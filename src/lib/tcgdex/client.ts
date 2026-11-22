// Server-only TCGdex + Bank of Canada client. Do not import from client components:
// the browser must go through our /api routes (see src/lib/api-client.ts).
//
// Caching: TCGdex sends `no-store`, so every request opts into the Next.js fetch
// (data) cache with `next.revalidate`. The fetch cache persists across requests and
// deploys on Vercel, unlike the in-memory `use cache` handler. Route handlers add
// CDN `Cache-Control` headers on top (see ./http.ts).
import type { CardDetail, CardSummary, FxRate, Serie, SetDetail, SetSummary } from "../types";
import { FALLBACK_FX } from "../pricing";
import type { RawCard, RawCardBrief, RawSerie, RawSerieBrief, RawSet, RawValet } from "./raw";
import {
  buildSerieIndex,
  EXCLUDED_SERIES,
  excludedSetIds,
  isExcludedCard,
  normalizeCard,
  normalizeCardSummary,
  normalizeFx,
  normalizeSet,
  type SerieIndex,
} from "./normalize";

export const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
export const VALET_URL =
  "https://www.bankofcanada.ca/valet/observations/FXUSDCAD,FXEURCAD/json?recent=1";
export const SEARCH_PAGE_SIZE = 24;

/** Revalidation windows, in seconds. */
export const REVALIDATE = {
  card: 6 * 60 * 60,
  search: 12 * 60 * 60,
  catalog: 24 * 60 * 60, // sets, series
  fx: 12 * 60 * 60,
} as const;

export class TcgdexError extends Error {
  constructor(
    message: string,
    /** HTTP status to surface to our API clients (404 for unknown ids, 502 upstream failure). */
    readonly status: number,
  ) {
    super(message);
    this.name = "TcgdexError";
  }
}

type NextFetchInit = RequestInit & { next?: { revalidate?: number | false; tags?: string[] } };

async function getJson<T>(path: string, revalidate: number, tags?: string[]): Promise<T> {
  const url = path.startsWith("http") ? path : `${TCGDEX_BASE}${path}`;
  let res: Response;
  try {
    const init: NextFetchInit = {
      headers: { accept: "application/json" },
      next: { revalidate, ...(tags ? { tags } : {}) },
    };
    res = await fetch(url, init);
  } catch (err) {
    throw new TcgdexError(`TCGdex unreachable: ${(err as Error).message}`, 502);
  }
  if (res.status === 404) throw new TcgdexError("Not found", 404);
  if (!res.ok) throw new TcgdexError(`TCGdex responded ${res.status}`, 502);
  try {
    return (await res.json()) as T;
  } catch {
    throw new TcgdexError("TCGdex returned invalid JSON", 502);
  }
}

// ---- Serie index (series → sets), cached by the fetch cache for 24h ----------------

let indexPromise: { at: number; promise: Promise<{ index: SerieIndex; excluded: Set<string> }> } | null =
  null;

async function loadSerieDetails(): Promise<RawSerie[]> {
  const list = await getJson<RawSerieBrief[]>("/series", REVALIDATE.catalog, ["tcgdex:catalog"]);
  return Promise.all(
    list.map((s) =>
      getJson<RawSerie>(`/series/${encodeURIComponent(s.id)}`, REVALIDATE.catalog, [
        "tcgdex:catalog",
      ]),
    ),
  );
}

/**
 * All series with their sets. TCGdex's `/sets` list has no serie, so we fetch every
 * `/series/{id}` (~20 small requests, each fetch-cached for 24h) and invert it.
 * Memoised per server instance for 10 minutes to avoid re-reading the cache.
 */
export function getSerieIndex(): Promise<{ index: SerieIndex; excluded: Set<string> }> {
  const now = Date.now();
  if (!indexPromise || now - indexPromise.at > 10 * 60 * 1000) {
    const promise = loadSerieDetails().then((details) => ({
      index: buildSerieIndex(details),
      excluded: excludedSetIds(details),
    }));
    promise.catch(() => {
      if (indexPromise?.promise === promise) indexPromise = null;
    });
    indexPromise = { at: now, promise };
  }
  return indexPromise.promise;
}

/** Test hook. */
export function _resetSerieIndex(): void {
  indexPromise = null;
}

// ---- Public API ---------------------------------------------------------------------

export async function fetchSeries(): Promise<Serie[]> {
  return (await getSerieIndex()).index.series;
}

/** Newest first. `releaseDate` is not included here (it needs one request per set). */
export async function fetchSets(): Promise<SetSummary[]> {
  return (await getSerieIndex()).index.sets;
}

export async function fetchSet(id: string): Promise<SetDetail> {
  const raw = await getJson<RawSet>(`/sets/${encodeURIComponent(id)}`, REVALIDATE.catalog, [
    "tcgdex:catalog",
  ]);
  if (raw.serie && EXCLUDED_SERIES.has(raw.serie.id)) throw new TcgdexError("Not found", 404);
  return normalizeSet(raw);
}

export async function fetchCard(id: string): Promise<CardDetail> {
  const [raw, idx] = await Promise.all([
    getJson<RawCard>(`/cards/${encodeURIComponent(id)}`, REVALIDATE.card),
    getSerieIndex().catch(() => null),
  ]);
  if (!raw?.set?.id) throw new TcgdexError("Malformed card", 502);
  if (idx?.excluded.has(raw.set.id)) throw new TcgdexError("Not found", 404);
  return normalizeCard(raw, idx?.index.setToSerie.get(raw.set.id));
}

/** Fetch many cards, skipping ones that fail. Order follows `ids` (deduplicated). */
export async function fetchCards(ids: string[], concurrency = 8): Promise<CardDetail[]> {
  const unique = [...new Set(ids)];
  const out: (CardDetail | null)[] = new Array(unique.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < unique.length) {
      const i = next++;
      try {
        out[i] = await fetchCard(unique[i]);
      } catch {
        out[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return out.filter((c): c is CardDetail => c !== null);
}

/**
 * Name search (TCGdex matches case-insensitive substrings). `hasMore` is true when
 * TCGdex returned a full page; TCG Pocket cards are filtered out afterwards, so a page
 * may hold fewer than 24 cards while `hasMore` is still true.
 */
export async function searchCards(
  q: string,
  page = 1,
): Promise<{ cards: CardSummary[]; page: number; hasMore: boolean }> {
  const query = q.trim();
  const p = Math.max(1, Math.floor(page) || 1);
  if (!query) return { cards: [], page: p, hasMore: false };
  const params = new URLSearchParams({
    name: query,
    "pagination:page": String(p),
    "pagination:itemsPerPage": String(SEARCH_PAGE_SIZE),
  });
  const [raw, idx] = await Promise.all([
    getJson<RawCardBrief[]>(`/cards?${params}`, REVALIDATE.search),
    getSerieIndex().catch(() => null),
  ]);
  const list = Array.isArray(raw) ? raw : [];
  const excluded = idx?.excluded ?? new Set<string>();
  return {
    cards: list.filter((c) => !isExcludedCard(c, excluded)).map(normalizeCardSummary),
    page: p,
    hasMore: list.length >= SEARCH_PAGE_SIZE,
  };
}

/** Latest Bank of Canada rates. Never throws: falls back to FALLBACK_FX. */
export async function fetchFx(): Promise<FxRate> {
  try {
    const raw = await getJson<RawValet>(VALET_URL, REVALIDATE.fx, ["fx"]);
    return normalizeFx(raw) ?? FALLBACK_FX;
  } catch {
    return FALLBACK_FX;
  }
}

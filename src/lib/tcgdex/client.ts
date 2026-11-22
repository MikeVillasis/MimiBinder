// Server-only TCGdex + Bank of Canada client. Do not import from client components:
// the browser must go through our /api routes (see src/lib/api-client.ts).
//
// Caching: TCGdex sends `no-store`, so every request opts into the Next.js fetch
// (data) cache with `next.revalidate`. The fetch cache persists across requests and
// deploys on Vercel, unlike the in-memory `use cache` handler. Route handlers add
// CDN `Cache-Control` headers on top (see ./http.ts).
import type { CardDetail, CardSummary, FxRate, Lang, Serie, SetDetail, SetSummary } from "../types";
import { joinId, splitId } from "../lang";
import { FALLBACK_FX } from "../pricing";
import type { RawCard, RawCardBrief, RawSerie, RawSerieBrief, RawSet, RawSetBrief, RawValet } from "./raw";
import {
  buildSerieIndex,
  EXCLUDED_SERIES,
  excludedSetIds,
  isExcludedCard,
  normalizeCard,
  normalizeCardSummary,
  normalizeFx,
  normalizeSet,
  setIdFromCardId,
  type SerieIndex,
} from "./normalize";
import { hasJapanese, matchSpecies } from "./species";

export const TCGDEX_BASES: Record<Lang, string> = {
  en: "https://api.tcgdex.net/v2/en",
  ja: "https://api.tcgdex.net/v2/ja",
};
/** English base URL (kept for existing importers). */
export const TCGDEX_BASE = TCGDEX_BASES.en;
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

/** `path` is relative to the TCGdex base of `lang`, or an absolute URL. */
async function getJson<T>(
  path: string,
  revalidate: number,
  tags?: string[],
  lang: Lang = "en",
): Promise<T> {
  const url = path.startsWith("http") ? path : `${TCGDEX_BASES[lang]}${path}`;
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

// ---- Serie index (series → sets), cached by the fetch cache for 24h, one per language ----

const CATALOG_TAGS = ["tcgdex:catalog"];

interface LoadedIndex {
  index: SerieIndex;
  excluded: Set<string>;
  /** App set id → position in `index.sets` (0 = newest). */
  setRank: Map<string, number>;
}

const indexPromises = new Map<Lang, { at: number; promise: Promise<LoadedIndex> }>();

async function loadSerieDetails(lang: Lang): Promise<RawSerie[]> {
  const list = await getJson<RawSerieBrief[]>("/series", REVALIDATE.catalog, CATALOG_TAGS, lang);
  return Promise.all(
    list.map((s) =>
      getJson<RawSerie>(`/series/${encodeURIComponent(s.id)}`, REVALIDATE.catalog, CATALOG_TAGS, lang),
    ),
  );
}

/**
 * Japanese series list their sets out of release order (and the list has no dates), so ask
 * TCGdex for all sets sorted by release date. Optional: on failure the serie order is used.
 */
async function loadSetOrder(lang: Lang): Promise<string[] | undefined> {
  if (lang === "en") return undefined;
  try {
    const list = await getJson<RawSetBrief[]>(
      "/sets?sort:field=releaseDate&sort:order=DESC",
      REVALIDATE.catalog,
      CATALOG_TAGS,
      lang,
    );
    return Array.isArray(list) ? list.map((s) => s.id) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * All series of one language with their sets. TCGdex's `/sets` list has no serie, so we
 * fetch every `/series/{id}` (~20 small requests, each fetch-cached for 24h) and invert it.
 * Memoised per server instance and language for 10 minutes to avoid re-reading the cache.
 */
export function getSerieIndex(lang: Lang = "en"): Promise<LoadedIndex> {
  const now = Date.now();
  const cached = indexPromises.get(lang);
  if (cached && now - cached.at <= 10 * 60 * 1000) return cached.promise;
  const promise = Promise.all([loadSerieDetails(lang), loadSetOrder(lang)]).then(
    ([details, order]) => {
      const index = buildSerieIndex(details, lang, order);
      return {
        index,
        excluded: excludedSetIds(details, lang),
        setRank: new Map(index.sets.map((s, i) => [s.id, i])),
      };
    },
  );
  promise.catch(() => {
    if (indexPromises.get(lang)?.promise === promise) indexPromises.delete(lang);
  });
  indexPromises.set(lang, { at: now, promise });
  return promise;
}

/** Test hook. */
export function _resetSerieIndex(): void {
  indexPromises.clear();
}

// ---- Public API ---------------------------------------------------------------------

export async function fetchSeries(lang: Lang = "en"): Promise<Serie[]> {
  return (await getSerieIndex(lang)).index.series;
}

/** Newest first. `releaseDate` is not included here (it needs one request per set). */
export async function fetchSets(lang: Lang = "en"): Promise<SetSummary[]> {
  return (await getSerieIndex(lang)).index.sets;
}

/** `id` is an app set id: "sv03.5" or "ja:SV2a". */
export async function fetchSet(id: string): Promise<SetDetail> {
  const { lang, raw: rawId } = splitId(id);
  if (!rawId) throw new TcgdexError("Not found", 404);
  const raw = await getJson<RawSet>(
    `/sets/${encodeURIComponent(rawId)}`,
    REVALIDATE.catalog,
    CATALOG_TAGS,
    lang,
  );
  if (raw.serie && EXCLUDED_SERIES.has(raw.serie.id)) throw new TcgdexError("Not found", 404);
  return normalizeSet(raw, lang);
}

/** `id` is an app card id: "sv03.5-001" or "ja:SV2a-001". */
export async function fetchCard(id: string): Promise<CardDetail> {
  const { lang, raw: rawId } = splitId(id);
  if (!rawId) throw new TcgdexError("Not found", 404);
  const [raw, idx] = await Promise.all([
    getJson<RawCard>(`/cards/${encodeURIComponent(rawId)}`, REVALIDATE.card, undefined, lang),
    getSerieIndex(lang).catch(() => null),
  ]);
  if (!raw?.set?.id) throw new TcgdexError("Malformed card", 502);
  const setId = joinId(raw.set.id, lang);
  if (idx?.excluded.has(setId)) throw new TcgdexError("Not found", 404);
  return normalizeCard(raw, idx?.index.setToSerie.get(setId), lang);
}

/** Fetch many cards (any mix of languages), skipping ones that fail. Order follows `ids` (deduplicated). */
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

export interface SearchResult {
  cards: CardSummary[];
  page: number;
  hasMore: boolean;
}

/**
 * Name search (TCGdex matches case-insensitive substrings). `hasMore` is true when
 * TCGdex returned a full page; TCG Pocket cards are filtered out afterwards, so a page
 * may hold fewer than 24 cards while `hasMore` is still true.
 *
 * Japanese (`lang` "ja"): a query with Japanese characters uses the same TCGdex name search
 * on the Japanese API. Any other query is matched against English species names
 * (see ./species.ts) and searched by National Pokédex number; see `searchJapaneseBySpecies`.
 * Returned ids are prefixed ("ja:SV2a-025").
 */
export async function searchCards(q: string, page = 1, lang: Lang = "en"): Promise<SearchResult> {
  const query = q.trim();
  const p = Math.max(1, Math.floor(page) || 1);
  if (!query) return { cards: [], page: p, hasMore: false };
  if (lang === "ja" && !hasJapanese(query)) return searchJapaneseBySpecies(query, p);
  const params = new URLSearchParams({
    name: query,
    "pagination:page": String(p),
    "pagination:itemsPerPage": String(SEARCH_PAGE_SIZE),
  });
  const [raw, idx] = await Promise.all([
    getJson<RawCardBrief[]>(`/cards?${params}`, REVALIDATE.search, undefined, lang),
    getSerieIndex(lang).catch(() => null),
  ]);
  const list = Array.isArray(raw) ? raw : [];
  const excluded = idx?.excluded ?? new Set<string>();
  return {
    cards: list
      .filter((c) => !isExcludedCard(c, excluded, lang))
      .map((c) => normalizeCardSummary(c, lang)),
    page: p,
    hasMore: list.length >= SEARCH_PAGE_SIZE,
  };
}

/**
 * Japanese cards for up to 6 English species matches: one fetch-cached `/ja/cards?dexId=eq:N`
 * per species (all cards, unpaginated; ~100 for the most printed species), merged and
 * deduplicated, sorted newest set first (by the serie index's release order; cards of unknown
 * sets last, TCGdex order kept within a set), then paginated locally at 24 per page.
 */
async function searchJapaneseBySpecies(query: string, page: number): Promise<SearchResult> {
  const dex = matchSpecies(query);
  if (dex.length === 0) return { cards: [], page, hasMore: false };
  const [lists, idx] = await Promise.all([
    Promise.all(
      dex.map((n) =>
        getJson<RawCardBrief[]>(`/cards?dexId=eq:${n}`, REVALIDATE.search, undefined, "ja"),
      ),
    ),
    getSerieIndex("ja").catch(() => null),
  ]);
  const excluded = idx?.excluded ?? new Set<string>();
  const seen = new Set<string>();
  const merged: { card: CardSummary; rank: number; i: number }[] = [];
  for (const list of lists) {
    for (const raw of Array.isArray(list) ? list : []) {
      if (!raw?.id || isExcludedCard(raw, excluded, "ja")) continue;
      const card = normalizeCardSummary(raw, "ja");
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      const setId = setIdFromCardId(card.id, card.localId);
      const rank = idx?.setRank.get(setId) ?? Number.MAX_SAFE_INTEGER;
      merged.push({ card, rank, i: merged.length });
    }
  }
  merged.sort((a, b) => a.rank - b.rank || a.i - b.i);
  const start = (page - 1) * SEARCH_PAGE_SIZE;
  return {
    cards: merged.slice(start, start + SEARCH_PAGE_SIZE).map((m) => m.card),
    page,
    hasMore: start + SEARCH_PAGE_SIZE < merged.length,
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

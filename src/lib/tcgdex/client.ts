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
import { hasJapanese, matchSpecies, nameHasSuffix, splitSuffix } from "./species";
import { POKEDEX_JA } from "./pokedex-ja";
import { matchesCardNumber, parseCardQuery, type CardNumberQuery } from "../search-query";

export const TCGDEX_BASES: Record<Lang, string> = {
  en: "https://api.tcgdex.net/v2/en",
  ja: "https://api.tcgdex.net/v2/ja",
};
/** English base URL (kept for existing importers). */
export const TCGDEX_BASE = TCGDEX_BASES.en;
export const VALET_URL =
  "https://www.bankofcanada.ca/valet/observations/FXUSDCAD,FXEURCAD/json?recent=1";
export const SEARCH_PAGE_SIZE = 24;
/**
 * Card-number search: TCGdex page size and the most pages read for one query. TCGdex's `localId`
 * filter is lax ("1" also matches "10", "001", "TG01"…), so a bare "1" matches 10,000+ cards; it
 * lists them grouped by number, exact matches first, so 4 × 250 covers every "1"/"001" printing
 * (~200) while bounding the cost to 4 requests (1 + 3 in parallel).
 */
export const NUMBER_SEARCH_PAGE_SIZE = 250;
export const NUMBER_SEARCH_MAX_PAGES = 4;

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
  /** App set id → official card count (the "159" of "189/159"). */
  setOfficialCount: Map<string, number>;
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
        setOfficialCount: new Map(index.sets.map((s) => [s.id, s.officialCount])),
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
 * A query with a card number ("Zorua 189", "189/159", "pikachu tg05", "#25"; see
 * ../search-query.ts) is a number search instead: see `searchByNumber`.
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
  const parsed = parseCardQuery(query);
  if (parsed.number) {
    if (lang === "ja" && parsed.name && !hasJapanese(parsed.name)) {
      return searchJapaneseBySpecies(parsed.name, p, parsed.number);
    }
    return searchByNumber(parsed.name, parsed.number, p, lang);
  }
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

/** Value for TCGdex's lax `localId` filter that is sure to match every printing of `n`. */
export function localIdFilter(n: CardNumberQuery): string {
  // "TG5" matches nothing (the card is "TG05"), but the bare prefix matches every TG card
  // (≤ ~300 for any prefix). Plain numbers match regardless of zero padding ("1" ≈ "001").
  return n.prefix || String(n.num);
}

/**
 * Sort (stable) and paginate number-search results: cards whose set's official count equals
 * `n.total` first ("189/159"), then newest set first (serie index order; unknown sets last).
 */
function rankAndPage(
  cards: CardSummary[],
  n: CardNumberQuery,
  page: number,
  idx: LoadedIndex | null,
): SearchResult {
  const ranked = cards.map((card, i) => {
    const setId = setIdFromCardId(card.id, card.localId);
    const totalMiss = n.total != null && idx?.setOfficialCount.get(setId) !== n.total ? 1 : 0;
    const rank = idx?.setRank.get(setId) ?? Number.MAX_SAFE_INTEGER;
    return { card, totalMiss, rank, i };
  });
  ranked.sort((a, b) => a.totalMiss - b.totalMiss || a.rank - b.rank || a.i - b.i);
  const start = (page - 1) * SEARCH_PAGE_SIZE;
  return {
    cards: ranked.slice(start, start + SEARCH_PAGE_SIZE).map((r) => r.card),
    page,
    hasMore: start + SEARCH_PAGE_SIZE < ranked.length,
  };
}

/**
 * Cards whose number is exactly `n` (and whose name contains `name`, when given). TCGdex's
 * `localId` filter narrows the list (`name` too when non-empty); up to NUMBER_SEARCH_MAX_PAGES
 * pages of NUMBER_SEARCH_PAGE_SIZE are read (page 1 first, the rest in parallel only when page 1
 * is full), each fetch-cached. Exact matches are kept with `matchesCardNumber`, TCG Pocket cards
 * dropped, then ranked (see `rankAndPage`) and paginated locally at 24 per page.
 */
async function searchByNumber(
  name: string,
  n: CardNumberQuery,
  page: number,
  lang: Lang,
): Promise<SearchResult> {
  const url = (pg: number) => {
    const params = new URLSearchParams({
      localId: localIdFilter(n),
      ...(name ? { name } : {}),
      "pagination:page": String(pg),
      "pagination:itemsPerPage": String(NUMBER_SEARCH_PAGE_SIZE),
    });
    return `/cards?${params}`;
  };
  const fetchPage = async (pg: number) => {
    const raw = await getJson<RawCardBrief[]>(url(pg), REVALIDATE.search, undefined, lang);
    return Array.isArray(raw) ? raw : [];
  };
  const idxPromise = getSerieIndex(lang).catch(() => null);
  const first = await fetchPage(1);
  const lists = [first];
  if (first.length >= NUMBER_SEARCH_PAGE_SIZE) {
    const rest = Array.from({ length: NUMBER_SEARCH_MAX_PAGES - 1 }, (_, i) => i + 2);
    // Later pages are best effort: a failure keeps what we have.
    lists.push(...(await Promise.all(rest.map((pg) => fetchPage(pg).catch(() => [])))));
  }
  const idx = await idxPromise;
  const excluded = idx?.excluded ?? new Set<string>();
  const seen = new Set<string>();
  const cards: CardSummary[] = [];
  for (const raw of lists.flat()) {
    if (!raw?.id || typeof raw.localId !== "string") continue;
    if (!matchesCardNumber(raw.localId, n) || isExcludedCard(raw, excluded, lang)) continue;
    const card = normalizeCardSummary(raw, lang);
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
  }
  return rankAndPage(cards, n, page, idx);
}

/**
 * Japanese cards for an English query ("espeon", "Espeon ex", "char"): up to 6 species are matched
 * (./species.ts), and for each, two fetch-cached lists are merged:
 * - `/ja/cards?dexId=eq:N` (all cards with that Pokédex number), and
 * - TCGdex's Japanese name search for each Japanese spelling in POKEDEX_JA ("エーフィ", "エスペオン"),
 *   because many newer Japanese cards have no `dexId` (e.g. SV8a-211 エーフィex).
 * A trailing mechanic ("ex", "V", "VMAX", "VSTAR", "GX", "BREAK") keeps only cards whose Japanese name
 * ends with it. Results are deduplicated, sorted newest set first and paginated locally at 24 per page.
 * With `number`, only cards with exactly that number are kept (a "/total" ranks matching sets first).
 */
async function searchJapaneseBySpecies(
  query: string,
  page: number,
  number?: CardNumberQuery,
): Promise<SearchResult> {
  const { base, suffix } = splitSuffix(query);
  const dex = matchSpecies(base);
  if (dex.length === 0) return { cards: [], page, hasMore: false };
  const byName = (jaName: string) => {
    const params = new URLSearchParams({ name: jaName, "pagination:itemsPerPage": String(NUMBER_SEARCH_PAGE_SIZE) });
    return getJson<RawCardBrief[]>(`/cards?${params}`, REVALIDATE.search, undefined, "ja").catch(() => []);
  };
  const requests: Promise<RawCardBrief[]>[] = [];
  for (const n of dex) {
    requests.push(getJson<RawCardBrief[]>(`/cards?dexId=eq:${n}`, REVALIDATE.search, undefined, "ja").catch(() => []));
    for (const jaName of POKEDEX_JA[n - 1] ?? []) requests.push(byName(jaName));
  }
  const [lists, idx] = await Promise.all([Promise.all(requests), getSerieIndex("ja").catch(() => null)]);
  const excluded = idx?.excluded ?? new Set<string>();
  const seen = new Set<string>();
  const merged: CardSummary[] = [];
  for (const list of lists) {
    for (const raw of Array.isArray(list) ? list : []) {
      if (!raw?.id || isExcludedCard(raw, excluded, "ja")) continue;
      if (suffix && !nameHasSuffix(raw.name ?? "", suffix)) continue;
      if (number && (typeof raw.localId !== "string" || !matchesCardNumber(raw.localId, number))) continue;
      const card = normalizeCardSummary(raw, "ja");
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      merged.push(card);
    }
  }
  // Without a number this is plain newest-set-first ordering.
  return rankAndPage(merged, number ?? { key: "", prefix: "", num: 0 }, page, idx);
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

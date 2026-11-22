// Pure normalisers: raw TCGdex / Bank of Canada JSON → shared domain types.
import type {
  CardDetail,
  CardmarketPrice,
  CardPrices,
  CardSummary,
  FxRate,
  Lang,
  Serie,
  SetDetail,
  SetSummary,
  StampedPrinting,
  TcgplayerPrice,
  Variant,
} from "../types";
import type {
  RawCard,
  RawCardBrief,
  RawCardmarket,
  RawSerie,
  RawSet,
  RawSetBrief,
  RawTcgplayer,
  RawTcgplayerVariant,
  RawValet,
  RawVariantDetailed,
} from "./raw";
import { joinId } from "../lang";

/**
 * TCG Pocket is a digital game; its series is hidden everywhere. Matched against raw TCGdex
 * serie ids of any language (Japanese has no Pocket series, so nothing is excluded there).
 */
export const EXCLUDED_SERIES = new Set(["tcgp"]);

/** Variant → TCGPlayer price keys, in preference order. */
export const TCGPLAYER_KEYS: Record<Variant, string[]> = {
  normal: ["normal", "unlimited"],
  holo: ["holofoil", "unlimited-holofoil"],
  reverse: ["reverse-holofoil"],
  firstEdition: ["1st-edition-holofoil", "1st-edition"],
};

const VARIANT_ORDER: Variant[] = ["normal", "holo", "reverse", "firstEdition"];

/** Positive finite number or null (TCGdex uses 0 for "no data" in some fields). */
function price(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function opt(v: string | null | undefined): string | undefined {
  return v ? v : undefined;
}

/** Card asset base URL (no suffix); `cardImage()` adds `/{quality}.webp`. */
function cardImageBase(v: string | null | undefined): string | undefined {
  return v ? v.replace(/\/+$/, "") : undefined;
}

/** Set logo asset base → ready-to-use URL. */
export function setLogoUrl(v: string | null | undefined): string | undefined {
  return v ? `${v}.webp` : undefined;
}

/**
 * Set symbol asset base → ready-to-use URL. TCGdex returns symbols under `/univ/`,
 * which currently 404s; the same file is served under `/en/`.
 */
export function setSymbolUrl(v: string | null | undefined): string | undefined {
  return v ? `${v.replace("assets.tcgdex.net/univ/", "assets.tcgdex.net/en/")}.webp` : undefined;
}

/**
 * Raw TCGdex card → summary. With `lang` "ja" the id gets the "ja:" prefix
 * (idempotent), so every id the app sees is language-qualified.
 */
export function normalizeCardSummary(raw: RawCardBrief, lang: Lang = "en"): CardSummary {
  return {
    id: joinId(raw.id, lang),
    localId: raw.localId,
    name: raw.name,
    image: cardImageBase(raw.image),
  };
}

/**
 * Derive the set id from a card id ("sv03.5-199" + localId "199" → "sv03.5"). Works on
 * prefixed ids too ("ja:SV2a-001" → "ja:SV2a"): the prefix is kept.
 */
export function setIdFromCardId(id: string, localId: string): string {
  const suffix = `-${localId}`;
  if (id.endsWith(suffix)) return id.slice(0, -suffix.length);
  const i = id.lastIndexOf("-");
  return i > 0 ? id.slice(0, i) : id;
}

function normalizeTcgplayerVariant(raw: RawTcgplayerVariant): TcgplayerPrice | null {
  const p: TcgplayerPrice = {
    low: price(raw.lowPrice),
    mid: price(raw.midPrice),
    high: price(raw.highPrice),
    market: price(raw.marketPrice),
  };
  const any = p.low != null || p.mid != null || p.high != null || p.market != null;
  return any ? p : null;
}

function normalizeTcgplayer(raw: RawTcgplayer | null | undefined): CardPrices["tcgplayer"] {
  if (!raw || typeof raw !== "object") return undefined;
  const variants: Partial<Record<Variant, TcgplayerPrice>> = {};
  for (const variant of VARIANT_ORDER) {
    for (const key of TCGPLAYER_KEYS[variant]) {
      const block = raw[key];
      if (!block || typeof block !== "object") continue;
      const p = normalizeTcgplayerVariant(block);
      if (p) {
        variants[variant] = p;
        break;
      }
    }
  }
  if (Object.keys(variants).length === 0) return undefined;
  return { updated: raw.updated ?? "", variants };
}

function hasAny(p: CardmarketPrice): boolean {
  return p.avg != null || p.low != null || p.trend != null || p.avg7 != null || p.avg30 != null;
}

function normalizeCardmarket(raw: RawCardmarket | null | undefined): CardPrices["cardmarket"] {
  if (!raw || typeof raw !== "object") return undefined;
  const normal: CardmarketPrice = {
    avg: price(raw.avg),
    low: price(raw.low),
    trend: price(raw.trend),
    avg7: price(raw.avg7),
    avg30: price(raw.avg30),
  };
  const holo: CardmarketPrice = {
    avg: price(raw["avg-holo"]),
    low: price(raw["low-holo"]),
    trend: price(raw["trend-holo"]),
    avg7: price(raw["avg7-holo"]),
    avg30: price(raw["avg30-holo"]),
  };
  if (!hasAny(normal) && !hasAny(holo)) return undefined;
  return {
    updated: raw.updated ?? "",
    normal,
    ...(hasAny(holo) ? { holo } : {}),
  };
}

/** Japanese cards are never on TCGPlayer, so their `tcgplayer` block is always dropped. */
export function normalizePrices(pricing: RawCard["pricing"], lang: Lang = "en"): CardPrices {
  const prices: CardPrices = {};
  const tcgplayer = lang === "en" ? normalizeTcgplayer(pricing?.tcgplayer) : undefined;
  const cardmarket = normalizeCardmarket(pricing?.cardmarket);
  if (tcgplayer) prices.tcgplayer = tcgplayer;
  if (cardmarket) prices.cardmarket = cardmarket;
  return prices;
}

/** `variants_detailed[].type` → app variant ("lenticular" is a holo printing, see normalizeStamped). */
const DETAILED_TYPES: Record<string, Variant> = {
  normal: "normal",
  holo: "holo",
  reverse: "reverse",
  firstEdition: "firstEdition",
  "first-edition": "firstEdition",
  "1st-edition": "firstEdition",
  lenticular: "holo",
};

function normalizeCardmarketBlock(raw: RawCardmarket | null | undefined): CardmarketPrice | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p: CardmarketPrice = {
    avg: price(raw.avg),
    low: price(raw.low),
    trend: price(raw.trend),
    avg7: price(raw.avg7),
    avg30: price(raw.avg30),
  };
  return hasAny(p) ? p : undefined;
}

function tcgplayerBlockFor(raw: RawTcgplayer | null | undefined, variant: Variant): TcgplayerPrice | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  for (const key of TCGPLAYER_KEYS[variant]) {
    const block = raw[key];
    if (!block || typeof block !== "object") continue;
    const p = normalizeTcgplayerVariant(block);
    if (p) return p;
  }
  return undefined;
}

/**
 * Stamped printings from TCGdex `variants_detailed`: one per standard-size printing that has a
 * stamp, deduplicated by (variant, stamp), in TCGdex order. Jumbo printings are skipped.
 * "lenticular" printings become holo with a "lenticular" stamp slug first (so an unstamped
 * lenticular printing is listed as stamp "lenticular"). TCGPlayer prices come from the block that
 * matches the variant (same keys as `TCGPLAYER_KEYS`; dropped for Japanese cards); Cardmarket from
 * the main (non "-holo") fields.
 */
export function normalizeStamped(
  detailed: RawVariantDetailed[] | null | undefined,
  lang: Lang = "en",
): StampedPrinting[] {
  if (!Array.isArray(detailed)) return [];
  const out: StampedPrinting[] = [];
  const seen = new Set<string>();
  for (const d of detailed) {
    if (!d || typeof d !== "object") continue;
    if (d.size && d.size !== "standard") continue;
    const type = d.type ?? "";
    const variant = DETAILED_TYPES[type];
    if (!variant) continue;
    const slugs = (Array.isArray(d.stamp) ? d.stamp : []).filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    );
    if (type === "lenticular" && !slugs.includes("lenticular")) slugs.unshift("lenticular");
    if (!slugs.length) continue;
    const stamp = slugs.join("+");
    const key = `${variant}:${stamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tcgplayer = lang === "en" ? tcgplayerBlockFor(d.pricing?.tcgplayer, variant) : undefined;
    const cardmarket = normalizeCardmarketBlock(d.pricing?.cardmarket);
    out.push({
      variant,
      stamp,
      ...(tcgplayer ? { tcgplayer } : {}),
      ...(cardmarket ? { cardmarket } : {}),
    });
  }
  return out;
}

function normalizeVariants(raw: RawCard): Variant[] {
  const flags = raw.variants ?? {};
  const out = VARIANT_ORDER.filter((v) => flags[v] === true);
  if (out.length) return out;
  // No flags: infer from which TCGPlayer blocks exist, else assume a normal printing.
  const tp = raw.pricing?.tcgplayer;
  const inferred = tp
    ? VARIANT_ORDER.filter((v) => TCGPLAYER_KEYS[v].some((k) => tp[k] && typeof tp[k] === "object"))
    : [];
  return inferred.length ? inferred : ["normal"];
}

function parseHp(hp: RawCard["hp"]): number | undefined {
  const n = typeof hp === "string" ? parseInt(hp, 10) : hp;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/** `serie` is the app-level serie (already prefixed for Japanese, e.g. from the serie index). */
export function normalizeCard(
  raw: RawCard,
  serie?: { id: string; name: string },
  lang: Lang = "en",
): CardDetail {
  const set = raw.set;
  return {
    ...normalizeCardSummary(raw, lang),
    rarity: opt(raw.rarity),
    illustrator: opt(raw.illustrator),
    hp: parseHp(raw.hp),
    types: raw.types?.length ? raw.types : undefined,
    setId: joinId(set.id, lang),
    setName: set.name,
    setLogo: setLogoUrl(set.logo),
    setSymbol: setSymbolUrl(set.symbol),
    setOfficialCount: set.cardCount?.official ?? undefined,
    setTotalCount: set.cardCount?.total ?? undefined,
    serieId: serie ? joinId(serie.id, lang) : undefined,
    serieName: serie?.name,
    variants: normalizeVariants(raw),
    prices: normalizePrices(raw.pricing, lang),
    ...withStamped(normalizeStamped(raw.variants_detailed, lang)),
  };
}

function withStamped(stamped: StampedPrinting[]): { stamped?: StampedPrinting[] } {
  return stamped.length ? { stamped } : {};
}

export function normalizeSetSummary(
  raw: RawSetBrief & { releaseDate?: string | null },
  serie: { id: string; name: string },
  lang: Lang = "en",
): SetSummary {
  const official = raw.cardCount?.official ?? raw.cardCount?.total ?? 0;
  return {
    id: joinId(raw.id, lang),
    name: raw.name,
    logo: setLogoUrl(raw.logo),
    symbol: setSymbolUrl(raw.symbol),
    serieId: joinId(serie.id, lang),
    serieName: serie.name,
    releaseDate: opt(raw.releaseDate),
    officialCount: official,
    totalCount: raw.cardCount?.total ?? official,
  };
}

export function normalizeSet(raw: RawSet, lang: Lang = "en"): SetDetail {
  const serie = raw.serie ?? { id: "unknown", name: "Unknown" };
  return {
    ...normalizeSetSummary(raw, serie, lang),
    cards: (raw.cards ?? []).map((c) => normalizeCardSummary(c, lang)),
  };
}

export function normalizeSerie(raw: RawSerie, lang: Lang = "en"): Serie {
  return {
    id: joinId(raw.id, lang),
    name: raw.name,
    logo: setLogoUrl(raw.logo),
    setIds: (raw.sets ?? []).map((s) => joinId(s.id, lang)),
  };
}

/** Everything derived from the full list of serie details. */
export interface SerieIndex {
  /** Newest first. */
  series: Serie[];
  /** Newest first: series newest first, sets within a serie in reverse release order. */
  sets: SetSummary[];
  /** App set id (prefixed for Japanese) → app serie (prefixed id). */
  setToSerie: Map<string, { id: string; name: string }>;
}

/**
 * Build the serie index from serie details (in any order). Excluded series are dropped.
 *
 * `setOrder` (raw set ids, newest first) overrides the order TCGdex lists sets in. Japanese
 * series list their sets out of release order, so for "ja" the client passes the order of
 * `/sets?sort:field=releaseDate&sort:order=DESC`; `sets` is then newest first across all
 * series and each `Serie.setIds` is in release order (oldest first). Sets missing from
 * `setOrder` keep their serie-based position after the ranked ones.
 */
export function buildSerieIndex(
  details: RawSerie[],
  lang: Lang = "en",
  setOrder?: readonly string[],
): SerieIndex {
  const kept = details
    .filter((s) => !EXCLUDED_SERIES.has(s.id))
    .map((s, i) => ({ s, i }))
    // Newest first by serie release date; ties / missing dates keep reverse API order.
    .sort((a, b) => {
      const da = a.s.releaseDate ?? "";
      const db = b.s.releaseDate ?? "";
      if (da !== db) return da < db ? 1 : -1;
      return b.i - a.i;
    })
    .map(({ s }) => s);

  const rank = setOrder?.length ? new Map(setOrder.map((id, i) => [id, i])) : null;
  const byRank = (a: string, b: string) =>
    (rank!.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank!.get(b) ?? Number.MAX_SAFE_INTEGER);

  const setToSerie = new Map<string, { id: string; name: string }>();
  const entries: { rawId: string; summary: SetSummary }[] = [];
  for (const s of kept) {
    const ref = { id: joinId(s.id, lang), name: s.name };
    const serieSets = s.sets ?? [];
    for (let i = serieSets.length - 1; i >= 0; i--) {
      const set = serieSets[i];
      const id = joinId(set.id, lang);
      if (setToSerie.has(id)) continue;
      setToSerie.set(id, ref);
      entries.push({ rawId: set.id, summary: normalizeSetSummary(set, s, lang) });
    }
  }
  // Array.prototype.sort is stable, so unranked sets keep their serie-based order.
  if (rank) entries.sort((a, b) => byRank(a.rawId, b.rawId));

  const series = kept.map((s) => {
    const serie = normalizeSerie(s, lang);
    if (!rank) return serie;
    const raw = (s.sets ?? []).map((x) => x.id);
    // Release order (oldest first); unranked sets go first, keeping their TCGdex order.
    const sorted = [...raw].reverse().sort(byRank).reverse();
    return { ...serie, setIds: sorted.map((id) => joinId(id, lang)) };
  });
  return { series, sets: entries.map((e) => e.summary), setToSerie };
}

/** App set ids (prefixed for Japanese) of excluded series (needs the full index). */
export function excludedSetIds(details: RawSerie[], lang: Lang = "en"): Set<string> {
  const out = new Set<string>();
  for (const s of details) {
    if (!EXCLUDED_SERIES.has(s.id)) continue;
    for (const set of s.sets ?? []) out.add(joinId(set.id, lang));
  }
  return out;
}

/** True when a raw search result belongs to an excluded serie. `excludedSets` holds app set ids. */
export function isExcludedCard(
  card: RawCardBrief,
  excludedSets: Set<string>,
  lang: Lang = "en",
): boolean {
  if (excludedSets.has(setIdFromCardId(joinId(card.id, lang), card.localId))) return true;
  return !!card.image && [...EXCLUDED_SERIES].some((s) => card.image!.includes(`/${s}/`));
}

/** Bank of Canada Valet observations → FxRate, or null if the payload is unusable. */
export function normalizeFx(raw: RawValet): FxRate | null {
  const obs = raw.observations?.[raw.observations.length - 1];
  if (!obs?.d) return null;
  const usdCad = price(obs.FXUSDCAD?.v);
  if (usdCad == null) return null;
  const eurCad = price(obs.FXEURCAD?.v);
  return { usdCad, ...(eurCad != null ? { eurCad } : {}), date: obs.d };
}

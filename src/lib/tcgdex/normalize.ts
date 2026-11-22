// Pure normalisers: raw TCGdex / Bank of Canada JSON → shared domain types.
import type {
  CardDetail,
  CardmarketPrice,
  CardPrices,
  CardSummary,
  FxRate,
  Serie,
  SetDetail,
  SetSummary,
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
} from "./raw";

/** TCG Pocket is a digital game; its series is hidden everywhere. */
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

export function normalizeCardSummary(raw: RawCardBrief): CardSummary {
  return {
    id: raw.id,
    localId: raw.localId,
    name: raw.name,
    image: cardImageBase(raw.image),
  };
}

/** Derive the set id from a card id ("sv03.5-199" + localId "199" → "sv03.5"). */
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

export function normalizePrices(pricing: RawCard["pricing"]): CardPrices {
  const prices: CardPrices = {};
  const tcgplayer = normalizeTcgplayer(pricing?.tcgplayer);
  const cardmarket = normalizeCardmarket(pricing?.cardmarket);
  if (tcgplayer) prices.tcgplayer = tcgplayer;
  if (cardmarket) prices.cardmarket = cardmarket;
  return prices;
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

export function normalizeCard(
  raw: RawCard,
  serie?: { id: string; name: string },
): CardDetail {
  const set = raw.set;
  return {
    ...normalizeCardSummary(raw),
    rarity: opt(raw.rarity),
    illustrator: opt(raw.illustrator),
    hp: parseHp(raw.hp),
    types: raw.types?.length ? raw.types : undefined,
    setId: set.id,
    setName: set.name,
    setLogo: setLogoUrl(set.logo),
    setSymbol: setSymbolUrl(set.symbol),
    setOfficialCount: set.cardCount?.official ?? undefined,
    setTotalCount: set.cardCount?.total ?? undefined,
    serieId: serie?.id,
    serieName: serie?.name,
    variants: normalizeVariants(raw),
    prices: normalizePrices(raw.pricing),
  };
}

export function normalizeSetSummary(
  raw: RawSetBrief & { releaseDate?: string | null },
  serie: { id: string; name: string },
): SetSummary {
  const official = raw.cardCount?.official ?? raw.cardCount?.total ?? 0;
  return {
    id: raw.id,
    name: raw.name,
    logo: setLogoUrl(raw.logo),
    symbol: setSymbolUrl(raw.symbol),
    serieId: serie.id,
    serieName: serie.name,
    releaseDate: opt(raw.releaseDate),
    officialCount: official,
    totalCount: raw.cardCount?.total ?? official,
  };
}

export function normalizeSet(raw: RawSet): SetDetail {
  const serie = raw.serie ?? { id: "unknown", name: "Unknown" };
  return {
    ...normalizeSetSummary(raw, serie),
    cards: (raw.cards ?? []).map(normalizeCardSummary),
  };
}

export function normalizeSerie(raw: RawSerie): Serie {
  return {
    id: raw.id,
    name: raw.name,
    logo: setLogoUrl(raw.logo),
    setIds: (raw.sets ?? []).map((s) => s.id),
  };
}

/** Everything derived from the full list of serie details. */
export interface SerieIndex {
  /** Newest first. */
  series: Serie[];
  /** Newest first: series newest first, sets within a serie in reverse release order. */
  sets: SetSummary[];
  /** setId → serie. */
  setToSerie: Map<string, { id: string; name: string }>;
}

/** Build the serie index from serie details (in any order). Excluded series are dropped. */
export function buildSerieIndex(details: RawSerie[]): SerieIndex {
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

  const setToSerie = new Map<string, { id: string; name: string }>();
  const sets: SetSummary[] = [];
  for (const s of kept) {
    const ref = { id: s.id, name: s.name };
    const serieSets = s.sets ?? [];
    for (let i = serieSets.length - 1; i >= 0; i--) {
      const set = serieSets[i];
      if (setToSerie.has(set.id)) continue;
      setToSerie.set(set.id, ref);
      sets.push(normalizeSetSummary(set, ref));
    }
  }
  return { series: kept.map(normalizeSerie), sets, setToSerie };
}

/** Serie ids that must be hidden, as a predicate over a set id (needs the full index). */
export function excludedSetIds(details: RawSerie[]): Set<string> {
  const out = new Set<string>();
  for (const s of details) {
    if (!EXCLUDED_SERIES.has(s.id)) continue;
    for (const set of s.sets ?? []) out.add(set.id);
  }
  return out;
}

/** True when a search result belongs to an excluded serie. */
export function isExcludedCard(card: RawCardBrief, excludedSets: Set<string>): boolean {
  if (excludedSets.has(setIdFromCardId(card.id, card.localId))) return true;
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

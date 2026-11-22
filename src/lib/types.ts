// Shared domain types. This file is the contract between the data layer,
// sync layer and UI. Change it only with the lead's approval.

export type Currency = "CAD" | "USD";

/**
 * Card language. English ids are TCGdex ids as-is ("sv03.5-001"); Japanese ids carry a "ja:" prefix
 * ("ja:SV2a-001") on cards, sets and series alike, so every id-keyed store (entries, card cache,
 * price snapshots, sync) works unchanged. Use the helpers in ./lang.ts; never parse ids by hand.
 */
export type Lang = "en" | "ja";

export const LANG_LABELS: Record<Lang, string> = { en: "English", ja: "Japanese" };
export type PriceSource = "tcgplayer" | "cardmarket";

/** Printing variant of a card. Maps to TCGdex `variants` flags. */
export type Variant = "normal" | "holo" | "reverse" | "firstEdition";

export type Condition = "NM" | "LP" | "MP" | "HP" | "DMG";

export const VARIANT_LABELS: Record<Variant, string> = {
  normal: "Normal",
  holo: "Holo",
  reverse: "Reverse Holo",
  firstEdition: "1st Edition",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

/** TCGPlayer price block for one variant, in USD. */
export interface TcgplayerPrice {
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
}

/** Cardmarket prices, in EUR. `holo` holds the reverse/holo-specific fields when present. */
export interface CardmarketPrice {
  avg: number | null;
  low: number | null;
  trend: number | null;
  avg7: number | null;
  avg30: number | null;
}

export interface CardPrices {
  tcgplayer?: {
    updated: string; // ISO timestamp
    variants: Partial<Record<Variant, TcgplayerPrice>>;
  };
  cardmarket?: {
    updated: string;
    normal: CardmarketPrice;
    holo?: CardmarketPrice; // TCGdex "-holo" suffixed fields (reverse/holo printings)
  };
}

/** Lightweight card used in search results and set lists. */
export interface CardSummary {
  id: string; // TCGdex id, e.g. "sv03.5-199"
  localId: string; // number within set, e.g. "199"
  name: string;
  image?: string; // TCGdex asset base URL (no quality/extension suffix)
}

/**
 * A special printing of a card that carries a stamp (Pokémon Center, prerelease set logo, Staff, Player
 * Rewards, GameStop…), from TCGdex `variants_detailed`. `stamp` is the TCGdex stamp slugs joined with "+"
 * in TCGdex order (e.g. "pokemon-center", "set-logo+staff"); see ./stamps.ts for labels. Unstamped
 * printings stay in `CardDetail.variants` / `CardDetail.prices` exactly as before.
 */
export interface StampedPrinting {
  variant: Variant;
  stamp: string;
  /** This printing's own prices (TCGPlayer in USD, Cardmarket in EUR), when TCGdex has them. */
  tcgplayer?: TcgplayerPrice;
  cardmarket?: CardmarketPrice;
}

export interface CardDetail extends CardSummary {
  rarity?: string;
  illustrator?: string;
  hp?: number;
  types?: string[];
  setId: string;
  setName: string;
  setLogo?: string;
  setSymbol?: string;
  setOfficialCount?: number;
  setTotalCount?: number;
  serieId?: string;
  serieName?: string;
  variants: Variant[]; // printings that exist for this card
  prices: CardPrices;
  /** Japanese cards: best-effort English name ("Espeon ex") for searching other sites. Absent for English cards. */
  nameEn?: string;
  /** Stamped printings (empty or missing when there are none). */
  stamped?: StampedPrinting[];
}

export interface SetSummary {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  serieId: string;
  serieName: string;
  releaseDate?: string; // YYYY-MM-DD
  officialCount: number;
  totalCount: number;
}

export interface SetDetail extends SetSummary {
  cards: CardSummary[];
}

/** A TCGdex "serie" (era). The app presents these as "generations". */
export interface Serie {
  id: string;
  name: string;
  logo?: string;
  setIds: string[]; // in release order
}

/** One owned copy group. Local-first; synced to Supabase for the owner. */
export interface CollectionEntry {
  id: string; // uuid
  cardId: string;
  // Denormalised so the collection renders offline without API calls:
  cardName: string;
  localId: string;
  image?: string;
  setId: string;
  setName: string;
  serieId?: string;
  serieName?: string;
  rarity?: string;
  variant: Variant;
  /** Stamp of a stamped printing (see StampedPrinting.stamp); absent for regular printings. */
  stamp?: string;
  condition: Condition;
  quantity: number;
  purchasePrice?: number; // per copy
  purchaseCurrency?: Currency;
  purchaseDate?: string; // YYYY-MM-DD
  notes?: string;
  binderIds: string[]; // custom binders only; set/generation binders are derived
  createdAt: string; // ISO
  updatedAt: string; // ISO, used for last-write-wins sync
  deletedAt?: string; // tombstone for sync
}

/** User-created binder. Set and generation binders are virtual, derived from entries. */
export interface Binder {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Settings {
  currency: Currency; // default "CAD"
  priceSource: PriceSource; // default "tcgplayer"
}

export interface FxRate {
  usdCad: number; // 1 USD = usdCad CAD
  eurCad?: number; // 1 EUR = eurCad CAD
  date: string; // YYYY-MM-DD of the Bank of Canada observation
}

/** Daily snapshot row written by the cron job. Prices are in source currency. */
export interface PriceSnapshot {
  cardId: string;
  variant: Variant;
  /** Stamp of a stamped printing; "" or absent for regular printings. */
  stamp?: string;
  date: string; // YYYY-MM-DD
  tcgplayerMarketUsd: number | null;
  cardmarketTrendEur: number | null;
}

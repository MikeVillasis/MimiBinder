// Raw TCGdex v2 response shapes (only the fields we use). Everything is optional
// because TCGdex data is community-maintained and fields are frequently missing or null.

export interface RawCardCount {
  official?: number | null;
  total?: number | null;
}

export interface RawSetBrief {
  id: string;
  name: string;
  logo?: string | null;
  symbol?: string | null;
  cardCount?: RawCardCount | null;
}

export interface RawCardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string | null;
}

export interface RawTcgplayerVariant {
  lowPrice?: number | null;
  midPrice?: number | null;
  highPrice?: number | null;
  marketPrice?: number | null;
  directLowPrice?: number | null;
}

export interface RawTcgplayer {
  unit?: string;
  updated?: string;
  [variantKey: string]: RawTcgplayerVariant | string | undefined | null;
}

export interface RawCardmarket {
  unit?: string;
  updated?: string;
  avg?: number | null;
  low?: number | null;
  trend?: number | null;
  avg1?: number | null;
  avg7?: number | null;
  avg30?: number | null;
  "avg-holo"?: number | null;
  "low-holo"?: number | null;
  "trend-holo"?: number | null;
  "avg1-holo"?: number | null;
  "avg7-holo"?: number | null;
  "avg30-holo"?: number | null;
}

/** One entry of TCGdex `variants_detailed` (a specific printing, possibly stamped or jumbo). */
export interface RawVariantDetailed {
  type?: string | null; // "normal" | "holo" | "reverse" | "lenticular" | "firstEdition" | …
  size?: string | null; // "standard" | "jumbo"
  stamp?: string[] | null;
  pricing?: {
    tcgplayer?: RawTcgplayer | null;
    cardmarket?: RawCardmarket | null;
  } | null;
}

export interface RawCard extends RawCardBrief {
  rarity?: string | null;
  illustrator?: string | null;
  hp?: number | string | null;
  types?: string[] | null;
  set: RawSetBrief;
  variants?: {
    normal?: boolean;
    holo?: boolean;
    reverse?: boolean;
    firstEdition?: boolean;
    wPromo?: boolean;
  } | null;
  pricing?: {
    tcgplayer?: RawTcgplayer | null;
    cardmarket?: RawCardmarket | null;
  } | null;
  variants_detailed?: RawVariantDetailed[] | null;
}

export interface RawSet extends RawSetBrief {
  releaseDate?: string | null;
  serie?: { id: string; name: string } | null;
  cards?: RawCardBrief[] | null;
}

export interface RawSerieBrief {
  id: string;
  name: string;
  logo?: string | null;
}

export interface RawSerie extends RawSerieBrief {
  releaseDate?: string | null;
  sets?: RawSetBrief[] | null;
}

export interface RawValet {
  observations?: Array<{
    d?: string;
    FXUSDCAD?: { v?: string | number } | null;
    FXEURCAD?: { v?: string | number } | null;
  }> | null;
}

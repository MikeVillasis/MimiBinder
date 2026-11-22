// Trimmed real TCGdex / Bank of Canada responses (captured 2026-11-21) for unit tests.
import type { RawCard, RawCardBrief, RawSerie, RawSet, RawValet } from "./raw";

const set151 = {
  cardCount: { official: 165, total: 207 },
  id: "sv03.5",
  logo: "https://assets.tcgdex.net/en/sv/sv03.5/logo",
  name: "151",
  symbol: "https://assets.tcgdex.net/univ/sv/sv03.5/symbol",
};

/** Holo-only card; cardmarket "-holo" block is empty (trend-holo 0). */
export const charizardEx: RawCard = {
  id: "sv03.5-199",
  localId: "199",
  name: "Charizard ex",
  image: "https://assets.tcgdex.net/en/sv/sv03.5/199",
  rarity: "Special illustration rare",
  illustrator: "miki kudo",
  hp: 330,
  types: ["Fire"],
  set: set151,
  variants: { firstEdition: false, holo: true, normal: false, reverse: false, wPromo: false },
  pricing: {
    cardmarket: {
      updated: "2026-11-21T22:16:19.030Z",
      unit: "EUR",
      avg: 336.32,
      low: 199.99,
      trend: 313.78,
      avg1: 306.33,
      avg7: 299.11,
      avg30: 326.81,
      "avg-holo": null,
      "low-holo": null,
      "trend-holo": 0,
      "avg1-holo": null,
      "avg7-holo": null,
      "avg30-holo": null,
    },
    tcgplayer: {
      unit: "USD",
      updated: "2026-11-21T22:16:32.868Z",
      holofoil: {
        lowPrice: 232.66,
        midPrice: 321.35,
        highPrice: 10000,
        marketPrice: 279.37,
        directLowPrice: 255.99,
      },
    },
  },
};

/** Normal + reverse printings. */
export const bulbasaur: RawCard = {
  id: "sv03.5-001",
  localId: "001",
  name: "Bulbasaur",
  image: "https://assets.tcgdex.net/en/sv/sv03.5/001",
  rarity: "Common",
  illustrator: "Yuu Nishida",
  hp: 70,
  types: ["Grass"],
  set: set151,
  variants: { firstEdition: false, holo: false, normal: true, reverse: true, wPromo: false },
  pricing: {
    cardmarket: {
      updated: "2026-11-21T22:16:19.006Z",
      unit: "EUR",
      avg: 0.17,
      low: 0.02,
      trend: 0.17,
      avg1: 0.11,
      avg7: 0.2,
      avg30: 0.2,
      "avg-holo": 0.36,
      "low-holo": 0.05,
      "trend-holo": 0.39,
      "avg1-holo": 0.24,
      "avg7-holo": 0.41,
      "avg30-holo": 0.4,
    },
    tcgplayer: {
      unit: "USD",
      updated: "2026-11-21T22:16:32.868Z",
      "reverse-holofoil": {
        lowPrice: 0.08,
        midPrice: 0.38,
        highPrice: 41.93,
        marketPrice: 0.33,
        directLowPrice: 0.33,
      },
      normal: {
        lowPrice: 0.01,
        midPrice: 0.25,
        highPrice: 15.1,
        marketPrice: 0.24,
        directLowPrice: 0.24,
      },
    },
  },
};

/** Base Set Charizard: holo + 1st edition flags, set without symbol. */
export const baseCharizard: RawCard = {
  id: "base1-4",
  localId: "4",
  name: "Charizard",
  image: "https://assets.tcgdex.net/en/base/base1/4",
  rarity: "Rare",
  illustrator: "Mitsuhiro Arita",
  hp: 120,
  types: ["Fire"],
  set: {
    cardCount: { official: 102, total: 102 },
    id: "base1",
    logo: "https://assets.tcgdex.net/en/base/base1/logo",
    name: "Base Set",
  },
  variants: { firstEdition: true, holo: true, normal: false, reverse: false, wPromo: false },
  pricing: {
    cardmarket: {
      updated: "2026-11-21T22:16:18.973Z",
      unit: "EUR",
      avg: 453.87,
      low: 89.95,
      trend: 441.79,
      avg1: 404.82,
      avg7: 559.08,
      avg30: 473.74,
      "avg-holo": null,
      "low-holo": null,
      "trend-holo": 123.63,
      "avg1-holo": 207.4,
      "avg7-holo": 129.55,
      "avg30-holo": 202.71,
    },
    tcgplayer: {
      unit: "USD",
      updated: "2026-11-21T22:16:19.540Z",
      holofoil: {
        lowPrice: 524.14,
        midPrice: 697.55,
        highPrice: 3499.1,
        marketPrice: 1001.05,
        directLowPrice: 601.99,
      },
    },
  },
};

/** Card with no image, no variants flags, null pricing blocks. */
export const barePromo: RawCard = {
  id: "2024sv-1",
  localId: "1",
  name: "Charizard",
  set: { id: "2024sv", name: "Pokémon 2024 Promos" },
  pricing: { cardmarket: null, tcgplayer: null },
};

export const setDetail151: RawSet = {
  ...set151,
  releaseDate: "2023-09-22",
  serie: { id: "sv", name: "Scarlet & Violet" },
  cards: [
    {
      id: "sv03.5-001",
      image: "https://assets.tcgdex.net/en/sv/sv03.5/001",
      localId: "001",
      name: "Bulbasaur",
    },
    { id: "sv03.5-002", localId: "002", name: "Ivysaur" },
  ],
};

export const serieDetails: RawSerie[] = [
  {
    id: "base",
    name: "Base",
    logo: "https://assets.tcgdex.net/en/base/base1/logo",
    releaseDate: "1999-01-09",
    sets: [
      { id: "base1", name: "Base Set", cardCount: { official: 102, total: 102 } },
      { id: "base2", name: "Jungle", cardCount: { official: 64, total: 64 } },
    ],
  },
  {
    id: "tcgp",
    name: "Pokémon TCG Pocket",
    releaseDate: "2024-10-30",
    sets: [
      { id: "A1", name: "Genetic Apex", cardCount: { official: 226, total: 286 } },
      { id: "A2b", name: "Shining Revelry", cardCount: { official: 96, total: 111 } },
    ],
  },
  {
    id: "sv",
    name: "Scarlet & Violet",
    logo: "https://assets.tcgdex.net/en/sv/sv01/logo",
    releaseDate: "2023-03-31",
    sets: [
      { id: "svp", name: "SVP Black Star Promos", cardCount: { official: 225, total: 226 } },
      {
        id: "sv01",
        name: "Scarlet & Violet",
        logo: "https://assets.tcgdex.net/en/sv/sv01/logo",
        symbol: "https://assets.tcgdex.net/univ/sv/sv01/symbol",
        cardCount: { official: 198, total: 258 },
      },
      { ...set151 },
    ],
  },
];

export const searchPage: RawCardBrief[] = [
  { id: "pl4-1", localId: "1", name: "Charizard", image: "https://assets.tcgdex.net/en/pl/pl4/1" },
  { id: "2024sv-1", localId: "1", name: "Charizard" },
  { id: "30th-c-001", localId: "001", name: "Charizard" },
  { id: "A1-035", localId: "035", name: "Charizard", image: "https://assets.tcgdex.net/en/tcgp/A1/035" },
  { id: "A2b-010", localId: "010", name: "Charizard ex" },
];

export const valet: RawValet = {
  observations: [{ d: "2026-11-20", FXUSDCAD: { v: "1.4325" }, FXEURCAD: { v: "1.5727" } }],
};

// ---- Japanese (/v2/ja), trimmed from real responses captured 2026-11-22 ----------------

const setSV2a = {
  cardCount: { official: 165, total: 210 },
  id: "SV2a",
  name: "ポケモンカード151",
};

/** Japanese 151 Bulbasaur: Cardmarket only (tcgplayer null), normal + reverse. */
export const jaBulbasaur: RawCard = {
  id: "SV2a-001",
  localId: "001",
  name: "フシギダネ",
  image: "https://assets.tcgdex.net/ja/SV/SV2a/001",
  rarity: "Common",
  illustrator: "Yuu Nishida",
  hp: 70,
  types: ["Grass"],
  set: setSV2a,
  variants: { firstEdition: false, holo: false, normal: true, reverse: true, wPromo: false },
  pricing: {
    cardmarket: {
      updated: "2026-11-21T22:16:19.014Z",
      unit: "EUR",
      avg: 1.24,
      low: 0.02,
      trend: 0.02,
      avg1: 0.03,
      avg7: 0.09,
      avg30: 0.47,
      "avg-holo": 5.75,
      "low-holo": 0.1,
      "trend-holo": 8.33,
      "avg1-holo": 1.45,
      "avg7-holo": 8.87,
      "avg30-holo": 6.54,
    },
    tcgplayer: null,
  },
};

export const jaSetDetailSV2a: RawSet = {
  ...setSV2a,
  releaseDate: "2023-06-16",
  serie: { id: "SV", name: "ポケモンカードゲーム スカーレット&バイオレット" },
  cards: [
    { id: "SV2a-001", localId: "001", name: "フシギダネ", image: "https://assets.tcgdex.net/ja/SV/SV2a/001" },
    { id: "SV2a-002", localId: "002", name: "フシギソウ", image: "https://assets.tcgdex.net/ja/SV/SV2a/002" },
  ],
};

/** Japanese series: sets are listed out of release order (as TCGdex does). */
export const jaSerieDetails: RawSerie[] = [
  {
    id: "SV",
    name: "ポケモンカードゲーム スカーレット&バイオレット",
    releaseDate: "2024-08-30",
    sets: [
      { id: "SV-P", name: "スカーレット&バイオレット プロモカード", cardCount: { official: 0, total: 288 } },
      { id: "SV2a", name: "ポケモンカード151", cardCount: { official: 165, total: 210 } },
      { id: "SV1V", name: "バイオレットex", cardCount: { official: 78, total: 108 } },
    ],
  },
  {
    id: "M",
    name: "ポケモンカードゲーム MEGA",
    releaseDate: "2025-09-26",
    sets: [
      { id: "M2", name: "インフェルノX", cardCount: { official: 80, total: 116 } },
      { id: "M1L", name: "メガブレイブ", cardCount: { official: 63, total: 92 } },
    ],
  },
];

/** `/ja/sets?sort:field=releaseDate&sort:order=DESC` ids (SV-P is undated, left out). */
export const jaSetOrder = ["M2", "M1L", "SV2a", "SV1V"];

/** `/ja/cards?dexId=eq:25` (trimmed). */
export const jaPikachuCards: RawCardBrief[] = [
  { id: "SV-P-001", localId: "001", name: "ピカチュウ" },
  { id: "SV1V-024", localId: "024", name: "ピカチュウ" },
  { id: "M2-030", localId: "030", name: "ピカチュウex", image: "https://assets.tcgdex.net/ja/M/M2/030" },
  { id: "SV2a-025", localId: "025", name: "ピカチュウ", image: "https://assets.tcgdex.net/ja/SV/SV2a/025" },
];

const zoruaCardmarket = {
  updated: "2026-11-21T22:16:19.030Z",
  unit: "EUR",
  avg: 7.86,
  low: 4.24,
  trend: 7.75,
  avg1: 7.7,
  avg7: 8.09,
  avg30: 7.83,
  "avg-holo": null,
  "low-holo": null,
  "trend-holo": 0,
  "avg1-holo": null,
  "avg7-holo": null,
  "avg30-holo": null,
};
const zoruaTcgplayer = {
  unit: "USD",
  updated: "2026-11-21T22:16:32.603Z",
  holofoil: { lowPrice: 7.25, midPrice: 9.71, highPrice: 145.35, marketPrice: 8.99, directLowPrice: 12.82 },
};

/** svp-189 N's Zorua (captured 2026-11-22): a plain holo and a Pokémon Center stamped holo. */
export const nsZorua: RawCard = {
  id: "svp-189",
  localId: "189",
  name: "N's Zorua",
  image: "https://assets.tcgdex.net/en/sv/svp/189",
  rarity: "Promo",
  illustrator: "Megumi Mizutani",
  hp: 70,
  types: ["Darkness"],
  set: { cardCount: { official: 225, total: 226 }, id: "svp", name: "SVP Black Star Promos" },
  variants: { firstEdition: false, holo: true, normal: false, reverse: false, wPromo: false },
  pricing: { cardmarket: zoruaCardmarket, tcgplayer: zoruaTcgplayer },
  variants_detailed: [
    { type: "holo", size: "standard", pricing: { cardmarket: zoruaCardmarket, tcgplayer: zoruaTcgplayer } },
    {
      type: "holo",
      size: "standard",
      stamp: ["pokemon-center"],
      pricing: {
        cardmarket: {
          ...zoruaCardmarket,
          avg: 57,
          low: 40,
          trend: 71.71,
          avg1: 53.9,
          avg7: 62.1,
          avg30: 82.55,
        },
        tcgplayer: {
          unit: "USD",
          updated: "2026-11-21T22:16:32.603Z",
          holofoil: { lowPrice: 34.68, midPrice: 41.09, highPrice: 559.18, marketPrice: 38.17, directLowPrice: null },
        },
      },
    },
  ],
};

import { describe, expect, it } from "vitest";
import {
  barePromo,
  baseCharizard,
  bulbasaur,
  charizardEx,
  jaBulbasaur,
  jaPikachuCards,
  jaSerieDetails,
  jaSetDetailSV2a,
  jaSetOrder,
  nsZorua,
  searchPage,
  serieDetails,
  setDetail151,
  valet,
} from "./fixtures.test-data";
import {
  buildSerieIndex,
  excludedSetIds,
  isExcludedCard,
  normalizeCard,
  normalizeCardSummary,
  normalizeFx,
  normalizePrices,
  normalizeSet,
  normalizeSerie,
  normalizeStamped,
  setIdFromCardId,
} from "./normalize";

const sv = { id: "sv", name: "Scarlet & Violet" };

describe("normalizeCard", () => {
  it("maps a holo-only modern card", () => {
    const c = normalizeCard(charizardEx, sv);
    expect(c).toMatchObject({
      id: "sv03.5-199",
      localId: "199",
      name: "Charizard ex",
      image: "https://assets.tcgdex.net/en/sv/sv03.5/199",
      rarity: "Special illustration rare",
      illustrator: "miki kudo",
      hp: 330,
      types: ["Fire"],
      setId: "sv03.5",
      setName: "151",
      setLogo: "https://assets.tcgdex.net/en/sv/sv03.5/logo.webp",
      setSymbol: "https://assets.tcgdex.net/en/sv/sv03.5/symbol.webp",
      setOfficialCount: 165,
      setTotalCount: 207,
      serieId: "sv",
      serieName: "Scarlet & Violet",
      variants: ["holo"],
    });
    expect(c.prices.tcgplayer).toEqual({
      updated: "2026-11-21T22:16:32.868Z",
      variants: { holo: { low: 232.66, mid: 321.35, high: 10000, market: 279.37 } },
    });
    // trend-holo 0 and null holo fields → no holo block
    expect(c.prices.cardmarket).toEqual({
      updated: "2026-11-21T22:16:19.030Z",
      normal: { avg: 336.32, low: 199.99, trend: 313.78, avg7: 299.11, avg30: 326.81 },
    });
  });

  it("maps normal + reverse TCGPlayer keys and the cardmarket holo block", () => {
    const c = normalizeCard(bulbasaur, sv);
    expect(c.variants).toEqual(["normal", "reverse"]);
    expect(c.prices.tcgplayer?.variants.normal?.market).toBe(0.24);
    expect(c.prices.tcgplayer?.variants.reverse?.market).toBe(0.33);
    expect(c.prices.cardmarket?.holo).toEqual({
      avg: 0.36,
      low: 0.05,
      trend: 0.39,
      avg7: 0.41,
      avg30: 0.4,
    });
  });

  it("handles 1st edition flags, missing symbol and missing serie", () => {
    const c = normalizeCard(baseCharizard);
    expect(c.variants).toEqual(["holo", "firstEdition"]);
    expect(c.setSymbol).toBeUndefined();
    expect(c.serieId).toBeUndefined();
    expect(c.prices.tcgplayer?.variants.firstEdition).toBeUndefined();
    expect(c.prices.cardmarket?.holo?.trend).toBe(123.63);
  });

  it("handles a card with no image, no variants and null pricing", () => {
    const c = normalizeCard(barePromo);
    expect(c.image).toBeUndefined();
    expect(c.variants).toEqual(["normal"]);
    expect(c.prices).toEqual({});
    expect(c.rarity).toBeUndefined();
  });

  it("uses fallback TCGPlayer keys (unlimited, 1st-edition)", () => {
    const c = normalizeCard({
      ...barePromo,
      variants: { normal: true, firstEdition: true },
      pricing: {
        tcgplayer: {
          updated: "x",
          unlimited: { marketPrice: 5, midPrice: 6 },
          "1st-edition": { marketPrice: null, midPrice: 50 },
          "1st-edition-holofoil": { marketPrice: 0, lowPrice: null },
        },
      },
    });
    expect(c.prices.tcgplayer?.variants).toEqual({
      normal: { low: null, mid: 6, high: null, market: 5 },
      firstEdition: { low: null, mid: 50, high: null, market: null },
    });
  });
});

describe("sets and series", () => {
  it("normalises a set detail", () => {
    const s = normalizeSet(setDetail151);
    expect(s).toMatchObject({
      id: "sv03.5",
      name: "151",
      serieId: "sv",
      serieName: "Scarlet & Violet",
      releaseDate: "2023-09-22",
      officialCount: 165,
      totalCount: 207,
    });
    expect(s.cards).toEqual([
      {
        id: "sv03.5-001",
        localId: "001",
        name: "Bulbasaur",
        image: "https://assets.tcgdex.net/en/sv/sv03.5/001",
      },
      { id: "sv03.5-002", localId: "002", name: "Ivysaur", image: undefined },
    ]);
  });

  it("builds the serie index newest first and excludes TCG Pocket", () => {
    const idx = buildSerieIndex(serieDetails);
    expect(idx.series.map((s) => s.id)).toEqual(["sv", "base"]);
    expect(idx.series[0]).toEqual({
      id: "sv",
      name: "Scarlet & Violet",
      logo: "https://assets.tcgdex.net/en/sv/sv01/logo.webp",
      setIds: ["svp", "sv01", "sv03.5"],
    });
    expect(idx.sets.map((s) => s.id)).toEqual(["sv03.5", "sv01", "svp", "base2", "base1"]);
    expect(idx.sets[0]).toMatchObject({ serieId: "sv", serieName: "Scarlet & Violet" });
    expect(idx.setToSerie.get("base2")).toEqual({ id: "base", name: "Base" });
    expect(idx.setToSerie.has("A1")).toBe(false);
  });
});

describe("search filtering", () => {
  it("derives set ids from card ids", () => {
    expect(setIdFromCardId("sv03.5-199", "199")).toBe("sv03.5");
    expect(setIdFromCardId("30th-c-001", "001")).toBe("30th-c");
    expect(setIdFromCardId("A2b-010", "010")).toBe("A2b");
  });

  it("drops TCG Pocket cards by set id or image path", () => {
    const excluded = excludedSetIds(serieDetails);
    const kept = searchPage.filter((c) => !isExcludedCard(c, excluded)).map((c) => c.id);
    expect(kept).toEqual(["pl4-1", "2024sv-1", "30th-c-001"]);
    // image path alone is enough when the index is unavailable
    expect(isExcludedCard(searchPage[3], new Set())).toBe(true);
  });
});

describe("normalizeFx", () => {
  it("parses Valet string values", () => {
    expect(normalizeFx(valet)).toEqual({ usdCad: 1.4325, eurCad: 1.5727, date: "2026-11-20" });
  });
  it("returns null for unusable payloads", () => {
    expect(normalizeFx({})).toBeNull();
    expect(normalizeFx({ observations: [{ d: "2026-11-20", FXUSDCAD: { v: "" } }] })).toBeNull();
  });
  it("omits eurCad when missing", () => {
    expect(normalizeFx({ observations: [{ d: "2026-11-20", FXUSDCAD: { v: "1.4" } }] })).toEqual({
      usdCad: 1.4,
      date: "2026-11-20",
    });
  });
});

describe("Japanese normalisation (ja: prefixed ids)", () => {
  const jaSv = { id: "ja:SV", name: "ポケモンカードゲーム スカーレット&バイオレット" };

  it("prefixes card, set and serie ids and drops TCGPlayer prices", () => {
    const c = normalizeCard(jaBulbasaur, jaSv, "ja");
    expect(c).toMatchObject({
      id: "ja:SV2a-001",
      localId: "001",
      name: "フシギダネ",
      image: "https://assets.tcgdex.net/ja/SV/SV2a/001",
      rarity: "Common",
      setId: "ja:SV2a",
      setName: "ポケモンカード151",
      setOfficialCount: 165,
      setTotalCount: 210,
      serieId: "ja:SV",
      variants: ["normal", "reverse"],
    });
    expect(c.prices.tcgplayer).toBeUndefined();
    expect(c.prices.cardmarket?.normal.trend).toBe(0.02);
    expect(c.prices.cardmarket?.holo?.trend).toBe(8.33);
    // An unprefixed serie ref is prefixed too; prefixing is idempotent.
    expect(normalizeCard(jaBulbasaur, { id: "SV", name: "x" }, "ja").serieId).toBe("ja:SV");
    expect(normalizeCardSummary({ ...jaPikachuCards[0], id: "ja:SV-P-001" }, "ja").id).toBe("ja:SV-P-001");
  });

  it("ignores a Japanese tcgplayer block even if TCGdex sends one", () => {
    const pricing = { tcgplayer: { updated: "x", normal: { marketPrice: 1 } }, cardmarket: null };
    expect(normalizePrices(pricing, "ja")).toEqual({});
    expect(normalizePrices(pricing, "en").tcgplayer?.variants.normal?.market).toBe(1);
  });

  it("English stays unprefixed", () => {
    const c = normalizeCard(bulbasaur, sv);
    expect(c.id).toBe("sv03.5-001");
    expect(c.setId).toBe("sv03.5");
    expect(c.serieId).toBe("sv");
  });

  it("prefixes set details and their cards", () => {
    const s = normalizeSet(jaSetDetailSV2a, "ja");
    expect(s.id).toBe("ja:SV2a");
    expect(s.serieId).toBe("ja:SV");
    expect(s.releaseDate).toBe("2023-06-16");
    expect(s.cards.map((c) => c.id)).toEqual(["ja:SV2a-001", "ja:SV2a-002"]);
  });

  it("prefixes series and their set ids", () => {
    const serie = normalizeSerie(jaSerieDetails[0], "ja");
    expect(serie.id).toBe("ja:SV");
    expect(serie.setIds).toEqual(["ja:SV-P", "ja:SV2a", "ja:SV1V"]);
  });

  it("derives prefixed set ids from prefixed card ids", () => {
    expect(setIdFromCardId("ja:SV2a-001", "001")).toBe("ja:SV2a");
    expect(setIdFromCardId("ja:SV-P-001", "001")).toBe("ja:SV-P");
    expect(setIdFromCardId("ja:M-P-012", "012")).toBe("ja:M-P");
  });

  it("builds a prefixed serie index ordered by release date", () => {
    const idx = buildSerieIndex(jaSerieDetails, "ja", jaSetOrder);
    expect(idx.series.map((s) => s.id)).toEqual(["ja:M", "ja:SV"]);
    // Ranked sets newest first; the undated SV-P goes last.
    expect(idx.sets.map((s) => s.id)).toEqual(["ja:M2", "ja:M1L", "ja:SV2a", "ja:SV1V", "ja:SV-P"]);
    expect(idx.sets.every((s) => s.serieId.startsWith("ja:"))).toBe(true);
    // Serie.setIds in release order (oldest first), unranked first.
    expect(idx.series[1].setIds).toEqual(["ja:SV-P", "ja:SV1V", "ja:SV2a"]);
    expect(idx.series[0].setIds).toEqual(["ja:M1L", "ja:M2"]);
    expect(idx.setToSerie.get("ja:SV2a")).toEqual({ id: "ja:SV", name: jaSerieDetails[0].name });
    expect(idx.setToSerie.has("SV2a")).toBe(false);
  });

  it("without a set order, keeps the serie-based order", () => {
    const idx = buildSerieIndex(jaSerieDetails, "ja");
    expect(idx.sets.map((s) => s.id)).toEqual(["ja:M1L", "ja:M2", "ja:SV1V", "ja:SV2a", "ja:SV-P"]);
  });

  it("exclusion is harmless for Japanese (no TCG Pocket serie)", () => {
    const excluded = excludedSetIds(jaSerieDetails, "ja");
    expect(excluded.size).toBe(0);
    expect(jaPikachuCards.filter((c) => isExcludedCard(c, excluded, "ja"))).toEqual([]);
    // Prefixed exclusion set ids are matched against prefixed card ids.
    expect(isExcludedCard(jaPikachuCards[1], new Set(["ja:SV1V"]), "ja")).toBe(true);
    expect(isExcludedCard(jaPikachuCards[1], new Set(["SV1V"]), "ja")).toBe(false);
  });
});

describe("stamped printings", () => {
  it("svp-189: Pokémon Center holo with its own prices; unstamped prices unchanged", () => {
    const card = normalizeCard(nsZorua);
    expect(card.variants).toEqual(["holo"]);
    expect(card.prices.tcgplayer?.variants.holo?.market).toBe(8.99);
    expect(card.prices.cardmarket?.normal.trend).toBe(7.75);
    expect(card.stamped).toEqual([
      {
        variant: "holo",
        stamp: "pokemon-center",
        tcgplayer: { low: 34.68, mid: 41.09, high: 559.18, market: 38.17 },
        cardmarket: { avg: 57, low: 40, trend: 71.71, avg7: 62.1, avg30: 82.55 },
      },
    ]);
  });

  it("omits `stamped` when a card has no stamped printings", () => {
    expect(normalizeCard(bulbasaur).stamped).toBeUndefined();
    expect(normalizeCard({ ...nsZorua, variants_detailed: [nsZorua.variants_detailed![0]] }).stamped).toBeUndefined();
  });

  it("maps types, joins slugs, dedupes, skips jumbo and unknown types", () => {
    const tp = (key: string, market: number) => ({ tcgplayer: { [key]: { marketPrice: market, midPrice: 1 } } });
    const out = normalizeStamped([
      { type: "normal", size: "standard", stamp: ["set-logo", "staff"], pricing: tp("normal", 3) },
      { type: "normal", size: "standard", stamp: ["set-logo", "staff"], pricing: tp("normal", 99) },
      { type: "reverse", size: "standard", stamp: ["player-rewards-program"], pricing: tp("reverse-holofoil", 4) },
      { type: "holo", size: "standard", stamp: ["worlds-2023"], pricing: tp("unlimited-holofoil", 5) },
      { type: "firstEdition", size: "standard", stamp: ["gamestop"], pricing: tp("1st-edition", 6) },
      { type: "holo", size: "jumbo", stamp: ["pokemon-center"] },
      { type: "metal", size: "standard", stamp: ["x"] },
      { type: "normal", stamp: [] },
      { type: "normal", stamp: ["snowflake"], pricing: tp("holofoil", 7) },
    ]);
    expect(out.map((p) => [p.variant, p.stamp, p.tcgplayer?.market])).toEqual([
      ["normal", "set-logo+staff", 3],
      ["reverse", "player-rewards-program", 4],
      ["holo", "worlds-2023", 5],
      ["firstEdition", "gamestop", 6],
      ["normal", "snowflake", undefined],
    ]);
  });

  it("lenticular becomes holo with a leading lenticular stamp, even when unstamped", () => {
    const out = normalizeStamped([
      { type: "lenticular", size: "standard" },
      { type: "lenticular", size: "standard", stamp: ["pokemon-center"], pricing: { tcgplayer: { holofoil: { marketPrice: 12 } } } },
    ]);
    expect(out).toEqual([
      { variant: "holo", stamp: "lenticular" },
      { variant: "holo", stamp: "lenticular+pokemon-center", tcgplayer: { low: null, mid: null, high: null, market: 12 } },
    ]);
  });

  it("Japanese cards drop TCGPlayer but keep Cardmarket", () => {
    const out = normalizeStamped(nsZorua.variants_detailed, "ja");
    expect(out[0].tcgplayer).toBeUndefined();
    expect(out[0].cardmarket?.trend).toBe(71.71);
  });

  it("tolerates missing or malformed variants_detailed", () => {
    expect(normalizeStamped(undefined)).toEqual([]);
    expect(normalizeStamped(null)).toEqual([]);
    expect(normalizeStamped([null as never, {}])).toEqual([]);
  });
});

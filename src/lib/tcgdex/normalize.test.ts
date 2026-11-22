import { describe, expect, it } from "vitest";
import {
  barePromo,
  baseCharizard,
  bulbasaur,
  charizardEx,
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
  normalizeFx,
  normalizeSet,
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

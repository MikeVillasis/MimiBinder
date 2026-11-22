import { describe, expect, it } from "vitest";
import { collectionValue, groupBySerie, groupBySet, setCompletion, UNKNOWN_SERIE } from "./collection";
import { normalizeCard } from "./tcgdex/normalize";
import { bulbasaur, charizardEx } from "./tcgdex/fixtures.test-data";
import type { CardDetail, CollectionEntry, FxRate, SetSummary } from "./types";

let n = 0;
function entry(p: Partial<CollectionEntry>): CollectionEntry {
  n++;
  return {
    id: `e${n}`,
    cardId: "sv03.5-001",
    cardName: "Bulbasaur",
    localId: "001",
    setId: "sv03.5",
    setName: "151",
    serieId: "sv",
    serieName: "Scarlet & Violet",
    variant: "normal",
    condition: "NM",
    quantity: 1,
    binderIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...p,
  };
}

const set151: SetSummary = {
  id: "sv03.5",
  name: "151",
  serieId: "sv",
  serieName: "Scarlet & Violet",
  officialCount: 165,
  totalCount: 207,
};

describe("grouping", () => {
  it("groups by set and serie, skipping tombstones", () => {
    const es = [
      entry({}),
      entry({ setId: "base1", serieId: "base" }),
      entry({ deletedAt: "2026-02-01T00:00:00.000Z" }),
      entry({ serieId: undefined, setId: "x" }),
    ];
    const bySet = groupBySet(es);
    expect(bySet.get("sv03.5")).toHaveLength(1);
    expect(bySet.get("base1")).toHaveLength(1);
    const bySerie = groupBySerie(es);
    expect([...bySerie.keys()].sort()).toEqual(["base", "sv", UNKNOWN_SERIE].sort());
  });
});

describe("setCompletion", () => {
  it("counts unique numbered cards up to the official count", () => {
    const es = [
      entry({ localId: "001" }),
      entry({ localId: "001", variant: "reverse" }), // duplicate number
      entry({ localId: "1" }), // same number, different formatting
      entry({ localId: "165" }),
      entry({ localId: "199" }), // secret rare, beyond official count
      entry({ localId: "TG01" }), // non numeric
      entry({ localId: "002", quantity: 0 }),
      entry({ localId: "003", deletedAt: "2026-02-01T00:00:00.000Z" }),
      entry({ localId: "004", setId: "other" }),
    ];
    expect(setCompletion(es, set151)).toEqual({ owned: 2, total: 165, percent: 1 });
  });

  it("only reaches 100 when complete", () => {
    const set = { ...set151, officialCount: 300 };
    const es = Array.from({ length: 299 }, (_, i) => entry({ localId: String(i + 1) }));
    expect(setCompletion(es, set).percent).toBe(99);
    es.push(entry({ localId: "300" }));
    expect(setCompletion(es, set).percent).toBe(100);
    expect(setCompletion([], { ...set151, officialCount: 0 }).percent).toBe(0);
  });
});

describe("collectionValue", () => {
  const fx: FxRate = { usdCad: 1.5, eurCad: 2, date: "2026-11-20" };
  const cards = new Map<string, CardDetail>([
    ["sv03.5-001", normalizeCard(bulbasaur)],
    ["sv03.5-199", normalizeCard(charizardEx)],
  ]);

  it("sums value and cost in the display currency", () => {
    const es = [
      entry({ quantity: 2, purchasePrice: 1, purchaseCurrency: "CAD" }), // 0.24 USD each
      entry({ cardId: "sv03.5-199", variant: "holo", purchasePrice: 200, purchaseCurrency: "USD" }), // 279.37 USD
      entry({ cardId: "unknown-1" }), // unpriced
      entry({ cardId: "sv03.5-001", variant: "firstEdition" }), // no price for variant
      entry({ deletedAt: "2026-02-01T00:00:00.000Z", quantity: 99 }),
    ];
    const r = collectionValue(es, cards, { currency: "CAD", priceSource: "tcgplayer" }, fx);
    const value = (0.24 * 2 + 279.37) * 1.5;
    const cost = 2 + 200 * 1.5;
    expect(r.value).toBeCloseTo(value, 2);
    expect(r.cost).toBeCloseTo(cost, 2);
    expect(r.gain).toBeCloseTo(value - cost, 1);
    expect(r.priced).toBe(2);
    expect(r.unpriced).toBe(2);
  });

  it("uses cardmarket in USD", () => {
    const es = [entry({ cardId: "sv03.5-199", variant: "holo" })];
    const r = collectionValue(es, cards, { currency: "USD", priceSource: "cardmarket" }, fx);
    expect(r.value).toBeCloseTo((313.78 * 2) / 1.5, 2);
    expect(r.cost).toBe(0);
  });

  it("assumes settings currency when purchase currency is missing", () => {
    const es = [entry({ purchasePrice: 10 })];
    const r = collectionValue(es, cards, { currency: "USD", priceSource: "tcgplayer" }, fx);
    expect(r.cost).toBe(10);
  });
});

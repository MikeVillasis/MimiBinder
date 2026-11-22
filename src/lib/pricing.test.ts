import { describe, expect, it } from "vitest";
import { cardImage, convert, effectiveSource, FALLBACK_FX, formatMoney, unitPrice } from "./pricing";
import { normalizeCard } from "./tcgdex/normalize";
import { baseCharizard, barePromo, bulbasaur, charizardEx, jaBulbasaur, nsZorua } from "./tcgdex/fixtures.test-data";
import type { FxRate } from "./types";

const fx: FxRate = { usdCad: 1.4, eurCad: 1.5, date: "2026-11-20" };

describe("cardImage", () => {
  it("appends quality and webp", () => {
    expect(cardImage("https://assets.tcgdex.net/en/sv/sv03.5/199", "low")).toBe(
      "https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp",
    );
    expect(cardImage("https://x/1/", "high")).toBe("https://x/1/high.webp");
    expect(cardImage(undefined, "low")).toBeUndefined();
  });
});

describe("unitPrice", () => {
  const bulba = normalizeCard(bulbasaur);
  const zard = normalizeCard(charizardEx);
  const base = normalizeCard(baseCharizard);

  it("tcgplayer: variant market price in USD", () => {
    expect(unitPrice(bulba, "normal", "tcgplayer")).toEqual({ amount: 0.24, currency: "USD" });
    expect(unitPrice(bulba, "reverse", "tcgplayer")).toEqual({ amount: 0.33, currency: "USD" });
  });

  it("tcgplayer: falls back to mid, null when variant has no block", () => {
    const card = { ...zard, prices: { tcgplayer: { updated: "", variants: { holo: { low: 1, mid: 2, high: 3, market: null } } } } };
    expect(unitPrice(card, "holo", "tcgplayer")).toEqual({ amount: 2, currency: "USD" });
    expect(unitPrice(base, "firstEdition", "tcgplayer")).toBeNull();
    expect(unitPrice(normalizeCard(barePromo), "normal", "tcgplayer")).toBeNull();
  });

  it("cardmarket: reverse uses the holo block, normal the main block", () => {
    expect(unitPrice(bulba, "reverse", "cardmarket")).toEqual({ amount: 0.39, currency: "EUR" });
    expect(unitPrice(bulba, "normal", "cardmarket")).toEqual({ amount: 0.17, currency: "EUR" });
  });

  it("cardmarket: holo-only card uses main block (empty holo block)", () => {
    expect(unitPrice(zard, "holo", "cardmarket")).toEqual({ amount: 313.78, currency: "EUR" });
  });

  it("cardmarket: holo with no normal printing uses main block even if holo block exists", () => {
    expect(unitPrice(base, "holo", "cardmarket")).toEqual({ amount: 441.79, currency: "EUR" });
  });

  it("cardmarket: holo on a card that also has a normal printing uses the holo block", () => {
    const card: typeof bulba = { ...bulba, variants: ["normal", "holo"] };
    expect(unitPrice(card, "holo", "cardmarket")).toEqual({
      amount: 0.39,
      currency: "EUR",
    });
  });

  it("cardmarket: trend falls back to avg; null without data", () => {
    const card = {
      ...bulba,
      prices: { cardmarket: { updated: "", normal: { avg: 3, low: null, trend: null, avg7: null, avg30: null } } },
    };
    expect(unitPrice(card, "normal", "cardmarket")).toEqual({ amount: 3, currency: "EUR" });
    expect(unitPrice(normalizeCard(barePromo), "normal", "cardmarket")).toBeNull();
  });
});

describe("unitPrice with a stamp", () => {
  const zorua = normalizeCard(nsZorua);

  it("uses the stamped printing's prices; no stamp keeps the regular price", () => {
    expect(unitPrice(zorua, "holo", "tcgplayer", "pokemon-center")).toEqual({ amount: 38.17, currency: "USD" });
    expect(unitPrice(zorua, "holo", "cardmarket", "pokemon-center")).toEqual({ amount: 71.71, currency: "EUR" });
    expect(unitPrice(zorua, "holo", "tcgplayer")).toEqual({ amount: 8.99, currency: "USD" });
    expect(unitPrice(zorua, "holo", "tcgplayer", "")).toEqual({ amount: 8.99, currency: "USD" });
  });

  it("falls back to mid / avg", () => {
    const card = {
      ...zorua,
      stamped: [
        {
          variant: "holo" as const,
          stamp: "staff",
          tcgplayer: { low: null, mid: 5, high: null, market: null },
          cardmarket: { avg: 4, low: null, trend: null, avg7: null, avg30: null },
        },
      ],
    };
    expect(unitPrice(card, "holo", "tcgplayer", "staff")).toEqual({ amount: 5, currency: "USD" });
    expect(unitPrice(card, "holo", "cardmarket", "staff")).toEqual({ amount: 4, currency: "EUR" });
  });

  it("null when the printing or its price is missing", () => {
    expect(unitPrice(zorua, "holo", "tcgplayer", "staff")).toBeNull();
    expect(unitPrice(zorua, "normal", "tcgplayer", "pokemon-center")).toBeNull();
    expect(unitPrice(normalizeCard(bulbasaur), "normal", "tcgplayer", "pokemon-center")).toBeNull();
    const noPrice = { ...zorua, stamped: [{ variant: "holo" as const, stamp: "pokemon-center" }] };
    expect(unitPrice(noPrice, "holo", "tcgplayer", "pokemon-center")).toBeNull();
    expect(unitPrice(noPrice, "holo", "cardmarket", "pokemon-center")).toBeNull();
  });

  it("Japanese stamped cards price from Cardmarket", () => {
    const ja = normalizeCard({ ...nsZorua, id: "ja:SVP-189" }, undefined, "ja");
    expect(unitPrice(ja, "holo", "tcgplayer", "pokemon-center")).toEqual({ amount: 71.71, currency: "EUR" });
  });
});

describe("convert", () => {
  it("converts via CAD", () => {
    expect(convert(10, "USD", "CAD", fx)).toBeCloseTo(14);
    expect(convert(10, "EUR", "CAD", fx)).toBeCloseTo(15);
    expect(convert(14, "CAD", "USD", fx)).toBeCloseTo(10);
    expect(convert(10, "EUR", "USD", fx)).toBeCloseTo(15 / 1.4);
    expect(convert(10, "USD", "USD", fx)).toBe(10);
    expect(convert(10, "CAD", "CAD", fx)).toBe(10);
  });
  it("uses fallback EUR rate when missing", () => {
    expect(convert(10, "EUR", "CAD", { usdCad: 1.4, date: "x" })).toBeCloseTo(10 * FALLBACK_FX.eurCad!);
  });
});

describe("formatMoney", () => {
  it("formats en-CA", () => {
    expect(formatMoney(1234.5, "CAD")).toBe("$1,234.50");
    expect(formatMoney(1234.5, "USD")).toBe("US$1,234.50");
  });
});

describe("Japanese cards", () => {
  const ja = normalizeCard(jaBulbasaur, { id: "ja:SV", name: "SV" }, "ja");

  it("effectiveSource forces Cardmarket for ja: ids only", () => {
    expect(effectiveSource("ja:SV2a-001", "tcgplayer")).toBe("cardmarket");
    expect(effectiveSource("ja:SV2a-001", "cardmarket")).toBe("cardmarket");
    expect(effectiveSource("sv03.5-001", "tcgplayer")).toBe("tcgplayer");
    expect(effectiveSource("sv03.5-001", "cardmarket")).toBe("cardmarket");
  });

  it("unitPrice uses Cardmarket EUR whatever the source setting", () => {
    expect(unitPrice(ja, "normal", "tcgplayer")).toEqual({ amount: 0.02, currency: "EUR" });
    expect(unitPrice(ja, "normal", "cardmarket")).toEqual({ amount: 0.02, currency: "EUR" });
    expect(unitPrice(ja, "reverse", "tcgplayer")).toEqual({ amount: 8.33, currency: "EUR" });
  });

  it("English cards still honour the tcgplayer setting", () => {
    expect(unitPrice(normalizeCard(bulbasaur), "normal", "tcgplayer")?.currency).toBe("USD");
  });
});

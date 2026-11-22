import { describe, expect, it } from "vitest";
import { jaBulbasaur } from "@/lib/tcgdex/fixtures.test-data";
import { normalizeCard } from "@/lib/tcgdex/normalize";
import type { CardDetail } from "@/lib/types";
import {
  buildFxRow,
  buildSnapshotRows,
  groupTargets,
  mapWithConcurrency,
  rowToSnapshot,
  snapshotPrices,
  utcDate,
} from "./snapshots";

const tp = (market: number | null, mid: number | null = null) => ({ low: null, mid, high: null, market });
const cmp = (trend: number | null, avg: number | null = null) => ({ avg, low: null, trend, avg7: null, avg30: null });

const card = (prices: CardDetail["prices"]): CardDetail => ({
  id: "sv03.5-199",
  localId: "199",
  name: "Charizard ex",
  setId: "sv03.5",
  setName: "151",
  variants: ["normal", "holo", "reverse"],
  prices,
});

describe("groupTargets", () => {
  it("groups by card, dedupes variants and drops invalid rows", () => {
    const m = groupTargets([
      { card_id: "a", variant: "normal" },
      { card_id: "a", variant: "reverse" },
      { card_id: "a", variant: "normal" },
      { card_id: "b", variant: "holo" },
      { card_id: "c", variant: "shiny" },
      { card_id: null, variant: "normal" },
      { card_id: "d", variant: null },
    ]);
    expect([...m.entries()]).toEqual([
      ["a", ["normal", "reverse"]],
      ["b", ["holo"]],
    ]);
  });
});

describe("snapshotPrices", () => {
  it("uses tcgplayer market, falling back to mid", () => {
    const c = card({ tcgplayer: { updated: "", variants: { normal: tp(1.5), reverse: tp(null, 2.25) } } });
    expect(snapshotPrices(c, "normal").tcgplayerMarketUsd).toBe(1.5);
    expect(snapshotPrices(c, "reverse").tcgplayerMarketUsd).toBe(2.25);
    expect(snapshotPrices(c, "holo").tcgplayerMarketUsd).toBeNull();
  });

  it("uses the cardmarket holo block for holo/reverse when present, trend then avg", () => {
    const c = card({ cardmarket: { updated: "", normal: cmp(3), holo: cmp(null, 7) } });
    expect(snapshotPrices(c, "normal").cardmarketTrendEur).toBe(3);
    expect(snapshotPrices(c, "reverse").cardmarketTrendEur).toBe(7);
    expect(snapshotPrices(c, "holo").cardmarketTrendEur).toBe(7);
    expect(snapshotPrices(c, "firstEdition").cardmarketTrendEur).toBe(3);
    const noHolo = card({ cardmarket: { updated: "", normal: cmp(4) } });
    expect(snapshotPrices(noHolo, "reverse").cardmarketTrendEur).toBe(4);
  });

  it("handles cards with no prices", () => {
    expect(snapshotPrices(card({}), "normal")).toEqual({ tcgplayerMarketUsd: null, cardmarketTrendEur: null });
  });
});

describe("buildSnapshotRows", () => {
  it("builds one row per priced variant and skips unpriced ones", () => {
    const c = card({
      tcgplayer: { updated: "", variants: { normal: tp(1.5) } },
      cardmarket: { updated: "", normal: cmp(1.2), holo: cmp(5) },
    });
    const rows = buildSnapshotRows(c, ["normal", "reverse", "firstEdition", "normal"], "2026-11-21");
    expect(rows).toEqual([
      { card_id: "sv03.5-199", variant: "normal", date: "2026-11-21", tcgplayer_market_usd: 1.5, cardmarket_trend_eur: 1.2 },
      { card_id: "sv03.5-199", variant: "reverse", date: "2026-11-21", tcgplayer_market_usd: null, cardmarket_trend_eur: 5 },
      { card_id: "sv03.5-199", variant: "firstEdition", date: "2026-11-21", tcgplayer_market_usd: null, cardmarket_trend_eur: 1.2 },
    ]);
    expect(buildSnapshotRows(card({}), ["normal"], "2026-11-21")).toEqual([]);
  });

  it("keys rows by the requested card id", () => {
    const c = card({ tcgplayer: { updated: "", variants: { normal: tp(1) } } });
    expect(buildSnapshotRows(c, ["normal"], "2026-11-21", "requested-id")[0].card_id).toBe("requested-id");
  });

  it("ignores non-finite numbers", () => {
    const c = card({ tcgplayer: { updated: "", variants: { normal: tp(Number.NaN, 2) } } });
    expect(buildSnapshotRows(c, ["normal"], "d")[0].tcgplayer_market_usd).toBe(2);
  });
});

describe("buildFxRow / utcDate / rowToSnapshot", () => {
  it("builds fx rows and rejects invalid rates", () => {
    expect(buildFxRow({ usdCad: 1.39, eurCad: 1.5, date: "2026-11-20" }, "2026-11-21")).toEqual({
      date: "2026-11-21",
      usd_cad: 1.39,
      eur_cad: 1.5,
    });
    expect(buildFxRow({ usdCad: 1.39, date: "x" }, "d")?.eur_cad).toBeNull();
    expect(buildFxRow({ usdCad: 0, date: "x" }, "d")).toBeNull();
  });

  it("utcDate uses UTC", () => {
    expect(utcDate(new Date("2026-11-21T23:30:00-05:00"))).toBe("2026-11-22");
  });

  it("rowToSnapshot converts numeric strings and rejects unknown variants", () => {
    expect(
      rowToSnapshot({ card_id: "a", variant: "holo", date: "2026-11-21", tcgplayer_market_usd: "1.50", cardmarket_trend_eur: null }),
    ).toEqual({ cardId: "a", variant: "holo", date: "2026-11-21", tcgplayerMarketUsd: 1.5, cardmarketTrendEur: null });
    expect(
      rowToSnapshot({ card_id: "a", variant: "x", date: "d", tcgplayer_market_usd: null, cardmarket_trend_eur: null }),
    ).toBeNull();
  });
});

describe("mapWithConcurrency", () => {
  it("bounds in-flight work, preserves order and captures failures", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    const { results, skipped } = await mapWithConcurrency(items, 5, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      if (n === 7) throw new Error("boom");
      return n * 2;
    });
    expect(peak).toBe(5);
    expect(skipped).toBe(0);
    expect(results[3]).toEqual({ ok: true, value: 6 });
    expect(results[7]?.ok).toBe(false);
  });

  it("skips items not started before the deadline", async () => {
    let clock = 0;
    const { results, skipped } = await mapWithConcurrency(
      [1, 2, 3, 4],
      1,
      async (n) => {
        clock += 10;
        return n;
      },
      15,
      () => clock,
    );
    expect(results.filter(Boolean)).toHaveLength(2);
    expect(skipped).toBe(2);
  });
});

describe("Japanese cards", () => {
  it("snapshot Cardmarket only, TCGPlayer null, keeping the prefixed id", () => {
    const card = normalizeCard(jaBulbasaur, { id: "ja:SV", name: "SV" }, "ja");
    expect(buildSnapshotRows(card, ["normal", "reverse"], "2026-11-22")).toEqual([
      { card_id: "ja:SV2a-001", variant: "normal", date: "2026-11-22", tcgplayer_market_usd: null, cardmarket_trend_eur: 0.02 },
      { card_id: "ja:SV2a-001", variant: "reverse", date: "2026-11-22", tcgplayer_market_usd: null, cardmarket_trend_eur: 8.33 },
    ]);
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { jaBulbasaur, nsZorua } from "@/lib/tcgdex/fixtures.test-data";
import { normalizeCard } from "@/lib/tcgdex/normalize";
import type { CardDetail } from "@/lib/types";
import {
  buildFxRow,
  buildSnapshotRows,
  groupTargets,
  isMissingStampSchema,
  mapWithConcurrency,
  readHistoryRows,
  readSnapshotTargets,
  rowToSnapshot,
  snapshotPrices,
  toLegacyRows,
  upsertSnapshots,
  utcDate,
  type SnapshotRow,
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
      ["a", [{ variant: "normal", stamp: "" }, { variant: "reverse", stamp: "" }]],
      ["b", [{ variant: "holo", stamp: "" }]],
    ]);
  });

  it("keeps stamped printings apart from regular ones", () => {
    const m = groupTargets([
      { card_id: "svp-189", variant: "holo", stamp: "" },
      { card_id: "svp-189", variant: "holo", stamp: "pokemon-center" },
      { card_id: "svp-189", variant: "holo", stamp: "pokemon-center" },
      { card_id: "svp-189", variant: "holo", stamp: null },
      { card_id: "svp-189", variant: "holo", stamp: "x".repeat(101) },
    ]);
    expect(m.get("svp-189")).toEqual([
      { variant: "holo", stamp: "" },
      { variant: "holo", stamp: "pokemon-center" },
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
      { card_id: "sv03.5-199", variant: "normal", stamp: "", date: "2026-11-21", tcgplayer_market_usd: 1.5, cardmarket_trend_eur: 1.2 },
      { card_id: "sv03.5-199", variant: "reverse", stamp: "", date: "2026-11-21", tcgplayer_market_usd: null, cardmarket_trend_eur: 5 },
      { card_id: "sv03.5-199", variant: "firstEdition", stamp: "", date: "2026-11-21", tcgplayer_market_usd: null, cardmarket_trend_eur: 1.2 },
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
    ).toEqual({ cardId: "a", variant: "holo", stamp: "", date: "2026-11-21", tcgplayerMarketUsd: 1.5, cardmarketTrendEur: null });
    expect(
      rowToSnapshot({ card_id: "a", variant: "holo", stamp: "staff", date: "d", tcgplayer_market_usd: 2, cardmarket_trend_eur: null })
        ?.stamp,
    ).toBe("staff");
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
      { card_id: "ja:SV2a-001", variant: "normal", stamp: "", date: "2026-11-22", tcgplayer_market_usd: null, cardmarket_trend_eur: 0.02 },
      { card_id: "ja:SV2a-001", variant: "reverse", stamp: "", date: "2026-11-22", tcgplayer_market_usd: null, cardmarket_trend_eur: 8.33 },
    ]);
  });
});

// ---- Stamped printings + schema fallback -----------------------------------------------------

const zorua = normalizeCard(nsZorua);
const silent = () => {};

describe("stamped snapshots", () => {
  it("snapshotPrices uses the stamped printing; missing printing → nulls", () => {
    expect(snapshotPrices(zorua, "holo", "pokemon-center")).toEqual({ tcgplayerMarketUsd: 38.17, cardmarketTrendEur: 71.71 });
    expect(snapshotPrices(zorua, "holo")).toEqual({ tcgplayerMarketUsd: 8.99, cardmarketTrendEur: 7.75 });
    expect(snapshotPrices(zorua, "holo", "staff")).toEqual({ tcgplayerMarketUsd: null, cardmarketTrendEur: null });
  });

  it("buildSnapshotRows writes one row per printing; toLegacyRows keeps regular ones without stamp", () => {
    const rows = buildSnapshotRows(
      zorua,
      [{ variant: "holo", stamp: "" }, { variant: "holo", stamp: "pokemon-center" }, { variant: "holo", stamp: "staff" }],
      "2026-11-22",
    );
    expect(rows).toEqual([
      { card_id: "svp-189", variant: "holo", stamp: "", date: "2026-11-22", tcgplayer_market_usd: 8.99, cardmarket_trend_eur: 7.75 },
      { card_id: "svp-189", variant: "holo", stamp: "pokemon-center", date: "2026-11-22", tcgplayer_market_usd: 38.17, cardmarket_trend_eur: 71.71 },
    ]);
    expect(toLegacyRows(rows)).toEqual([
      { card_id: "svp-189", variant: "holo", date: "2026-11-22", tcgplayer_market_usd: 8.99, cardmarket_trend_eur: 7.75 },
    ]);
  });
});

describe("isMissingStampSchema", () => {
  it("detects a missing stamp column or 0002 RPC, and nothing else", () => {
    expect(isMissingStampSchema({ code: "42703", message: 'column price_snapshots.stamp does not exist' })).toBe(true);
    expect(isMissingStampSchema({ code: "PGRST204", message: "Could not find the 'stamp' column of 'price_snapshots' in the schema cache" })).toBe(true);
    expect(
      isMissingStampSchema({
        code: "PGRST202",
        message: "Could not find the function public.snapshot_printing_targets without parameters in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingStampSchema({ message: "function snapshot_printing_targets() does not exist" })).toBe(true);
    expect(isMissingStampSchema({ code: "23505", message: "duplicate key", details: "Key (card_id, variant, stamp, date)" })).toBe(false);
    expect(isMissingStampSchema({ code: "42703", message: "column foo does not exist" })).toBe(false);
    expect(isMissingStampSchema({ message: "timeout" })).toBe(false);
    expect(isMissingStampSchema(null)).toBe(false);
  });
});

type Result = { data: unknown; error: { message: string; code?: string } | null };

/** Minimal Supabase mock: rpc(name).range(), from(t).upsert(), from(t).select().eq().order().limit(). */
function mockClient(handlers: {
  rpc?: (name: string, from: number, to: number) => Result;
  upsert?: (rows: SnapshotRow[], onConflict: string) => Result;
  select?: (cols: string) => Result;
}) {
  const calls = { rpc: [] as string[], upsert: [] as { rows: SnapshotRow[]; onConflict: string }[], select: [] as string[] };
  const client = {
    rpc: (name: string) => ({
      range: async (from: number, to: number) => {
        calls.rpc.push(name);
        return handlers.rpc!(name, from, to);
      },
    }),
    from: (table: string) => {
      expect(table).toBe("price_snapshots");
      return {
        upsert: async (rows: SnapshotRow[], opts: { onConflict: string }) => {
          calls.upsert.push({ rows, onConflict: opts.onConflict });
          return handlers.upsert!(rows, opts.onConflict);
        },
        select: (cols: string) => {
          calls.select.push(cols);
          const chain = { eq: () => chain, order: () => chain, limit: async () => handlers.select!(cols) };
          return chain;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const missingRpc = { code: "PGRST202", message: "Could not find the function public.snapshot_printing_targets without parameters in the schema cache" };
const missingCol = { code: "PGRST204", message: "Could not find the 'stamp' column of 'price_snapshots' in the schema cache" };

describe("readSnapshotTargets", () => {
  it("reads (card, variant, stamp) from the 0002 RPC, paging", async () => {
    const all = [
      { card_id: "a", variant: "holo", stamp: "" },
      { card_id: "a", variant: "holo", stamp: "pokemon-center" },
      { card_id: "b", variant: "normal", stamp: "" },
    ];
    const { client, calls } = mockClient({ rpc: (_n, from, to) => ({ data: all.slice(from, to + 1), error: null }) });
    const r = await readSnapshotTargets(client, { pageSize: 2, log: silent });
    expect(r).toEqual({ rows: all, schema: "stamped" });
    expect(calls.rpc).toEqual(["snapshot_printing_targets", "snapshot_printing_targets"]);
  });

  it("falls back to the 0001 RPC (regular printings) when 0002 is missing, and logs", async () => {
    const log = vi.fn();
    const { client, calls } = mockClient({
      rpc: (name) =>
        name === "snapshot_printing_targets"
          ? { data: null, error: missingRpc }
          : { data: [{ card_id: "a", variant: "holo" }], error: null },
    });
    const r = await readSnapshotTargets(client, { log });
    expect(r).toEqual({ rows: [{ card_id: "a", variant: "holo" }], schema: "legacy" });
    expect(calls.rpc).toEqual(["snapshot_printing_targets", "snapshot_targets"]);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatch(/0002_stamped_printings/);
  });

  it("throws on other errors", async () => {
    const { client } = mockClient({ rpc: () => ({ data: null, error: { code: "57014", message: "statement timeout" } }) });
    await expect(readSnapshotTargets(client, { log: silent })).rejects.toThrow("statement timeout");
  });
});

describe("upsertSnapshots", () => {
  const rows = buildSnapshotRows(zorua, [{ variant: "holo", stamp: "" }, { variant: "holo", stamp: "pokemon-center" }], "2026-11-22");

  it("stamped schema: writes every printing on the 4-column key, in chunks", async () => {
    const { client, calls } = mockClient({ upsert: () => ({ data: null, error: null }) });
    const r = await upsertSnapshots(client, rows, "stamped", { chunk: 1, log: silent });
    expect(r).toEqual({ upserted: 2, errors: [], schema: "stamped" });
    expect(calls.upsert.map((c) => c.onConflict)).toEqual(["card_id,variant,stamp,date", "card_id,variant,stamp,date"]);
    expect(calls.upsert[1].rows[0].stamp).toBe("pokemon-center");
  });

  it("legacy schema: regular printings only, without stamp, on the old key", async () => {
    const { client, calls } = mockClient({ upsert: () => ({ data: null, error: null }) });
    const r = await upsertSnapshots(client, rows, "legacy", { log: silent });
    expect(r).toEqual({ upserted: 1, errors: [], schema: "legacy" });
    expect(calls.upsert).toEqual([{ rows: toLegacyRows(rows), onConflict: "card_id,variant,date" }]);
    expect("stamp" in calls.upsert[0].rows[0]).toBe(false);
  });

  it("switches to legacy when the stamp column turns out to be missing", async () => {
    const log = vi.fn();
    const { client, calls } = mockClient({
      upsert: (_rows, onConflict) => (onConflict.includes("stamp") ? { data: null, error: missingCol } : { data: null, error: null }),
    });
    const r = await upsertSnapshots(client, rows, "stamped", { log });
    expect(r).toEqual({ upserted: 1, errors: [], schema: "legacy" });
    expect(calls.upsert).toHaveLength(2);
    expect(calls.upsert[1].rows).toEqual(toLegacyRows(rows));
    expect(log).toHaveBeenCalledOnce();
  });

  it("reports other write errors without falling back", async () => {
    const { client } = mockClient({ upsert: () => ({ data: null, error: { code: "23514", message: "check violation" } }) });
    expect(await upsertSnapshots(client, rows, "stamped", { log: silent })).toEqual({
      upserted: 0,
      errors: ["check violation"],
      schema: "stamped",
    });
  });
});

describe("readHistoryRows", () => {
  const base = { card_id: "svp-189", variant: "holo", date: "2026-11-22", tcgplayer_market_usd: "38.17", cardmarket_trend_eur: null };

  it("returns stamp per snapshot", async () => {
    const { client, calls } = mockClient({
      select: () => ({ data: [{ ...base, stamp: "pokemon-center" }, { ...base, stamp: "", tcgplayer_market_usd: 8.99 }], error: null }),
    });
    const r = await readHistoryRows(client, "svp-189", 10);
    expect(r.map((s) => [s.stamp, s.tcgplayerMarketUsd])).toEqual([
      ["pokemon-center", 38.17],
      ["", 8.99],
    ]);
    expect(calls.select).toHaveLength(1);
    expect(calls.select[0]).toMatch(/stamp/);
  });

  it("old schema: re-reads without the column and treats every row as stamp ''", async () => {
    const { client, calls } = mockClient({
      select: (cols) =>
        cols.includes("stamp")
          ? { data: null, error: { code: "42703", message: "column price_snapshots.stamp does not exist" } }
          : { data: [base], error: null },
    });
    const r = await readHistoryRows(client, "svp-189", 10);
    expect(r).toEqual([{ cardId: "svp-189", variant: "holo", stamp: "", date: "2026-11-22", tcgplayerMarketUsd: 38.17, cardmarketTrendEur: null }]);
    expect(calls.select).toHaveLength(2);
  });

  it("throws on other errors", async () => {
    const { client } = mockClient({ select: () => ({ data: null, error: { message: "boom" } }) });
    await expect(readHistoryRows(client, "x", 1)).rejects.toThrow("boom");
  });
});

import { describe, expect, it } from "vitest";
import {
  chunk,
  dedupeNewest,
  fromRemoteRow,
  isNewer,
  maxSyncedAt,
  pullLowerBound,
  selectLocalChanges,
  selectRemoteWinners,
  toPushRow,
  type RemoteRow,
  type Syncable,
} from "./merge";

interface Rec extends Syncable {
  name: string;
}

const rec = (id: string, updatedAt: string, name = id, deletedAt?: string): Rec => ({
  id,
  name,
  updatedAt,
  ...(deletedAt ? { deletedAt } : {}),
});

const row = (r: Rec, syncedAt: string): RemoteRow => ({
  id: r.id,
  data: r,
  updated_at: r.updatedAt,
  deleted_at: r.deletedAt ?? null,
  synced_at: syncedAt,
});

describe("isNewer", () => {
  it("compares instants, not strings", () => {
    // Same instant in different notations is not newer.
    expect(isNewer(rec("a", "2026-01-01T10:00:00.000Z"), rec("a", "2026-01-01T10:00:00+00:00"))).toBe(false);
    expect(isNewer(rec("a", "2026-01-01T10:00:00.001Z"), rec("a", "2026-01-01T10:00:00+00:00"))).toBe(true);
  });
  it("treats missing local as older and invalid timestamps as oldest", () => {
    expect(isNewer(rec("a", "2026-01-01T00:00:00Z"), undefined)).toBe(true);
    expect(isNewer(rec("a", "2026-01-01T00:00:00Z"), rec("a", "garbage"))).toBe(true);
    expect(isNewer(rec("a", "garbage"), rec("a", "2026-01-01T00:00:00Z"))).toBe(false);
  });
});

describe("selectRemoteWinners (last-write-wins)", () => {
  const local = new Map<string, Rec>([
    ["a", rec("a", "2026-01-02T00:00:00Z", "local-a")],
    ["b", rec("b", "2026-01-02T00:00:00Z", "local-b")],
    ["c", rec("c", "2026-01-02T00:00:00Z", "local-c")],
  ]);

  it("applies newer remote, keeps newer local, keeps local on ties, adds unknown ids", () => {
    const remote = [
      rec("a", "2026-01-03T00:00:00Z", "remote-a"), // newer -> wins
      rec("b", "2026-01-01T00:00:00Z", "remote-b"), // older -> loses
      rec("c", "2026-01-02T00:00:00Z", "remote-c"), // tie -> local kept
      rec("d", "2026-01-01T00:00:00Z", "remote-d"), // unknown -> wins
    ];
    const winners = selectRemoteWinners(remote, local);
    expect(winners.map((w) => w.name).sort()).toEqual(["remote-a", "remote-d"]);
  });

  it("applies remote tombstones only when newer", () => {
    const winners = selectRemoteWinners(
      [
        rec("a", "2026-01-05T00:00:00Z", "a", "2026-01-05T00:00:00Z"),
        rec("b", "2026-01-01T00:00:00Z", "b", "2026-01-01T00:00:00Z"),
      ],
      local,
    );
    expect(winners).toHaveLength(1);
    expect(winners[0].id).toBe("a");
    expect(winners[0].deletedAt).toBe("2026-01-05T00:00:00Z");
  });

  it("a newer local edit beats an older remote tombstone (resurrection by edit)", () => {
    const winners = selectRemoteWinners(
      [rec("a", "2026-01-01T00:00:00Z", "a", "2026-01-01T00:00:00Z")],
      local,
    );
    expect(winners).toEqual([]);
  });

  it("de-duplicates remote by id keeping the newest", () => {
    const winners = selectRemoteWinners(
      [rec("z", "2026-01-01T00:00:00Z", "old"), rec("z", "2026-01-04T00:00:00Z", "new")],
      new Map(),
    );
    expect(winners.map((w) => w.name)).toEqual(["new"]);
  });

  it("is idempotent: after applying winners, a second pass selects nothing", () => {
    const remote = [rec("a", "2026-01-03T00:00:00Z"), rec("d", "2026-01-01T00:00:00Z")];
    const merged = new Map(local);
    for (const w of selectRemoteWinners(remote, merged)) merged.set(w.id, w);
    expect(selectRemoteWinners(remote, merged)).toEqual([]);
  });

  it("converges regardless of order across two replicas", () => {
    const x = rec("k", "2026-02-01T00:00:00Z", "x");
    const y = rec("k", "2026-02-02T00:00:00Z", "y");
    const replica1 = new Map<string, Rec>([["k", x]]);
    const replica2 = new Map<string, Rec>([["k", y]]);
    for (const w of selectRemoteWinners([y], replica1)) replica1.set(w.id, w);
    for (const w of selectRemoteWinners([x], replica2)) replica2.set(w.id, w);
    expect(replica1.get("k")?.name).toBe("y");
    expect(replica2.get("k")?.name).toBe("y");
  });
});

describe("selectLocalChanges", () => {
  it("keeps records strictly after the cursor; null cursor keeps all", () => {
    const recs = [rec("a", "2026-01-01T00:00:00Z"), rec("b", "2026-01-03T00:00:00Z")];
    expect(selectLocalChanges(recs, "2026-01-02T00:00:00Z").map((r) => r.id)).toEqual(["b"]);
    expect(selectLocalChanges(recs, null)).toHaveLength(2);
  });
});

describe("row conversion", () => {
  it("toPushRow maps tombstones", () => {
    const r = rec("a", "2026-01-01T00:00:00Z", "a", "2026-01-01T00:00:00Z");
    expect(toPushRow(r)).toEqual({
      id: "a",
      data: r,
      updated_at: r.updatedAt,
      deleted_at: r.deletedAt,
    });
    expect(toPushRow(rec("b", "2026-01-01T00:00:00Z")).deleted_at).toBeNull();
  });

  it("fromRemoteRow round-trips and fills deletedAt from the column", () => {
    const r = rec("a", "2026-01-01T00:00:00Z");
    expect(fromRemoteRow<Rec>(row(r, "2026-01-01T00:00:01Z"))).toEqual(r);
    const tomb = { ...row(r, "x"), deleted_at: "2026-01-02T00:00:00Z" };
    expect(fromRemoteRow<Rec>(tomb)?.deletedAt).toBe("2026-01-02T00:00:00Z");
  });

  it("fromRemoteRow rejects malformed rows", () => {
    const base = row(rec("a", "2026-01-01T00:00:00Z"), "s");
    expect(fromRemoteRow({ ...base, data: null })).toBeNull();
    expect(fromRemoteRow({ ...base, data: [1] })).toBeNull();
    expect(fromRemoteRow({ ...base, data: { id: "other", updatedAt: "2026-01-01T00:00:00Z" } })).toBeNull();
    expect(fromRemoteRow({ ...base, data: { id: "a", updatedAt: "nope" } })).toBeNull();
  });
});

describe("cursors", () => {
  it("maxSyncedAt picks the latest instant and keeps current when nothing is newer", () => {
    const rows = [
      row(rec("a", "2026-01-01T00:00:00Z"), "2026-01-05T00:00:00.000001+00:00"),
      row(rec("b", "2026-01-01T00:00:00Z"), "2026-01-04T00:00:00+00:00"),
    ];
    expect(maxSyncedAt(rows, null)).toBe("2026-01-05T00:00:00.000001+00:00");
    expect(maxSyncedAt(rows, "2026-02-01T00:00:00Z")).toBe("2026-02-01T00:00:00Z");
    expect(maxSyncedAt([], null)).toBeNull();
  });

  it("pullLowerBound steps back by the overlap", () => {
    expect(pullLowerBound("2026-01-01T00:00:10.000Z", 5000)).toBe("2026-01-01T00:00:05.000Z");
    expect(pullLowerBound(null, 5000)).toBeNull();
  });
});

describe("helpers", () => {
  it("chunk splits evenly with a remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
  it("dedupeNewest keeps one per id", () => {
    expect(dedupeNewest([rec("a", "2026-01-01T00:00:00Z"), rec("a", "2026-01-02T00:00:00Z")])).toHaveLength(1);
  });
});

// DB-level pieces of grading-assessment sync: changed-since, applyRemote last-write-wins, tombstones, backups.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyRemote,
  db,
  deleteAssessment,
  exportCollection,
  getChangedSince,
  importCollection,
  parseAssessment,
  recordActualGrade,
  saveAssessment,
  type GradingAssessment,
  type NewAssessment,
} from "./index";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const face = { lr: 55, tb: 52, lrHeavy: "left", tbHeavy: "top", mm: { left: 2.4, right: 2, top: 2.1, bottom: 2 }, shots: 1, flags: [], notAssessed: [] };
const input = (over: Partial<NewAssessment> = {}): NewAssessment => ({ cardId: "sv03.5-025", cardName: "Pikachu", front: face, centeringCeiling: 10, thumbs: { front: "data:image/jpeg;base64,AAAA" }, ...over });

const remote = (id: string, updatedAt: string, over: Partial<GradingAssessment> = {}): GradingAssessment => ({
  id,
  cardId: "sv03.5-025",
  cardName: "Pikachu",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt,
  engine: 1,
  ...over,
});

describe("getChangedSince (assessments)", () => {
  it("returns assessments changed after the cursor, tombstones included", async () => {
    await db.assessments.bulkPut([
      remote("old", "2026-01-01T00:00:00.000Z"),
      remote("new", "2026-01-05T00:00:00.000Z"),
      remote("gone", "2026-01-06T00:00:00.000Z", { deletedAt: "2026-01-06T00:00:00.000Z" }),
    ]);
    const res = await getChangedSince("2026-01-03T00:00:00.000Z");
    expect(res.assessments.map((a) => a.id).sort()).toEqual(["gone", "new"]);
    expect(res.entries).toEqual([]);
    // Non-canonical cursor form still compares correctly.
    expect((await getChangedSince("2026-01-01T00:00:00+00:00")).assessments).toHaveLength(2);
  });

  it("uses its own cursor for assessments when given one", async () => {
    await db.assessments.put(remote("a", "2026-01-02T00:00:00.000Z"));
    // Entries cursor far ahead, assessments cursor at the epoch (table was missing until now): still returned.
    const res = await getChangedSince("2026-06-01T00:00:00.000Z", "1970-01-01T00:00:00.000Z");
    expect(res.assessments.map((a) => a.id)).toEqual(["a"]);
    expect((await getChangedSince("2026-06-01T00:00:00.000Z")).assessments).toEqual([]);
  });

  it("a save, an edit and a delete each move updatedAt past the cursor", async () => {
    const a = await saveAssessment(input());
    const cursor = a.updatedAt;
    expect((await getChangedSince(cursor)).assessments).toEqual([]);
    await recordActualGrade(a.id, { grade: 9 });
    const edited = (await getChangedSince(cursor)).assessments;
    expect(edited).toHaveLength(1);
    await deleteAssessment(a.id);
    const [tomb] = (await getChangedSince(edited[0].updatedAt)).assessments;
    expect(tomb.deletedAt).toBe(tomb.updatedAt);
  });
});

describe("applyRemote (assessments)", () => {
  it("is last-write-wins, keeps updatedAt, and ties keep the local copy", async () => {
    await db.assessments.put(remote("a", "2026-02-01T00:00:00.000Z", { notes: "local" }));
    let res = await applyRemote([], [], [remote("a", "2026-01-01T00:00:00.000Z", { notes: "older" })]);
    expect(res.assessments).toBe(0);
    res = await applyRemote([], [], [remote("a", "2026-02-01T00:00:00.000Z", { notes: "tie" })]);
    expect(res.assessments).toBe(0);
    expect((await db.assessments.get("a"))!.notes).toBe("local");

    res = await applyRemote([], [], [remote("a", "2026-03-01T00:00:00.000Z", { notes: "newer" }), remote("b", "2026-01-01T00:00:00.000Z")]);
    expect(res).toEqual({ entries: 0, binders: 0, assessments: 2 });
    const a = (await db.assessments.get("a"))!;
    expect(a.notes).toBe("newer");
    expect(a.updatedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("keeps the newest of duplicate incoming rows and canonicalises timestamps", async () => {
    const res = await applyRemote([], [], [
      remote("a", "2026-03-01T00:00:00.000Z", { notes: "newest" }),
      remote("a", "2026-02-01T00:00:00+00:00", { notes: "middle" }),
    ]);
    expect(res.assessments).toBe(1);
    expect((await db.assessments.get("a"))!.notes).toBe("newest");
    await applyRemote([], [], [remote("c", "2026-04-01T00:00:00+00:00")]);
    expect((await db.assessments.get("c"))!.updatedAt).toBe("2026-04-01T00:00:00.000Z");
  });

  it("applies a remote tombstone, which hides the check from lists and the backup", async () => {
    const a = await saveAssessment(input());
    const later = new Date(Date.parse(a.updatedAt) + 60_000).toISOString();
    const res = await applyRemote([], [], [{ id: a.id, createdAt: a.createdAt, updatedAt: later, deletedAt: later, engine: 1 }]);
    expect(res.assessments).toBe(1);
    expect((await db.assessments.get(a.id))!.deletedAt).toBe(later);
    expect(JSON.parse(await exportCollection()).assessments).toEqual([]);
  });

  it("a newer local edit beats an older remote tombstone", async () => {
    const a = await saveAssessment(input());
    await recordActualGrade(a.id, { grade: 8 });
    const res = await applyRemote([], [], [{ id: a.id, createdAt: a.createdAt, updatedAt: a.updatedAt, deletedAt: a.updatedAt, engine: 1 }]);
    expect(res.assessments).toBe(0);
    expect((await db.assessments.get(a.id))!.deletedAt).toBeUndefined();
  });

  it("still works for callers that pass only entries and binders", async () => {
    const res = await applyRemote([], []);
    expect(res).toEqual({ entries: 0, binders: 0, assessments: 0 });
  });
});

describe("tombstones", () => {
  it("deleting twice is a no-op and keeps the first deletion time", async () => {
    const a = await saveAssessment(input());
    await deleteAssessment(a.id);
    const first = (await db.assessments.get(a.id))!;
    await deleteAssessment(a.id);
    expect((await db.assessments.get(a.id))!.updatedAt).toBe(first.updatedAt);
    await deleteAssessment("missing"); // unknown id: nothing happens
  });

  it("replace-import tombstones local checks missing from the file", async () => {
    const keep = await saveAssessment(input({ cardName: "keep" }));
    const json = await exportCollection();
    const drop = await saveAssessment(input({ cardName: "drop" }));
    await importCollection(json, "replace");
    expect((await db.assessments.get(drop.id))!.deletedAt).toBeTruthy();
    const kept = (await db.assessments.get(keep.id))!;
    expect(kept.deletedAt).toBeUndefined();
    expect(kept.updatedAt > keep.updatedAt).toBe(true); // fresh updatedAt so it wins on the next sync
  });
});

describe("parseAssessment", () => {
  it("accepts a synced row (nulls dropped) and a tombstone, rejects garbage", () => {
    const ok = parseAssessment({ ...remote("a", "2026-01-01T00:00:00.000Z"), notes: null, actual: { grade: 9, qualifier: null } });
    expect(ok).not.toBeNull();
    expect("notes" in ok!).toBe(false);
    expect(ok!.actual).toEqual({ grade: 9 });
    expect(parseAssessment({ id: "t", createdAt: "x", updatedAt: "y", deletedAt: "y", engine: 1 })).not.toBeNull();
    expect(parseAssessment({ id: "", createdAt: "x", updatedAt: "y" })).toBeNull();
    expect(parseAssessment({ ...remote("a", "2026-01-01T00:00:00.000Z"), actual: { grade: 9.5 } })).toBeNull();
    expect(parseAssessment("nope")).toBeNull();
  });
});

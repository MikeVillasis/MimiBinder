import "fake-indexeddb/auto";
import { Dexie } from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import {
  accuracySummary,
  addEntry,
  db,
  deleteAssessment,
  exportCollection,
  importCollection,
  ImportError,
  isPsaGrade,
  MimiBinderDB,
  PSA_GRADES,
  recordActualGrade,
  saveAssessment,
  updateAssessment,
  type GradingAssessment,
  type NewAssessment,
} from "./index";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const face = { lr: 57.2, tb: 61, lrHeavy: "left", tbHeavy: "bottom", mm: { left: 3, right: 2.2, top: 2, bottom: 3.1 }, shots: 2, spread: 0.4, flags: [], notAssessed: [] };
const input = (over: Partial<NewAssessment> = {}): NewAssessment => ({
  cardId: "sv03.5-001",
  cardName: "Bulbasaur",
  front: face,
  back: { ...face, flags: [{ zone: "corner-tl", kind: "whitening", severity: "minor", lengthMm: 1.2, depthMm: 0.2, areaMm2: 0.2, crop: "data:image/jpeg;base64,AAAA" }] },
  centeringCeiling: 8,
  centeringLimitedBy: "front top/bottom 61.0/39.0",
  probableCeiling: 8,
  ...over,
});

describe("PSA grades", () => {
  it("has half grades up to 8.5 and no 9.5", () => {
    expect(PSA_GRADES).toContain(8.5);
    expect(PSA_GRADES).toContain(1.5);
    expect(PSA_GRADES).not.toContain(9.5);
    expect(isPsaGrade(9.5)).toBe(false);
    expect(isPsaGrade(10)).toBe(true);
    expect(isPsaGrade(0)).toBe(true); // authentic, no numeric grade
  });
});

describe("assessments", () => {
  it("save / update / record the returned grade / delete", async () => {
    const a = await saveAssessment(input());
    expect(a.id).toBeTruthy();
    expect(a.engine).toBeGreaterThan(0);
    expect(a.createdAt).toBe(a.updatedAt);

    await updateAssessment(a.id, { notes: "sent in the March batch" });
    await recordActualGrade(a.id, { grade: 7, qualifier: "", gradedAt: "2027-01-15", cert: " 12345678 " });
    let got = (await db.assessments.get(a.id))!;
    expect(got.notes).toBe("sent in the March batch");
    expect(got.actual).toEqual({ grade: 7, gradedAt: "2027-01-15", cert: "12345678" });
    expect(got.updatedAt > a.updatedAt).toBe(true);
    expect(got.createdAt).toBe(a.createdAt);
    expect(got.back!.flags[0].zone).toBe("corner-tl");

    await expect(recordActualGrade(a.id, { grade: 9.5 })).rejects.toThrow(/PSA grade/);
    await recordActualGrade(a.id, null);
    got = (await db.assessments.get(a.id))!;
    expect("actual" in got).toBe(false);

    await deleteAssessment(a.id);
    expect(await db.assessments.get(a.id)).toBeUndefined();
  });

  it("is found by card id", async () => {
    await saveAssessment(input());
    await saveAssessment(input({ cardId: "sv01-001", cardName: "Pineco" }));
    expect(await db.assessments.where("cardId").equals("sv03.5-001").count()).toBe(1);
  });
});

describe("accuracy log", () => {
  it("compares the ceilings with the grades PSA returned", () => {
    const row = (centering: number | undefined, probable: number | undefined, grade?: number): GradingAssessment => ({
      id: String(Math.random()), createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", engine: 1,
      centeringCeiling: centering, probableCeiling: probable, actual: grade === undefined ? undefined : { grade },
    });
    const s = accuracySummary([row(10, 9, 9), row(9, 8, 7), row(8, 8, 9), row(10, 10), row(10, 10, 0), row(undefined, undefined, 6)]);
    expect(s.total).toBe(6);
    expect(s.graded).toBe(4); // the ungraded row and the "authentic" (0) row are skipped
    expect(s.centeringChecked).toBe(3);
    expect(s.centeringHeld).toBe(2); // the 8-ceiling card came back a 9
    expect(s.probableHeld).toBe(2);
    expect(s.probableExact).toBe(1);
    expect(s.meanGap).toBeCloseTo((0 + 1 - 1) / 3, 6);
    expect(accuracySummary([]).meanGap).toBeNull();
  });
});

describe("backup compatibility", () => {
  it("export carries assessments and they round-trip through replace", async () => {
    const a = await saveAssessment(input());
    await recordActualGrade(a.id, { grade: 8.5 });
    const json = await exportCollection();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.assessments).toHaveLength(1);

    await deleteAssessment(a.id);
    await saveAssessment(input({ cardName: "local only" }));
    const res = await importCollection(json, "replace");
    expect(res.assessments).toBe(1);
    const all = await db.assessments.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(a.id);
    expect(all[0].actual).toEqual({ grade: 8.5 });
    expect(all[0].back!.flags[0].crop).toMatch(/^data:image/);
  });

  it("a backup from before assessments existed still imports and leaves the local log alone", async () => {
    const e = await addEntry({ cardId: "sv03.5-001", cardName: "Bulbasaur", localId: "001", setId: "sv03.5", setName: "151", variant: "normal" });
    const a = await saveAssessment(input());
    const old = JSON.stringify({ version: 1, exportedAt: "2026-01-01T00:00:00.000Z", entries: [e], binders: [], settings: { currency: "CAD", priceSource: "tcgplayer" } });
    for (const mode of ["merge", "replace"] as const) {
      const res = await importCollection(old, mode);
      expect(res.assessments).toBeUndefined();
      expect(await db.assessments.get(a.id)).toBeDefined();
    }
  });

  it("merge keeps the newer assessment", async () => {
    const a = await saveAssessment(input());
    const older = { ...a, notes: "older", updatedAt: "2000-01-01T00:00:00.000Z" };
    let res = await importCollection(JSON.stringify({ version: 1, entries: [], assessments: [older] }), "merge");
    expect(res.assessments).toBe(0);
    expect((await db.assessments.get(a.id))!.notes).toBeUndefined();
    const newer = { ...a, notes: "newer", updatedAt: "2999-01-01T00:00:00.000Z" };
    const fresh = { ...a, id: "other", cardName: "Other" };
    res = await importCollection(JSON.stringify({ version: 1, entries: [], assessments: [newer, fresh] }), "merge");
    expect(res.assessments).toBe(2);
    expect((await db.assessments.get(a.id))!.notes).toBe("newer");
    expect(await db.assessments.count()).toBe(2);
  });

  it("rejects an assessment with a grade PSA does not issue", async () => {
    const a = await saveAssessment(input());
    const bad = { ...a, actual: { grade: 9.5 } };
    await expect(importCollection(JSON.stringify({ version: 1, entries: [], assessments: [bad] }), "merge")).rejects.toBeInstanceOf(ImportError);
  });
});

describe("schema upgrade", () => {
  it("a version 1 database opens under version 2 with its rows intact", async () => {
    const name = "mimibinder-upgrade-test";
    await Dexie.delete(name);
    const v1 = new Dexie(name);
    v1.version(1).stores({ entries: "id, cardId, setId, serieId, updatedAt", binders: "id, updatedAt", settings: "key", cardCache: "id, cachedAt" });
    await v1.table("entries").add({ id: "e1", cardId: "sv03.5-001", cardName: "Bulbasaur", localId: "001", setId: "sv03.5", setName: "151", variant: "normal", condition: "NM", quantity: 2, binderIds: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    await v1.table("settings").put({ key: "settings", currency: "USD", priceSource: "cardmarket" });
    v1.close();

    const v2 = new MimiBinderDB(name);
    expect((await v2.entries.get("e1"))!.quantity).toBe(2);
    expect((await v2.settings.get("settings"))!.currency).toBe("USD");
    expect(await v2.assessments.count()).toBe(0);
    await v2.assessments.add({ id: "a1", createdAt: "2026-02-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z", engine: 1 });
    expect(await v2.assessments.count()).toBe(1);
    expect(v2.verno).toBe(2);
    v2.close();
    await Dexie.delete(name);
  });
});

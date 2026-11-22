// Sync engine against a mocked Supabase client (no live Supabase): assessments sync alongside entries/binders,
// and a missing `grading_assessments` table (migration 0003 not run) skips only the assessments phase.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addEntry, db, deleteAssessment, saveAssessment } from "@/lib/db";

type Err = { code?: string; message: string } | null;
interface MockOpts {
  assessmentsMissing?: boolean;
  assessmentPushError?: Err;
  remote?: Record<string, unknown[]>;
}

const calls: { rpc: { fn: string; rows: { id: string; data: Record<string, unknown> }[] }[]; pulls: string[] } = { rpc: [], pulls: [] };
let opts: MockOpts = {};
const missing = { code: "PGRST205", message: "Could not find the table 'public.grading_assessments' in the schema cache" };

function query(table: string) {
  const q = {
    select: () => q,
    eq: () => q,
    gt: () => q,
    order: () => q,
    range: async () => {
      calls.pulls.push(table);
      if (table === "grading_assessments" && opts.assessmentsMissing) return { data: null, error: missing };
      return { data: opts.remote?.[table] ?? [], error: null };
    },
  };
  return q;
}

const client = {
  auth: { getSession: async () => ({ data: { session: { user: { id: "owner" } } } }) },
  rpc: async (fn: string, args: { rows: { id: string; data: Record<string, unknown> }[] }) => {
    calls.rpc.push({ fn, rows: args.rows });
    if (fn === "push_grading_assessments") {
      if (opts.assessmentsMissing) return { data: null, error: { code: "PGRST202", message: "Could not find the function public.push_grading_assessments(rows) in the schema cache" } };
      if (opts.assessmentPushError) return { data: null, error: opts.assessmentPushError };
    }
    return { data: args.rows.length, error: null };
  },
  from: (table: string) => query(table),
};

vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => client, isSupabaseConfigured: () => true }));

const store = new Map<string, string>();
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  calls.rpc = [];
  calls.pulls = [];
  opts = {};
  store.clear();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const entry = () => addEntry({ cardId: "sv03.5-025", cardName: "Pikachu", localId: "025", setId: "sv03.5", setName: "151", variant: "normal" });
const check = () => saveAssessment({ cardId: "sv03.5-025", cardName: "Pikachu", centeringCeiling: 9, thumbs: { front: "data:image/jpeg;base64,AAAA" } });
const pushed = (fn: string) => calls.rpc.filter((c) => c.fn === fn).flatMap((c) => c.rows);

describe("sync engine with grading assessments", () => {
  it("pushes and pulls assessments next to entries", async () => {
    const { syncNow } = await import("./engine");
    const e = await entry();
    const a = await check();
    opts.remote = {
      grading_assessments: [
        { id: "remote-1", data: { id: "remote-1", cardName: "From phone", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", engine: 1 }, updated_at: "2026-01-02T00:00:00.000Z", deleted_at: null, synced_at: "2026-01-02T00:00:01.000Z" },
        { id: "bad", data: { id: "bad" }, updated_at: "2026-01-02T00:00:00.000Z", deleted_at: null, synced_at: "2026-01-02T00:00:02.000Z" },
      ],
    };
    const res = await syncNow();
    expect(pushed("push_entries").map((r) => r.id)).toEqual([e.id]);
    expect(pushed("push_grading_assessments").map((r) => r.id)).toEqual([a.id]);
    expect(res.pulled).toBe(1); // the malformed row is skipped
    expect((await db.assessments.get("remote-1"))!.cardName).toBe("From phone");
    const cursors = JSON.parse(store.get("mimibinder:sync:owner")!);
    expect(cursors.assessPull).toBe("2026-01-02T00:00:02.000Z");
    expect(cursors.assessPush).toBeTruthy();
  });

  it("pushes a deletion as a tombstone without the photos", async () => {
    const { syncNow } = await import("./engine");
    const a = await check();
    await syncNow();
    calls.rpc = [];
    await deleteAssessment(a.id);
    await syncNow();
    const [row] = pushed("push_grading_assessments") as unknown as { id: string; data: Record<string, unknown>; deleted_at: string }[];
    expect(row.id).toBe(a.id);
    expect(row.deleted_at).toBeTruthy();
    expect(row.data.thumbs).toBeUndefined();
  });

  it("skips only assessments when migration 0003 has not been run, then catches up once it has", async () => {
    const { syncNow } = await import("./engine");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    opts.assessmentsMissing = true;
    const e = await entry();
    const a = await check();

    await expect(syncNow()).resolves.toBeDefined();
    expect(pushed("push_entries").map((r) => r.id)).toEqual([e.id]);
    expect(calls.pulls).toContain("entries");
    expect(calls.pulls).not.toContain("grading_assessments"); // push failed first, pull skipped
    expect(warn).toHaveBeenCalledTimes(1);
    const cursors = JSON.parse(store.get("mimibinder:sync:owner")!);
    expect(cursors.push).toBeTruthy(); // entries moved on
    expect(cursors.assessPush).toBeNull(); // assessments held back

    await syncNow();
    expect(warn).toHaveBeenCalledTimes(1); // warned once per page load

    // Owner runs the migration: the next sync pushes the check saved earlier.
    opts.assessmentsMissing = false;
    calls.rpc = [];
    await syncNow();
    expect(pushed("push_grading_assessments").map((r) => r.id)).toEqual([a.id]);
  });

  it("other assessment errors still surface, after entries have synced", async () => {
    const { syncNow } = await import("./engine");
    opts.assessmentPushError = { code: "42501", message: "permission denied" };
    await entry();
    await check();
    await expect(syncNow()).rejects.toThrow(/grading checks failed: permission denied/);
    const cursors = JSON.parse(store.get("mimibinder:sync:owner")!);
    expect(cursors.push).toBeTruthy();
    expect(cursors.assessPush).toBeNull();
  });
});

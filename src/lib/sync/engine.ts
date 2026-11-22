// Client-only sync engine: Dexie <-> Supabase, last-write-wins per record on `updatedAt`.
//
// Push: local records with updatedAt > pushCursor go to the `push_*` RPCs, which only overwrite a
//       remote row when the pushed updatedAt is strictly newer (idempotent, concurrency-safe).
// Pull: remote rows with synced_at (server clock) > pullCursor - overlap; LWW-filtered against local
//       copies, then handed to `applyRemote`.
// Concurrency: one sync at a time per browser (Web Locks across tabs, a promise mutex within a tab).
// Cursors live in localStorage per user id, read inside the lock so tabs never use stale values.
//
// Grading assessments sync the same way (table `grading_assessments`, RPC `push_grading_assessments`, migration
// 0003) but as a separate, later phase with their own cursors: if the owner has not run 0003 yet, that phase is
// skipped with a console warning, its cursors stay put (so everything is pushed once the table exists), and
// entries/binders sync exactly as before. Rows are shrunk under SYNC_ROW_BUDGET before they are pushed.

import { applyRemote, db, getChangedSince, parseAssessment, shrinkForSync, type GradingAssessment } from "@/lib/db";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Binder, CollectionEntry } from "@/lib/types";
import {
  chunk,
  fromRemoteRow,
  isMissingRelationError,
  maxSyncedAt,
  pullLowerBound,
  selectLocalChanges,
  selectRemoteWinners,
  toPushRow,
  type RemoteRow,
  type SupabaseErrorLike,
} from "./merge";

const EPOCH = "1970-01-01T00:00:00.000Z";
const PUSH_CHUNK = 500;
const PAGE_SIZE = 1000;
/** Assessment rows can be up to ~180 KB each (thumbnails), so they travel in much smaller batches. */
const ASSESSMENT_PUSH_CHUNK = 20;
const ASSESSMENT_PAGE_SIZE = 50;
const ASSESSMENTS_TABLE = "grading_assessments";
/** Re-push window to cover writes that committed while we were reading local changes. */
const PUSH_OVERLAP_MS = 2_000;
/** Re-pull window to cover server transactions that committed out of order. */
const PULL_OVERLAP_MS = 5_000;
const LOCK_NAME = "mimibinder-sync";

export interface SyncResult {
  pushed: number;
  pulled: number;
}

interface Cursors {
  push: string | null; // client clock (updatedAt)
  pull: string | null; // server clock (synced_at)
  last: string | null; // when the last successful sync finished
  assessPush: string | null; // like push/pull, for grading assessments (held back while the table is missing)
  assessPull: string | null;
}

const cursorKey = (userId: string) => `mimibinder:sync:${userId}`;

export function readCursors(userId: string): Cursors {
  try {
    const raw = localStorage.getItem(cursorKey(userId));
    if (raw) {
      const c = JSON.parse(raw) as Partial<Cursors>;
      return { push: c.push ?? null, pull: c.pull ?? null, last: c.last ?? null, assessPush: c.assessPush ?? null, assessPull: c.assessPull ?? null };
    }
  } catch {
    // storage unavailable or corrupt: start fresh (a full sync is always safe)
  }
  return { push: null, pull: null, last: null, assessPush: null, assessPull: null };
}

function writeCursors(userId: string, c: Cursors) {
  try {
    localStorage.setItem(cursorKey(userId), JSON.stringify(c));
  } catch {
    // ignore: next sync just re-sends (idempotent)
  }
}

export class SyncDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncDisabledError";
  }
}

async function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(LOCK_NAME, fn) as Promise<T>;
  }
  return fn();
}

let inFlight: Promise<SyncResult> | null = null;
let rerunRequested = false;

/**
 * Run one full push + pull. Concurrent calls in the same tab share the running sync (and trigger one
 * follow-up run so nothing requested mid-sync is missed). Resolves `{ pushed: 0, pulled: 0 }` in
 * guest mode or when signed out.
 */
export function syncNow(): Promise<SyncResult> {
  if (inFlight) {
    rerunRequested = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      let total: SyncResult = { pushed: 0, pulled: 0 };
      do {
        rerunRequested = false;
        const r = await withCrossTabLock(runSyncOnce);
        total = { pushed: total.pushed + r.pushed, pulled: total.pulled + r.pulled };
      } while (rerunRequested);
      return total;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function isSyncing(): boolean {
  return inFlight !== null;
}

async function runSyncOnce(): Promise<SyncResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { pushed: 0, pulled: 0 };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user.id;
  if (!userId) return { pushed: 0, pulled: 0 };

  const cursors = readCursors(userId);

  // ---- push ----
  const startedAt = Date.now();
  const changed = await getChangedSince(cursors.push ?? EPOCH, cursors.assessPush ?? EPOCH);
  const localEntries = selectLocalChanges<CollectionEntry>(changed.entries, cursors.push);
  const localBinders = selectLocalChanges<Binder>(changed.binders, cursors.push);
  let pushed = 0;
  // Binders first so entries never reference a binder the other device has not seen.
  for (const part of chunk(localBinders.map(toPushRow), PUSH_CHUNK)) {
    const { data, error } = await supabase.rpc("push_binders", { rows: part });
    if (error) throw new Error(`Push binders failed: ${error.message}`);
    pushed += typeof data === "number" ? data : 0;
  }
  for (const part of chunk(localEntries.map(toPushRow), PUSH_CHUNK)) {
    const { data, error } = await supabase.rpc("push_entries", { rows: part });
    if (error) throw new Error(`Push entries failed: ${error.message}`);
    pushed += typeof data === "number" ? data : 0;
  }
  const pushCursor = new Date(startedAt - PUSH_OVERLAP_MS).toISOString();

  // ---- pull ----
  const since = pullLowerBound(cursors.pull, PULL_OVERLAP_MS);
  const binderRows = await pullTable(supabase, "binders", userId, since);
  const entryRows = await pullTable(supabase, "entries", userId, since);

  const remoteBinders = binderRows
    .map((r) => fromRemoteRow<Binder>(r))
    .filter((r): r is Binder => r !== null);
  const remoteEntries = entryRows
    .map((r) => fromRemoteRow<CollectionEntry>(r))
    .filter((r): r is CollectionEntry => r !== null);

  const [localB, localE] = await Promise.all([
    db.binders.bulkGet(remoteBinders.map((b) => b.id)),
    db.entries.bulkGet(remoteEntries.map((e) => e.id)),
  ]);
  const winnersB = selectRemoteWinners(remoteBinders, toMap<Binder>(localB));
  const winnersE = selectRemoteWinners(remoteEntries, toMap<CollectionEntry>(localE));
  let pulled = 0;
  if (winnersB.length > 0 || winnersE.length > 0) {
    // applyRemote re-checks LWW inside its own transaction, so a local edit made since bulkGet wins.
    const applied = await applyRemote(winnersE, winnersB);
    pulled = applied.entries + applied.binders;
  }

  const pullCursor = maxSyncedAt([...binderRows, ...entryRows], cursors.pull);
  const done: Cursors = { ...cursors, push: pushCursor, pull: pullCursor, last: new Date().toISOString() };
  writeCursors(userId, done);

  // ---- grading assessments (separate phase: never holds back entries/binders) ----
  const a = await syncAssessments(supabase, userId, changed.assessments, done, startedAt);
  if (a) writeCursors(userId, { ...done, assessPush: a.pushCursor, assessPull: a.pullCursor });
  return { pushed: pushed + (a?.pushed ?? 0), pulled: pulled + (a?.pulled ?? 0) };
}

type Client = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

/** A failed Supabase call, keeping the PostgREST error so callers can tell "table missing" apart. */
class RemoteError extends Error {
  constructor(
    message: string,
    readonly remote: SupabaseErrorLike,
  ) {
    super(message);
    this.name = "RemoteError";
  }
}

let warnedMissingAssessments = false;

/**
 * Push then pull grading assessments. Returns null (and warns once per page load) when the remote table or RPC
 * does not exist yet, i.e. migration 0003 has not been run; any other error is thrown.
 */
async function syncAssessments(
  supabase: Client,
  userId: string,
  changedRows: GradingAssessment[],
  cursors: Cursors,
  startedAt: number,
): Promise<{ pushed: number; pulled: number; pushCursor: string; pullCursor: string | null } | null> {
  try {
    const local = selectLocalChanges<GradingAssessment>(changedRows, cursors.assessPush);
    let pushed = 0;
    for (const part of chunk(local, ASSESSMENT_PUSH_CHUNK)) {
      const rows = await Promise.all(part.map(async (r) => toPushRow(await shrinkForSync(r))));
      const { data, error } = await supabase.rpc("push_grading_assessments", { rows });
      if (error) throw new RemoteError(`Push grading checks failed: ${error.message}`, error);
      pushed += typeof data === "number" ? data : 0;
    }
    const pushCursor = new Date(startedAt - PUSH_OVERLAP_MS).toISOString();

    const remoteRows = await pullTable(supabase, ASSESSMENTS_TABLE, userId, pullLowerBound(cursors.assessPull, PULL_OVERLAP_MS), ASSESSMENT_PAGE_SIZE);
    const remote = remoteRows
      .map((r) => fromRemoteRow<GradingAssessment>(r))
      .map((r) => (r ? parseAssessment(r) : null))
      .filter((r): r is GradingAssessment => r !== null);
    const localCopies = await db.assessments.bulkGet(remote.map((r) => r.id));
    const winners = selectRemoteWinners(remote, toMap<GradingAssessment>(localCopies));
    let pulled = 0;
    if (winners.length > 0) pulled = (await applyRemote([], [], winners)).assessments;
    return { pushed, pulled, pushCursor, pullCursor: maxSyncedAt(remoteRows, cursors.assessPull) };
  } catch (err) {
    if (err instanceof RemoteError && isMissingRelationError(err.remote)) {
      if (!warnedMissingAssessments) {
        warnedMissingAssessments = true;
        console.warn(
          "MimiBinder sync: grading checks are not synced yet because the Supabase table is missing. Run supabase/migrations/0003_grading_assessments.sql in the Supabase SQL editor. Entries and binders sync normally.",
        );
      }
      return null;
    }
    throw err;
  }
}

function toMap<T extends { id: string }>(items: readonly (T | undefined)[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of items) if (it) m.set(it.id, it);
  return m;
}

async function pullTable(
  supabase: Client,
  table: "entries" | "binders" | typeof ASSESSMENTS_TABLE,
  userId: string,
  since: string | null,
  pageSize = PAGE_SIZE,
): Promise<RemoteRow[]> {
  const rows: RemoteRow[] = [];
  for (let from = 0; ; from += pageSize) {
    let q = supabase
      .from(table)
      .select("id, data, updated_at, deleted_at, synced_at")
      .eq("user_id", userId);
    if (since) q = q.gt("synced_at", since);
    const { data, error } = await q
      .order("synced_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new RemoteError(`Pull ${table} failed: ${error.message}`, error);
    const page = (data ?? []) as RemoteRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/** Names of Dexie tables whose mutations should trigger an auto-sync. */
export const SYNCED_TABLES = ["entries", "binders", "assessments"] as const;

/** Dexie database name, for matching `storagemutated` parts. */
export function syncedDbName(): string {
  return db.name;
}

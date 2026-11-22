// Pure last-write-wins merge helpers for the sync engine. No I/O; unit tested.

/** Anything synced: entries and binders both carry these fields. */
export interface Syncable {
  id: string;
  updatedAt: string;
  deletedAt?: string;
}

/** Row shape sent to the `push_entries` / `push_binders` RPCs. */
export interface PushRow {
  id: string;
  data: unknown;
  updated_at: string;
  deleted_at: string | null;
}

/** Row shape read back from the `entries` / `binders` tables. */
export interface RemoteRow {
  id: string;
  data: unknown;
  updated_at: string;
  deleted_at: string | null;
  synced_at: string;
}

/** Epoch ms of an ISO timestamp; invalid/missing sorts oldest. */
export function timeOf(iso: string | null | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** True when `a` should replace `b` under last-write-wins (strictly newer updatedAt). */
export function isNewer(a: Syncable, b: Syncable | undefined | null): boolean {
  if (!b) return true;
  return timeOf(a.updatedAt) > timeOf(b.updatedAt);
}

export function toPushRow<T extends Syncable>(record: T): PushRow {
  return {
    id: record.id,
    data: record,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt ?? null,
  };
}

/**
 * Turn a remote row into a local record. The `data` column is the source of truth; the tombstone
 * column wins if the JSON somehow lacks it. Returns null for malformed rows (skipped, never applied).
 */
export function fromRemoteRow<T extends Syncable>(row: RemoteRow): T | null {
  const data = row.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const rec = { ...(data as Record<string, unknown>) };
  if (typeof rec.id !== "string" || rec.id !== row.id) return null;
  if (typeof rec.updatedAt !== "string" || !Number.isFinite(timeOf(rec.updatedAt))) return null;
  if (row.deleted_at && typeof rec.deletedAt !== "string") rec.deletedAt = row.deleted_at;
  return rec as unknown as T;
}

/** Keep only the newest version of each id (input order irrelevant). */
export function dedupeNewest<T extends Syncable>(records: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const r of records) {
    if (isNewer(r, byId.get(r.id))) byId.set(r.id, r);
  }
  return [...byId.values()];
}

/**
 * Last-write-wins: of the remote records, return those that should be written locally — i.e. the
 * id is unknown locally or the remote copy is strictly newer. Ties keep the local copy, which makes
 * re-applying the same pull a no-op (idempotent).
 */
export function selectRemoteWinners<T extends Syncable>(
  remote: readonly T[],
  local: ReadonlyMap<string, T>,
): T[] {
  return dedupeNewest(remote).filter((r) => isNewer(r, local.get(r.id)));
}

/** Local records changed after the push cursor (defensive re-filter of `getChangedSince`). */
export function selectLocalChanges<T extends Syncable>(
  records: readonly T[],
  since: string | null,
): T[] {
  const cutoff = timeOf(since);
  return dedupeNewest(records).filter((r) => timeOf(r.updatedAt) > cutoff);
}

/** Largest `synced_at` among rows, or `current` if none is larger. */
export function maxSyncedAt(rows: readonly RemoteRow[], current: string | null): string | null {
  let best = current;
  for (const row of rows) {
    if (timeOf(row.synced_at) > timeOf(best)) best = row.synced_at;
  }
  return best;
}

/**
 * Lower bound for the next pull. Steps back `overlapMs` from the cursor so rows whose transaction
 * committed slightly out of order are not missed; the overlap is harmless because applying is LWW.
 */
export function pullLowerBound(cursor: string | null, overlapMs: number): string | null {
  if (!cursor) return null;
  const t = timeOf(cursor);
  if (!Number.isFinite(t)) return null;
  return new Date(t - overlapMs).toISOString();
}

/** The bits of a Supabase/PostgREST error we look at. */
export interface SupabaseErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * True when a Supabase error means the table or RPC does not exist (yet), e.g. migration 0003 has not been run:
 * PostgREST PGRST205 (table not in schema cache) / PGRST202 (function not in schema cache), Postgres 42P01
 * (undefined table) / 42883 (undefined function). Anything else (network, auth, payload) is a real error.
 */
export function isMissingRelationError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "PGRST205" || code === "PGRST202" || code === "42P01" || code === "42883") return true;
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return /could not find the (table|function)[\s\S]*schema cache/i.test(text) || /relation "[^"]+" does not exist/i.test(text);
}

/** Split into chunks of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

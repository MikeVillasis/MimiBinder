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

/** Split into chunks of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

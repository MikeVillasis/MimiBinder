// Helpers for the daily price-snapshot cron and the history route. The builders are pure; the
// read/write helpers take a Supabase client (mocked in tests) and handle the pre-0002 schema.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardDetail, FxRate, PriceSnapshot, Variant } from "@/lib/types";

const VARIANTS: readonly Variant[] = ["normal", "holo", "reverse", "firstEdition"];

export function isVariant(v: unknown): v is Variant {
  return typeof v === "string" && (VARIANTS as readonly string[]).includes(v);
}

/** One printing to snapshot: a variant plus its stamp ("" for a regular printing). */
export interface SnapshotTarget {
  variant: Variant;
  stamp: string;
}

/** Row of the `price_snapshots` table. `stamp` is omitted when writing to the pre-0002 schema. */
export interface SnapshotRow {
  card_id: string;
  variant: Variant;
  stamp?: string; // "" for regular printings (migration 0002)
  date: string; // YYYY-MM-DD
  tcgplayer_market_usd: number | null;
  cardmarket_trend_eur: number | null;
}

/** Row of the `fx_rates` table. */
export interface FxRow {
  date: string;
  usd_cad: number;
  eur_cad: number | null;
}

/** YYYY-MM-DD in UTC. */
export function utcDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

const num = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Longest stamp we accept from entry data (TCGdex stamps are short slug lists). */
const MAX_STAMP = 100;

/** Normalised stamp from entry/DB data: a trimmed string, "" for none or anything unusable. */
export function normalizeStamp(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s.length <= MAX_STAMP ? s : "";
}

/** A row from `snapshot_printing_targets()` (0002) or `snapshot_targets()` (0001, no stamp). */
export interface TargetRow {
  card_id: string | null;
  variant: string | null;
  stamp?: string | null;
}

/**
 * Group distinct (card_id, variant, stamp) rows by card id, dropping malformed rows and unknown
 * variants. Card order follows first appearance; printings are de-duplicated. Rows without a
 * stamp (old schema) are regular printings.
 */
export function groupTargets(rows: readonly TargetRow[]): Map<string, SnapshotTarget[]> {
  const out = new Map<string, SnapshotTarget[]>();
  for (const r of rows) {
    if (!r.card_id || !isVariant(r.variant)) continue;
    const t: SnapshotTarget = { variant: r.variant, stamp: normalizeStamp(r.stamp) };
    const list = out.get(r.card_id);
    if (!list) out.set(r.card_id, [t]);
    else if (!list.some((x) => x.variant === t.variant && x.stamp === t.stamp)) list.push(t);
  }
  return out;
}

/**
 * Prices captured for one card + variant, mirroring `unitPrice` in src/lib/pricing.ts:
 * TCGPlayer variant market (fallback mid); Cardmarket holo block for holo/reverse when present
 * (else normal), trend (fallback avg). With a `stamp`, the stamped printing's own prices
 * (both null when the card has no such printing).
 */
export function snapshotPrices(
  card: CardDetail,
  variant: Variant,
  stamp = "",
): { tcgplayerMarketUsd: number | null; cardmarketTrendEur: number | null } {
  if (stamp) {
    const p = card.stamped?.find((x) => x.variant === variant && x.stamp === stamp);
    return {
      tcgplayerMarketUsd: num(p?.tcgplayer?.market) ?? num(p?.tcgplayer?.mid),
      cardmarketTrendEur: num(p?.cardmarket?.trend) ?? num(p?.cardmarket?.avg),
    };
  }
  const tp = card.prices?.tcgplayer?.variants?.[variant];
  const tcgplayerMarketUsd = num(tp?.market) ?? num(tp?.mid);

  const cm = card.prices?.cardmarket;
  const block = (variant === "holo" || variant === "reverse") && cm?.holo ? cm.holo : cm?.normal;
  const cardmarketTrendEur = num(block?.trend) ?? num(block?.avg);

  return { tcgplayerMarketUsd, cardmarketTrendEur };
}

/**
 * Snapshot rows for one fetched card. Printings with no price from either source are skipped.
 * `targets` are printings (or bare variants, meaning regular printings). Rows carry `stamp`
 * ("" for regular printings); use `toLegacyRows` for the pre-0002 schema.
 */
export function buildSnapshotRows(
  card: CardDetail,
  targets: readonly (Variant | SnapshotTarget)[],
  date: string,
  cardId: string = card.id,
): SnapshotRow[] {
  const rows: SnapshotRow[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    const { variant, stamp } = typeof t === "string" ? { variant: t, stamp: "" } : t;
    const key = `${variant}:${stamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = snapshotPrices(card, variant, stamp);
    if (p.tcgplayerMarketUsd === null && p.cardmarketTrendEur === null) continue;
    rows.push({
      card_id: cardId,
      variant,
      stamp,
      date,
      tcgplayer_market_usd: p.tcgplayerMarketUsd,
      cardmarket_trend_eur: p.cardmarketTrendEur,
    });
  }
  return rows;
}

/** Rows for the pre-0002 schema (no `stamp` column): regular printings only, without `stamp`. */
export function toLegacyRows(rows: readonly SnapshotRow[]): SnapshotRow[] {
  return rows
    .filter((r) => !r.stamp)
    .map((r) => {
      const { stamp: _stamp, ...rest } = r;
      void _stamp;
      return rest;
    });
}

/** fx_rates row keyed by the snapshot date so history joins on the same day. */
export function buildFxRow(fx: FxRate, date: string): FxRow | null {
  const usd = num(fx.usdCad);
  if (usd === null || usd <= 0) return null;
  const eur = num(fx.eurCad);
  return { date, usd_cad: usd, eur_cad: eur !== null && eur > 0 ? eur : null };
}

/**
 * DB row → shared PriceSnapshot type (numeric columns may arrive as strings). `stamp` is always
 * set, "" for regular printings and for rows read from the pre-0002 schema (no column).
 */
export function rowToSnapshot(row: {
  card_id: string;
  variant: string;
  stamp?: string | null;
  date: string;
  tcgplayer_market_usd: number | string | null;
  cardmarket_trend_eur: number | string | null;
}): PriceSnapshot | null {
  if (!isVariant(row.variant)) return null;
  const toNum = (v: number | string | null) => (v === null ? null : num(Number(v)));
  return {
    cardId: row.card_id,
    variant: row.variant,
    stamp: normalizeStamp(row.stamp),
    date: String(row.date).slice(0, 10),
    tcgplayerMarketUsd: toNum(row.tcgplayer_market_usd),
    cardmarketTrendEur: toNum(row.cardmarket_trend_eur),
  };
}

export interface ConcurrencyResult<R> {
  results: Array<{ ok: true; value: R } | { ok: false; error: unknown } | undefined>;
  /** Items not started because the deadline passed. */
  skipped: number;
}

/**
 * Run `fn` over `items` with at most `limit` in flight. Items not yet started when `deadline`
 * (epoch ms) passes are skipped (their result is `undefined`). Never rejects.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  deadline: number = Number.POSITIVE_INFINITY,
  now: () => number = Date.now,
): Promise<ConcurrencyResult<R>> {
  const results: ConcurrencyResult<R>["results"] = new Array(items.length).fill(undefined);
  let next = 0;
  let skipped = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      if (now() >= deadline) {
        skipped++;
        continue;
      }
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return { results, skipped };
}

/** Reject after `ms` if `promise` has not settled. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ---- Supabase I/O (schema-tolerant) -------------------------------------------------------

/** RPC added by migration 0002: distinct (card_id, variant, stamp) over live entries. */
export const PRINTING_TARGETS_RPC = "snapshot_printing_targets";
/** RPC from migration 0001: distinct (card_id, variant). */
export const LEGACY_TARGETS_RPC = "snapshot_targets";

interface PgError {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
}

/** Postgres / PostgREST codes for "no such column / function" (incl. schema-cache misses). */
const MISSING_SCHEMA_CODES = new Set(["42703", "42883", "PGRST202", "PGRST204"]);

/**
 * True when `error` says migration 0002 has not been applied: its text mentions "stamp" or the
 * 0002 RPC name, and its code (when there is one) is an undefined column / function. The code
 * check keeps e.g. a key violation whose details list the stamp column from counting.
 */
export function isMissingStampSchema(error: PgError | null | undefined): boolean {
  if (!error) return false;
  if (error.code && !MISSING_SCHEMA_CODES.has(error.code)) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return text.includes("stamp") || text.includes(PRINTING_TARGETS_RPC);
}

type Log = (message: string) => void;
const defaultLog: Log = (m) => console.warn(m);

/** Snapshots schema in use: "stamped" after migration 0002, "legacy" before it. */
export type SnapshotSchema = "stamped" | "legacy";

async function readRpcPages(
  client: SupabaseClient,
  fn: string,
  pageSize: number,
): Promise<{ rows: TargetRow[]; error: PgError | null }> {
  const rows: TargetRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.rpc(fn).range(from, from + pageSize - 1);
    if (error) return { rows, error };
    const page = (data ?? []) as TargetRow[];
    rows.push(...page);
    if (page.length < pageSize) return { rows, error: null };
  }
}

/**
 * All snapshot targets. Uses the 0002 RPC; when it is missing, logs and falls back to the 0001
 * RPC (regular printings only, schema "legacy"). Throws on any other error.
 */
export async function readSnapshotTargets(
  client: SupabaseClient,
  { pageSize = 1000, log = defaultLog }: { pageSize?: number; log?: Log } = {},
): Promise<{ rows: TargetRow[]; schema: SnapshotSchema }> {
  const stamped = await readRpcPages(client, PRINTING_TARGETS_RPC, pageSize);
  if (!stamped.error) return { rows: stamped.rows, schema: "stamped" };
  if (!isMissingStampSchema(stamped.error)) throw new Error(stamped.error.message ?? "rpc failed");
  log(
    `[snapshot] ${PRINTING_TARGETS_RPC} unavailable (${stamped.error.message}); ` +
      "run supabase/migrations/0002_stamped_printings.sql. Snapshotting regular printings only.",
  );
  const legacy = await readRpcPages(client, LEGACY_TARGETS_RPC, pageSize);
  if (legacy.error) throw new Error(legacy.error.message ?? "rpc failed");
  return { rows: legacy.rows.map((r) => ({ card_id: r.card_id, variant: r.variant })), schema: "legacy" };
}

/**
 * Upsert snapshot rows in chunks (idempotent per day). With schema "stamped", conflicts on
 * (card_id, variant, stamp, date); if the table turns out to lack the stamp column, logs and
 * switches to legacy rows (regular printings only, conflict on (card_id, variant, date)).
 */
export async function upsertSnapshots(
  client: SupabaseClient,
  rows: readonly SnapshotRow[],
  schema: SnapshotSchema,
  { chunk = 500, log = defaultLog }: { chunk?: number; log?: Log } = {},
): Promise<{ upserted: number; errors: string[]; schema: SnapshotSchema }> {
  let mode = schema;
  let pending = mode === "legacy" ? toLegacyRows(rows) : [...rows];
  let upserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < pending.length; i += chunk) {
    const part = pending.slice(i, i + chunk);
    const onConflict = mode === "stamped" ? "card_id,variant,stamp,date" : "card_id,variant,date";
    const { error } = await client.from("price_snapshots").upsert(part, { onConflict });
    if (!error) {
      upserted += part.length;
      continue;
    }
    if (mode === "stamped" && isMissingStampSchema(error)) {
      log(`[snapshot] price_snapshots has no stamp column (${error.message}); writing regular printings only.`);
      mode = "legacy";
      // Redo the rest (this chunk included) as legacy rows; the loop increment brings i to 0.
      pending = toLegacyRows(pending.slice(i));
      i = -chunk;
      continue;
    }
    errors.push(error.message);
  }
  return { upserted, errors, schema: mode };
}

const HISTORY_COLS = "card_id, variant, date, tcgplayer_market_usd, cardmarket_trend_eur";

/**
 * Snapshot rows for one card, newest first. Selects `stamp`; on the pre-0002 schema (no column)
 * re-reads without it, so every snapshot reads as a regular printing. Throws on other errors.
 */
export async function readHistoryRows(
  client: SupabaseClient,
  cardId: string,
  limit: number,
): Promise<PriceSnapshot[]> {
  const query = (cols: string) =>
    client
      .from("price_snapshots")
      .select(cols)
      .eq("card_id", cardId)
      .order("date", { ascending: false })
      .limit(limit);
  let { data, error } = await query(`${HISTORY_COLS}, stamp`);
  if (error && isMissingStampSchema(error)) ({ data, error } = await query(HISTORY_COLS));
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Parameters<typeof rowToSnapshot>[0][])
    .map(rowToSnapshot)
    .filter((s): s is PriceSnapshot => s !== null);
}

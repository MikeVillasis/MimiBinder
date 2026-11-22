// Pure helpers for the daily price-snapshot cron and the history route. No I/O; unit tested.

import type { CardDetail, FxRate, PriceSnapshot, Variant } from "@/lib/types";

const VARIANTS: readonly Variant[] = ["normal", "holo", "reverse", "firstEdition"];

export function isVariant(v: unknown): v is Variant {
  return typeof v === "string" && (VARIANTS as readonly string[]).includes(v);
}

/** Row of the `price_snapshots` table. */
export interface SnapshotRow {
  card_id: string;
  variant: Variant;
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

/**
 * Group distinct (card_id, variant) rows by card id, dropping malformed rows and unknown variants.
 * Card order follows first appearance; variants are de-duplicated.
 */
export function groupTargets(
  rows: readonly { card_id: string | null; variant: string | null }[],
): Map<string, Variant[]> {
  const out = new Map<string, Variant[]>();
  for (const r of rows) {
    if (!r.card_id || !isVariant(r.variant)) continue;
    const list = out.get(r.card_id);
    if (!list) out.set(r.card_id, [r.variant]);
    else if (!list.includes(r.variant)) list.push(r.variant);
  }
  return out;
}

/**
 * Prices captured for one card + variant, mirroring `unitPrice` in src/lib/pricing.ts:
 * TCGPlayer variant market (fallback mid); Cardmarket holo block for holo/reverse when present
 * (else normal), trend (fallback avg).
 */
export function snapshotPrices(
  card: CardDetail,
  variant: Variant,
): { tcgplayerMarketUsd: number | null; cardmarketTrendEur: number | null } {
  const tp = card.prices?.tcgplayer?.variants?.[variant];
  const tcgplayerMarketUsd = num(tp?.market) ?? num(tp?.mid);

  const cm = card.prices?.cardmarket;
  const block = (variant === "holo" || variant === "reverse") && cm?.holo ? cm.holo : cm?.normal;
  const cardmarketTrendEur = num(block?.trend) ?? num(block?.avg);

  return { tcgplayerMarketUsd, cardmarketTrendEur };
}

/** Snapshot rows for one fetched card. Variants with no price from either source are skipped. */
export function buildSnapshotRows(
  card: CardDetail,
  variants: readonly Variant[],
  date: string,
  cardId: string = card.id,
): SnapshotRow[] {
  const rows: SnapshotRow[] = [];
  for (const variant of new Set(variants)) {
    const p = snapshotPrices(card, variant);
    if (p.tcgplayerMarketUsd === null && p.cardmarketTrendEur === null) continue;
    rows.push({
      card_id: cardId,
      variant,
      date,
      tcgplayer_market_usd: p.tcgplayerMarketUsd,
      cardmarket_trend_eur: p.cardmarketTrendEur,
    });
  }
  return rows;
}

/** fx_rates row keyed by the snapshot date so history joins on the same day. */
export function buildFxRow(fx: FxRate, date: string): FxRow | null {
  const usd = num(fx.usdCad);
  if (usd === null || usd <= 0) return null;
  const eur = num(fx.eurCad);
  return { date, usd_cad: usd, eur_cad: eur !== null && eur > 0 ? eur : null };
}

/** DB row → shared PriceSnapshot type (numeric columns may arrive as strings). */
export function rowToSnapshot(row: {
  card_id: string;
  variant: string;
  date: string;
  tcgplayer_market_usd: number | string | null;
  cardmarket_trend_eur: number | string | null;
}): PriceSnapshot | null {
  if (!isVariant(row.variant)) return null;
  const toNum = (v: number | string | null) => (v === null ? null : num(Number(v)));
  return {
    cardId: row.card_id,
    variant: row.variant,
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

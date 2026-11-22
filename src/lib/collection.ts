// Pure collection helpers (client-safe, unit tested).
import { convert, unitPrice } from "./pricing";
import type { CardDetail, CollectionEntry, FxRate, Settings, SetSummary } from "./types";

/** Key used by groupBySerie for entries with no serie (e.g. added while TCGdex lacked it). */
export const UNKNOWN_SERIE = "unknown";

const live = (e: CollectionEntry) => !e.deletedAt;

function groupBy(
  entries: CollectionEntry[],
  key: (e: CollectionEntry) => string,
): Map<string, CollectionEntry[]> {
  const out = new Map<string, CollectionEntry[]>();
  for (const e of entries) {
    if (!live(e)) continue;
    const k = key(e);
    const list = out.get(k);
    if (list) list.push(e);
    else out.set(k, [e]);
  }
  return out;
}

/** setId → entries (tombstones excluded). */
export function groupBySet(entries: CollectionEntry[]): Map<string, CollectionEntry[]> {
  return groupBy(entries, (e) => e.setId);
}

/** serieId → entries (tombstones excluded); missing serie → UNKNOWN_SERIE. */
export function groupBySerie(entries: CollectionEntry[]): Map<string, CollectionEntry[]> {
  return groupBy(entries, (e) => e.serieId || UNKNOWN_SERIE);
}

/**
 * Completion of one set from the owned entries.
 * - Default ("official"): unique numbered cards 1..officialCount, so secret rares and lettered cards
 *   (e.g. "199", "TG01", "GG69") don't push it past 100%.
 * - `includeSecret`: secret rares count too, against the set's full size (totalCount: official + secret),
 *   e.g. 151 becomes x/207 instead of x/165 (the "master set" view).
 * `secret` is always the number of unique secret rares owned. `percent` is floored, so it only reads 100
 * when the set is complete.
 */
export function setCompletion(
  entries: CollectionEntry[],
  set: SetSummary,
  opts: { includeSecret?: boolean } = {},
): { owned: number; total: number; percent: number; secret: number; includesSecret: boolean } {
  const official = set.officialCount;
  const owned = new Set<number>();
  const secret = new Set<string>();
  for (const e of entries) {
    if (!live(e) || e.setId !== set.id || e.quantity <= 0) continue;
    const id = e.localId.trim();
    if (/^\d+$/.test(id)) {
      const n = parseInt(id, 10);
      if (n >= 1 && n <= official) owned.add(n);
      else if (n > official) secret.add(String(n));
    } else if (id) {
      secret.add(id.toUpperCase());
    }
  }
  // Only meaningful when the set has secret rares at all (totalCount > officialCount).
  const includesSecret = !!opts.includeSecret && (set.totalCount ?? 0) > official;
  const total = includesSecret ? set.totalCount : official;
  const have = includesSecret ? Math.min(total, owned.size + secret.size) : owned.size;
  const percent = total > 0 ? Math.floor((have / total) * 100) : 0;
  return { owned: have, total, percent, secret: secret.size, includesSecret };
}

/**
 * Collection market value vs. purchase cost, in `settings.currency`.
 * `priced` / `unpriced` count entries (rows), not copies. Cost includes every entry with
 * a purchase price; entries without a purchase currency are assumed to be in
 * `settings.currency`. gain = value - cost.
 */
export function collectionValue(
  entries: CollectionEntry[],
  cards: Map<string, CardDetail>,
  settings: Settings,
  fx: FxRate,
): { value: number; cost: number; gain: number; priced: number; unpriced: number } {
  let value = 0;
  let cost = 0;
  let priced = 0;
  let unpriced = 0;
  for (const e of entries) {
    if (!live(e)) continue;
    const qty = Math.max(0, e.quantity);
    const card = cards.get(e.cardId);
    const p = card ? unitPrice(card, e.variant, settings.priceSource, e.stamp) : null;
    if (p) {
      value += convert(p.amount, p.currency, settings.currency, fx) * qty;
      priced++;
    } else {
      unpriced++;
    }
    if (e.purchasePrice != null && Number.isFinite(e.purchasePrice)) {
      const from = e.purchaseCurrency ?? settings.currency;
      cost += convert(e.purchasePrice, from, settings.currency, fx) * qty;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { value: round(value), cost: round(cost), gain: round(value - cost), priced, unpriced };
}

// Pure, client-safe pricing helpers.
import type {
  CardDetail,
  CardmarketPrice,
  Currency,
  FxRate,
  PriceSource,
  Variant,
} from "./types";

export type SourceCurrency = "USD" | "EUR";

/**
 * Used when Bank of Canada is unreachable (and offline before the first FX fetch).
 * The deliberately old date lets the UI flag the rate as stale.
 */
export const FALLBACK_FX: FxRate = { usdCad: 1.43, eurCad: 1.57, date: "2026-11-20" };

/** TCGdex asset base URL → image URL. */
export function cardImage(
  image: string | undefined,
  quality: "low" | "high",
): string | undefined {
  if (!image) return undefined;
  return `${image.replace(/\/+$/, "")}/${quality}.webp`;
}

function hasCardmarketValue(p: CardmarketPrice | undefined): p is CardmarketPrice {
  return !!p && (p.trend != null || p.avg != null);
}

/**
 * Price of one copy in the source's own currency, or null when unknown.
 * - tcgplayer: the variant's market price, falling back to mid.
 * - cardmarket: the "-holo" block for reverse (and for holo when the card also has a
 *   non-holo printing, i.e. the main block describes the non-holo card); otherwise the
 *   main block. Trend, falling back to avg.
 */
export function unitPrice(
  card: CardDetail,
  variant: Variant,
  source: PriceSource,
): { amount: number; currency: SourceCurrency } | null {
  if (source === "tcgplayer") {
    const p = card.prices.tcgplayer?.variants[variant];
    const amount = p?.market ?? p?.mid ?? null;
    return amount != null ? { amount, currency: "USD" } : null;
  }

  const cm = card.prices.cardmarket;
  if (!cm) return null;
  const wantsHolo =
    variant === "reverse" || (variant === "holo" && card.variants.includes("normal"));
  const block = wantsHolo && hasCardmarketValue(cm.holo) ? cm.holo : cm.normal;
  const amount = block?.trend ?? block?.avg ?? null;
  return amount != null ? { amount, currency: "EUR" } : null;
}

function toCad(amount: number, from: SourceCurrency | "CAD", fx: FxRate): number {
  switch (from) {
    case "CAD":
      return amount;
    case "USD":
      return amount * fx.usdCad;
    case "EUR":
      return amount * (fx.eurCad ?? FALLBACK_FX.eurCad!);
  }
}

/** Convert between source and display currencies, using CAD as the pivot. */
export function convert(
  amount: number,
  from: SourceCurrency | "CAD",
  to: Currency,
  fx: FxRate,
): number {
  if (from === to) return amount;
  const cad = toCad(amount, from, fx);
  return to === "CAD" ? cad : cad / fx.usdCad;
}

const formatters = new Map<Currency, Intl.NumberFormat>();

/** Locale en-CA: CAD renders as "$1,234.56", USD as "US$1,234.56". */
export function formatMoney(amount: number, currency: Currency): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-CA", { style: "currency", currency });
    formatters.set(currency, f);
  }
  return f.format(amount);
}

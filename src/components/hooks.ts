"use client";

import { useCallback, useEffect, useState } from "react";
import { getFx } from "@/lib/api-client";
import { convert, formatMoney, unitPrice } from "@/lib/pricing";
import { useSettings } from "@/lib/db";
import type { CardDetail, CollectionEntry, Currency, FxRate, Settings } from "@/lib/types";

/** Run an async loader; re-runs when `key` changes. */
export function useAsync<T>(loader: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key: "" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loader().then(
      (data) => !cancelled && setState({ key, data }),
      (e: unknown) => !cancelled && setState({ key, error: e instanceof Error ? e.message : "Request failed" }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  const loading = state.key !== key;
  const retry = useCallback(() => {
    setState({ key: "" });
    setNonce((n) => n + 1);
  }, []);
  return { data: loading ? undefined : state.data, error: loading ? undefined : state.error, loading, retry };
}

let fxPromise: Promise<FxRate> | undefined;
function loadFx() {
  const p =
    fxPromise ??
    getFx().catch((e: unknown) => {
      fxPromise = undefined;
      throw e;
    });
  fxPromise = p;
  return p;
}

export function useFx(): FxRate | undefined {
  const [fx, setFx] = useState<FxRate>();
  useEffect(() => {
    let c = false;
    loadFx().then((r) => !c && setFx(r), () => {});
    return () => {
      c = true;
    };
  }, []);
  return fx;
}

/** Currency conversion + formatting bound to the user's settings. */
export function useMoney(fxOverride?: FxRate) {
  const settings = useSettings();
  const fetched = useFx();
  const fx = fxOverride ?? fetched;
  const currency = settings.currency;
  const to = useCallback(
    (amount: number, from: Currency | "USD" | "EUR"): number | null => {
      if (from === currency) return amount;
      if (!fx) return null;
      return convert(amount, from, currency, fx);
    },
    [fx, currency],
  );
  const fmt = useCallback(
    (amount: number | null | undefined, from: Currency | "USD" | "EUR" = currency): string => {
      if (amount == null) return "—";
      const v = to(amount, from);
      return v == null ? "—" : formatMoney(v, currency);
    },
    [to, currency],
  );
  const fmtDisplay = useCallback((amount: number) => formatMoney(amount, currency), [currency]);
  return { settings, fx, currency, to, fmt, fmtDisplay };
}

/** Value of one entry (all copies) in display currency, or null if unpriced. */
export function entryValue(
  e: CollectionEntry,
  cards: Map<string, CardDetail> | undefined,
  settings: Settings,
  fx: FxRate | undefined,
): number | null {
  const card = cards?.get(e.cardId);
  if (!card) return null;
  const p = unitPrice(card, e.variant, settings.priceSource);
  if (!p) return null;
  if (p.currency !== settings.currency && !fx) return null;
  const unit = p.currency === settings.currency ? p.amount : convert(p.amount, p.currency, settings.currency, fx!);
  return unit * e.quantity;
}

/** Cost of one entry in display currency (undefined when no purchase price recorded). */
export function entryCost(e: CollectionEntry, settings: Settings, fx: FxRate | undefined): number | null {
  if (e.purchasePrice == null) return null;
  const from = e.purchaseCurrency ?? settings.currency;
  if (from === settings.currency) return e.purchasePrice * e.quantity;
  if (!fx) return null;
  return convert(e.purchasePrice, from, settings.currency, fx) * e.quantity;
}

export function localIdNum(id: string) {
  const n = parseInt(id, 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

export function cardHref(id: string) {
  return `/card/${encodeURIComponent(id)}`;
}

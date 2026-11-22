"use client";
// Prices every owned card: shows cached CardDetails from IndexedDB immediately, then
// refreshes stale ones through /api/cards/batch. Falls back to the cache when offline.
import { useEffect, useMemo, useState } from "react";
import { getCardsBatch, getFx } from "./api-client";
import { getCachedCards, putCachedCards, useEntries } from "./db";
import { FALLBACK_FX } from "./pricing";
import type { CardDetail, CollectionEntry, FxRate } from "./types";

/** Cached cards younger than this are not refetched. */
const FRESH_MS = 60 * 60 * 1000;
const FX_STORAGE_KEY = "mimibinder:fx";

function readStoredFx(): FxRate | undefined {
  try {
    const raw = localStorage.getItem(FX_STORAGE_KEY);
    const fx = raw ? (JSON.parse(raw) as FxRate) : undefined;
    return fx && typeof fx.usdCad === "number" ? fx : undefined;
  } catch {
    return undefined;
  }
}

function storeFx(fx: FxRate) {
  try {
    localStorage.setItem(FX_STORAGE_KEY, JSON.stringify(fx));
  } catch {
    // storage unavailable
  }
}

/**
 * @param entries optional entries to price; defaults to the whole live collection.
 * `fx` is undefined only until the first load completes; afterwards it is the live rate,
 * the last stored rate, or FALLBACK_FX.
 */
export function useCollectionPrices(entries?: CollectionEntry[]): {
  cards: Map<string, CardDetail>;
  fx: FxRate | undefined;
  loading: boolean;
} {
  const all = useEntries();
  const source = entries ?? all;
  const idsKey = useMemo(
    () => (source ? [...new Set(source.map((e) => e.cardId))].sort().join(",") : null),
    [source],
  );

  const [cards, setCards] = useState<Map<string, CardDetail>>(() => new Map());
  const [fx, setFx] = useState<FxRate | undefined>(undefined);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // FX: once per mount.
  useEffect(() => {
    let cancelled = false;
    getFx()
      .then((live) => {
        if (cancelled) return;
        storeFx(live);
        setFx(live);
      })
      .catch(() => {
        if (!cancelled) setFx(readStoredFx() ?? FALLBACK_FX);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cards: whenever the set of owned card ids changes.
  useEffect(() => {
    if (idsKey === null) return;
    let cancelled = false;
    const ids = idsKey ? idsKey.split(",") : [];

    (async () => {
      const cached = ids.length ? await getCachedCards(ids).catch(() => []) : [];
      if (cancelled) return;
      const map = new Map<string, CardDetail>();
      for (const c of cached) {
        const { cachedAt: _cachedAt, ...card } = c;
        void _cachedAt;
        map.set(card.id, card);
      }
      setCards(new Map(map));

      const now = Date.now();
      const freshIds = new Set(
        cached.filter((c) => now - Date.parse(c.cachedAt) < FRESH_MS).map((c) => c.id),
      );
      const stale = ids.filter((id) => !freshIds.has(id));
      if (stale.length && (typeof navigator === "undefined" || navigator.onLine !== false)) {
        try {
          const fetched = await getCardsBatch(stale);
          if (cancelled) return;
          for (const c of fetched) map.set(c.id, c);
          setCards(new Map(map));
          await putCachedCards(fetched).catch(() => undefined);
        } catch {
          // offline / API down: keep cached data
        }
      }
      if (!cancelled) setLoadedKey(idsKey);
    })();

    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const loading = idsKey === null || loadedKey !== idsKey || fx === undefined;
  return { cards, fx, loading };
}

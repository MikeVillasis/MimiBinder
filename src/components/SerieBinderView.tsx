"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getSeries, getSets } from "@/lib/api-client";
import { setCompletion } from "@/lib/collection";
import { useEntries } from "@/lib/db";
import type { CollectionEntry } from "@/lib/types";
import { CardTile, QtyBadge } from "./CardTile";
import { localIdNum, useAsync } from "./hooks";
import { CardGridSkeleton, EmptyState, ErrorState, ProgressBar } from "./ui";

export function SerieBinderView({ serieId }: { serieId: string }) {
  const { data, error, loading, retry } = useAsync(async () => {
    const [series, sets] = await Promise.all([getSeries(), getSets()]);
    return { serie: series.find((s) => s.id === serieId), sets: sets.filter((s) => s.serieId === serieId) };
  }, serieId);
  const entries = useEntries();

  const bySet = useMemo(() => {
    const m = new Map<string, CollectionEntry[]>();
    (entries ?? []).forEach((e) => {
      if (!m.has(e.setId)) m.set(e.setId, []);
      m.get(e.setId)!.push(e);
    });
    return m;
  }, [entries]);

  if (loading) return <CardGridSkeleton count={12} />;
  if (error || !data) return <ErrorState message={error ?? "Generation not found."} onRetry={retry} />;
  const { serie, sets } = data;
  const ownedSets = sets.filter((s) => bySet.has(s.id));
  const total = ownedSets.reduce((n, s) => n + new Set(bySet.get(s.id)!.map((e) => e.cardId)).size, 0);

  return (
    <div>
      <Link href="/binders?tab=generations" className="mb-2 inline-flex min-h-11 items-center text-sm text-muted hover:text-fg">
        ← Binders
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{serie?.name ?? serieId}</h1>
      <p className="mb-5 text-sm text-muted">
        {total} unique {total === 1 ? "card" : "cards"} across {ownedSets.length} of {sets.length} sets
      </p>
      {ownedSets.length === 0 ? (
        <EmptyState title="Nothing here yet" body="Cards you add from this generation will show up grouped by set.">
          <Link href="/search" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-bold text-accent-fg">
            Search cards
          </Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {ownedSets.map((s) => {
            const list = bySet.get(s.id)!;
            const c = setCompletion(list, s);
            const byCard = new Map<string, { e: CollectionEntry; n: number }>();
            list.forEach((e) => {
              const cur = byCard.get(e.cardId);
              byCard.set(e.cardId, { e: cur?.e ?? e, n: (cur?.n ?? 0) + e.quantity });
            });
            const cards = [...byCard.values()].sort((a, b) => localIdNum(a.e.localId) - localIdNum(b.e.localId));
            return (
              <section key={s.id} aria-label={s.name}>
                <Link href={`/binders/set/${encodeURIComponent(s.id)}`} className="mb-3 block rounded-2xl border border-line bg-surface p-3 hover:border-accent/50">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h2 className="truncate text-base font-bold">{s.name}</h2>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {c.owned}/{c.total} · {Math.round(c.percent)}%
                    </span>
                  </div>
                  <ProgressBar percent={c.percent} label={`${s.name} completion`} />
                </Link>
                <div className="grid grid-cols-3 gap-x-2.5 gap-y-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
                  {cards.map(({ e, n }) => (
                    <CardTile key={e.cardId} id={e.cardId} name={e.cardName} localId={e.localId} image={e.image} badge={<QtyBadge n={n} />} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

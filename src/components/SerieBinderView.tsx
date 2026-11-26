"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getSeries, getSets } from "@/lib/api-client";
import { setCompletion } from "@/lib/collection";
import { useEntries, useSettings } from "@/lib/db";
import { langOf, splitId } from "@/lib/lang";
import type { CollectionEntry } from "@/lib/types";
import { CardTile, QtyBadge } from "./CardTile";
import { localIdNum, useAsync } from "./hooks";
import { CardGridSkeleton, EmptyState, ErrorState, ProgressBar, SetLogo, Stat, Surface, buttonCls, surfaceCls } from "./ui";

export function SerieBinderView({ serieId }: { serieId: string }) {
  const { data, error, loading, retry } = useAsync(async () => {
    const lang = langOf(serieId);
    const [series, sets] = await Promise.all([getSeries(lang), getSets(lang)]);
    return { serie: series.find((s) => s.id === serieId), sets: sets.filter((s) => s.serieId === serieId) };
  }, `${langOf(serieId)}:${serieId}`);
  const entries = useEntries();
  const includeSecret = useSettings().countSecretRares !== false;

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
      <Link href={`/binders?tab=generations${langOf(serieId) === "ja" ? "&lang=ja" : ""}`} className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-0.5 rounded-ui-sm px-1 text-sm font-medium text-muted hover:text-fg">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Binders
      </Link>
      <div className="mb-4 flex items-center gap-3">
        <SetLogo name={serie?.name ?? serieId} logo={serie?.logo} fallbackText={langOf(serieId) === "ja" ? splitId(serieId).raw : undefined} className="h-12 w-16" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold leading-tight tracking-[-0.02em] md:text-3xl">{serie?.name ?? serieId}</h1>
          <p className="text-sm text-muted">
            {sets.length} {sets.length === 1 ? "set" : "sets"}
          </p>
        </div>
      </div>
      <Surface as="section" aria-label="Generation summary" padded className="mb-6 flex items-end justify-between gap-4">
        <Stat inset label="Unique cards owned" value={total} />
        <p className="pb-0.5 text-right text-sm text-muted">
          across <span className="font-semibold text-fg">{ownedSets.length}</span> of {sets.length} sets
        </p>
      </Surface>
      {ownedSets.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Cards you add from this generation will show up grouped by set."
          icon={
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="3" width="14" height="18" rx="2.5" />
              <path d="M9 8h6M9 12h6" />
            </svg>
          }
        >
          <Link href="/search" className={buttonCls({ variant: "primary" })}>
            Search cards
          </Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {ownedSets.map((s) => {
            const list = bySet.get(s.id)!;
            const c = setCompletion(list, s, { includeSecret });
            const byCard = new Map<string, { e: CollectionEntry; n: number }>();
            list.forEach((e) => {
              const cur = byCard.get(e.cardId);
              byCard.set(e.cardId, { e: cur?.e ?? e, n: (cur?.n ?? 0) + e.quantity });
            });
            const cards = [...byCard.values()].sort((a, b) => localIdNum(a.e.localId) - localIdNum(b.e.localId));
            return (
              <section key={s.id} aria-label={s.name}>
                <Link href={`/binders/set/${encodeURIComponent(s.id)}`} className={`${surfaceCls({ interactive: true, padded: "sm" })} mb-3 flex items-center gap-3`}>
                  <SetLogo name={s.name} logo={s.logo} symbol={s.symbol} fallbackText={langOf(s.id) === "ja" ? splitId(s.id).raw : undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <h2 className="min-w-0 truncate text-[15px] font-semibold">{s.name}</h2>
                      <span className="shrink-0 text-[13px] tabular-nums text-muted">
                        {c.owned}/{c.total} · <span className="font-semibold text-fg">{Math.round(c.percent)}%</span>
                      </span>
                    </div>
                    <ProgressBar percent={c.percent} label={`${s.name} completion`} />
                  </div>
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

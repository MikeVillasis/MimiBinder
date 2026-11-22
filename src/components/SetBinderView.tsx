"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getSet } from "@/lib/api-client";
import { setCompletion } from "@/lib/collection";
import { useEntries } from "@/lib/db";
import { langOf, splitId } from "@/lib/lang";
import { CardTile, QtyBadge } from "./CardTile";
import { useAsync } from "./hooks";
import { CardGridSkeleton, ErrorState, ProgressBar, Segmented, SetLogo, Skeleton, Stat, Surface } from "./ui";

type Show = "all" | "owned" | "missing";

export function SetBinderView({ setId }: { setId: string }) {
  const { data: set, error, loading, retry } = useAsync(() => getSet(setId), `${langOf(setId)}:${setId}`);
  const entries = useEntries();
  const [show, setShow] = useState<Show>("all");

  const mine = useMemo(() => (entries ?? []).filter((e) => e.setId === setId), [entries, setId]);
  const qty = useMemo(() => {
    const m = new Map<string, number>();
    mine.forEach((e) => m.set(e.cardId, (m.get(e.cardId) ?? 0) + e.quantity));
    return m;
  }, [mine]);

  if (loading)
    return (
      <div aria-busy="true">
        <Skeleton className="mb-4 h-10 w-1/2" />
        <CardGridSkeleton count={18} />
      </div>
    );
  if (error || !set) return <ErrorState message={error ?? "Set not found."} onRetry={retry} />;

  const c = setCompletion(mine, set);
  const cards = set.cards.filter((card) => (show === "all" ? true : show === "owned" ? qty.has(card.id) : !qty.has(card.id)));

  return (
    <div>
      <Link href={langOf(setId) === "ja" ? "/binders?tab=sets&lang=ja" : "/binders"} className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-0.5 rounded-ui-sm px-1 text-sm font-medium text-muted hover:text-fg">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Binders
      </Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <SetLogo name={set.name} logo={set.logo} symbol={set.symbol} fallbackText={langOf(setId) === "ja" ? splitId(setId).raw : undefined} className="h-12 w-16" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold leading-tight tracking-[-0.02em] md:text-3xl">{set.name}</h1>
            <p className="truncate text-sm text-muted">
              {langOf(setId) === "ja" && `Set code ${splitId(setId).raw} · `}
              {set.serieName}
              {set.releaseDate ? ` · ${set.releaseDate}` : ""}
            </p>
          </div>
        </div>
        <Segmented<Show>
          label="Show"
          value={show}
          onChange={setShow}
          options={[{ value: "all", label: "All" }, { value: "owned", label: "Owned" }, { value: "missing", label: "Missing" }]}
        />
      </div>
      <Surface as="section" aria-label="Completion" padded className="mb-5">
        <div className="mb-3 flex items-end justify-between gap-3">
          <Stat inset label="Completion" value={`${Math.round(c.percent)}%`} size="lg" tone={c.percent >= 100 ? "good" : undefined} />
          <div className="pb-0.5 text-right text-sm tabular-nums text-muted">
            <span className="text-base font-semibold text-fg">{c.owned}</span> / {c.total} cards
          </div>
        </div>
        <ProgressBar percent={c.percent} label={`${set.name} completion`} />
        {c.secret > 0 && (
          <p className="mt-3 text-[13px] text-muted">
            +{c.secret} secret rare{c.secret === 1 ? "" : "s"} owned, not counted toward completion
          </p>
        )}
      </Surface>
      <div className="grid grid-cols-3 gap-x-2.5 gap-y-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
        {cards.map((card) => (
          <CardTile
            key={card.id}
            id={card.id}
            name={card.name}
            localId={card.localId}
            image={card.image}
            dim={!qty.has(card.id)}
            badge={qty.has(card.id) ? <QtyBadge n={qty.get(card.id)!} /> : undefined}
          />
        ))}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getSet } from "@/lib/api-client";
import { setCompletion } from "@/lib/collection";
import { useEntries } from "@/lib/db";
import { langOf, splitId } from "@/lib/lang";
import { MILESTONES } from "@/lib/fun";
import { PREF, usePref, writePref } from "@/lib/prefs";
import { BinderPages } from "./BinderPages";
import { CardTile, QtyBadge } from "./CardTile";
import { InspectHint, MilestoneBanner, useMilestone } from "./fun";
import { useAsync } from "./hooks";
import { CardGridSkeleton, ErrorState, ProgressBar, Segmented, SetLogo, Skeleton, Stat, Surface } from "./ui";

type Show = "all" | "owned" | "missing";
type View = "grid" | "pages";
const TICKS = MILESTONES.filter((m) => m < 100);

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
  // Remembered on this device. The grid stays the default.
  const view: View = usePref(PREF.setView, "grid") === "pages" ? "pages" : "grid";
  // Milestones read the existing setCompletion result; nothing is recomputed. Wait for both the set
  // and the collection, so a half-loaded 0% never counts.
  const completion = useMemo(() => (set ? setCompletion(mine, set) : null), [mine, set]);
  const { milestone, dismiss } = useMilestone(setId, !!completion && entries !== undefined, completion?.percent ?? 0);

  if (loading)
    return (
      <div aria-busy="true">
        <Skeleton className="mb-4 h-10 w-1/2" />
        <CardGridSkeleton count={18} />
      </div>
    );
  if (error || !set || !completion) return <ErrorState message={error ?? "Set not found."} onRetry={retry} />;

  const c = completion;
  const tile = (card: (typeof set.cards)[number], index: number) => (
    <CardTile
      key={card.id}
      index={index}
      id={card.id}
      name={card.name}
      localId={card.localId}
      image={card.image}
      dim={!qty.has(card.id)}
      badge={qty.has(card.id) ? <QtyBadge n={qty.get(card.id)!} /> : undefined}
    />
  );
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
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<View>
            size="sm"
            label="View"
            value={view}
            onChange={(v) => writePref(PREF.setView, v)}
            options={[{ value: "grid", label: "Grid" }, { value: "pages", label: "Pages" }]}
          />
          <Segmented<Show>
            size="sm"
            label="Show"
            value={show}
            onChange={setShow}
            options={[{ value: "all", label: "All" }, { value: "owned", label: "Owned" }, { value: "missing", label: "Missing" }]}
          />
        </div>
      </div>
      {milestone != null && <MilestoneBanner milestone={milestone} setName={set.name} onDismiss={dismiss} />}
      <Surface as="section" aria-label="Completion" padded className="mb-5">
        <div className="mb-3 flex items-end justify-between gap-3">
          <Stat inset label="Completion" value={`${Math.round(c.percent)}%`} size="lg" tone={c.percent >= 100 ? "good" : undefined} />
          <div className="pb-0.5 text-right text-sm tabular-nums text-muted">
            <span className="text-base font-semibold text-fg">{c.owned}</span> / {c.total} cards
          </div>
        </div>
        <ProgressBar percent={c.percent} label={`${set.name} completion`} ticks={TICKS} />
        {c.secret > 0 && (
          <p className="mt-3 text-[13px] text-muted">
            +{c.secret} secret rare{c.secret === 1 ? "" : "s"} owned, not counted toward completion
          </p>
        )}
      </Surface>
      <InspectHint className="mb-4" />
      {cards.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted">
          {show === "owned" ? "You don't own any cards from this set yet." : show === "missing" ? "Nothing missing. Every card in this set is yours." : "This set has no cards listed yet."}
        </p>
      ) : view === "pages" ? (
        <BinderPages
          items={cards}
          itemKey={(card) => card.id}
          label={`${set.name} binder pages`}
          renderPocket={(card, i) => tile(card, i % 9)}
        />
      ) : (
        <div className="grid grid-cols-3 gap-x-2.5 gap-y-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
          {cards.map((card, i) => tile(card, i))}
        </div>
      )}
    </div>
  );
}

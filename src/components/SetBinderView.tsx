"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getSet } from "@/lib/api-client";
import { setCompletion } from "@/lib/collection";
import { useEntries } from "@/lib/db";
import { CardTile, QtyBadge } from "./CardTile";
import { useAsync } from "./hooks";
import { CardGridSkeleton, ErrorState, ProgressBar, Segmented, Skeleton } from "./ui";

type Show = "all" | "owned" | "missing";

export function SetBinderView({ setId }: { setId: string }) {
  const { data: set, error, loading, retry } = useAsync(() => getSet(setId), setId);
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
      <Link href="/binders" className="mb-2 inline-flex min-h-11 items-center text-sm text-muted hover:text-fg">
        ← Binders
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight md:text-3xl">{set.name}</h1>
          <p className="text-sm text-muted">
            {set.serieName}
            {set.releaseDate ? ` · ${set.releaseDate}` : ""}
          </p>
        </div>
        <Segmented<Show>
          label="Show"
          value={show}
          onChange={setShow}
          options={[{ value: "all", label: "All" }, { value: "owned", label: "Owned" }, { value: "missing", label: "Missing" }]}
        />
      </div>
      <div className="mb-5 rounded-2xl border border-line bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-semibold">Completion</span>
          <span className="text-sm tabular-nums text-muted">
            {c.owned}/{c.total} · <span className="font-bold text-accent">{Math.round(c.percent)}%</span>
          </span>
        </div>
        {c.secret > 0 && (
          <p className="mb-2 text-xs text-muted">
            +{c.secret} secret rare{c.secret === 1 ? "" : "s"} owned, not counted toward completion
          </p>
        )}
        <ProgressBar percent={c.percent} label={`${set.name} completion`} />
      </div>
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

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { getSeries, getSets } from "@/lib/api-client";
import { groupBySerie, groupBySet, setCompletion } from "@/lib/collection";
import { createBinder, useBinders, useEntries } from "@/lib/db";
import type { SetSummary } from "@/lib/types";
import { useAsync } from "./hooks";
import { Button, EmptyState, ErrorState, Segmented, Skeleton, ProgressBar, SetLogo, inputCls } from "./ui";

type Tab = "sets" | "generations" | "custom";

export function BindersView() {
  const params = useSearchParams();
  const initial = params.get("tab");
  const [tab, setTab] = useState<Tab>(initial === "generations" || initial === "custom" ? initial : "sets");
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Binders</h1>
        <Segmented<Tab>
          label="Binder type"
          value={tab}
          onChange={setTab}
          options={[
            { value: "sets", label: "Sets" },
            { value: "generations", label: "Generations" },
            { value: "custom", label: "Custom" },
          ]}
        />
      </div>
      {tab === "sets" && <SetsTab />}
      {tab === "generations" && <GenerationsTab />}
      {tab === "custom" && <CustomTab />}
    </div>
  );
}

function SetRow({ set, owned, c }: { set: SetSummary; owned: boolean; c?: ReturnType<typeof setCompletion> }) {
  return (
    <Link
      href={`/binders/set/${encodeURIComponent(set.id)}`}
      className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-accent/50"
    >
      <SetLogo name={set.name} logo={set.logo} symbol={set.symbol} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-bold">{set.name}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {owned && c ? `${c.owned}/${c.total}${c.secret ? ` +${c.secret}` : ""}` : `${set.officialCount} cards`}
          </span>
        </div>
        <div className="mb-1.5 truncate text-xs text-muted">
          {set.serieName}
          {set.releaseDate ? ` · ${set.releaseDate.slice(0, 4)}` : ""}
        </div>
        {owned && c && <ProgressBar percent={c.percent} label={`${set.name} completion`} />}
      </div>
    </Link>
  );
}

function SetsTab() {
  const entries = useEntries();
  const { data: sets, error, loading, retry } = useAsync(() => getSets(), "sets");
  const [q, setQ] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const grouped = useMemo(() => groupBySet(entries ?? []), [entries]);

  if (loading) return <ListSkeleton />;
  if (error || !sets) return <ErrorState message={error ?? "Could not load sets."} onRetry={retry} />;

  const filtered = sets.filter((s) => (!ownedOnly || grouped.has(s.id)) && s.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div>
      <div className="mb-4 flex gap-2">
        <input type="search" aria-label="Filter sets" placeholder="Filter sets…" value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} />
        <Button variant={ownedOnly ? "primary" : "secondary"} aria-pressed={ownedOnly} onClick={() => setOwnedOnly((v) => !v)} className="shrink-0">
          Owned
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No sets" body="No sets match your filter." />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {filtered.map((s) => (
            <SetRow key={s.id} set={s} owned={grouped.has(s.id)} c={grouped.has(s.id) ? setCompletion(grouped.get(s.id)!, s) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function GenerationsTab() {
  const entries = useEntries();
  const { data: series, error, loading, retry } = useAsync(() => getSeries(), "series");
  const grouped = useMemo(() => groupBySerie(entries ?? []), [entries]);
  if (loading) return <ListSkeleton />;
  if (error || !series) return <ErrorState message={error ?? "Could not load generations."} onRetry={retry} />;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {series.map((s) => {
        const list = grouped.get(s.id) ?? [];
        const unique = new Set(list.map((e) => e.cardId)).size;
        return (
          <Link
            key={s.id}
            href={`/binders/serie/${encodeURIComponent(s.id)}`}
            className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-accent/50"
          >
            <SetLogo name={s.name} logo={s.logo} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{s.name}</div>
              <div className="text-xs text-muted">
                {s.setIds.length} sets · {unique} unique {unique === 1 ? "card" : "cards"} owned
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function CustomTab() {
  const binders = useBinders();
  const entries = useEntries();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createBinder(name.trim());
      setName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form onSubmit={create} className="mb-4 flex gap-2">
        <input aria-label="New binder name" placeholder="New binder name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={60} />
        <Button type="submit" disabled={busy || !name.trim()} className="shrink-0">
          Create
        </Button>
      </form>
      {binders === undefined ? (
        <ListSkeleton />
      ) : binders.length === 0 ? (
        <EmptyState title="No custom binders yet" body="Group cards any way you like: trade binder, favourites, a deck wishlist." />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {binders.map((b) => {
            const n = (entries ?? []).filter((e) => e.binderIds.includes(b.id)).length;
            return (
              <Link key={b.id} href={`/binders/custom/${encodeURIComponent(b.id)}`} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-accent/50">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{b.name}</div>
                  {b.description && <div className="truncate text-xs text-muted">{b.description}</div>}
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {n} {n === 1 ? "entry" : "entries"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-2 md:grid-cols-2" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getSets } from "@/lib/api-client";
import { groupBySet, setCompletion } from "@/lib/collection";
import { useEntries } from "@/lib/db";
import { langOf, splitId } from "@/lib/lang";
import { useCollectionPrices } from "@/lib/useCollectionPrices";
import { printingLabel } from "@/lib/stamps";
import { CardImage } from "./CardImage";
import { cardHref, entryCost, entryValue, useAsync, useMoney } from "./hooks";
import { EmptyState, LangBadge, PageHeader, ProgressBar, SetLogo, Skeleton, Stat } from "./ui";

export function DashboardView() {
  const entries = useEntries();
  const { cards, fx: pricedFx, loading } = useCollectionPrices();
  const { settings, fx: fetchedFx, fmtDisplay } = useMoney();
  const fx = pricedFx ?? fetchedFx;
  const hasJa = (entries ?? []).some((e) => langOf(e.cardId) === "ja");
  const { data: sets } = useAsync(
    async () => {
      const [en, ja] = await Promise.all([getSets(), hasJa ? getSets("ja").catch(() => []) : Promise.resolve([])]);
      return [...en, ...ja];
    },
    hasJa ? "sets:en+ja" : "sets:en",
  );

  const stats = useMemo(() => {
    const list = entries ?? [];
    const rows = list.map((e) => ({ e, v: entryValue(e, cards, settings, fx), c: entryCost(e, settings, fx) }));
    const value = rows.reduce((n, r) => n + (r.v ?? 0), 0);
    const unpriced = rows.filter((r) => r.v == null).length;
    const costed = rows.filter((r) => r.c != null);
    const cost = costed.reduce((n, r) => n + r.c!, 0);
    const costedValue = costed.reduce((n, r) => n + (r.v ?? 0), 0);
    const gain = costedValue - cost;
    return {
      value,
      cost,
      gain,
      pct: cost > 0 ? (gain / cost) * 100 : null,
      unpriced,
      copies: list.reduce((n, e) => n + e.quantity, 0),
      unique: new Set(list.map((e) => e.cardId)).size,
      top: [...rows].filter((r) => r.v != null).sort((a, b) => b.v! - a.v!).slice(0, 5),
      recent: [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    };
  }, [entries, cards, settings, fx]);

  const completion = useMemo(() => {
    if (!entries || !sets) return [];
    const grouped = groupBySet(entries);
    return sets
      .filter((s) => grouped.has(s.id))
      .map((s) => ({ set: s, c: setCompletion(grouped.get(s.id)!, s) }))
      .sort((a, b) => b.c.percent - a.c.percent)
      .slice(0, 4);
  }, [entries, sets]);

  if (entries === undefined) {
    return (
      <>
        <PageHeader title="Home" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </>
    );
  }

  if (entries.length === 0) {
    return (
      <>
        <PageHeader title="Welcome to MimiBinder" subtitle="Track your Pokemon TCG collection and what it is worth." />
        <EmptyState title="Start your collection" body="Search for a card you own, add it, and your total value, gains and set progress show up here.">
          <Link href="/search" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-bold text-accent-fg">
            Search for a card
          </Link>
        </EmptyState>
      </>
    );
  }

  const priceReady = !loading || stats.value > 0;
  const gainTone = stats.gain >= 0 ? "good" : "bad";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Home"
        subtitle={`Prices in ${settings.currency} · ${settings.priceSource === "tcgplayer" ? "TCGPlayer" : "Cardmarket"}${hasJa ? " (Japanese cards: Cardmarket)" : ""}`}
      />

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 rounded-2xl border border-accent/30 p-4" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 14%, transparent), color-mix(in srgb, var(--color-brand) 8%, transparent))" }}>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Total value</div>
          {priceReady ? (
            <div className="mt-1 text-4xl font-extrabold tabular-nums text-accent">{fmtDisplay(stats.value)}</div>
          ) : (
            <Skeleton className="mt-2 h-10 w-40" />
          )}
          {stats.unpriced > 0 && priceReady && <div className="mt-1 text-xs text-muted">{stats.unpriced} entries without a price yet</div>}
        </div>
        <Stat label="Cost basis" value={fmtDisplay(stats.cost)} />
        <Stat
          label="Gain / loss"
          tone={stats.cost > 0 ? gainTone : undefined}
          value={stats.cost > 0 ? `${stats.gain >= 0 ? "+" : ""}${fmtDisplay(stats.gain)}` : "—"}
          sub={stats.pct != null ? `${stats.pct >= 0 ? "+" : ""}${stats.pct.toFixed(1)}%` : "Add purchase prices to track"}
        />
        <Stat label="Cards" value={stats.copies} sub="total copies" />
        <Stat label="Unique" value={stats.unique} sub="different cards" />
      </section>

      <Link href="/centering" className="flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-accent/50">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="1" />
            <rect x="8" y="7" width="8" height="10" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Centering check</span>
          <span className="block text-xs text-muted">Measure a card from phone photos, on your device.</span>
        </span>
        <span className="text-muted" aria-hidden="true">→</span>
      </Link>

      <section aria-labelledby="top-h">
        <h2 id="top-h" className="mb-3 text-lg font-bold">
          Most valuable
        </h2>
        {stats.top.length === 0 ? (
          <p className="text-sm text-muted">{loading ? "Loading prices…" : "No priced cards yet."}</p>
        ) : (
          <ol className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {stats.top.map(({ e, v }, i) => (
              <li key={e.id}>
                <Link href={cardHref(e.cardId)} className="flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 hover:border-accent/50">
                  <span className="w-5 text-center text-sm font-extrabold text-muted">{i + 1}</span>
                  <div className="w-12 shrink-0">
                    <CardImage image={e.image} name={e.cardName} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-bold">{e.cardName}</span>
                      {langOf(e.cardId) === "ja" && <LangBadge className="shrink-0" />}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {e.setName} · {printingLabel(e.variant, e.stamp)} ×{e.quantity}
                    </div>
                  </div>
                  <div className="text-sm font-bold tabular-nums text-accent">{fmtDisplay(v!)}</div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="mb-3 text-lg font-bold">
          Recently added
        </h2>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          {stats.recent.map((e) => (
            <Link key={e.id} href={cardHref(e.cardId)} className="w-28 shrink-0 md:w-32" aria-label={e.cardName}>
              <div className="relative">
                <CardImage image={e.image} name={e.cardName} className="card-shadow" />
                {langOf(e.cardId) === "ja" && <LangBadge className="absolute left-1.5 top-1.5" />}
              </div>
              <div className="mt-1 truncate text-xs font-semibold">{e.cardName}</div>
            </Link>
          ))}
        </div>
      </section>

      {completion.length > 0 && (
        <section aria-labelledby="sets-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="sets-h" className="text-lg font-bold">
              Set progress
            </h2>
            <Link href="/binders" className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
              All binders →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {completion.map(({ set, c }) => (
              <Link key={set.id} href={`/binders/set/${encodeURIComponent(set.id)}`} className="rounded-2xl border border-line bg-surface p-3 hover:border-accent/50">
                <div className="flex items-center gap-3">
                  <SetLogo name={set.name} logo={set.logo} symbol={set.symbol} fallbackText={langOf(set.id) === "ja" ? splitId(set.id).raw : undefined} className="h-9 w-12" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">{set.name}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {c.owned}/{c.total} · {Math.round(c.percent)}%
                      </span>
                    </div>
                    <ProgressBar percent={c.percent} label={`${set.name} completion`} />
                    {c.secret > 0 && (
                      <div className="mt-1.5 text-xs text-muted">
                        <span className="font-semibold text-accent">+{c.secret}</span> secret rare{c.secret === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

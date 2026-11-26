"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { getSets } from "@/lib/api-client";
import { groupBySet, setCompletion } from "@/lib/collection";
import { useEntries } from "@/lib/db";
import { langOf, splitId } from "@/lib/lang";
import { useCollectionPrices } from "@/lib/useCollectionPrices";
import { printingLabel } from "@/lib/stamps";
import { isNewEntry } from "@/lib/fun";
import { CardImage } from "./CardImage";
import { CardFan, CountUp, HoloCard, InspectHint, NewBadge } from "./fun";
import { cardHref, entryCost, entryValue, useAsync, useMoney } from "./hooks";
import { EmptyState, LangBadge, ListGroup, ListRow, PageHeader, SectionHeader, SetLogo, Skeleton, Stat, Surface, buttonCls, cx } from "./ui";

export function DashboardView() {
  const entries = useEntries();
  const { cards, fx: pricedFx, loading } = useCollectionPrices();
  const { settings, fx: fetchedFx, fmtDisplay } = useMoney();
  const fx = pricedFx ?? fetchedFx;
  const [now] = useState(() => Date.now()); // for the "New" badge; fixed for this visit
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
      hasCost: costed.length > 0,
      gain,
      pct: cost > 0 ? (gain / cost) * 100 : null,
      unpriced,
      copies: list.reduce((n, e) => n + e.quantity, 0),
      unique: new Set(list.map((e) => e.cardId)).size,
      top: [...rows].filter((r) => r.v != null).sort((a, b) => b.v! - a.v!).slice(0, 5),
      recent: [...rows].sort((a, b) => b.e.createdAt.localeCompare(a.e.createdAt)).slice(0, 10),
    };
  }, [entries, cards, settings, fx]);

  const completion = useMemo(() => {
    if (!entries || !sets) return [];
    const grouped = groupBySet(entries);
    return sets
      .filter((s) => grouped.has(s.id))
      .map((s) => ({ set: s, c: setCompletion(grouped.get(s.id)!, s, { includeSecret: settings.countSecretRares !== false }) }))
      .sort((a, b) => b.c.percent - a.c.percent)
      .slice(0, 4);
  }, [entries, sets, settings.countSecretRares]);

  if (entries === undefined) {
    return (
      <>
        <PageHeader title="Home" />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40 rounded-ui-lg" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[63/88] w-32 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (entries.length === 0) {
    return (
      <>
        <PageHeader title="Welcome to MimiBinder" subtitle="Track your Pokémon TCG collection and what it is worth." />
        <EmptyState
          art={<CardFan />}
          title="Deal yourself in"
          body="Search for a card you own and add it. Your total value, gains and set progress will show up right here."
        >
          <Link href="/search" className={buttonCls({ size: "lg" })}>
            Search for a card
          </Link>
        </EmptyState>
      </>
    );
  }

  const priceReady = !loading || stats.value > 0;
  const sourceName = settings.priceSource === "tcgplayer" ? "TCGPlayer" : "Cardmarket";

  return (
    <div>
      <PageHeader title="Home" />
      <div className="flex flex-col gap-8">

        {/* Portfolio hero: the one number that matters, plus a quiet inline summary. */}
        <Surface as="section" aria-label="Portfolio" padded="lg" className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, var(--color-accent-soft), transparent 70%)" }}
          />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              {priceReady ? (
                <Stat
                  inset
                  size="lg"
                  tone="accent"
                  label="Total value"
                  // Counts up, then renders exactly fmtDisplay(stats.value); screen readers get that from the start.
                  value={<CountUp id={`home-total:${settings.currency}`} value={stats.value} format={fmtDisplay} />}
                />
              ) : (
                <div>
                  <div className="text-[13px] font-medium text-muted">Total value</div>
                  <Skeleton className="mt-2 h-11 w-48" />
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                {stats.hasCost && stats.cost > 0 && priceReady && <GainChip gain={stats.gain} pct={stats.pct} fmt={fmtDisplay} />}
                <p className="text-sm text-muted tabular-nums">
                  <span className="font-semibold text-fg">{stats.copies}</span> {stats.copies === 1 ? "card" : "cards"}
                  <Dot />
                  <span className="font-semibold text-fg">{stats.unique}</span> unique
                  {stats.hasCost && stats.cost > 0 && (
                    <>
                      <Dot />
                      cost <span className="font-semibold text-fg">{fmtDisplay(stats.cost)}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-0.5 border-t border-line/50 pt-3 text-[13px] text-muted md:items-end md:border-0 md:pt-0 md:text-right">
              <span>
                {settings.currency} · {sourceName}
                {hasJa ? " (Japanese cards: Cardmarket)" : ""}
                {stats.unpriced > 0 && priceReady && ` · ${stats.unpriced} without a price yet`}
              </span>
              {!stats.hasCost && (
                <Link href="/collection" className="-mb-2 inline-flex min-h-9 items-center gap-1 font-medium text-fg/80 hover:text-accent md:justify-end">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 17l5-5 4 4 7-8" />
                    <path d="M15 8h5v5" />
                  </svg>
                  Add purchase prices to track gains
                </Link>
              )}
            </div>
          </div>
        </Surface>

        <InspectHint className="-my-3" />

        {stats.recent.length > 0 && (
          <section aria-labelledby="recent-h">
            <SectionHeader id="recent-h" title="Recently added" href="/collection?sort=recent" />
            <ul
              role="list"
              className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-1 md:-mx-1 md:scroll-px-1 md:gap-4 md:px-1"
            >
              {stats.recent.map(({ e, v }, i) => {
                const fresh = isNewEntry(e.createdAt, now);
                return (
                <li key={e.id} className="deal w-[7.5rem] shrink-0 snap-start md:w-36" style={{ "--deal-i": i } as CSSProperties}>
                  <Link href={cardHref(e.cardId)} className="group block rounded-xl focus-visible:outline-offset-4" aria-label={fresh ? `${e.cardName}, new` : e.cardName}>
                    <div className="ui-motion ui-press ui-lift relative rounded-[6%/4.5%]">
                      <HoloCard>
                        <CardImage image={e.image} name={e.cardName} className="card-shadow" />
                        {(fresh || langOf(e.cardId) === "ja") && (
                          <span className="absolute left-1.5 top-1.5 z-[1] flex items-center gap-1">
                            {langOf(e.cardId) === "ja" && <LangBadge />}
                            {fresh && <NewBadge />}
                          </span>
                        )}
                      </HoloCard>
                    </div>
                    <div className="mt-2 truncate px-0.5 text-[13px] font-semibold">{e.cardName}</div>
                    <div className="truncate px-0.5 text-xs text-muted tabular-nums">
                      {v != null ? fmtDisplay(v) : printingLabel(e.variant, e.stamp)}
                    </div>
                  </Link>
                </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-6">
          <ListGroup title="Most valuable" href="/collection?sort=value" label="Most valuable">
            {stats.top.length === 0 ? (
              <li className="px-4 py-5 text-sm text-muted">{loading ? "Loading prices…" : "No priced cards yet."}</li>
            ) : (
              stats.top.map(({ e, v }, i) => (
                <ListRow
                  key={e.id}
                  href={cardHref(e.cardId)}
                  chevron={false}
                  leading={
                    <span className="flex items-center gap-3">
                      <span className="w-4 text-center text-[13px] font-semibold tabular-nums text-muted">{i + 1}</span>
                      <span className="block w-10">
                        <CardImage image={e.image} name={e.cardName} />
                      </span>
                    </span>
                  }
                  title={
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{e.cardName}</span>
                      {langOf(e.cardId) === "ja" && <LangBadge className="shrink-0 shadow-none" />}
                    </span>
                  }
                  subtitle={`${e.setName} · ${printingLabel(e.variant, e.stamp)}${e.quantity > 1 ? ` ×${e.quantity}` : ""}`}
                  trailing={<span className="text-[15px] font-semibold">{fmtDisplay(v!)}</span>}
                />
              ))
            )}
          </ListGroup>

          <div className="flex flex-col gap-8 lg:gap-6">
            {completion.length > 0 && (
              <ListGroup title="Set progress" href="/binders" actionLabel="All binders">
                {completion.map(({ set, c }) => {
                  const pct = Math.round(c.percent);
                  return (
                    <ListRow
                      key={set.id}
                      href={`/binders/set/${encodeURIComponent(set.id)}`}
                      leading={
                        <SetLogo
                          name={set.name}
                          logo={set.logo}
                          symbol={set.symbol}
                          fallbackText={langOf(set.id) === "ja" ? splitId(set.id).raw : undefined}
                          className="h-9 w-12"
                        />
                      }
                      title={set.name}
                      subtitle={
                        <span className="block">
                          <span className="mt-1.5 flex items-center gap-2.5">
                            <Bar percent={c.percent} label={`${set.name} completion`} />
                            <span className="shrink-0 tabular-nums">
                              {c.owned}/{c.total}
                            </span>
                          </span>
                          {c.secret > 0 && (
                            <span className="mt-1 block text-xs">
                              {c.includesSecret ? "incl. " : ""}
                              <span className="font-semibold text-fg">{c.includesSecret ? c.secret : `+${c.secret}`}</span> secret rare{c.secret === 1 ? "" : "s"}
                            </span>
                          )}
                        </span>
                      }
                      trailing={<span className={cx("font-semibold", pct >= 100 && "text-good")}>{pct}%</span>}
                    />
                  );
                })}
              </ListGroup>
            )}

            <ListGroup label="Tools">
              <ListRow
                href="/centering"
                leading={
                  <span className="flex h-9 w-9 items-center justify-center rounded-ui-sm bg-accent-soft text-accent" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="4" y="4" width="16" height="16" rx="1.5" />
                      <rect x="8" y="7" width="8" height="10" rx="0.5" />
                    </svg>
                  </span>
                }
                title="Centering check"
                subtitle="Measure a card from phone photos, on your device"
              />
            </ListGroup>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="mx-1.5 text-muted/60">
      ·
    </span>
  );
}

/** Gain/loss pill: good/danger tint, arrow, amount and percent. */
function GainChip({ gain, pct, fmt }: { gain: number; pct: number | null; fmt: (n: number) => string }) {
  const up = gain >= 0;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums",
        up ? "bg-good/12 text-good" : "bg-danger/12 text-danger",
      )}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {up ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
      <span className="sr-only">{up ? "Gain" : "Loss"}</span>
      {up ? "+" : "−"}
      {fmt(Math.abs(gain))}
      {pct != null && <span className="font-medium opacity-80">({up ? "+" : "−"}{Math.abs(pct).toFixed(1)}%)</span>}
    </span>
  );
}

/** Span-based progress bar (ProgressBar renders a div, which can't sit inside a ListRow's text spans). */
function Bar({ percent, label }: { percent: number; label: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <span
      role="progressbar"
      aria-valuenow={Math.round(p)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3/80 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-line)_40%,transparent)]"
    >
      <span
        className="block h-full rounded-full"
        style={{ width: `${p}%`, minWidth: p > 0 ? 6 : 0, background: p >= 100 ? "var(--color-good)" : "var(--color-accent)" }}
      />
    </span>
  );
}

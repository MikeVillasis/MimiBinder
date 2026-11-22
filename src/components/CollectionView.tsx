"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { updateEntry, useBinders, useEntries } from "@/lib/db";
import { useCollectionPrices } from "@/lib/useCollectionPrices";
import { CONDITION_LABELS, VARIANT_LABELS, type CollectionEntry, type Condition, type Variant } from "@/lib/types";
import { CardImage } from "./CardImage";
import { CardTile, QtyBadge } from "./CardTile";
import { EntryEditor } from "./EntryEditor";
import { cardHref, entryCost, entryValue, localIdNum, useMoney } from "./hooks";
import { Badge, Button, CardGridSkeleton, EmptyState, PageHeader, Segmented, Sheet, Stat, cx, inputCls } from "./ui";

type Sort = "value" | "name" | "set" | "recent" | "gain";
type View = "grid" | "list";

export function CollectionView() {
  const entries = useEntries();
  const binders = useBinders();
  const { cards, fx: pricedFx } = useCollectionPrices();
  const { settings, fx: fetchedFx, fmt, fmtDisplay } = useMoney();
  const fx = pricedFx ?? fetchedFx;

  const [view, setView] = useState<View>("grid");
  const [sort, setSort] = useState<Sort>("recent");
  const [setF, setSetF] = useState("");
  const [genF, setGenF] = useState("");
  const [varF, setVarF] = useState("");
  const [condF, setCondF] = useState("");
  const [binderF, setBinderF] = useState("");
  const [editing, setEditing] = useState<string>();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const rows = useMemo(
    () =>
      (entries ?? []).map((e) => {
        const value = entryValue(e, cards, settings, fx);
        const cost = entryCost(e, settings, fx);
        return { e, value, cost, gain: value != null && cost != null ? value - cost : null };
      }),
    [entries, cards, settings, fx],
  );

  const setOptions = useMemo(() => uniq((entries ?? []).map((e) => [e.setId, e.setName] as const)), [entries]);
  const genOptions = useMemo(() => uniq((entries ?? []).filter((e) => e.serieId).map((e) => [e.serieId!, e.serieName ?? e.serieId!] as const)), [entries]);

  const filtered = useMemo(() => {
    const f = rows.filter(
      ({ e }) =>
        (!setF || e.setId === setF) &&
        (!genF || e.serieId === genF) &&
        (!varF || e.variant === varF) &&
        (!condF || e.condition === condF) &&
        (!binderF || e.binderIds.includes(binderF)),
    );
    const cmp: Record<Sort, (a: (typeof f)[number], b: (typeof f)[number]) => number> = {
      value: (a, b) => (b.value ?? -1) - (a.value ?? -1),
      gain: (a, b) => (b.gain ?? -Infinity) - (a.gain ?? -Infinity),
      name: (a, b) => a.e.cardName.localeCompare(b.e.cardName),
      set: (a, b) => a.e.setName.localeCompare(b.e.setName) || localIdNum(a.e.localId) - localIdNum(b.e.localId),
      recent: (a, b) => b.e.createdAt.localeCompare(a.e.createdAt),
    };
    return [...f].sort(cmp[sort]);
  }, [rows, setF, genF, varF, condF, binderF, sort]);

  if (entries === undefined) {
    return (
      <>
        <PageHeader title="Collection" />
        <CardGridSkeleton />
      </>
    );
  }
  if (entries.length === 0) {
    return (
      <>
        <PageHeader title="Collection" />
        <EmptyState title="Your collection is empty" body="Search for a card and add it to start tracking value.">
          <Link href="/search" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-bold text-accent-fg">
            Search cards
          </Link>
        </EmptyState>
      </>
    );
  }

  const total = filtered.reduce((s, r) => s + (r.value ?? 0), 0);
  const copies = filtered.reduce((s, r) => s + r.e.quantity, 0);
  const unpriced = filtered.filter((r) => r.value == null).length;
  const costed = filtered.filter((r) => r.cost != null);
  const cost = costed.reduce((s, r) => s + r.cost!, 0);
  const gain = costed.reduce((s, r) => s + (r.value ?? 0), 0) - cost;
  const gainPct = cost > 0 ? (gain / cost) * 100 : null;
  const editEntry = entries.find((e) => e.id === editing);
  const compactFmt = (n: number) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: settings.currency, notation: "compact", maximumFractionDigits: 1 }).format(n);
  const clearAll = () => {
    setSetF("");
    setGenF("");
    setVarF("");
    setCondF("");
    setBinderF("");
  };
  const labelOf = (opts: (readonly [string, string])[], v: string) => opts.find(([k]) => k === v)?.[1] ?? v;
  const filterSels = [
    { key: "set", label: "Set", value: setF, set: setSetF, options: setOptions as (readonly [string, string])[] },
    { key: "gen", label: "Generation", value: genF, set: setGenF, options: genOptions as (readonly [string, string])[] },
    { key: "var", label: "Variant", value: varF, set: setVarF, options: (Object.keys(VARIANT_LABELS) as Variant[]).map((v) => [v, VARIANT_LABELS[v]] as const) },
    { key: "cond", label: "Condition", value: condF, set: setCondF, options: (Object.keys(CONDITION_LABELS) as Condition[]).map((c) => [c, c] as const) },
    { key: "binder", label: "Binder", value: binderF, set: setBinderF, options: (binders ?? []).map((b) => [b.id, b.name] as const) },
  ];
  const active = filterSels.filter((f) => f.value);
  const sortSel = (
    <Sel label="Sort" value={sort} onChange={(v) => setSort(v as Sort)} options={[["recent", "Recently added"], ["value", "Value"], ["gain", "Gain / loss"], ["name", "Name"], ["set", "Set"]]} bare />
  );

  return (
    <div>
      <PageHeader
        title="Collection"
        subtitle={`${filtered.length} ${filtered.length === 1 ? "entry" : "entries"} · ${copies} cards`}
        actions={
          <Segmented<View> label="View" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]} />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Total value" value={fmtDisplay(total)} sub={unpriced ? `${unpriced} without price` : `in ${settings.currency}`} />
        <Stat
          label="Gain / loss"
          tone={cost > 0 ? (gain >= 0 ? "good" : "bad") : undefined}
          value={cost > 0 ? `${gain >= 0 ? "+" : ""}${fmtDisplay(gain)}` : "—"}
          sub={gainPct != null ? `${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}% vs cost` : "no cost recorded"}
        />
      </div>

      <div className="mb-3 flex items-end gap-2 md:hidden">
        <div className="min-w-0 flex-1">{sortSel}</div>
        <Button variant="secondary" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" aria-label={`Filters, ${active.length} active`} className="shrink-0">
          {active.length ? `Filters · ${active.length}` : "Filters"}
        </Button>
      </div>

      <div className="mb-3 hidden flex-wrap items-end gap-2 md:flex">
        <div className="w-44">{sortSel}</div>
        {filterSels.map((f) => (
          <div key={f.key} className="w-40">
            <Sel label={f.label} value={f.value} onChange={f.set} options={f.options} />
          </div>
        ))}
      </div>

      {active.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2" aria-label="Active filters">
          {active.map((f) => (
            <li key={f.key}>
              <button
                type="button"
                onClick={() => f.set("")}
                aria-label={`Remove ${f.label} filter: ${labelOf(f.options, f.value)}`}
                className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-line bg-surface-2 pl-3 pr-3 text-xs font-semibold hover:bg-line"
              >
                <span className="truncate">{labelOf(f.options, f.value)}</span>
                <span aria-hidden="true" className="text-base leading-none text-muted">×</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={clearAll} className="inline-flex min-h-11 items-center px-2 text-xs font-semibold text-muted hover:text-fg">
              Clear all
            </button>
          </li>
        </ul>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="flex flex-col gap-3">
          {filterSels.map((f) => (
            <Sel key={f.key} label={f.label} value={f.value} onChange={f.set} options={f.options} />
          ))}
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={clearAll} disabled={active.length === 0} className="flex-1">
              Clear all
            </Button>
            <Button onClick={() => setFiltersOpen(false)} className="flex-[2]">
              Show {filtered.length} {filtered.length === 1 ? "card" : "cards"}
            </Button>
          </div>
        </div>
      </Sheet>

      {filtered.length === 0 ? (
        <EmptyState title="No matches" body="No cards match these filters.">
          <Button variant="secondary" onClick={clearAll}>
            Clear filters
          </Button>
        </EmptyState>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filtered.map(({ e, value }) => (
            <CardTile
              key={e.id}
              id={e.cardId}
              name={e.cardName}
              localId={e.localId}
              image={e.image}
              badge={<QtyBadge n={e.quantity} />}
              footer={
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <div className="min-w-0">
                    <div className="whitespace-nowrap text-xs font-bold text-accent" title={value != null ? fmtDisplay(value) : undefined} aria-label={value != null ? fmtDisplay(value) : "No price"}>
                      {value != null ? (value >= 1000 ? compactFmt(value) : fmtDisplay(value)) : "—"}
                    </div>
                    <div className="truncate text-[11px] text-muted">
                      {VARIANT_LABELS[e.variant]} · {e.condition}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(e.id)}
                    aria-label={`Edit ${e.cardName}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <PencilIcon />
                  </button>
                </div>
              }
            />
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map(({ e, value, gain }) => (
            <li key={e.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
              <Link href={cardHref(e.cardId)} className="w-14 shrink-0" aria-label={`Open ${e.cardName}`}>
                <CardImage image={e.image} name={e.cardName} />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{e.cardName}</div>
                <div className="truncate text-xs text-muted">
                  {e.setName} · #{e.localId}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge>{VARIANT_LABELS[e.variant]}</Badge>
                  <Badge>{e.condition}</Badge>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="text-sm font-bold tabular-nums text-accent">{value != null ? fmtDisplay(value) : "—"}</div>
                {gain != null && (
                  <div className={cx("text-xs tabular-nums", gain >= 0 ? "text-good" : "text-danger")}>
                    {gain >= 0 ? "+" : ""}
                    {fmt(gain, settings.currency)}
                  </div>
                )}
                <QtyStepper e={e} onEdit={() => setEditing(e.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {editEntry && <EntryEditor key={editEntry.id} entry={editEntry} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

function QtyStepper({ e, onEdit }: { e: CollectionEntry; onEdit: () => void }) {
  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label={`Decrease quantity of ${e.cardName}`}
        disabled={e.quantity <= 1}
        onClick={() => updateEntry(e.id, { quantity: e.quantity - 1 })}
        className="flex h-11 w-9 items-center justify-center rounded-lg text-lg text-muted hover:bg-surface-2 disabled:opacity-30"
      >
        −
      </button>
      <span className="w-6 text-center text-sm font-bold tabular-nums">{e.quantity}</span>
      <button
        type="button"
        aria-label={`Increase quantity of ${e.cardName}`}
        onClick={() => updateEntry(e.id, { quantity: e.quantity + 1 })}
        className="flex h-11 w-9 items-center justify-center rounded-lg text-lg text-muted hover:bg-surface-2"
      >
        +
      </button>
      <button type="button" aria-label={`Edit ${e.cardName}`} onClick={onEdit} className="flex h-11 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
        <PencilIcon />
      </button>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function uniq(pairs: (readonly [string, string])[]): [string, string][] {
  const m = new Map<string, string>();
  pairs.forEach(([k, v]) => m.set(k, v));
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

function Sel({
  label,
  value,
  onChange,
  options,
  bare,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (readonly [string, string])[];
  bare?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {!bare && <option value="">All</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

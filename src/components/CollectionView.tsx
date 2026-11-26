"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { updateEntry, useBinders, useEntries } from "@/lib/db";
import { langOf } from "@/lib/lang";
import { printingKey, printingLabel } from "@/lib/stamps";
import { matchesCardNumber, parseCardQuery } from "@/lib/search-query";
import { useCollectionPrices } from "@/lib/useCollectionPrices";
import { CONDITION_LABELS, VARIANT_LABELS, type CollectionEntry, type Condition, type Variant } from "@/lib/types";
import { isNewEntry } from "@/lib/fun";
import { CardImage } from "./CardImage";
import { CardFan, InspectHint } from "./fun";
import { CardTile, PriceChip, QtyBadge } from "./CardTile";
import { EntryEditor } from "./EntryEditor";
import { cardHref, entryCost, entryValue, localIdNum, useMoney } from "./hooks";
import { Button, CardGridSkeleton, Chip, ChipGroup, EmptyState, Field, LangBadge, ListGroup, PageHeader, Segmented, Sheet, Stat, Surface, buttonCls, cx, inputCls } from "./ui";

type Sort = "value" | "name" | "set" | "recent" | "gain";
type View = "grid" | "list";

export function CollectionView() {
  const entries = useEntries();
  const binders = useBinders();
  const { cards, fx: pricedFx } = useCollectionPrices();
  const { settings, fx: fetchedFx, fmt, fmtDisplay } = useMoney();
  const fx = pricedFx ?? fetchedFx;

  const [view, setView] = useState<View>("grid");
  const [now] = useState(() => Date.now()); // for the "New" badge; fixed for this visit
  // ?sort=value|recent|… (links from Home) read after mount, like CenteringTool, so the page prerenders statically.
  const search = useSyncExternalStore(noopSubscribe, () => window.location.search, () => "");
  const urlSort = new URLSearchParams(search).get("sort");
  const [pickedSort, setSort] = useState<Sort>();
  const sort: Sort = pickedSort ?? (SORTS.some(([k]) => k === urlSort) ? (urlSort as Sort) : "recent");
  const [setF, setSetF] = useState("");
  const [genF, setGenF] = useState("");
  const [varF, setVarF] = useState("");
  const [text, setText] = useState("");
  const [condF, setCondF] = useState("");
  const [binderF, setBinderF] = useState("");
  const [langF, setLangF] = useState("");
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
    const parsed = parseCardQuery(text);
    const nameNeedle = parsed.name.toLowerCase();
    const f = rows.filter(
      ({ e }) =>
        (!nameNeedle || e.cardName.toLowerCase().includes(nameNeedle) || e.setName.toLowerCase().includes(nameNeedle)) &&
        (!parsed.number || matchesCardNumber(e.localId, parsed.number)) &&
        (!setF || e.setId === setF) &&
        (!genF || e.serieId === genF) &&
        (!varF || printingKey(e.variant, e.stamp) === varF) &&
        (!condF || e.condition === condF) &&
        (!binderF || e.binderIds.includes(binderF)) &&
        (!langF || langOf(e.cardId) === langF),
    );
    const cmp: Record<Sort, (a: (typeof f)[number], b: (typeof f)[number]) => number> = {
      value: (a, b) => (b.value ?? -1) - (a.value ?? -1),
      gain: (a, b) => (b.gain ?? -Infinity) - (a.gain ?? -Infinity),
      name: (a, b) => a.e.cardName.localeCompare(b.e.cardName),
      set: (a, b) => a.e.setName.localeCompare(b.e.setName) || localIdNum(a.e.localId) - localIdNum(b.e.localId),
      recent: (a, b) => b.e.createdAt.localeCompare(a.e.createdAt),
    };
    return [...f].sort(cmp[sort]);
  }, [rows, text, setF, genF, varF, condF, binderF, langF, sort]);

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
        <EmptyState art={<CardFan />} title="No cards in hand yet" body="Search for a card you own and add it. It lands here with its value, ready to sort and filter.">
          <Link href="/search" className={buttonCls()}>
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
    setText("");
    setSetF("");
    setGenF("");
    setVarF("");
    setCondF("");
    setBinderF("");
    setLangF("");
  };
  const printingOptions = [
    ...(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => [v, VARIANT_LABELS[v]] as const),
    ...uniq(entries.filter((e) => e.stamp).map((e) => [printingKey(e.variant, e.stamp), printingLabel(e.variant, e.stamp)] as const)),
  ];
  const labelOf = (opts: (readonly [string, string])[], v: string) => opts.find(([k]) => k === v)?.[1] ?? v;
  const hasJa = (entries ?? []).some((e) => langOf(e.cardId) === "ja");
  const filterSels = [
    ...(hasJa || langF
      ? [{ key: "lang", label: "Language", all: "Any language", value: langF, set: setLangF, options: [["en", "English"], ["ja", "Japanese"]] as (readonly [string, string])[] }]
      : []),
    { key: "set", label: "Set", all: "All sets", value: setF, set: setSetF, options: setOptions as (readonly [string, string])[] },
    { key: "gen", label: "Generation", all: "All generations", value: genF, set: setGenF, options: genOptions as (readonly [string, string])[] },
    { key: "var", label: "Printing", all: "Any printing", value: varF, set: setVarF, options: printingOptions },
    { key: "cond", label: "Condition", all: "Any condition", value: condF, set: setCondF, options: (Object.keys(CONDITION_LABELS) as Condition[]).map((c) => [c, c] as const) },
    { key: "binder", label: "Binder", all: "Any binder", value: binderF, set: setBinderF, options: (binders ?? []).map((b) => [b.id, b.name] as const) },
  ];
  const active = filterSels.filter((f) => f.value);
  return (
    <div>
      <PageHeader
        title="Collection"
        actions={
          <Segmented<View> size="sm" label="View" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]} />
        }
      />

      {/* One compact summary: value (for the current filters), gain chip, counts. */}
      <Surface padded className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <Stat inset label={active.length || text ? "Value of matches" : "Total value"} value={fmtDisplay(total)} />
        <div className="flex flex-col items-start gap-1.5 text-[13px] text-muted tabular-nums sm:items-end">
          {cost > 0 && (
            <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold", gain >= 0 ? "bg-good/12 text-good" : "bg-danger/12 text-danger")}>
              {gain >= 0 ? "+" : "−"}
              {fmtDisplay(Math.abs(gain))}
              {gainPct != null && <span className="font-medium opacity-80">({gainPct >= 0 ? "+" : "−"}{Math.abs(gainPct).toFixed(1)}%)</span>}
              <span className="sr-only">{gain >= 0 ? "gain" : "loss"} vs cost</span>
            </span>
          )}
          <span>
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"} · {copies} {copies === 1 ? "card" : "cards"}
            {unpriced > 0 && ` · ${unpriced} unpriced`}
          </span>
        </div>
      </Surface>

      {/* Phone: search + sort + filters on one row. Desktop: search, sort and compact filter pills. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 md:max-w-xs md:flex-none md:basis-72">
          <SearchIcon />
          <input
            type="search"
            aria-label="Search your collection by name or number"
            placeholder="Name or number"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={cx(inputCls, "pl-10")}
          />
        </div>
        <SelectPill label="Sort" value={sort} onChange={(v) => setSort(v as Sort)} options={SORTS} icon={<SortIcon />} iconOnlyOnPhone />
        <Button
          variant="secondary"
          onClick={() => setFiltersOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Filters, ${active.length} active`}
          className="relative w-11 shrink-0 px-0 md:hidden"
        >
          <FilterIcon />
          {active.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-fg">
              {active.length}
            </span>
          )}
        </Button>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {filterSels.map((f) => (
            <SelectPill key={f.key} label={f.label} value={f.value} onChange={f.set} options={f.options} allLabel={f.all} />
          ))}
          {active.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear all
            </Button>
          )}
        </div>
      </div>

      {active.length > 0 && (
        <ChipGroup label="Active filters" scroll className="mb-3 md:hidden">
          {active.map((f) => (
            <Chip key={f.key} selected onClick={() => f.set("")} aria-pressed={undefined} aria-label={`Remove ${f.label} filter: ${labelOf(f.options, f.value)}`}>
              <span className="max-w-[12rem] truncate">{labelOf(f.options, f.value)}</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true" className="-mr-1">
                <path d="M7 7l10 10M17 7L7 17" />
              </svg>
            </Chip>
          ))}
          <Chip onClick={clearAll} aria-pressed={undefined}>
            Clear all
          </Chip>
        </ChipGroup>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="flex flex-col gap-4">
          {filterSels.map((f) => (
            <Field key={f.key} label={f.label}>
              <select className={inputCls} value={f.value} onChange={(e) => f.set(e.target.value)}>
                <option value="">{f.all}</option>
                {f.options.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
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

      <InspectHint className="mt-4" />
      {filtered.length === 0 ? (
        <EmptyState title="No matches" body="No cards match this search and these filters.">
          <Button variant="secondary" onClick={clearAll}>
            Clear filters
          </Button>
        </EmptyState>
      ) : view === "grid" ? (
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 md:gap-x-4 lg:grid-cols-6">
          {filtered.map(({ e, value }, i) => (
            <CardTile
              key={e.id}
              index={i}
              isNew={isNewEntry(e.createdAt, now)}
              id={e.cardId}
              name={e.cardName}
              localId={e.localId}
              image={e.image}
              badge={e.quantity > 1 ? <QtyBadge n={e.quantity} /> : undefined}
              price={value != null ? <PriceChip label={fmtDisplay(value)}>{value >= 1000 ? compactFmt(value) : fmtDisplay(value)}</PriceChip> : undefined}
              meta={`${printingLabel(e.variant, e.stamp)} · ${e.condition}`}
              action={
                <button
                  type="button"
                  onClick={() => setEditing(e.id)}
                  aria-label={`Edit ${e.cardName}`}
                  className="ui-motion flex h-11 w-9 items-center justify-center rounded-ui-sm text-muted/80 hover:bg-surface-2 hover:text-fg"
                >
                  <MoreIcon />
                </button>
              }
            />
          ))}
        </div>
      ) : (
        <ListGroup label="Collection" className="mt-4">
          {filtered.map(({ e, value, gain }) => (
            <li key={e.id} className="list-row">
              <div className="relative flex gap-3 px-4 py-3 ui-motion has-[a:hover]:bg-surface-2/60">
                <div className="w-11 shrink-0">
                  <CardImage image={e.image} name={e.cardName} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={cardHref(e.cardId)}
                        className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold leading-snug after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-ui-sm focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent"
                      >
                        <span className="truncate">{e.cardName}</span>
                        {langOf(e.cardId) === "ja" && <LangBadge className="shrink-0 shadow-none" />}
                      </Link>
                      <div className="truncate text-[13px] text-muted">
                        {e.setName} · #{e.localId}
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      {value != null ? <div className="text-[15px] font-semibold">{fmtDisplay(value)}</div> : <div className="text-[13px] text-muted">No price</div>}
                      {gain != null && (
                        <div className={cx("text-xs font-medium", gain >= 0 ? "text-good" : "text-danger")}>
                          {gain >= 0 ? "+" : ""}
                          {fmt(gain, settings.currency)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] text-muted">
                      {printingLabel(e.variant, e.stamp)} · {e.condition}
                    </span>
                    <QtyStepper e={e} onEdit={() => setEditing(e.id)} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ListGroup>
      )}

      {editEntry && <EntryEditor key={editEntry.id} entry={editEntry} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

const SORTS: (readonly [string, string])[] = [
  ["recent", "Recently added"],
  ["value", "Value"],
  ["gain", "Gain / loss"],
  ["name", "Name"],
  ["set", "Set"],
];

const noopSubscribe = () => () => {};

/** −  n  +  ✎ as one quiet pill; buttons sit above the row's stretched link. */
function QtyStepper({ e, onEdit }: { e: CollectionEntry; onEdit: () => void }) {
  const btn =
    "ui-motion relative flex h-9 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-30 after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']";
  return (
    <div className="relative z-[1] flex shrink-0 items-center gap-1">
      <div className="flex items-center rounded-full bg-surface-2">
        <button type="button" aria-label={`Decrease quantity of ${e.cardName}`} disabled={e.quantity <= 1} onClick={() => updateEntry(e.id, { quantity: e.quantity - 1 })} className={btn}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 12h12" />
          </svg>
        </button>
        <span className="w-5 text-center text-sm font-semibold tabular-nums" aria-label={`Quantity ${e.quantity}`}>
          {e.quantity}
        </span>
        <button type="button" aria-label={`Increase quantity of ${e.cardName}`} onClick={() => updateEntry(e.id, { quantity: e.quantity + 1 })} className={btn}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 6v12M6 12h12" />
          </svg>
        </button>
      </div>
      <button type="button" aria-label={`Edit ${e.cardName}`} onClick={onEdit} className={cx(btn, "w-10")}>
        <MoreIcon />
      </button>
    </div>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <circle cx="5.5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18.5" cy="12" r="1.7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function uniq(pairs: (readonly [string, string])[]): [string, string][] {
  const m = new Map<string, string>();
  pairs.forEach(([k, v]) => m.set(k, v));
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

/**
 * A native <select> dressed as a compact pill (keeps the platform picker on phones).
 * With `allLabel` the first option clears it; a set value gets the accent tint.
 * `iconOnlyOnPhone` shows just the icon below md (the label is still the accessible name).
 */
function SelectPill({
  label,
  value,
  onChange,
  options,
  allLabel,
  icon,
  iconOnlyOnPhone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (readonly [string, string])[];
  allLabel?: string;
  icon?: ReactNode;
  iconOnlyOnPhone?: boolean;
}) {
  const on = !!allLabel && !!value;
  const current = options.find(([k]) => k === value)?.[1] ?? allLabel ?? value;
  return (
    <div
      className={cx(
        "ui-motion relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-ui-md px-3.5 text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
        on ? "bg-accent-soft text-accent" : "bg-surface-2 text-fg hover:bg-surface-3",
        iconOnlyOnPhone && "w-11 justify-center px-0 md:w-auto md:justify-start md:px-3.5",
      )}
    >
      {icon && <span className="flex shrink-0 items-center text-muted">{icon}</span>}
      <span className={cx("max-w-[11rem] truncate", iconOnlyOnPhone && "hidden md:inline")}>{current}</span>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cx("shrink-0 opacity-60", iconOnlyOnPhone && "hidden md:block")}>
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0">
        {allLabel && <option value="">{allLabel}</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

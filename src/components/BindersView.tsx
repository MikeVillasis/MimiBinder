"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { getSeries, getSets } from "@/lib/api-client";
import { groupBySerie, groupBySet, setCompletion } from "@/lib/collection";
import { createBinder, useBinders, useEntries, useSettings } from "@/lib/db";
import { parseLang, splitId } from "@/lib/lang";
import { LANG_LABELS, type Lang, type SetSummary } from "@/lib/types";
import { useAsync } from "./hooks";
import { Button, Chip, EmptyState, ErrorState, ListGroup, ListRow, PageHeader, ProgressBar, Segmented, SetLogo, Skeleton, Surface, inputCls } from "./ui";

type Tab = "sets" | "generations" | "custom";

const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
function useWide() {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );
}

/** One ListGroup on phones; two side-by-side groups (split in half, reading top-down) on wide screens. */
function Columns({ label, rows }: { label: string; rows: ReactNode[] }) {
  const wide = useWide();
  if (!wide || rows.length < 6) return <ListGroup label={label}>{rows}</ListGroup>;
  const half = Math.ceil(rows.length / 2);
  return (
    <div className="grid grid-cols-2 items-start gap-4">
      <ListGroup label={`${label} (1)`}>{rows.slice(0, half)}</ListGroup>
      <ListGroup label={`${label} (2)`}>{rows.slice(half)}</ListGroup>
    </div>
  );
}

export function BindersView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initial = params.get("tab");
  const [tab, setTabState] = useState<Tab>(initial === "generations" || initial === "custom" ? initial : "sets");
  const lang = parseLang(params.get("lang"));
  const syncUrl = (t: Tab, l: Lang) => {
    const sp = new URLSearchParams();
    sp.set("tab", t);
    if (l !== "en") sp.set("lang", l);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };
  const setTab = (t: Tab) => {
    setTabState(t);
    syncUrl(t, lang);
  };
  return (
    <div>
      <PageHeader
        title="Binders"
        actions={
          tab !== "custom" ? (
            <Segmented<Lang>
              size="sm"
              label="Card language"
              value={lang}
              onChange={(l) => syncUrl(tab, l)}
              options={(["en", "ja"] as Lang[]).map((l) => ({ value: l, label: LANG_LABELS[l] }))}
            />
          ) : undefined
        }
      />
      <Segmented<Tab>
        label="Binder type"
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: "sets", label: "Sets" },
          { value: "generations", label: "Generations" },
          { value: "custom", label: "Custom" },
        ]}
      />
      {tab === "sets" && <SetsTab lang={lang} />}
      {tab === "generations" && <GenerationsTab lang={lang} />}
      {tab === "custom" && <CustomTab />}
    </div>
  );
}

/** Japanese sets show their set code (e.g. "SV2a") instead of useless initials. */
function fallback(setId: string): string | undefined {
  const { lang, raw } = splitId(setId);
  return lang === "ja" ? raw : undefined;
}

function SetRow({ set, owned, c }: { set: SetSummary; owned: boolean; c?: ReturnType<typeof setCompletion> }) {
  return (
    <ListRow
      href={`/binders/set/${encodeURIComponent(set.id)}`}
      leading={<SetLogo name={set.name} logo={set.logo} symbol={set.symbol} fallbackText={fallback(set.id)} />}
      title={set.name}
      subtitle={
        <>
          {set.serieName}
          {set.releaseDate ? ` · ${set.releaseDate.slice(0, 4)}` : ""}
          {owned && c && (
            <span className="mt-1.5 block">
              <ProgressBar percent={c.percent} label={`${set.name} completion`} />
            </span>
          )}
        </>
      }
      trailing={
        <span className="text-[13px] text-muted">
          {owned && c ? `${c.owned}/${c.total}${c.secret && !c.includesSecret ? ` +${c.secret}` : ""}` : `${c?.includesSecret ? set.totalCount : set.officialCount} cards`}
        </span>
      }
    />
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function SetsTab({ lang }: { lang: Lang }) {
  const includeSecret = useSettings().countSecretRares !== false;
  const entries = useEntries();
  const { data: sets, error, loading, retry } = useAsync(() => getSets(lang), `sets:${lang}`);
  const [q, setQ] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const grouped = useMemo(() => groupBySet(entries ?? []), [entries]);

  if (loading) return <ListSkeleton />;
  if (error || !sets) return <ErrorState message={error ?? "Could not load sets."} onRetry={retry} />;

  const needle = q.trim().toLowerCase();
  const filtered = sets.filter(
    (s) => (!ownedOnly || grouped.has(s.id)) && (s.name.toLowerCase().includes(needle) || splitId(s.id).raw.toLowerCase().includes(needle)),
  );
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative min-w-0 flex-1 md:max-w-md md:flex-none md:basis-96">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
            <SearchIcon />
          </span>
          <input
            type="search"
            aria-label="Filter sets"
            placeholder="Filter sets…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={`${inputCls} pl-10 [&::-webkit-search-cancel-button]:appearance-none`}
          />
        </div>
        <Chip selected={ownedOnly} onClick={() => setOwnedOnly((v) => !v)}>
          Owned
        </Chip>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No sets" body="No sets match your filter." icon={<SearchIcon />} />
      ) : (
        <Columns
          label="Sets"
          rows={filtered.map((s) => (
            <SetRow key={s.id} set={s} owned={grouped.has(s.id)} c={grouped.has(s.id) ? setCompletion(grouped.get(s.id)!, s, { includeSecret }) : undefined} />
          ))}
        />
      )}
    </div>
  );
}

function GenerationsTab({ lang }: { lang: Lang }) {
  const entries = useEntries();
  const { data: series, error, loading, retry } = useAsync(() => getSeries(lang), `series:${lang}`);
  const grouped = useMemo(() => groupBySerie(entries ?? []), [entries]);
  if (loading) return <ListSkeleton />;
  if (error || !series) return <ErrorState message={error ?? "Could not load generations."} onRetry={retry} />;
  return (
    <Columns
      label="Generations"
      rows={series.map((s) => {
        const list = grouped.get(s.id) ?? [];
        const unique = new Set(list.map((e) => e.cardId)).size;
        return (
          <ListRow
            key={s.id}
            href={`/binders/serie/${encodeURIComponent(s.id)}`}
            leading={<SetLogo name={s.name} logo={s.logo} fallbackText={fallback(s.id)} />}
            title={s.name}
            subtitle={`${s.setIds.length} sets`}
            trailing={
              unique > 0 ? (
                <span className="text-[13px] text-muted">
                  {unique} owned
                </span>
              ) : undefined
            }
          />
        );
      })}
    />
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
      <Surface as="section" padded="sm" className="mb-4">
        <form onSubmit={create} className="flex gap-2">
          <input aria-label="New binder name" placeholder="New binder name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={60} />
          <Button type="submit" disabled={busy || !name.trim()} className="shrink-0">
            Create
          </Button>
        </form>
      </Surface>
      {binders === undefined ? (
        <ListSkeleton />
      ) : binders.length === 0 ? (
        <EmptyState
          title="No custom binders yet"
          body="Group cards any way you like: trade binder, favourites, a deck wishlist."
          icon={
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
              <path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" />
            </svg>
          }
        />
      ) : (
        <Columns
          label="Custom binders"
          rows={binders.map((b) => {
            const n = (entries ?? []).filter((e) => e.binderIds.includes(b.id)).length;
            return (
              <ListRow
                key={b.id}
                href={`/binders/custom/${encodeURIComponent(b.id)}`}
                title={b.name}
                subtitle={b.description}
                trailing={
                  <span className="text-[13px] text-muted">
                    {n} {n === 1 ? "entry" : "entries"}
                  </span>
                }
              />
            );
          })}
        />
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <Surface className="divide-y divide-line/60 overflow-hidden" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
          <Skeleton className="h-10 w-14 rounded-ui-sm" />
          <div className="flex-1">
            <Skeleton className="mb-2 h-4 w-1/2 rounded" />
            <Skeleton className="h-3 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </Surface>
  );
}

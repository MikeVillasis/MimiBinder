"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { searchCards } from "@/lib/api-client";
import { parseLang } from "@/lib/lang";
import { LANG_LABELS, type CardSummary, type Lang } from "@/lib/types";
import { CardTile } from "./CardTile";
import { Button, CardGridSkeleton, EmptyState, ErrorState, PageHeader, Segmented, buttonCls, inputCls } from "./ui";

export function SearchView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const lang = parseLang(params.get("lang"));
  const initialQ = params.get("q") ?? "";
  const [input, setInput] = useState(initialQ);
  const [q, setQ] = useState(initialQ.trim());
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const reqId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = (query: string, pg: number, l: Lang = lang) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(undefined);
    searchCards(query, pg, l).then(
      (r) => {
        if (id !== reqId.current) return;
        setCards((prev) => (pg === 1 ? r.cards : [...prev, ...r.cards.filter((c) => !prev.some((p) => p.id === c.id))]));
        setPage(r.page);
        setHasMore(r.hasMore);
        setLoading(false);
      },
      (e: unknown) => {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : "Search failed");
        setLoading(false);
      },
    );
  };

  // Keep ?q= and ?lang= in the URL so links and back navigation restore them.
  const syncUrl = (v: string, l: Lang) => {
    const sp = new URLSearchParams();
    if (v) sp.set("q", v);
    if (l !== "en") sp.set("lang", l);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Debounced search; also re-runs when the language changes.
  useEffect(() => {
    const t = setTimeout(() => {
      const v = input.trim();
      setQ(v);
      if (v) {
        setCards([]);
        run(v, 1, lang);
      } else {
        reqId.current++;
        setLoading(false);
      }
      if ((params.get("q") ?? "") !== v) syncUrl(v, lang);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, lang]);

  const shown = q ? cards : [];
  const browseHref = `/binders?tab=sets${lang === "ja" ? "&lang=ja" : ""}`;
  return (
    <div>
      <PageHeader title="Search" />
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.25rem)] z-10 -mx-4 bg-bg/90 px-4 pb-3 pt-1 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Search cards by name or number"
            placeholder={lang === "ja" ? "Name, e.g. Pikachu or ピカチュウ" : "Name or number, e.g. Zorua 189"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={`${inputCls} min-h-12 rounded-ui-lg bg-surface pl-12 pr-12 text-base elev-1 [&::-webkit-search-cancel-button]:appearance-none`}
          />
          {input && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setInput("");
                inputRef.current?.focus();
              }}
              className="ui-motion absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-fg"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </span>
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Segmented<Lang>
            size="sm"
            label="Card language"
            value={lang}
            onChange={(l) => syncUrl(input.trim(), l)}
            options={(["en", "ja"] as Lang[]).map((l) => ({ value: l, label: LANG_LABELS[l] }))}
          />
          <Link href={browseHref} className={buttonCls({ variant: "ghost", size: "sm" })}>
            Browse sets
          </Link>
        </div>
      </div>

      {!q && (
        <EmptyState
          title="Find a card"
          icon={
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          }
          body={
            lang === "ja"
              ? "Search Japanese cards by English Pokemon name (for example “Pikachu”) or by Japanese name. Trainer and Energy cards need the Japanese name."
              : "Type a Pokemon name or a card number (like “Zorua 189”, “#189” or “189/159”) to search every card, or browse by set to see full checklists."
          }
        />
      )}

      {q && error && <ErrorState message={error} onRetry={() => run(q, cards.length ? page + 1 : 1)} />}

      {q && !error && loading && shown.length === 0 && <CardGridSkeleton />}

      {q && !error && !loading && shown.length === 0 && <EmptyState
          icon={
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5M9 11h4" />
            </svg>
          }
          title="No cards found"
          body={lang === "ja" ? `Nothing matched “${q}”. Try the English Pokemon name, or the Japanese name for Trainer and Energy cards.` : `Nothing matched “${q}”. Try a shorter name, or check the card number.`}
        />}

      {shown.length > 0 && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {shown.map((c) => (
              <CardTile key={c.id} id={c.id} name={c.name} localId={c.localId} image={c.image} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" disabled={loading} onClick={() => run(q, page + 1)}>
                {loading ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

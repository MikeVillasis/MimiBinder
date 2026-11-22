"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { searchCards } from "@/lib/api-client";
import { parseLang } from "@/lib/lang";
import { LANG_LABELS, type CardSummary, type Lang } from "@/lib/types";
import { CardTile } from "./CardTile";
import { Button, CardGridSkeleton, EmptyState, ErrorState, Segmented, inputCls } from "./ui";

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
  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight md:text-3xl">Search</h1>
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.25rem)] z-10 -mx-4 bg-bg/90 px-4 pb-3 pt-1 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0">
        <div className="mb-2">
          <Segmented<Lang>
            label="Card language"
            value={lang}
            onChange={(l) => syncUrl(input.trim(), l)}
            options={(["en", "ja"] as Lang[]).map((l) => ({ value: l, label: LANG_LABELS[l] }))}
          />
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Search cards by name or number"
            placeholder={lang === "ja" ? "Search by name, e.g. Pikachu or ピカチュウ" : "Name or number, e.g. Zorua 189 or 189/159"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={inputCls}
          />
          <Link
            href={`/binders?tab=sets${lang === "ja" ? "&lang=ja" : ""}`}
            className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-line bg-surface-2 px-4 text-sm font-semibold hover:bg-line"
          >
            Browse sets
          </Link>
        </div>
      </div>

      {!q && (
        <EmptyState title="Find a card" body={
            lang === "ja"
              ? "Search Japanese cards by English Pokemon name (for example “Pikachu”) or by Japanese name. Trainer and Energy cards need the Japanese name."
              : "Type a Pokemon name or a card number (like “Zorua 189”, “#189” or “189/159”) to search every card, or browse by set to see full checklists."
          }
        >
          <Link href={`/binders?tab=sets${lang === "ja" ? "&lang=ja" : ""}`} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-bold text-accent-fg">
            Browse sets
          </Link>
        </EmptyState>
      )}

      {q && error && <ErrorState message={error} onRetry={() => run(q, cards.length ? page + 1 : 1)} />}

      {q && !error && loading && shown.length === 0 && <CardGridSkeleton />}

      {q && !error && !loading && shown.length === 0 && <EmptyState
          title="No cards found"
          body={lang === "ja" ? `Nothing matched “${q}”. Try the English Pokemon name, or the Japanese name for Trainer and Energy cards.` : `Nothing matched “${q}”. Try a shorter name, or check the card number.`}
        />}

      {shown.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
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

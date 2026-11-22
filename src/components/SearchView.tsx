"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { searchCards } from "@/lib/api-client";
import type { CardSummary } from "@/lib/types";
import { CardTile } from "./CardTile";
import { Button, CardGridSkeleton, EmptyState, ErrorState, inputCls } from "./ui";

export function SearchView() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const reqId = useRef(0);

  const run = (query: string, pg: number) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(undefined);
    searchCards(query, pg).then(
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

  useEffect(() => {
    const t = setTimeout(() => {
      const v = input.trim();
      setQ(v);
      if (v) run(v, 1);
      else reqId.current++;
    }, 350);
    return () => clearTimeout(t);
  }, [input]);

  const shown = q ? cards : [];
  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight md:text-3xl">Search</h1>
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.25rem)] z-10 -mx-4 bg-bg/90 px-4 pb-3 pt-1 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0">
        <div className="flex gap-2">
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Search cards by name"
            placeholder="Search cards by name, e.g. Charizard"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={inputCls}
          />
          <Link
            href="/binders?tab=sets"
            className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-line bg-surface-2 px-4 text-sm font-semibold hover:bg-line"
          >
            Browse sets
          </Link>
        </div>
      </div>

      {!q && (
        <EmptyState title="Find a card" body="Type a Pokemon name to search every card, or browse by set to see full checklists.">
          <Link href="/binders?tab=sets" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-bold text-accent-fg">
            Browse sets
          </Link>
        </EmptyState>
      )}

      {q && error && <ErrorState message={error} onRetry={() => run(q, cards.length ? page + 1 : 1)} />}

      {q && !error && loading && shown.length === 0 && <CardGridSkeleton />}

      {q && !error && !loading && shown.length === 0 && <EmptyState title="No cards found" body={`Nothing matched “${q}”. Try a shorter name.`} />}

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

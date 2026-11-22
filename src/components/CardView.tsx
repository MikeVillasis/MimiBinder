"use client";

import Link from "next/link";
import { useState } from "react";
import { getCard } from "@/lib/api-client";
import { useEntries } from "@/lib/db";
import { CONDITION_LABELS, VARIANT_LABELS } from "@/lib/types";
import { AddToCollectionSheet } from "./AddToCollectionSheet";
import { CardImage } from "./CardImage";
import { useAsync } from "./hooks";
import { PriceHistoryChart } from "./PriceHistoryChart";
import { PriceTable } from "./PriceTable";
import { Badge, Button, ErrorState, Sheet, Skeleton } from "./ui";

export function CardView({ id }: { id: string }) {
  const { data: card, error, loading, retry } = useAsync(() => getCard(id), id);
  const entries = useEntries();
  const [adding, setAdding] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [added, setAdded] = useState(false);

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-[320px_1fr]" aria-busy="true">
        <Skeleton className="aspect-[63/88] w-full max-w-xs rounded-2xl" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }
  if (error || !card) return <ErrorState message={error ?? "Card not found."} onRetry={retry} />;

  const owned = (entries ?? []).filter((e) => e.cardId === card.id);
  const ownedCount = owned.reduce((n, e) => n + e.quantity, 0);

  return (
    <div>
      <Link href="/search" className="mb-3 inline-flex min-h-11 items-center text-sm text-muted hover:text-fg">
        ← Back to search
      </Link>
      <div className="grid gap-6 md:grid-cols-[320px_1fr] md:items-start">
        <div className="mx-auto w-full max-w-[300px] md:sticky md:top-8 md:max-w-none">
          <button type="button" onClick={() => setZoom(true)} aria-label={`Zoom ${card.name}`} className="block w-full cursor-zoom-in">
            <CardImage image={card.image} name={card.name} quality="high" className="card-shadow" />
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{card.name}</h1>
            <p className="mt-1 text-sm text-muted">
              <Link href={`/binders/set/${encodeURIComponent(card.setId)}`} className="text-fg underline decoration-line underline-offset-2 hover:decoration-accent">
                {card.setName}
              </Link>{" "}
              · #{card.localId}
              {card.setOfficialCount ? `/${card.setOfficialCount}` : ""}
              {card.rarity ? ` · ${card.rarity}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {card.variants.map((v) => (
                <Badge key={v}>{VARIANT_LABELS[v]}</Badge>
              ))}
              {card.hp != null && <Badge>HP {card.hp}</Badge>}
              {card.types?.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
            {card.illustrator && <p className="mt-2 text-xs text-muted">Illustrated by {card.illustrator}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setAdding(true)} className="min-w-44">
              + Add to collection
            </Button>
            {added && (
              <span role="status" className="text-sm font-medium text-good">
                Added to your collection
              </span>
            )}
          </div>

          {owned.length > 0 && (
            <section className="rounded-2xl border border-accent/30 bg-accent/5 p-4" aria-label="Copies owned">
              <h2 className="mb-2 text-sm font-bold">
                You own {ownedCount} {ownedCount === 1 ? "copy" : "copies"}
              </h2>
              <ul className="flex flex-col gap-1 text-sm">
                {owned.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <span>
                      {VARIANT_LABELS[e.variant]} · {CONDITION_LABELS[e.condition]}
                    </span>
                    <span className="font-semibold tabular-nums">×{e.quantity}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <PriceTable card={card} />
          <PriceHistoryChart cardId={card.id} variants={card.variants} />
        </div>
      </div>

      {adding && (
        <AddToCollectionSheet
          card={card}
          open={adding}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdded(true);
            setTimeout(() => setAdded(false), 4000);
          }}
        />
      )}
      <Sheet open={zoom} onClose={() => setZoom(false)} title={card.name}>
        <CardImage image={card.image} name={card.name} quality="high" className="mx-auto max-w-sm" />
      </Sheet>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasInAppHistory } from "./navHistory";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCard } from "@/lib/api-client";
import { getCachedCards, putCachedCards, useEntries } from "@/lib/db";
import { langOf } from "@/lib/lang";
import type { CardDetail, Variant } from "@/lib/types";
import { CONDITION_LABELS, VARIANT_LABELS } from "@/lib/types";
import { printingKey, printingLabel } from "@/lib/stamps";
import { AddToCollectionSheet } from "./AddToCollectionSheet";
import { foilTier, glitterTier, strongestGlitter } from "@/lib/fun";
import { haptic, motionOK } from "@/lib/prefs";
import { CardBack } from "./CardBack";
import { CardImage } from "./CardImage";
import { HoloCard, Sparkles } from "./fun";
import { openCardInspector } from "./CardInspector";
import { PriceHistoryChart } from "./PriceHistoryChart";
import { PriceTable } from "./PriceTable";
import { GradedPrices } from "./GradedPrices";
import { EntryEditor } from "./EntryEditor";
import { useMoney } from "./hooks";
import { effectiveSource, unitPrice } from "@/lib/pricing";
import { Badge, Button, ErrorState, LangBadge, ListGroup, ListRow, Sheet, Skeleton, Surface, buttonCls, cx } from "./ui";

export function CardView({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ id: string; card?: CardDetail; error?: string; fresh: boolean }>({ id: "", fresh: false });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getCachedCards([id]).then(
      ([cached]) => {
        if (cancelled || !cached) return;
        setState((s) => (s.id === id && s.fresh ? s : { id, card: cached, fresh: false }));
      },
      () => undefined,
    );
    getCard(id).then(
      (card) => {
        if (cancelled) return;
        setState({ id, card, fresh: true });
        void putCachedCards([card]).catch(() => undefined);
      },
      (e: unknown) => {
        if (cancelled) return;
        const error = e instanceof Error ? e.message : "Request failed";
        // Keep a cached copy on screen if the network fails.
        setState((s) => (s.id === id && s.card ? s : { id, error, fresh: true }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, nonce]);

  const current = state.id === id ? state : undefined;
  const card = current?.card;
  const error = current?.card ? undefined : current?.error;
  const loading = !current || (!current.card && !current.error);
  const retry = useCallback(() => {
    setState({ id: "", fresh: false });
    setNonce((n) => n + 1);
  }, []);

  const goBack = (e: React.MouseEvent) => {
    if (hasInAppHistory()) {
      e.preventDefault();
      router.back();
    }
  };
  const entries = useEntries();
  const [adding, setAdding] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [added, setAdded] = useState(false);
  // "Added!" reveal: one turn of the big card with a sheen and sparkles. Purely visual; it runs
  // after addEntry has resolved and is skipped under reduced motion / Settings > Feel.
  const [revealing, setRevealing] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(revealTimer.current), []);
  const celebrate = () => {
    haptic("success");
    if (!motionOK()) return;
    clearTimeout(revealTimer.current);
    setRevealing(true);
    revealTimer.current = setTimeout(() => setRevealing(false), 1300);
  };
  const [editing, setEditing] = useState<string>();
  const { settings, fmt } = useMoney();

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[320px_minmax(0,1fr)]" aria-busy="true">
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
  const editEntry = owned.find((e) => e.id === editing);
  // The card's own glitter (a card printed only as holo counts as holo), or more if an owned copy is a holo /
  // reverse printing.
  const holoOnly = card.variants.includes("holo") && !card.variants.includes("normal");
  const glitter = strongestGlitter([glitterTier({ ...card, variant: holoOnly ? "holo" : undefined }), ...owned.map((e) => glitterTier({ ...card, variant: e.variant }))]);
  const source = effectiveSource(card.id, settings.priceSource);
  const headline = headlinePrice(card, source);
  const headlineText = headline ? fmt(headline.amount, headline.currency) : null;
  const addedNote = (short?: boolean) =>
    added && (
      <span role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-good">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        {short ? "Added" : "Added to your collection"}
      </span>
    );

  return (
    <div>
      <Link href="/search" onClick={goBack} className="-ml-2 mb-2 inline-flex min-h-11 min-w-11 items-center gap-1 rounded-ui-sm px-2 text-sm font-medium text-muted hover:text-fg">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Back
      </Link>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[320px_minmax(0,1fr)] md:items-start md:gap-8">
        <div className="mx-auto w-full max-w-[264px] md:sticky md:top-8 md:max-w-none">
          <div className="reveal-stage">
            <div className="reveal-card" data-reveal={revealing ? "" : undefined}>
              <button type="button" onClick={() => setZoom(true)} aria-label={`Zoom ${card.name}`} className="reveal-front block w-full cursor-zoom-in rounded-[6%/4.5%]">
                <HoloCard tier={foilTier(card.rarity)} glitter={glitter} maxTilt={10} sweep>
                  <CardImage image={card.image} name={card.name} quality="high" glitter={glitter} className="card-shadow" />
                </HoloCard>
                {revealing && (
                  <span className="holo-fx" aria-hidden="true">
                    <span className="holo-sweep" />
                  </span>
                )}
              </button>
              {revealing && (
                <div className="reveal-back card-shadow" aria-hidden="true">
                  <CardBack />
                </div>
              )}
            </div>
            {revealing && <Sparkles count={14} spread={150} />}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="secondary" size="sm" pill icon={<InspectIcon />} className="elev-0" onClick={() => openCardInspector({ image: card.image, name: card.name, glitter })}>
              Inspect
            </Button>
            <Link href={`/centering?card=${encodeURIComponent(card.id)}`} className={cx(buttonCls({ variant: "secondary", size: "sm", pill: true }), "elev-0")}>
              <CenteringIcon />
              Check centering
            </Link>
          </div>
          <p className="mt-2 text-center text-xs text-muted">Tip: press and hold any card to inspect it.</p>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[28px] font-bold leading-tight tracking-[-0.02em] md:text-4xl">
              <span className="min-w-0 break-words">{card.name}</span>
              {langOf(card.id) === "ja" && <LangBadge className="shadow-none" />}
            </h1>
            <p className="mt-1 text-sm text-muted">
              <Link href={`/binders/set/${encodeURIComponent(card.setId)}`} className="-my-3 inline-flex min-h-11 items-center align-middle font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-accent">
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
              {card.stamped?.map((s) => (
                <Badge key={printingKey(s.variant, s.stamp)}>{printingLabel(s.variant, s.stamp)}</Badge>
              ))}
              {card.hp != null && <Badge>HP {card.hp}</Badge>}
              {card.types?.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
            {card.illustrator && <p className="mt-2 text-[13px] text-muted">Illustrated by {card.illustrator}</p>}
          </div>

          {/* Headline price + (desktop) the one primary action. On phones the action lives in the sticky bar. */}
          <Surface padded="lg" className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-muted">
                <span>
                  {source === "tcgplayer" ? "Market price" : "Trend price"}
                  {headline ? ` · ${headline.label}` : ""}
                </span>
                <Badge>{source === "tcgplayer" ? "TCGPlayer" : "Cardmarket"}</Badge>
              </div>
              <div className="mt-1.5 text-4xl font-bold leading-none tracking-[-0.02em] tabular-nums md:text-5xl">
                {headlineText ?? <span className="text-2xl font-semibold text-muted">No price yet</span>}
              </div>
            </div>
            <div className="hidden flex-col items-end gap-2 md:flex">
              <Button size="lg" icon={<PlusIcon />} onClick={() => setAdding(true)}>
                Add to collection
              </Button>
              {addedNote()}
            </div>
          </Surface>

          {owned.length > 0 && (
            <ListGroup title={`You own ${ownedCount} ${ownedCount === 1 ? "copy" : "copies"}`}>
              {owned.map((e) => (
                <ListRow
                  key={e.id}
                  onClick={() => setEditing(e.id)}
                  ariaLabel={`Edit ${printingLabel(e.variant, e.stamp)}, ${CONDITION_LABELS[e.condition]}, quantity ${e.quantity}`}
                  title={printingLabel(e.variant, e.stamp)}
                  subtitle={CONDITION_LABELS[e.condition]}
                  trailing={<span className="font-semibold">×{e.quantity}</span>}
                  chevron
                />
              ))}
            </ListGroup>
          )}

          <PriceTable card={card} />
          <GradedPrices card={card} />
          <PriceHistoryChart card={card} />
        </div>
      </div>

      {/* Phone: sticky action bar above the tab bar (AppShell's bottom nav is 3.5rem + 1px border + safe area). */}
      <div className="h-20 md:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-20 px-3 pb-2 md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3 rounded-ui-lg bg-surface/85 py-2 pl-4 pr-2 backdrop-blur-xl backdrop-saturate-150 elev-pop">
          <div className="min-w-0 flex-1">
            {added ? (
              addedNote(true)
            ) : (
              <>
                <div className="truncate text-xs text-muted">{headline ? `${source === "tcgplayer" ? "Market" : "Trend"} · ${headline.label}` : "Price"}</div>
                <div className="truncate text-[17px] font-bold leading-tight tabular-nums">{headlineText ?? "—"}</div>
              </>
            )}
          </div>
          <Button icon={<PlusIcon />} onClick={() => setAdding(true)} className="shrink-0">
            Add to collection
          </Button>
        </div>
      </div>

      {adding && (
        <AddToCollectionSheet
          card={card}
          open={adding}
          onClose={() => setAdding(false)}
          onAdded={() => {
            celebrate();
            setAdded(true);
            setTimeout(() => setAdded(false), 4000);
          }}
        />
      )}
      {editEntry && <EntryEditor key={editEntry.id} entry={editEntry} onClose={() => setEditing(undefined)} />}
      <Sheet open={zoom} onClose={() => setZoom(false)} title={card.name}>
        <CardImage image={card.image} name={card.name} quality="high" glitter={glitter} className="mx-auto max-w-sm" />
      </Sheet>
    </div>
  );
}

/** The main printing's price on the active source: the first regular variant with a price. */
function headlinePrice(card: CardDetail, source: ReturnType<typeof effectiveSource>) {
  const regular: Variant[] = card.variants.length ? card.variants : ["normal"];
  const tpVariants = Object.keys(card.prices.tcgplayer?.variants ?? {}) as Variant[];
  for (const v of [...regular, ...tpVariants.filter((v) => !regular.includes(v))]) {
    const p = unitPrice(card, v, source);
    if (p) return { ...p, label: printingLabel(v) };
  }
  for (const s of card.stamped ?? []) {
    const p = unitPrice(card, s.variant, source, s.stamp);
    if (p) return { ...p, label: printingLabel(s.variant, s.stamp) };
  }
  return null;
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function InspectIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4" />
    </svg>
  );
}

function CenteringIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="-ml-0.5 shrink-0">
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <rect x="8" y="7" width="8" height="10" rx="0.5" />
    </svg>
  );
}

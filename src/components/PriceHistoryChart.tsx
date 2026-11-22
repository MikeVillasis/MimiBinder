"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getPriceHistory } from "@/lib/api-client";
import { useEntries } from "@/lib/db";
import { useAuth } from "@/lib/sync";
import { printingKey, printingLabel } from "@/lib/stamps";
import type { CardDetail, PriceSnapshot, Variant } from "@/lib/types";
import { effectiveSource } from "@/lib/pricing";
import { useAsync, useMoney } from "./hooks";
import { SectionHeader, Segmented, Skeleton, Surface } from "./ui";

function TrendFallback({ card, variant, stamp }: { card: CardDetail; variant: Variant; stamp?: string }) {
  const { fmt } = useMoney();
  const cm = card.prices.cardmarket;
  const stampedCm = stamp ? card.stamped?.find((s) => s.variant === variant && s.stamp === stamp)?.cardmarket : undefined;
  if (stamp && !stampedCm) return null;
  if (!cm && !stampedCm) return null;
  // Same block selection as unitPrice() for cardmarket.
  const wantsHolo = variant === "reverse" || (variant === "holo" && card.variants.includes("normal"));
  const holoOk = !!cm?.holo && (cm.holo.trend != null || cm.holo.avg != null);
  const b = stampedCm ?? (wantsHolo && holoOk ? cm!.holo! : cm!.normal);
  if (!b) return null;
  const steps = [
    { label: "30d avg", v: b.avg30 },
    { label: "7d avg", v: b.avg7 },
    { label: "Trend", v: b.trend },
  ].filter((s): s is { label: string; v: number } => s.v != null);
  if (steps.length === 0) return null;
  const pct = b.avg30 != null && b.avg30 > 0 && b.trend != null ? ((b.trend - b.avg30) / b.avg30) * 100 : null;
  return (
    <div className="mt-3 rounded-ui-md bg-surface-2 px-4 py-3">
      <p className="mb-1 text-[13px] font-medium text-muted">Cardmarket trend</p>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm tabular-nums">
        {steps.map((s, i) => (
          <span key={s.label} className="inline-flex items-baseline gap-2">
            {i > 0 && <span aria-hidden="true" className="text-muted">→</span>}
            <span>
              <span className="text-xs text-muted">{s.label} </span>
              <span className="font-semibold">{fmt(s.v, "EUR")}</span>
            </span>
          </span>
        ))}
        {pct != null && (
          <span className={`text-xs font-semibold ${pct >= 0 ? "text-good" : "text-danger"}`}>
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(1)}%
          </span>
        )}
      </p>
    </div>
  );
}

export function PriceHistoryChart({ card }: { card: CardDetail }) {
  const cardId = card.id;
  const variants = card.variants;
  const { user } = useAuth();
  const entries = useEntries();
  const ownsCard = (entries ?? []).some((e) => e.cardId === cardId);
  const { data, loading, error } = useAsync<PriceSnapshot[]>(() => getPriceHistory(cardId), cardId);
  const { settings, to, fmt } = useMoney();
  const source = effectiveSource(cardId, settings.priceSource);
  const [picked, setPicked] = useState<string>();

  // Every printing of the card (regular, then stamped); the selector offers the ones with history, or all
  // when a stamped printing exists so an empty stamped printing can explain itself.
  const printings = useMemo(
    () => [
      ...variants.map((v) => ({ key: printingKey(v), variant: v, stamp: "", label: printingLabel(v) })),
      ...(card.stamped ?? []).map((s) => ({ key: printingKey(s.variant, s.stamp), variant: s.variant, stamp: s.stamp, label: printingLabel(s.variant, s.stamp) })),
    ],
    [variants, card.stamped],
  );
  const present = useMemo(() => {
    const have = new Set((data ?? []).map((s) => printingKey(s.variant, s.stamp || undefined)));
    return printings.filter((p) => have.has(p.key) || (p.stamp !== "" && have.size > 0));
  }, [data, printings]);
  const current = present.find((p) => p.key === picked) ?? present[0];
  const variant = current?.variant;
  const stamp = current?.stamp ?? "";

  const points = useMemo(() => {
    if (!data || !variant) return [];
    return data
      .filter((s) => s.variant === variant && (s.stamp ?? "") === stamp)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => {
        const raw = source === "tcgplayer" ? s.tcgplayerMarketUsd : s.cardmarketTrendEur;
        const cur = source === "tcgplayer" ? "USD" : "EUR";
        return { date: s.date, value: raw == null ? null : to(raw, cur) };
      });
  }, [data, variant, stamp, source, to]);

  return (
    <Surface as="section" padded aria-labelledby="hist-h">
      <SectionHeader id="hist-h" title="Price history" subtitle={source === "tcgplayer" ? "TCGPlayer market" : "Cardmarket trend"} className="mb-2" />
      {present.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-3 overflow-x-auto px-4">
          <Segmented
            size="sm"
            label="History variant"
            value={current!.key}
            onChange={setPicked}
            options={present.map((p) => ({ value: p.key, label: p.label }))}
          />
        </div>
      )}
      {loading ? (
        <Skeleton className="h-52 w-full rounded-ui-md" />
      ) : error || points.length < 1 ? (
        <>
          <div className="flex flex-col items-center gap-2 rounded-ui-md bg-surface-2/70 px-4 py-7 text-center text-sm text-muted">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="opacity-70">
              <path d="M4 19h16M5 15l4-4 3 3 6-7" />
            </svg>
            <p className="max-w-sm">
            {error
              ? "Price history is unavailable right now."
              : stamp
                ? `No price history for the ${printingLabel(variant!, stamp)} printing yet. It starts once this printing has been in a daily snapshot.`
              : user && ownsCard
                ? "History starts with the next daily snapshot (around 10:00 UTC)."
                : "Daily price history is recorded for cards in the site owner's synced collection."}
            </p>
          </div>
          <TrendFallback card={card} variant={variant ?? variants[0] ?? "normal"} stamp={stamp} />
        </>
      ) : (
        <div className="h-52 w-full md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--color-line)" strokeOpacity={0.5} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--color-muted)", fontSize: 12 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} axisLine={false} tickLine={false} />
              <YAxis
                width={56}
                tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => fmt(v, settings.currency)}
              />
              <Tooltip
                contentStyle={{ background: "var(--color-surface-3)", border: "none", borderRadius: 14, color: "var(--color-fg)", boxShadow: "var(--shadow-pop)", fontSize: 13 }}
                cursor={{ stroke: "var(--color-muted)", strokeOpacity: 0.4 }}
                formatter={(v) => [fmt(Number(v), settings.currency), "Price"]}
              />
              <Line type="monotone" dataKey="value" stroke="var(--color-accent)" strokeWidth={2.5} dot={points.length < 30 ? { r: points.length < 3 ? 4 : 3 } : false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {!loading && !error && points.length >= 1 && points.length < 3 && (
        <p className="mt-2 text-[13px] text-muted">More points appear daily.</p>
      )}
      {!loading && !error && points.length >= 1 && points.length < 3 && (
        <TrendFallback card={card} variant={variant ?? variants[0] ?? "normal"} stamp={stamp} />
      )}
      <p className="mt-3 text-xs text-muted">
        {source === "tcgplayer" ? "TCGPlayer market (USD)" : "Cardmarket trend (EUR)"} converted at today&apos;s rate.
      </p>
    </Surface>
  );
}

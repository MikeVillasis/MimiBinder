"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getPriceHistory } from "@/lib/api-client";
import { useEntries } from "@/lib/db";
import { useAuth } from "@/lib/sync";
import { VARIANT_LABELS, type CardDetail, type PriceSnapshot, type Variant } from "@/lib/types";
import { effectiveSource } from "@/lib/pricing";
import { useAsync, useMoney } from "./hooks";
import { Segmented, Skeleton } from "./ui";

function TrendFallback({ card, variant }: { card: CardDetail; variant: Variant }) {
  const { fmt } = useMoney();
  const cm = card.prices.cardmarket;
  if (!cm) return null;
  // Same block selection as unitPrice() for cardmarket.
  const wantsHolo = variant === "reverse" || (variant === "holo" && card.variants.includes("normal"));
  const holoOk = !!cm.holo && (cm.holo.trend != null || cm.holo.avg != null);
  const b = wantsHolo && holoOk ? cm.holo! : cm.normal;
  if (!b) return null;
  const steps = [
    { label: "30d avg", v: b.avg30 },
    { label: "7d avg", v: b.avg7 },
    { label: "Trend", v: b.trend },
  ].filter((s): s is { label: string; v: number } => s.v != null);
  if (steps.length === 0) return null;
  const pct = b.avg30 != null && b.avg30 > 0 && b.trend != null ? ((b.trend - b.avg30) / b.avg30) * 100 : null;
  return (
    <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="mb-1 text-xs font-semibold text-muted">Cardmarket trend</p>
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
  const [picked, setPicked] = useState<Variant>();

  const present = useMemo(() => {
    const set = new Set((data ?? []).map((s) => s.variant));
    return variants.filter((v) => set.has(v));
  }, [data, variants]);
  const variant = picked && present.includes(picked) ? picked : present[0];

  const points = useMemo(() => {
    if (!data || !variant) return [];
    return data
      .filter((s) => s.variant === variant)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => {
        const raw = source === "tcgplayer" ? s.tcgplayerMarketUsd : s.cardmarketTrendEur;
        const cur = source === "tcgplayer" ? "USD" : "EUR";
        return { date: s.date, value: raw == null ? null : to(raw, cur) };
      });
  }, [data, variant, source, to]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-labelledby="hist-h">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="hist-h" className="text-base font-bold">
          Price history
        </h2>
        {present.length > 1 && (
          <Segmented
            label="History variant"
            value={variant!}
            onChange={setPicked}
            options={present.map((v) => ({ value: v, label: VARIANT_LABELS[v] }))}
          />
        )}
      </div>
      {loading ? (
        <Skeleton className="h-52 w-full" />
      ) : error || points.length < 1 ? (
        <>
          <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            {error
              ? "Price history is unavailable right now."
              : user && ownsCard
                ? "History starts with the next daily snapshot (around 10:00 UTC)."
                : "Daily price history is recorded for cards in the site owner's synced collection."}
          </div>
          <TrendFallback card={card} variant={variant ?? variants[0] ?? "normal"} />
        </>
      ) : (
        <div className="h-52 w-full md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--color-muted)", fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} stroke="var(--color-line)" />
              <YAxis
                width={52}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => fmt(v, settings.currency)}
                stroke="var(--color-line)"
              />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, color: "var(--color-fg)" }}
                formatter={(v) => [fmt(Number(v), settings.currency), "Price"]}
              />
              <Line type="monotone" dataKey="value" stroke="var(--color-accent)" strokeWidth={2.5} dot={points.length < 30 ? { r: points.length < 3 ? 4 : 3 } : false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {!loading && !error && points.length >= 1 && points.length < 3 && (
        <p className="mt-2 text-xs text-muted">More points appear daily.</p>
      )}
      {!loading && !error && points.length >= 1 && points.length < 3 && (
        <TrendFallback card={card} variant={variant ?? variants[0] ?? "normal"} />
      )}
      <p className="mt-2 text-xs text-muted">
        {source === "tcgplayer" ? "TCGPlayer market (USD)" : "Cardmarket trend (EUR)"} converted at today&apos;s rate.
      </p>
    </section>
  );
}

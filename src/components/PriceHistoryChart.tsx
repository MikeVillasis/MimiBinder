"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getPriceHistory } from "@/lib/api-client";
import { VARIANT_LABELS, type PriceSnapshot, type Variant } from "@/lib/types";
import { useAsync, useMoney } from "./hooks";
import { Segmented, Skeleton } from "./ui";

export function PriceHistoryChart({ cardId, variants }: { cardId: string; variants: Variant[] }) {
  const { data, loading, error } = useAsync<PriceSnapshot[]>(() => getPriceHistory(cardId), cardId);
  const { settings, to, fmt } = useMoney();
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
        const raw = settings.priceSource === "tcgplayer" ? s.tcgplayerMarketUsd : s.cardmarketTrendEur;
        const cur = settings.priceSource === "tcgplayer" ? "USD" : "EUR";
        return { date: s.date, value: raw == null ? null : to(raw, cur) };
      });
  }, [data, variant, settings.priceSource, to]);

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
      ) : error || points.length < 2 ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          {error
            ? "Price history is unavailable right now."
            : points.length === 1
              ? "Only one snapshot so far. The chart appears after the next daily snapshot."
              : "History starts collecting after your first daily snapshot. Cards in your collection are snapshotted once a day."}
        </div>
      ) : (
        <div className="h-52 w-full md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#262d44" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#8f98b3", fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} stroke="#262d44" />
              <YAxis
                width={52}
                tick={{ fill: "#8f98b3", fontSize: 11 }}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => fmt(v, settings.currency)}
                stroke="#262d44"
              />
              <Tooltip
                contentStyle={{ background: "#131724", border: "1px solid #262d44", borderRadius: 12, color: "#eef0f7" }}
                formatter={(v) => [fmt(Number(v), settings.currency), "Price"]}
              />
              <Line type="monotone" dataKey="value" stroke="#ffcb05" strokeWidth={2.5} dot={points.length < 30} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        {settings.priceSource === "tcgplayer" ? "TCGPlayer market (USD)" : "Cardmarket trend (EUR)"} converted at today&apos;s rate.
      </p>
    </section>
  );
}

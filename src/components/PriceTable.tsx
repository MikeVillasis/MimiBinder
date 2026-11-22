"use client";

import { VARIANT_LABELS, type CardDetail, type CardmarketPrice, type TcgplayerPrice, type Variant } from "@/lib/types";
import { printingKey, printingLabel } from "@/lib/stamps";
import { langOf } from "@/lib/lang";
import { effectiveSource } from "@/lib/pricing";
import { useMoney } from "./hooks";

function Cell({ v, cur }: { v: number | null | undefined; cur: "USD" | "EUR" }) {
  const { fmt } = useMoney();
  return <td className="px-2 py-2.5 text-right tabular-nums">{v == null ? <span className="text-muted">—</span> : fmt(v, cur)}</td>;
}

export function PriceTable({ card }: { card: CardDetail }) {
  const { settings } = useMoney();
  const tp = card.prices.tcgplayer;
  const cm = card.prices.cardmarket;
  const stamped = card.stamped ?? [];
  const tpRows: [string, string, TcgplayerPrice][] = [
    ...(tp ? (Object.entries(tp.variants) as [Variant, TcgplayerPrice][]).map(([v, p]) => [v, VARIANT_LABELS[v], p] as [string, string, TcgplayerPrice]) : []),
    ...stamped.flatMap((s) => (s.tcgplayer ? [[printingKey(s.variant, s.stamp), printingLabel(s.variant, s.stamp), s.tcgplayer] as [string, string, TcgplayerPrice]] : [])),
  ];
  const cmRows: { label: string; p: CardmarketPrice }[] = cm
    ? [
        { label: card.variants.length === 1 ? VARIANT_LABELS[card.variants[0]] : "Non-holo", p: cm.normal },
        ...(cm.holo ? [{ label: "Holo / Reverse", p: cm.holo }] : []),
      ]
    : [];
  for (const s of stamped) if (s.cardmarket) cmRows.push({ label: printingLabel(s.variant, s.stamp), p: s.cardmarket });
  const hasTp = tpRows.length > 0;
  const hasCm = cmRows.length > 0;
  const isJa = langOf(card.id) === "ja";
  const active = effectiveSource(card.id, settings.priceSource);
  const jaNote = isJa && (
    <p className="text-xs text-muted">Japanese cards are priced from Cardmarket (EUR → {settings.currency}).</p>
  );

  if (!hasTp && !hasCm) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-1 text-base font-bold">Prices</h2>
        <p className="text-sm text-muted">No price data is available for this card.</p>
        {jaNote && <div className="mt-1">{jaNote}</div>}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4" aria-labelledby="prices-h">
      <h2 id="prices-h" className="text-base font-bold">
        Prices <span className="text-xs font-normal text-muted">in {settings.currency}</span>
      </h2>
      {jaNote}
      {hasTp && (
        <div className={active === "tcgplayer" ? "" : "opacity-80"}>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span className="font-semibold text-fg">TCGPlayer {active === "tcgplayer" && <span className="text-accent">· selected</span>}</span>
            <span>source: USD{tp ? ` · updated ${tp.updated.slice(0, 10)}` : ""}</span>
          </div>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[300px] text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Variant</th>
                  <th className="px-2 py-1 text-right font-medium">Low</th>
                  <th className="px-2 py-1 text-right font-medium">Mid</th>
                  <th className="px-2 py-1 text-right font-medium">Market</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tpRows.map(([k, label, p]) => (
                  <tr key={k}>
                    <th scope="row" className="px-2 py-2.5 text-left font-medium">
                      {label}
                    </th>
                    <Cell v={p.low} cur="USD" />
                    <Cell v={p.mid} cur="USD" />
                    <Cell v={p.market} cur="USD" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {hasCm && (
        <div className={active === "cardmarket" ? "" : "opacity-80"}>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span className="font-semibold text-fg">Cardmarket {active === "cardmarket" && <span className="text-accent">· selected</span>}</span>
            <span>source: EUR{cm ? ` · updated ${cm.updated.slice(0, 10)}` : ""}</span>
          </div>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[300px] text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Printing</th>
                  <th className="px-2 py-1 text-right font-medium">Trend</th>
                  <th className="px-2 py-1 text-right font-medium">7d avg</th>
                  <th className="px-2 py-1 text-right font-medium">30d avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cmRows.map(({ label, p }) => (
                  <tr key={label}>
                    <th scope="row" className="px-2 py-2.5 text-left font-medium">
                      {label}
                    </th>
                    <Cell v={p.trend} cur="EUR" />
                    <Cell v={p.avg7} cur="EUR" />
                    <Cell v={p.avg30} cur="EUR" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

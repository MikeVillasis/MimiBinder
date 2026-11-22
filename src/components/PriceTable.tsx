"use client";

import { VARIANT_LABELS, type CardDetail, type CardmarketPrice, type TcgplayerPrice, type Variant } from "@/lib/types";
import { printingKey, printingLabel } from "@/lib/stamps";
import { langOf } from "@/lib/lang";
import { effectiveSource } from "@/lib/pricing";
import { useMoney } from "./hooks";
import { Badge, SectionHeader, Surface, cx } from "./ui";

function Cell({ v, cur, strong }: { v: number | null | undefined; cur: "USD" | "EUR"; strong?: boolean }) {
  const { fmt } = useMoney();
  return (
    <td className={cx("py-3 pl-3 text-right tabular-nums", strong ? "font-semibold text-fg" : "text-fg/85")}>
      {v == null ? <span className="text-muted/70">—</span> : fmt(v, cur)}
    </td>
  );
}

/** One source's block: name + "Selected" badge, source currency/date, and a light-ruled table. */
function SourceBlock({
  name,
  selected,
  meta,
  cols,
  rows,
}: {
  name: string;
  selected: boolean;
  meta: string;
  cols: [string, string, string, string];
  rows: { key: string; label: string; cells: [number | null | undefined, number | null | undefined, number | null | undefined]; cur: "USD" | "EUR" }[];
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold">{name}</h3>
          {selected && <Badge tone="accent">Selected</Badge>}
        </div>
        <span className="text-xs text-muted">{meta}</span>
      </div>
      <div className="-mx-1 mt-1 overflow-x-auto px-1">
        <table className="w-full min-w-[300px] text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="py-2 pr-3 text-left font-medium">
                {cols[0]}
              </th>
              {cols.slice(1).map((c) => (
                <th key={c} scope="col" className="py-2 pl-3 text-right font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line/50">
                <th scope="row" className="py-3 pr-3 text-left font-medium">
                  {r.label}
                </th>
                <Cell v={r.cells[0]} cur={r.cur} />
                <Cell v={r.cells[1]} cur={r.cur} />
                <Cell v={r.cells[2]} cur={r.cur} strong={selected} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
    <p className="rounded-ui-sm bg-surface-2 px-3 py-2 text-[13px] text-muted">Japanese cards are priced from Cardmarket (EUR → {settings.currency}).</p>
  );

  if (!hasTp && !hasCm) {
    return (
      <Surface as="section" padded aria-labelledby="prices-h">
        <SectionHeader id="prices-h" title="Prices" className="mb-1" />
        <p className="text-sm text-muted">No price data is available for this card.</p>
        {jaNote && <div className="mt-3">{jaNote}</div>}
      </Surface>
    );
  }

  const blocks = [
    hasTp && (
      <SourceBlock
        key="tp"
        name="TCGPlayer"
        selected={active === "tcgplayer"}
        meta={`USD${tp ? ` · updated ${tp.updated.slice(0, 10)}` : ""}`}
        cols={["Variant", "Low", "Mid", "Market"]}
        rows={tpRows.map(([k, label, p]) => ({ key: k, label, cells: [p.low, p.mid, p.market], cur: "USD" as const }))}
      />
    ),
    hasCm && (
      <SourceBlock
        key="cm"
        name="Cardmarket"
        selected={active === "cardmarket"}
        meta={`EUR${cm ? ` · updated ${cm.updated.slice(0, 10)}` : ""}`}
        cols={["Printing", "7d avg", "30d avg", "Trend"]}
        rows={cmRows.map(({ label, p }) => ({ key: label, label, cells: [p.avg7, p.avg30, p.trend], cur: "EUR" as const }))}
      />
    ),
  ].filter(Boolean);
  // The selected source first.
  if (active === "cardmarket") blocks.reverse();

  return (
    <Surface as="section" padded aria-labelledby="prices-h">
      <SectionHeader id="prices-h" title="Prices" subtitle={`Converted to ${settings.currency}`} className="mb-2" />
      {jaNote && <div className="mb-3">{jaNote}</div>}
      <div className="flex flex-col gap-5">{blocks}</div>
    </Surface>
  );
}

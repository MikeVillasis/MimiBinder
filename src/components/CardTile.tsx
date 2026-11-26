"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CardImage } from "./CardImage";
import { langOf } from "@/lib/lang";
import { HoloCard, NewBadge } from "./fun";
import { cardHref } from "./hooks";
import { LangBadge, cx } from "./ui";

/**
 * A card in a grid: art (hover lift, press scale), then a quiet meta block: name, muted "#number".
 * - `badge`: top-right over the art (e.g. a QtyBadge).
 * - `price`: a small chip over the bottom-left of the art.
 * - `meta`: appended to the "#number" line ("#199 · Holo · NM").
 * - `action`: a small control (e.g. an edit icon button) to the right of the meta block.
 * - `footer`: anything else under the meta.
 * - `index`: position in its grid; the first tiles are "dealt in" with a short stagger.
 * - `isNew`: shows a "New" badge (added in the last few days).
 */
export function CardTile({
  id,
  name,
  localId,
  image,
  dim,
  badge,
  price,
  meta,
  action,
  footer,
  index,
  isNew,
}: {
  id: string;
  name: string;
  localId?: string;
  image?: string;
  dim?: boolean;
  badge?: ReactNode;
  price?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  index?: number;
  isNew?: boolean;
}) {
  const sub = [localId ? `#${localId}` : null, meta].filter(Boolean);
  return (
    <div className={cx("group min-w-0", index != null && "deal")} style={index != null ? ({ "--deal-i": index } as CSSProperties) : undefined}>
      <Link
        href={cardHref(id)}
        className="ui-motion ui-press ui-lift relative block rounded-[6%/4.5%] focus-visible:outline-offset-4"
        aria-label={`${name}${localId ? ` #${localId}` : ""}${isNew ? ", new" : ""}`}
      >
        <HoloCard>
          <CardImage image={image} name={name} dim={dim} className="card-shadow" />
          {badge && <span className="absolute right-1.5 top-1.5 z-[1]">{badge}</span>}
          {(isNew || langOf(id) === "ja") && (
            <span className="absolute left-1.5 top-1.5 z-[1] flex items-center gap-1">
              {langOf(id) === "ja" && <LangBadge />}
              {isNew && <NewBadge />}
            </span>
          )}
          {price && <span className="absolute bottom-1.5 left-1.5 z-[1] max-w-[calc(100%-0.75rem)]">{price}</span>}
        </HoloCard>
      </Link>
      <div className={cx("mt-2 flex min-w-0 items-start gap-1", action ? "pl-0.5" : "px-0.5")}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-snug">{name}</div>
          {sub.length > 0 && (
            <div className="truncate text-xs text-muted">
              {sub.map((s, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {s}
                </span>
              ))}
            </div>
          )}
          {footer}
        </div>
        {action && <div className="-mr-1.5 -mt-2 shrink-0">{action}</div>}
      </div>
    </div>
  );
}

/** Quiet quantity marker over card art. */
export function QtyBadge({ n }: { n: number }) {
  return (
    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-3/90 px-1.5 text-xs font-bold tabular-nums text-fg backdrop-blur elev-1">
      ×{n}
    </span>
  );
}

/** Small price chip over card art (pairs with CardTile's `price`). */
export function PriceChip({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <span
      title={label}
      className="inline-flex max-w-full items-center truncate rounded-full bg-surface-3/90 px-2 py-0.5 text-xs font-semibold tabular-nums text-fg backdrop-blur elev-1"
    >
      {children}
    </span>
  );
}

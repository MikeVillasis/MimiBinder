"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CardImage } from "./CardImage";
import { langOf } from "@/lib/lang";
import { cardHref } from "./hooks";
import { LangBadge } from "./ui";

export function CardTile({
  id,
  name,
  localId,
  image,
  dim,
  badge,
  footer,
}: {
  id: string;
  name: string;
  localId?: string;
  image?: string;
  dim?: boolean;
  badge?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="group min-w-0">
      <Link href={cardHref(id)} className="relative block rounded-xl transition-transform active:scale-[0.98] md:hover:-translate-y-1" aria-label={`${name}${localId ? ` #${localId}` : ""}`}>
        <CardImage image={image} name={name} dim={dim} className="card-shadow" />
        {badge && <span className="absolute right-1.5 top-1.5">{badge}</span>}
        {langOf(id) === "ja" && <LangBadge className="absolute left-1.5 top-1.5" />}
      </Link>
      <div className="mt-1.5 min-w-0 px-0.5">
        <div className="truncate text-xs font-semibold">{name}</div>
        {localId && <div className="text-xs text-muted">#{localId}</div>}
        {footer}
      </div>
    </div>
  );
}

export function QtyBadge({ n }: { n: number }) {
  return (
    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-extrabold text-accent-fg shadow">
      ×{n}
    </span>
  );
}

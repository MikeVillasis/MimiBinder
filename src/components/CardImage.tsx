"use client";

import { useState } from "react";
import { cardImage } from "@/lib/pricing";

export function CardImage({
  image,
  name,
  quality = "low",
  className = "",
  dim = false,
}: {
  image?: string;
  name: string;
  quality?: "low" | "high";
  className?: string;
  dim?: boolean;
}) {
  const src = cardImage(image, quality);
  const [failedSrc, setFailedSrc] = useState<string>();
  const failed = !src || failedSrc === src;
  return (
    <div className={`relative aspect-[63/88] w-full overflow-hidden rounded-[6%/4.5%] bg-surface-2 ${className}`}>
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-line p-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="" aria-hidden="true" className="h-8 w-8 rounded-lg opacity-40" />
          <span className="line-clamp-3 text-[11px] text-muted">{name}</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          width={630}
          height={880}
          onError={() => setFailedSrc(src)}
          className={`h-full w-full object-cover ${dim ? "opacity-40 grayscale" : ""}`}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
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
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const imgRef = useRef<HTMLImageElement>(null);
  const loaded = loadedSrc === src;

  // Images served from cache can finish before React attaches onLoad.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoadedSrc(src);
  }, [src]);

  return (
    <div className={`relative aspect-[63/88] w-full overflow-hidden rounded-[6%/4.5%] bg-surface-2 ${className}`}>
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-line p-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="" aria-hidden="true" className="h-8 w-8 rounded-lg opacity-40" />
          <span className="line-clamp-3 text-[11px] text-muted">{name}</span>
        </div>
      ) : (
        <>
          {!loaded && <div className="skeleton absolute inset-0 rounded-none" aria-hidden="true" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
          ref={imgRef}
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          width={630}
          height={880}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? (dim ? "opacity-40 grayscale" : "opacity-100") : "opacity-0"}`}
          />
        </>
      )}
    </div>
  );
}

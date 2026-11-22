"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cardImage } from "@/lib/pricing";
import { haptic } from "@/lib/prefs";
import { openCardInspector } from "./CardInspector";

const HOLD_MS = 450;
const HOLD_SLOP_PX = 10;

/**
 * Press-and-hold (touch or mouse) opens the card inspector. A short tap is untouched; moving more than
 * a few px (e.g. to scroll) cancels the hold. After a hold fires, the click that follows is swallowed so
 * a surrounding <Link> or button does not activate.
 */
function useHoldToInspect(enabled: boolean, image: string | undefined, name: string) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number; id: number; type: string; t: number } | null>(null);
  const fired = useRef(false);
  // The element being held: it carries data-holding, which draws the "charging" ring (globals.css).
  const held = useRef<HTMLElement | null>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const ring = (el: HTMLElement | null) => {
    held.current?.removeAttribute("data-holding");
    held.current = el;
    el?.setAttribute("data-holding", "");
  };

  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    start.current = null;
    ring(null);
  };

  const fire = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    fired.current = true;
    ring(null);
    haptic("tick");
    openCardInspector({ image, name });
  };

  if (!enabled) return undefined;

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      fired.current = false; // a click never followed the last hold (e.g. Android long-press)
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      cancel();
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType, t: performance.now() };
      timer.current = setTimeout(fire, HOLD_MS);
      ring(e.currentTarget);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId || !timer.current) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > HOLD_SLOP_PX) cancel();
    },
    onPointerUp: () => {
      // On a busy main thread the hold timer can run late, after the finger lifts: judge by elapsed time.
      const s = start.current;
      if (s && timer.current && performance.now() - s.t >= HOLD_MS) fire();
      cancel();
    },
    onPointerCancel: cancel,
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      // Native long-press menu on touch; a desktop right-click keeps working.
      if (start.current && start.current.type !== "mouse") e.preventDefault();
    },
    onDragStart: (e: React.DragEvent<HTMLElement>) => {
      if (timer.current) cancel();
      if (fired.current) e.preventDefault();
    },
  };
}

export function CardImage({
  image,
  name,
  quality = "low",
  className = "",
  dim = false,
  inspectable = true,
}: {
  image?: string;
  name: string;
  quality?: "low" | "high";
  className?: string;
  dim?: boolean;
  /** Press and hold opens the full-screen inspector. */
  inspectable?: boolean;
}) {
  const src = cardImage(image, quality);
  const [failedSrc, setFailedSrc] = useState<string>();
  const failed = !src || failedSrc === src;
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const imgRef = useRef<HTMLImageElement>(null);
  const loaded = loadedSrc === src;
  const hold = useHoldToInspect(inspectable && !failed, image, name);

  // Images served from cache can finish before React attaches onLoad.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoadedSrc(src);
  }, [src]);

  return (
    <div
      className={`relative aspect-[63/88] w-full overflow-hidden rounded-[6%/4.5%] bg-surface-2 ${hold ? "select-none [-webkit-touch-callout:none]" : ""} ${className}`}
      {...hold}
    >
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-line p-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="" aria-hidden="true" className="h-8 w-8 rounded-lg opacity-40" />
          <span className="line-clamp-3 text-xs text-muted">{name}</span>
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
          className={`h-full w-full object-cover transition-opacity duration-300 ${hold ? "select-none [-webkit-touch-callout:none]" : ""} ${loaded ? (dim ? "opacity-40 grayscale" : "opacity-100") : "opacity-0"}`}
          />
        </>
      )}
    </div>
  );
}

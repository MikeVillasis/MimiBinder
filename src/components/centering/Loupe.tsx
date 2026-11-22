"use client";

import { useEffect, useRef } from "react";

export interface LoupeState {
  /** Point being inspected, in source pixels. */
  x: number;
  y: number;
  /** Finger position relative to the loupe's positioned parent, in CSS px. */
  ax: number;
  ay: number;
  /** Size of that parent. */
  bw: number;
  bh: number;
}

const SIZE = 120;

/** Zoomed inset shown while dragging, so the point under a finger stays visible. */
export function Loupe({
  source,
  state,
  windowPx,
  rotation = 0,
}: {
  source: CanvasImageSource | null;
  state: LoupeState | null;
  windowPx: number;
  /** Clockwise degrees the photo is turned on screen; the zoomed view turns with it. */
  rotation?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c || !state || !source) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(SIZE * dpr);
    if (c.width !== px) {
      c.width = px;
      c.height = px;
    }
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, px, px);
    ctx.imageSmoothingEnabled = true;
    const half = windowPx / 2;
    // drawImage clips source rects that run off the image, but then stretches the rest: clamp ourselves.
    const sw = source instanceof ImageBitmap ? source.width : (source as HTMLCanvasElement).width;
    const sh = source instanceof ImageBitmap ? source.height : (source as HTMLCanvasElement).height;
    const sx0 = state.x - half;
    const sy0 = state.y - half;
    const cx0 = Math.max(0, sx0);
    const cy0 = Math.max(0, sy0);
    const cx1 = Math.min(sw, sx0 + windowPx);
    const cy1 = Math.min(sh, sy0 + windowPx);
    if (cx1 > cx0 && cy1 > cy0) {
      const k = px / windowPx;
      // Rotate about the inspected point, which sits at the loupe's centre.
      ctx.save();
      ctx.translate(px / 2, px / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(k, k);
      ctx.drawImage(source, cx0, cy0, cx1 - cx0, cy1 - cy0, cx0 - state.x, cy0 - state.y, cx1 - cx0, cy1 - cy0);
      ctx.restore();
    }
  }, [source, state, windowPx, rotation]);

  if (!state) return null;
  const left = Math.max(0, Math.min(state.bw - SIZE, state.ax - SIZE / 2));
  let top = state.ay - SIZE - 64;
  if (top < 0) top = Math.min(state.bh - SIZE, state.ay + 64);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-20 overflow-hidden rounded-full border-2 border-accent shadow-xl"
      style={{ left, top, width: SIZE, height: SIZE }}
    >
      <canvas ref={ref} style={{ width: SIZE, height: SIZE }} />
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white mix-blend-difference" />
      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white mix-blend-difference" />
    </div>
  );
}

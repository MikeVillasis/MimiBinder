"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Point, Quad } from "@/lib/centering";
import { Loupe, type LoupeState } from "./Loupe";

const NAMES = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Photo with the card quad and four draggable corner handles. Coordinates are in photo pixels. */
export function CornerEditor({
  bitmap,
  width,
  height,
  quad,
  onChange,
}: {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  quad: Quad;
  onChange: (q: Quad) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loupe, setLoupe] = useState<LoupeState | null>(null);
  const drag = useRef<{ idx: number; dx: number; dy: number } | null>(null);

  // Draw the photo once per bitmap, at most 1600 px wide (the full-res pixels stay in the bitmap / worker).
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const k = Math.min(1, 1600 / Math.max(width, height));
    c.width = Math.round(width * k);
    c.height = Math.round(height * k);
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  }, [bitmap, width, height]);

  const toImage = (e: { clientX: number; clientY: number }): Point => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
  };

  const setCorner = (i: number, p: Point) => {
    const next = quad.map((q, j) => (j === i ? { x: clamp(p.x, 0, width), y: clamp(p.y, 0, height) } : q)) as Quad;
    onChange(next);
    return next[i];
  };

  const showLoupe = (e: { clientX: number; clientY: number }, p: Point) => {
    const r = parentRef.current!.getBoundingClientRect();
    setLoupe({ x: p.x, y: p.y, ax: e.clientX - r.left, ay: e.clientY - r.top, bw: r.width, bh: r.height });
  };

  const idxOf = (e: { currentTarget: HTMLElement }) => Number(e.currentTarget.dataset.i);
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    const i = idxOf(e);
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e);
    drag.current = { idx: i, dx: quad[i].x - p.x, dy: quad[i].y - p.y };
    showLoupe(e, quad[i]);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const i = idxOf(e);
    const d = drag.current;
    if (!d || d.idx !== i) return;
    const p = toImage(e);
    const placed = setCorner(i, { x: p.x + d.dx, y: p.y + d.dy });
    showLoupe(e, placed);
  };
  const up = () => {
    drag.current = null;
    setLoupe(null);
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = idxOf(e);
    const step = e.shiftKey ? 10 : 1;
    const v: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = v[e.key];
    if (!d) return;
    e.preventDefault();
    setCorner(i, { x: quad[i].x + d[0], y: quad[i].y + d[1] });
  };

  const pct = (p: Point) => ({ left: `${(p.x / width) * 100}%`, top: `${(p.y / height) * 100}%` });
  const mid = { x: (quad[0].x + quad[1].x) / 2, y: (quad[0].y + quad[1].y) / 2 };

  return (
    <div ref={parentRef} className="relative">
      <div className="mx-auto" style={{ width: `min(100%, calc(68dvh * ${width / height}))` }}>
        <div ref={wrapRef} className="relative select-none overflow-visible rounded-ui-md bg-surface-2" style={{ aspectRatio: `${width} / ${height}` }}>
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full rounded-lg" role="img" aria-label="Your photo with the detected card outline" />
          <svg viewBox={`0 0 ${width} ${height}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            <polygon points={quad.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgb(255 255 255 / 0.08)" stroke="black" strokeOpacity="0.6" strokeWidth="5" vectorEffect="non-scaling-stroke" />
            <polygon points={quad.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            <line x1={quad[0].x} y1={quad[0].y} x2={quad[1].x} y2={quad[1].y} stroke="var(--color-good)" strokeWidth="5" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-good px-1.5 py-0.5 text-xs font-bold text-bg" style={pct(mid)}>
            Top edge
          </span>
          {quad.map((p, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${NAMES[i]} corner, x ${Math.round(p.x)}, y ${Math.round(p.y)}`}
              data-i={i}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onKeyDown={key}
              style={{ ...pct(p), touchAction: "none" }}
              className="group absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full outline-none active:cursor-grabbing"
            >
              <span className="h-5 w-5 rounded-full border-2 border-white bg-accent shadow-[0_0_0_1.5px_rgb(0_0_0/0.7)] group-focus-visible:ring-4 group-focus-visible:ring-fg" />
            </button>
          ))}
        </div>
      </div>
      <Loupe source={bitmap} state={loupe} windowPx={Math.max(40, Math.round(Math.max(width, height) / 40))} />
    </div>
  );
}

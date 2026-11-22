"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { SIDES, computeCentering } from "@/lib/centering";
import type { BorderFit, CenteringResult, Line, Point, RGBAImage, Side } from "@/lib/centering";
import { Button } from "../ui";
import { sideLabel } from "./format";
import { Loupe, type LoupeState } from "./Loupe";

export const OUTER_COLOR = "#00e5ff";
export const INNER_COLOR = "#ff3df0";
export const WARN_Q = 0.6;

type Kind = "outer" | "inner";
type Sel = { side: Side; kind: Kind };
type Handle = "a" | "b" | "mid";

const kindName = (k: Kind) => (k === "outer" ? "cut edge" : "frame line");
const selId = (s: Sel) => `${s.side}:${s.kind}`;
const lineName = (s: Sel) => `${sideLabel(s.side)} ${kindName(s.kind)}`;

export function safeCentering(fit: BorderFit): CenteringResult | null {
  try {
    return computeCentering(fit);
  } catch {
    return null;
  }
}

function normal(l: Line): Point {
  const dx = l.b.x - l.a.x;
  const dy = l.b.y - l.a.y;
  const n = Math.hypot(dx, dy) || 1;
  return { x: -dy / n, y: dx / n };
}

function moved(l: Line, h: Handle, dx: number, dy: number): Line {
  if (h === "a") return { a: { x: l.a.x + dx, y: l.a.y + dy }, b: l.b };
  if (h === "b") return { a: l.a, b: { x: l.b.x + dx, y: l.b.y + dy } };
  const n = normal(l);
  const d = dx * n.x + dy * n.y; // parallel move: only the part along the line's normal counts
  return { a: { x: l.a.x + n.x * d, y: l.a.y + n.y * d }, b: { x: l.b.x + n.x * d, y: l.b.y + n.y * d } };
}

/** The warped card with the eight fitted lines. Tap a line to select it, then drag its handles. */
export function ResultEditor({
  image,
  fit,
  origFit,
  onChange,
  warn,
  focus,
}: {
  image: RGBAImage;
  fit: BorderFit;
  origFit: BorderFit;
  onChange: (f: BorderFit) => void;
  warn: Side[];
  /** Ask the editor to select a side's frame line (n changes on every request). */
  focus?: { side: Side; n: number } | null;
}) {
  const W = image.width;
  const H = image.height;
  const parentRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<Sel | null>(null);
  const [scale, setScale] = useState(0.25); // CSS px per warped px
  const [loupe, setLoupe] = useState<LoupeState | null>(null);
  const [seenFocus, setSeenFocus] = useState(0);
  if (focus && focus.n !== seenFocus) {
    setSeenFocus(focus.n);
    setSel({ side: focus.side, kind: "inner" });
  }
  const drag = useRef<{ h: Handle; px: number; py: number; line: Line } | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = W;
    c.height = H;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), W, H), 0, 0);
  }, [canvasEl, image, W, H]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, [W]);

  const lineOf = (s: Sel): Line => fit[s.kind][s.side];
  const setLine = (s: Sel, l: Line) => onChange({ ...fit, [s.kind]: { ...fit[s.kind], [s.side]: l } });

  const toWarp = (e: { clientX: number; clientY: number }): Point => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const showLoupe = (e: { clientX: number; clientY: number }, p: Point) => {
    const r = parentRef.current!.getBoundingClientRect();
    setLoupe({ x: p.x, y: p.y, ax: e.clientX - r.left, ay: e.clientY - r.top, bw: r.width, bh: r.height });
  };

  const hOf = (e: { currentTarget: HTMLElement }) => e.currentTarget.dataset.h as Handle;
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    const h = hOf(e);
    if (!sel) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toWarp(e);
    drag.current = { h, px: p.x, py: p.y, line: lineOf(sel) };
    showLoupe(e, handlePoint(lineOf(sel), h));
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const h = hOf(e);
    const d = drag.current;
    if (!d || d.h !== h || !sel) return;
    const p = toWarp(e);
    const next = moved(d.line, h, p.x - d.px, p.y - d.py);
    setLine(sel, next);
    showLoupe(e, handlePoint(next, h));
  };
  const up = () => {
    drag.current = null;
    setLoupe(null);
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    const h = hOf(e);
    if (!sel) return;
    const step = e.shiftKey ? 10 : 1;
    const v: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = v[e.key];
    if (!d) return;
    e.preventDefault();
    setLine(sel, moved(lineOf(sel), h, d[0], d[1]));
  };

  const pct = (p: Point) => ({ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` });
  const edited = JSON.stringify(fit) !== JSON.stringify(origFit);
  const allLines = useMemo(() => SIDES.flatMap((side) => (["outer", "inner"] as Kind[]).map((kind) => ({ side, kind }))), []);
  const vw = (px: number) => px / scale; // screen px -> viewBox units
  const cur = sel ? lineOf(sel) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" className="min-w-11" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
          −
        </Button>
        <span className="min-w-12 text-center text-sm tabular-nums" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <Button size="sm" variant="secondary" className="min-w-11" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, z + 0.5))}>
          +
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" disabled={!edited} onClick={() => { onChange(origFit); setSel(null); }}>
          Reset lines
        </Button>
      </div>

      <div ref={parentRef} className="relative">
        <div className="mx-auto max-h-[72dvh] overflow-auto rounded-ui-md bg-surface-2 elev-0" style={{ width: `min(100%, calc(72dvh * ${W / H}))` }}>
          <div ref={wrapRef} className="relative select-none" style={{ width: `${zoom * 100}%`, aspectRatio: `${W} / ${H}` }}>
            <canvas
              ref={(el) => {
                canvasRef.current = el;
                setCanvasEl(el);
              }} className="absolute inset-0 h-full w-full" role="img" aria-label="Flattened card with the measured border lines" />
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }} aria-hidden="true">
              {allLines.map((s) => {
                const l = lineOf(s);
                const color = s.kind === "outer" ? OUTER_COLOR : INNER_COLOR;
                const isSel = !!sel && selId(sel) === selId(s);
                const dash = warn.includes(s.side) ? `${vw(8)} ${vw(5)}` : undefined;
                return (
                  <g key={selId(s)}>
                    <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="#000" strokeOpacity="0.55" strokeWidth={vw(isSel ? 5.5 : 4)} strokeDasharray={dash} />
                    <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke={color} strokeWidth={vw(isSel ? 3 : 1.75)} strokeDasharray={dash} />
                    <line
                      x1={l.a.x}
                      y1={l.a.y}
                      x2={l.b.x}
                      y2={l.b.y}
                      stroke="transparent"
                      strokeWidth={vw(26)}
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onPointerDown={() => setSel(s)}
                    />
                  </g>
                );
              })}
            </svg>
            {sel && cur && (
              <>
                {(["a", "b"] as const).map((h) => (
                  <HandleButton
                    key={h}
                    label={`${lineName(sel)}, ${h === "a" ? "start" : "end"} point. Arrow keys nudge 1 pixel, Shift 10.`}
                    style={pct(cur[h])}
                    onPointerDown={down}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={up}
                    onKeyDown={key}
                    data-h={h}
                  />
                ))}
                <HandleButton
                  label={`${lineName(sel)}, move whole line. Arrow keys nudge 1 pixel, Shift 10.`}
                  square
                  style={pct({ x: (cur.a.x + cur.b.x) / 2, y: (cur.a.y + cur.b.y) / 2 })}
                  onPointerDown={down}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={up}
                  onKeyDown={key}
                  data-h="mid"
                />
              </>
            )}
          </div>
        </div>
        <Loupe source={canvasEl} state={loupe} windowPx={Math.round(image.width / 22)} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1 w-5 rounded" style={{ background: OUTER_COLOR }} /> Cut edge (outer)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1 w-5 rounded" style={{ background: INNER_COLOR }} /> Frame line (inner)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-5 border-t-2 border-dashed border-fg" /> Dashed = check this line
        </span>
      </div>

      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
        Line to adjust
        <select
          value={sel ? selId(sel) : ""}
          onChange={(e) => {
            const [side, kind] = e.target.value.split(":");
            setSel(e.target.value ? { side: side as Side, kind: kind as Kind } : null);
          }}
          className="ui-motion min-h-11 rounded-ui-md border border-muted/45 bg-surface-2 px-3 text-sm text-fg focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
        >
          <option value="">None (tap a line on the card)</option>
          {allLines.map((s) => (
            <option key={selId(s)} value={selId(s)}>
              {lineName(s)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[13px] text-muted">
        Tap a line, then drag a round end handle to move that end, or the square handle to slide the whole line. Arrow keys nudge a focused handle (Shift for bigger steps).
      </p>
    </div>
  );
}

function handlePoint(l: Line, h: Handle): Point {
  return h === "a" ? l.a : h === "b" ? l.b : { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
}

function HandleButton({ label, square, style, ...rest }: { label: string; square?: boolean; style: React.CSSProperties } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      {...rest}
      style={{ ...style, touchAction: "none" }}
      className="group absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center outline-none active:cursor-grabbing"
    >
      <span
        className={`h-5 w-5 border-2 border-white bg-accent shadow-[0_0_0_1.5px_rgb(0_0_0/0.7)] group-focus-visible:ring-4 group-focus-visible:ring-fg ${square ? "rounded-sm" : "rounded-full"}`}
      />
    </button>
  );
}

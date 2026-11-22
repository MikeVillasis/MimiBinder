"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { cardImage } from "@/lib/pricing";

/**
 * Full-screen card inspector. Open it from anywhere with `openCardInspector({ image, name })`;
 * a single <CardInspector /> mounted in AppShell listens for the event and renders through a portal.
 *
 * Gestures (pointer events, all state in refs, transform written in requestAnimationFrame):
 * - one pointer drag: move (clamped so part of the card stays on screen), with a 3D tilt toward the motion
 * - two pointers: pinch to zoom (0.6–4x), twist to rotate, centroid moves the card
 * - wheel: zoom; Shift+wheel: rotate
 * - double tap / double click: reset
 */

export type InspectCard = { image?: string; name: string };

const OPEN_EVENT = "mimibinder:inspect-card";
const MIN_SCALE = 0.6;
const MAX_SCALE = 4;
const MAX_TILT = 9; // degrees
const DOUBLE_TAP_MS = 320;

export function openCardInspector(card: InspectCard) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<InspectCard>(OPEN_EVENT, { detail: card }));
}

type Pt = { x: number; y: number };
type View = { x: number; y: number; rot: number; scale: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function CardInspector() {
  const [card, setCard] = useState<InspectCard | null>(null);
  const [openId, setOpenId] = useState(0);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<InspectCard>).detail;
      if (!detail?.name) return;
      setCard({ image: detail.image, name: detail.name });
      setOpenId((n) => n + 1);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback(() => setCard(null), []);

  if (!card) return null;
  return createPortal(<InspectorOverlay key={openId} card={card} onClose={close} />, document.body);
}

function InspectorOverlay({ card, onClose }: { card: InspectCard; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const view = useRef<View>({ x: 0, y: 0, rot: 0, scale: 1 });
  // Tilt is a damped spring toward `target` (driven by drag velocity, 0 when idle).
  const tilt = useRef({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 });
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{
    start: View;
    // one pointer
    origin?: Pt;
    // two pointers
    dist?: number;
    angle?: number;
    centroid?: Pt;
  } | null>(null);
  const lastMove = useRef<{ x: number; y: number; t: number } | null>(null);
  const tap = useRef<{ x: number; y: number; t: number; moved: boolean }>({ x: 0, y: 0, t: 0, moved: false });
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  const frame = useRef(0);
  const reduced = useRef(false);

  const [hiLoaded, setHiLoaded] = useState(false);
  const [hiFailed, setHiFailed] = useState(false);
  const low = cardImage(card.image, "low");
  const high = cardImage(card.image, "high");

  const write = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    const v = view.current;
    const t = tilt.current;
    const tx = reduced.current ? 0 : t.x;
    const ty = reduced.current ? 0 : t.y;
    el.style.transform =
      `translate3d(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px, 0) perspective(1000px) ` +
      `rotateX(${tx.toFixed(2)}deg) rotateY(${ty.toFixed(2)}deg) rotate(${v.rot.toFixed(2)}deg) scale(${v.scale.toFixed(3)})`;
    const sheen = sheenRef.current;
    if (sheen && !reduced.current) {
      // Light moves opposite the tilt; stronger when tilted.
      sheen.style.backgroundPosition = `${50 - ty * 4}% ${50 + tx * 4}%`;
      sheen.style.opacity = String(0.18 + Math.min(1, (Math.abs(tx) + Math.abs(ty)) / MAX_TILT) * 0.5);
    }
  }, []);

  const schedule = useCallback(() => {
    if (frame.current) return;
    const step = () => {
      frame.current = 0;
      const t = tilt.current;
      if (pointers.current.size === 0) {
        t.tx = 0;
        t.ty = 0;
      } else {
        // Velocity-driven target fades out if the pointer stops.
        t.tx *= 0.88;
        t.ty *= 0.88;
      }
      // Damped spring toward the target: a small overshoot when released.
      t.vx = (t.vx + (t.tx - t.x) * 0.18) * 0.72;
      t.vy = (t.vy + (t.ty - t.y) * 0.18) * 0.72;
      t.x += t.vx;
      t.y += t.vy;
      const settled =
        Math.abs(t.x) + Math.abs(t.y) + Math.abs(t.vx) + Math.abs(t.vy) + Math.abs(t.tx) + Math.abs(t.ty) < 0.02;
      if (settled) t.x = t.y = t.vx = t.vy = 0;
      write();
      if (!settled && !reduced.current) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [write]);

  const setTransition = useCallback((on: boolean) => {
    const el = cardRef.current;
    if (el) el.style.transition = on && !reduced.current ? "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
  }, []);

  const clampView = useCallback(() => {
    const el = cardRef.current;
    const v = view.current;
    v.scale = clamp(v.scale, MIN_SCALE, MAX_SCALE);
    if (!el) return;
    const w = (el.offsetWidth * v.scale) / 2;
    const h = (el.offsetHeight * v.scale) / 2;
    const keepX = Math.min(72, w);
    const keepY = Math.min(72, h);
    const maxX = window.innerWidth / 2 + w - keepX;
    const maxY = window.innerHeight / 2 + h - keepY;
    v.x = clamp(v.x, -maxX, maxX);
    v.y = clamp(v.y, -maxY, maxY);
  }, []);

  const reset = useCallback(() => {
    setTransition(true);
    view.current = { x: 0, y: 0, rot: 0, scale: 1 };
    schedule();
  }, [schedule, setTransition]);

  const rotateBy = useCallback(
    (deg: number) => {
      setTransition(true);
      const v = view.current;
      v.rot = Math.round(v.rot / 90) * 90 + deg;
      schedule();
    },
    [schedule, setTransition],
  );

  // Open: reduced-motion check, scroll lock, focus, Esc + focus trap, wheel.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = mq.matches;
    const onMq = () => (reduced.current = mq.matches);
    mq.addEventListener("change", onMq);

    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    const surface = surfaceRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setTransition(false);
      const v = view.current;
      // Shift+wheel is often reported as horizontal scroll.
      const delta = e.deltaY || e.deltaX;
      const unit = e.deltaMode === 1 ? 16 : 1;
      if (e.shiftKey) {
        v.rot += delta * unit * 0.15;
      } else {
        v.scale *= Math.exp(-delta * unit * 0.0015);
        clampView();
      }
      schedule();
    };
    surface?.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      mq.removeEventListener("change", onMq);
      document.removeEventListener("keydown", onKey);
      surface?.removeEventListener("wheel", onWheel);
      document.body.style.overflow = prevOverflow;
      if (frame.current) cancelAnimationFrame(frame.current);
      if (prevFocus && prevFocus !== document.body && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    };
  }, [onClose, schedule, clampView, setTransition]);

  const beginGesture = () => {
    const pts = [...pointers.current.values()];
    const start = { ...view.current };
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.current = {
        start,
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        centroid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    } else if (pts.length === 1) {
      gesture.current = { start, origin: { ...pts[0] } };
    } else {
      gesture.current = null;
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setTransition(false);
    if (pointers.current.size === 1) {
      tap.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      lastMove.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    } else {
      tap.current.moved = true; // multi-touch is never a tap
    }
    beginGesture();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > 10) tap.current.moved = true;

    const g = gesture.current;
    if (!g) return;
    const v = view.current;
    const pts = [...pointers.current.values()];
    if (pts.length >= 2 && g.dist && g.centroid && g.angle != null) {
      const [a, b] = pts;
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      v.scale = g.start.scale * (dist / g.dist);
      v.rot = g.start.rot + ((angle - g.angle) * 180) / Math.PI;
      v.x = g.start.x + (c.x - g.centroid.x);
      v.y = g.start.y + (c.y - g.centroid.y);
    } else if (g.origin) {
      v.x = g.start.x + (e.clientX - g.origin.x);
      v.y = g.start.y + (e.clientY - g.origin.y);
      // Tilt toward the direction of motion, from pointer velocity (px/ms).
      const now = performance.now();
      const lm = lastMove.current;
      if (lm && now > lm.t) {
        const dt = Math.max(8, now - lm.t);
        const t = tilt.current;
        t.ty = clamp(((e.clientX - lm.x) / dt) * 7, -MAX_TILT, MAX_TILT);
        t.tx = clamp(((lm.y - e.clientY) / dt) * 7, -MAX_TILT, MAX_TILT);
      }
      lastMove.current = { x: e.clientX, y: e.clientY, t: now };
    }
    clampView();
    schedule();
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0 && e.type === "pointerup" && !tap.current.moved) {
      const now = performance.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
        lastTap.current = null;
        reset();
        return;
      }
      lastTap.current = { x: e.clientX, y: e.clientY, t: now };
    }
    // Remaining pointer(s) continue from where they are.
    beginGesture();
    lastMove.current = null;
    schedule();
  };

  const btn =
    "flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-3 text-xs font-semibold text-fg shadow-lg hover:bg-surface-2";

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Inspect ${card.name}`}
      className="fixed inset-0 z-[60] overflow-hidden bg-bg/85 backdrop-blur-md"
    >
      <div
        ref={surfaceRef}
        className="absolute inset-0 flex touch-none select-none items-center justify-center"
        style={{ WebkitTouchCallout: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={(e) => e.preventDefault()}
        // Keep focus inside the dialog: a mouse press (or the compat mousedown after the opening
        // touch hold) on the non-focusable surface would otherwise blur to <body>.
        onMouseDown={(e) => e.preventDefault()}
        data-testid="card-inspector-surface"
      >
        <div
          ref={cardRef}
          data-testid="card-inspector-card"
          className="relative aspect-[63/88] overflow-hidden rounded-[6%/4.5%] bg-surface-2 will-change-transform"
          style={{
            width: "min(85vw, calc(70dvh * 63 / 88))",
            boxShadow: "var(--card-shadow), 0 30px 80px -20px rgb(0 0 0 / 0.6)",
            transform: "translate3d(0, 0, 0)",
          }}
        >
          {low && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={low} alt="" aria-hidden="true" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
          )}
          {high && !hiFailed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={high}
              alt={card.name}
              draggable={false}
              decoding="async"
              onLoad={() => setHiLoaded(true)}
              onError={() => setHiFailed(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${hiLoaded ? "opacity-100" : "opacity-0"}`}
            />
          )}
          {!low && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted">{card.name}</div>
          )}
          {/* Glare: white light blended over the art so holo cards read as shiny. Hidden under reduced motion. */}
          <div
            ref={sheenRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay motion-reduce:hidden"
            style={{
              backgroundImage:
                "linear-gradient(115deg, transparent 25%, rgb(255 255 255 / 0.55) 45%, rgb(255 255 255 / 0.15) 55%, transparent 70%)",
              backgroundSize: "250% 250%",
              backgroundPosition: "50% 50%",
            }}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <p className="max-w-full rounded-full border border-line bg-surface px-4 py-2 text-center text-xs text-fg shadow-lg">
          <span className="font-bold">{card.name}</span>
          <span className="text-muted"> · Drag to move · pinch to zoom · twist to turn</span>
        </p>
      </div>

      <div
        role="toolbar"
        aria-label="Card controls"
        className="absolute inset-x-0 bottom-0 flex justify-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <button type="button" className={btn} onClick={() => rotateBy(-90)} aria-label="Rotate left 90 degrees">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 4v6h6" />
            <path d="M3.5 15a9 9 0 1 0 2.1-9.4L3 10" />
          </svg>
          <span aria-hidden="true">Left</span>
        </button>
        <button type="button" className={btn} onClick={() => rotateBy(90)} aria-label="Rotate right 90 degrees">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 4v6h-6" />
            <path d="M20.5 15a9 9 0 1 1-2.1-9.4L21 10" />
          </svg>
          <span aria-hidden="true">Right</span>
        </button>
        <button type="button" className={btn} onClick={reset} aria-label="Reset position, rotation and zoom">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" />
          </svg>
          <span aria-hidden="true">Reset</span>
        </button>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-2xl bg-accent px-3 text-xs font-bold text-accent-fg shadow-lg hover:opacity-90"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          <span aria-hidden="true">Close</span>
        </button>
      </div>
    </div>
  );
}

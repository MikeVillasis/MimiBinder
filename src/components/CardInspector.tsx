"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useBackToClose } from "./useBackToClose";
import { cardImage } from "@/lib/pricing";
import { CardBack } from "./CardBack";
import { Glitter } from "./Glitter";
import type { GlitterTier } from "@/lib/fun";

/**
 * Full-screen 3D card inspector. Open it from anywhere with `openCardInspector({ image, name })`;
 * a single <CardInspector /> mounted in AppShell listens for the event and renders through a portal.
 *
 * Orientation is a quaternion. Drag deltas are applied as rotations about the SCREEN axes
 * (pre-multiplied), so turning stays natural even when the card is flipped or upside down.
 * - one finger / left mouse drag: turn (horizontal → screen Y axis, vertical → screen X axis), with inertia
 * - two fingers: pinch to zoom (0.6–4x), twist to roll (screen Z axis), centroid moves the card
 * - right-drag or Alt+drag (mouse): move; wheel: zoom; Shift+wheel: roll
 * - double tap / double click: reset; toolbar: Flip (180° about Y), Reset, Close
 * All gesture state lives in refs; the transform is written in requestAnimationFrame, and the loop
 * stops when nothing is animating.
 */

/** `glitter`: the front's glitter (glitterTier in src/lib/fun.ts); it follows the live rotation. Never on the back. */
export type InspectCard = { image?: string; name: string; glitter?: GlitterTier };

export const INSPECT_OPEN_EVENT = "mimibinder:inspect-card";
const OPEN_EVENT = INSPECT_OPEN_EVENT;
const MIN_SCALE = 0.6;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 320;
const FLIP_MS = 500;
const RESET_MS = 380;
const SPIN_FRICTION = 0.9975; // velocity kept per ms (~280 ms half-life)
const SPIN_MIN = 0.00015; // rad/ms
const THICKNESS_LAYERS = [-0.5, 0, 0.5]; // px; faces sit at ±1px

export function openCardInspector(card: InspectCard) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<InspectCard>(OPEN_EVENT, { detail: card }));
}

export function CardInspector() {
  const [card, setCard] = useState<InspectCard | null>(null);
  const [openId, setOpenId] = useState(0);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<InspectCard>).detail;
      if (!detail?.name) return;
      setCard({ image: detail.image, name: detail.name, glitter: detail.glitter });
      setOpenId((n) => n + 1);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback(() => setCard(null), []);
  // Android back gesture / browser Back closes the inspector instead of navigating underneath it.
  useBackToClose(!!card, close);

  if (!card) return null;
  return createPortal(<InspectorOverlay key={openId} card={card} onClose={close} />, document.body);
}

// ---------- quaternion helpers: [w, x, y, z] ----------
type Quat = [number, number, number, number];
const Q_ID: Quat = [1, 0, 0, 0];

function qMul(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}
function qNorm(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
/** Rotation by |(ax, ay, az)| radians about that vector (screen axes: x right, y down, z toward viewer). */
function qFromRotVec(ax: number, ay: number, az: number): Quat {
  const angle = Math.hypot(ax, ay, az);
  if (angle < 1e-9) return Q_ID;
  const s = Math.sin(angle / 2) / angle;
  return [Math.cos(angle / 2), ax * s, ay * s, az * s];
}
/** Apply a screen-space rotation on top of the current orientation. */
const qRotate = (q: Quat, ax: number, ay: number, az: number) => qNorm(qMul(qFromRotVec(ax, ay, az), q));
function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (dot < 0) {
    dot = -dot;
    bb = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (dot > 0.9995) return qNorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(dot);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}
/** Row-major 3x3 rotation matrix (same convention as CSS rotate3d). */
function qMatrix([w, x, y, z]: Quat) {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const f = (n: number) => (Math.abs(n) < 1e-6 ? "0" : n.toFixed(5));

// Light from the upper left, in front of the card; H is the half-vector with the viewer (0,0,1).
const LIGHT = (() => {
  const l = [-0.35, -0.55, 1];
  const ll = Math.hypot(l[0], l[1], l[2]);
  const L = l.map((v) => v / ll);
  const h = [L[0], L[1], L[2] + 1];
  const hl = Math.hypot(h[0], h[1], h[2]);
  return { L, H: h.map((v) => v / hl) };
})();

type Pt = { x: number; y: number };
type Pose = { q: Quat; x: number; y: number; scale: number };
type Tween = { t0: number; dur: number; from: Pose; to: Pose };

function InspectorOverlay({ card, onClose }: { card: InspectCard; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const frontFace = useRef<HTMLDivElement>(null);
  const frontGlare = useRef<HTMLDivElement>(null);
  const frontShade = useRef<HTMLDivElement>(null);
  const backGlare = useRef<HTMLDivElement>(null);
  const backShade = useRef<HTMLDivElement>(null);

  const pose = useRef<Pose>({ q: Q_ID, x: 0, y: 0, scale: 1 });
  const spin = useRef({ x: 0, y: 0 }); // angular velocity about screen X / Y, rad/ms
  const tween = useRef<Tween | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const mode = useRef<"turn" | "move" | "pinch" | null>(null);
  const pinch = useRef<{ dist: number; angle: number; c: Pt } | null>(null);
  const lastMoveT = useRef(0);
  const pinched = useRef(false);
  const tap = useRef<{ x: number; y: number; moved: boolean }>({ x: 0, y: 0, moved: false });
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  const frame = useRef(0);
  const lastFrameT = useRef(0);
  const reduced = useRef(false);

  const [hiLoaded, setHiLoaded] = useState(false);
  const [hiFailed, setHiFailed] = useState(false);
  const [lowFailed, setLowFailed] = useState(false);
  const low = cardImage(card.image, "low");
  const high = cardImage(card.image, "high");

  const write = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    const p = pose.current;
    const m = qMatrix(p.q);
    // CSS matrix3d is column-major.
    el.style.transform =
      `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(${p.scale.toFixed(4)}) ` +
      `matrix3d(${f(m[0])},${f(m[3])},${f(m[6])},0,${f(m[1])},${f(m[4])},${f(m[7])},0,${f(m[2])},${f(m[5])},${f(m[8])},0,0,0,0,1)`;

    // Lighting from the face normals (front = +Z column, back = −Z).
    const { L, H } = LIGHT;
    const light = (n: number[], glare: HTMLDivElement | null, shade: HTMLDivElement | null, mirror: number) => {
      const diffuse = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      if (shade) shade.style.opacity = ((1 - diffuse) * 0.6).toFixed(3);
      if (glare) {
        const spec = Math.pow(Math.max(0, n[0] * H[0] + n[1] * H[1] + n[2] * H[2]), 6);
        glare.style.opacity = (0.12 + spec * 0.7).toFixed(3);
        glare.style.backgroundPosition = `${(50 + mirror * (n[0] - H[0]) * 160).toFixed(1)}% ${(50 + (n[1] - H[1]) * 160).toFixed(1)}%`;
      }
    };
    const n = [m[2], m[5], m[8]];
    light(n, frontGlare.current, frontShade.current, 1);
    // Glitter (front only): the light field slides with the face's tilt, and specks brighten as the face
    // turns toward the light (--gs). The card's in-plane spin (its X axis) adds a little so a twist twinkles too.
    const face = frontFace.current;
    if (face && card.glitter && card.glitter !== "none") {
      const spec = Math.max(0, n[0] * H[0] + n[1] * H[1] + n[2] * H[2]);
      face.style.setProperty("--gx", (n[0] + m[3] * 0.35).toFixed(4));
      face.style.setProperty("--gy", (n[1] - m[0] * 0.35 + 0.35).toFixed(4));
      face.style.setProperty("--gs", Math.pow(spec, 3).toFixed(3));
    }
    light([-n[0], -n[1], -n[2]], backGlare.current, backShade.current, -1);
  }, [card.glitter]);

  const clampPose = useCallback(() => {
    const el = cardRef.current;
    const p = pose.current;
    p.scale = clamp(p.scale, MIN_SCALE, MAX_SCALE);
    if (!el) return;
    const w = (el.offsetWidth * p.scale) / 2;
    const h = (el.offsetHeight * p.scale) / 2;
    const maxX = window.innerWidth / 2 + w - Math.min(72, w);
    const maxY = window.innerHeight / 2 + h - Math.min(72, h);
    p.x = clamp(p.x, -maxX, maxX);
    p.y = clamp(p.y, -maxY, maxY);
  }, []);

  /** Request one frame; the loop keeps itself alive only while tweening or spinning. */
  const schedule = useCallback(() => {
    if (frame.current) return;
    const step = (now: number) => {
      frame.current = 0;
      const dt = clamp(now - (lastFrameT.current || now), 0, 50);
      lastFrameT.current = now;
      let busy = false;
      const tw = tween.current;
      const s = spin.current;
      if (tw) {
        const t = clamp((now - tw.t0) / tw.dur, 0, 1);
        const e = easeInOut(t);
        pose.current = {
          q: qSlerp(tw.from.q, tw.to.q, e),
          x: tw.from.x + (tw.to.x - tw.from.x) * e,
          y: tw.from.y + (tw.to.y - tw.from.y) * e,
          scale: tw.from.scale + (tw.to.scale - tw.from.scale) * e,
        };
        if (t >= 1) {
          pose.current = { ...tw.to };
          tween.current = null;
        } else busy = true;
      } else if (pointers.current.size === 0 && (s.x || s.y)) {
        pose.current.q = qRotate(pose.current.q, s.x * dt, s.y * dt, 0);
        const k = Math.pow(SPIN_FRICTION, dt);
        s.x *= k;
        s.y *= k;
        if (Math.hypot(s.x, s.y) < SPIN_MIN) s.x = s.y = 0;
        else busy = true;
      }
      write();
      if (busy) frame.current = requestAnimationFrame(step);
      else lastFrameT.current = 0;
    };
    frame.current = requestAnimationFrame(step);
  }, [write]);

  const animateTo = useCallback(
    (to: Pose, dur: number) => {
      spin.current = { x: 0, y: 0 };
      if (reduced.current) {
        tween.current = null;
        pose.current = to;
        schedule();
        return;
      }
      tween.current = { t0: performance.now(), dur, from: { ...pose.current }, to };
      schedule();
    },
    [schedule],
  );

  const reset = useCallback(() => animateTo({ q: Q_ID, x: 0, y: 0, scale: 1 }, RESET_MS), [animateTo]);
  const flip = useCallback(() => {
    // Finish any running tween first so repeated taps add up to whole half-turns.
    const base = tween.current ? tween.current.to : pose.current;
    animateTo({ ...base, q: qRotate(base.q, 0, Math.PI, 0) }, FLIP_MS);
  }, [animateTo]);

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
    write();

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
        const inside = dialogRef.current.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    const surface = surfaceRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      tween.current = null;
      const p = pose.current;
      // Shift+wheel is often reported as horizontal scroll.
      const delta = (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 16 : 1);
      if (e.shiftKey) {
        p.q = qRotate(p.q, 0, 0, delta * 0.0026);
      } else {
        p.scale *= Math.exp(-delta * 0.0015);
        clampPose();
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
  }, [onClose, schedule, clampPose, write]);

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    pinch.current = {
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const isMouse = e.pointerType === "mouse";
    if (isMouse && e.button !== 0 && e.button !== 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tween.current = null; // the user takes over
    spin.current = { x: 0, y: 0 };
    if (pointers.current.size === 1) {
      pinched.current = false;
      mode.current = isMouse && (e.button === 2 || e.altKey) ? "move" : "turn";
      tap.current = { x: e.clientX, y: e.clientY, moved: false };
      lastMoveT.current = performance.now();
    } else if (pointers.current.size === 2) {
      mode.current = "pinch";
      pinched.current = true;
      tap.current.moved = true;
      startPinch();
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pt = pointers.current.get(e.pointerId);
    if (!pt) return;
    const dx = e.clientX - pt.x;
    const dy = e.clientY - pt.y;
    pt.x = e.clientX;
    pt.y = e.clientY;
    if (Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > 10) tap.current.moved = true;
    const p = pose.current;

    if (mode.current === "pinch" && pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const prev = pinch.current;
      let dA = angle - prev.angle;
      if (dA > Math.PI) dA -= 2 * Math.PI;
      if (dA < -Math.PI) dA += 2 * Math.PI;
      p.scale *= dist / prev.dist;
      p.q = qRotate(p.q, 0, 0, dA); // screen Z: positive = clockwise on screen
      p.x += c.x - prev.c.x;
      p.y += c.y - prev.c.y;
      pinch.current = { dist, angle, c };
      clampPose();
    } else if (mode.current === "move") {
      p.x += dx;
      p.y += dy;
      clampPose();
    } else if (mode.current === "turn") {
      // Dragging about one on-screen card width turns the card half way round.
      const width = Math.max(160, (cardRef.current?.offsetWidth ?? 320) * p.scale);
      const k = Math.PI / width;
      const rx = -dy * k; // drag down → top edge comes toward the viewer
      const ry = dx * k; // drag right → front face swings right
      p.q = qRotate(p.q, rx, ry, 0);
      const now = performance.now();
      const dt = Math.max(1, now - lastMoveT.current);
      lastMoveT.current = now;
      const s = spin.current;
      s.x = s.x * 0.5 + (rx / dt) * 0.5;
      s.y = s.y * 0.5 + (ry / dt) * 0.5;
    }
    schedule();
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const left = pointers.current.size;
    if (left === 1) {
      // Lifting one of two fingers: keep moving with the remaining one, don't start turning.
      mode.current = "move";
      return;
    }
    if (left > 1) {
      startPinch();
      return;
    }
    // Last pointer up.
    const wasTurning = mode.current === "turn";
    mode.current = null;
    const stale = performance.now() - lastMoveT.current > 80;
    if (!wasTurning || pinched.current || stale || reduced.current || e.type === "pointercancel") spin.current = { x: 0, y: 0 };
    if (e.type === "pointerup" && !tap.current.moved) {
      spin.current = { x: 0, y: 0 };
      const now = performance.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
        lastTap.current = null;
        reset();
        return;
      }
      lastTap.current = { x: e.clientX, y: e.clientY, t: now };
    }
    schedule();
  };

  const btn =
    "flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-3 text-xs font-semibold text-fg shadow-lg hover:bg-surface-2";
  const face = "absolute inset-0 overflow-hidden rounded-[6%/4.5%] [backface-visibility:hidden] [-webkit-backface-visibility:hidden]";
  const glareStyle = {
    backgroundImage:
      "linear-gradient(115deg, transparent 25%, rgb(255 255 255 / 0.6) 45%, rgb(255 255 255 / 0.15) 55%, transparent 70%)",
    backgroundSize: "250% 250%",
    backgroundPosition: "50% 50%",
  } as const;

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
        style={{ WebkitTouchCallout: "none", perspective: "1600px" }}
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
          className="relative aspect-[63/88] will-change-transform [transform-style:preserve-3d]"
          style={{ width: "min(85vw, calc(70dvh * 63 / 88))" }}
        >
          {/* Edge: a few stacked layers between the faces so the card doesn't vanish edge-on. */}
          {THICKNESS_LAYERS.map((z) => (
            <div
              key={z}
              aria-hidden="true"
              className="absolute inset-0 rounded-[6%/4.5%] bg-[#c9ccd3]"
              style={{ transform: `translateZ(${z}px)` }}
            />
          ))}

          {/* Front */}
          <div ref={frontFace} className={`${face} bg-surface-2`} style={{ transform: "translateZ(1px)", boxShadow: "var(--card-shadow)" }} data-testid="card-inspector-front">
            {low && !lowFailed && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={low}
                alt=""
                aria-hidden="true"
                draggable={false}
                onError={() => setLowFailed(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
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
            {(!low || lowFailed) && (!high || hiFailed || !hiLoaded) && <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted">{card.name}</div>}
            {card.glitter && card.glitter !== "none" && ((low && !lowFailed) || (high && !hiFailed)) && <Glitter tier={card.glitter} big />}
            {/* Lighting: shade darkens faces turned from the light; glare is a specular sheen. */}
            <div ref={frontShade} aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black opacity-0" />
            <div ref={frontGlare} aria-hidden="true" className="pointer-events-none absolute inset-0 mix-blend-overlay motion-reduce:hidden" style={glareStyle} />
          </div>

          {/* Back */}
          <div className={face} style={{ transform: "rotateY(180deg) translateZ(1px)", boxShadow: "var(--card-shadow)" }} data-testid="card-inspector-back">
            <CardBack />
            <div ref={backShade} aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black opacity-0" />
            <div ref={backGlare} aria-hidden="true" className="pointer-events-none absolute inset-0 mix-blend-overlay motion-reduce:hidden" style={glareStyle} />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <p className="max-w-full rounded-2xl border border-line bg-surface px-4 py-2 text-center text-xs text-fg shadow-lg">
          <span className="font-bold">{card.name}</span>
          <span className="text-muted"> · Drag to turn · pinch to zoom · two fingers to move</span>
        </p>
      </div>

      <div
        role="toolbar"
        aria-label="Card controls"
        className="absolute inset-x-0 bottom-0 flex justify-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <button type="button" className={btn} onClick={flip} aria-label="Flip card over">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v18" strokeDasharray="2 2.5" />
            <path d="M9 6H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4" />
            <path d="M15 6h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-4" />
            <path d="M7 3.5 9 6 7 8.5M17 15.5 15 18l2 2.5" />
          </svg>
          <span aria-hidden="true">Flip</span>
        </button>
        <button type="button" className={btn} onClick={reset} aria-label="Reset position, rotation and zoom">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 4v6h6" />
            <path d="M3.5 15a9 9 0 1 0 2.1-9.4L3 10" />
          </svg>
          <span aria-hidden="true">Reset</span>
        </button>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-2xl bg-accent px-3 text-xs font-bold text-accent-fg shadow-lg hover:opacity-90"
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

"use client";

// The "fun" layer: decorative, original, and safe to remove. See docs/proposals/FUN_UPGRADES.md.
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { countUpValue, MILESTONE_COPY, type FoilTier, type Milestone } from "@/lib/fun";
import { haptic, motionOK, PREF, takeMilestone, usePref, writePref } from "@/lib/prefs";
import { CardBack } from "./CardBack";
import { INSPECT_OPEN_EVENT } from "./CardInspector";
import { cx } from "./ui";

/* ------------------------------------------------------------------------------------------------
 * Holo tilt and light
 * ---------------------------------------------------------------------------------------------- */

/**
 * Wraps card art. With a mouse, the card leans toward the pointer and a soft light follows it;
 * `tier` adds a foil band (card page). Touch and pen input are ignored, so phones pay nothing.
 * It adds no click, capture or hold logic: hold-to-inspect and links underneath work as before.
 */
export function HoloCard({
  tier = "none",
  maxTilt = 7,
  sweep = false,
  className,
  children,
}: {
  tier?: FoilTier;
  /** Largest lean in degrees. */
  maxTilt?: number;
  /** One light sweep when it appears (foil cards on the card page). */
  sweep?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const point = useRef({ x: 0, y: 0 });

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const paint = () => {
    frame.current = 0;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = Math.min(1, Math.max(0, (point.current.x - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (point.current.y - r.top) / r.height));
    el.style.setProperty("--holo-ry", `${((px - 0.5) * 2 * maxTilt).toFixed(2)}deg`);
    el.style.setProperty("--holo-rx", `${(-(py - 0.5) * 2 * maxTilt).toFixed(2)}deg`);
    el.style.setProperty("--holo-x", `${(px * r.width).toFixed(1)}px`);
    el.style.setProperty("--holo-y", `${(py * r.height).toFixed(1)}px`);
    el.style.setProperty("--holo-p", px.toFixed(3));
    el.setAttribute("data-active", "");
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !motionOK()) return;
    point.current = { x: e.clientX, y: e.clientY };
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  };
  const onPointerLeave = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    const el = ref.current;
    if (!el) return;
    el.removeAttribute("data-active");
    el.style.setProperty("--holo-rx", "0deg");
    el.style.setProperty("--holo-ry", "0deg");
  };

  return (
    <div ref={ref} className={cx("holo", className)} data-foil={tier} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      {children}
      <span className="holo-fx" aria-hidden="true">
        <span className="holo-foil" />
        <span className="holo-glare" />
        {sweep && tier !== "none" && <span className="holo-sweep" />}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Sparkles
 * ---------------------------------------------------------------------------------------------- */

/** A one-shot burst of small stars from the centre of the parent (which must be positioned). */
export function Sparkles({ count = 12, spread = 120 }: { count?: number; spread?: number }) {
  return (
    <span className="sparkles" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        // Evenly spread angles with a fixed wobble: deterministic, so render stays pure.
        const a = (i / count) * Math.PI * 2 + (i % 3) * 0.35;
        const d = spread * (0.65 + ((i * 37) % 10) / 22);
        const style = {
          "--sx": `${(Math.cos(a) * d).toFixed(0)}px`,
          "--sy": `${(Math.sin(a) * d).toFixed(0)}px`,
          "--ss": `${10 + ((i * 5) % 9)}px`,
          "--sd": `${(i % 4) * 45}ms`,
        } as CSSProperties;
        return <i key={i} style={style} />;
      })}
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Count-up
 * ---------------------------------------------------------------------------------------------- */

// What each counter last showed, so coming back to a page does not replay from zero.
const lastShown = new Map<string, number>();

/**
 * A number that counts up to `value`. Price safety:
 * - every frame is formatted by the same `format` the page would use;
 * - when the animation ends (or is skipped) it renders `format(value)` itself, not an interpolation;
 * - a timer forces that final state even if animation frames are throttled (background tab);
 * - screen readers get the real value from the first frame (the animated text is aria-hidden);
 * - no animation at all under reduced motion or with Settings > Feel > motion off.
 */
export function CountUp({
  id,
  value,
  format,
  durationMs = 700,
}: {
  /** Stable key for remembering the last shown value (e.g. "home-total:CAD"). */
  id: string;
  value: number;
  format: (n: number) => string;
  durationMs?: number;
}) {
  const final = format(value);
  const text = useRef<HTMLSpanElement>(null);

  // React always renders the exact final string. While counting, the frames are written straight to
  // the text node (no re-renders) and the last write puts the exact final string back.
  useLayoutEffect(() => {
    const el = text.current;
    const from = lastShown.get(id) ?? 0;
    if (!el) return;
    if (from === value || !Number.isFinite(value) || !motionOK()) {
      lastShown.set(id, value);
      el.textContent = final; // whatever a cancelled count-up left behind, show the real value
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const finish = () => {
      cancelAnimationFrame(raf);
      clearTimeout(guard);
      lastShown.set(id, value);
      el.textContent = final;
    };
    const tick = (now: number) => {
      const t = (now - t0) / durationMs;
      if (t >= 1) return finish();
      const v = countUpValue(from, value, t);
      lastShown.set(id, v);
      el.textContent = format(v);
      raf = requestAnimationFrame(tick);
    };
    const guard = setTimeout(finish, durationMs + 120);
    el.textContent = format(from);
    raf = requestAnimationFrame(tick);
    // Cleanup only cancels: it must not write this run's (by then stale) value over a newer one.
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(guard);
    };
    // `format` changes identity with the currency, which is part of `final`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, value, final, durationMs]);

  return (
    <>
      <span ref={text} aria-hidden="true" data-countup>
        {final}
      </span>
      <span className="sr-only" data-final>
        {final}
      </span>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Small pieces
 * ---------------------------------------------------------------------------------------------- */

/** "New" marker for cards added in the last few days. Opaque, so it reads on top of card art. */
export function NewBadge({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-md bg-accent px-1.5 py-0.5 text-xs font-bold leading-none text-accent-fg elev-1", className)}>
      New
    </span>
  );
}

/** A fanned hand of three MimiBinder card backs (the app's own original back) for empty states. */
export function CardFan({ className }: { className?: string }) {
  return (
    <span className={cx("card-fan block", className)} aria-hidden="true">
      <span>
        <CardBack />
      </span>
      <span>
        <CardBack />
      </span>
      <span>
        <CardBack />
      </span>
    </span>
  );
}

/**
 * One-time coach hint for the 3D inspector. Gone for good once dismissed or once the inspector
 * has been opened on this device.
 */
export function InspectHint({ className }: { className?: string }) {
  const state = usePref(PREF.inspectHint, "show", "done"); // hidden on the server and while hydrating
  useEffect(() => {
    if (state === "done") return;
    const done = () => writePref(PREF.inspectHint, "done");
    window.addEventListener(INSPECT_OPEN_EVENT, done);
    return () => window.removeEventListener(INSPECT_OPEN_EVENT, done);
  }, [state]);
  if (state === "done") return null;
  return (
    <div role="note" className={cx("pop-in flex items-center gap-2 rounded-ui-md bg-accent-soft py-1 pl-3 pr-1 text-[13px] font-medium text-fg", className)}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-accent">
        <path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
      <span className="min-w-0 flex-1 py-1.5">Press and hold any card to inspect it in 3D.</span>
      <button
        type="button"
        onClick={() => writePref(PREF.inspectHint, "done")}
        className="ui-motion flex min-h-11 shrink-0 items-center rounded-ui-sm px-3 font-semibold text-accent hover:bg-accent-soft"
      >
        Got it
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Set milestones
 * ---------------------------------------------------------------------------------------------- */

/**
 * Returns the milestone to celebrate on this visit, once per set per milestone on this device.
 * `ready` must be false until both the set and the collection have loaded, so a half-loaded 0%
 * or a still-empty list never counts.
 */
export function useMilestone(setId: string, ready: boolean, percent: number) {
  const current = useSyncExternalStore(subscribeMilestone, getMilestone, () => null);
  useEffect(() => {
    if (!ready) return;
    const m = takeMilestone(setId, percent);
    if (m == null) return;
    setMilestone({ setId, milestone: m });
    haptic("success");
  }, [setId, ready, percent]);
  return {
    milestone: current && current.setId === setId ? current.milestone : null,
    dismiss: () => setMilestone(null),
  };
}

// The banner on screen (at most one). A tiny store, so showing it is not a setState inside an effect.
type ActiveMilestone = { setId: string; milestone: Milestone };
let activeMilestone: ActiveMilestone | null = null;
const milestoneListeners = new Set<() => void>();
function setMilestone(next: ActiveMilestone | null) {
  if (activeMilestone === next) return;
  activeMilestone = next;
  milestoneListeners.forEach((l) => l());
}
function getMilestone() {
  return activeMilestone;
}
function subscribeMilestone(cb: () => void) {
  milestoneListeners.add(cb);
  return () => {
    milestoneListeners.delete(cb);
  };
}

/** A dismissible, non-blocking banner for a set milestone. */
export function MilestoneBanner({ milestone, setName, onDismiss }: { milestone: Milestone; setName: string; onDismiss: () => void }) {
  const copy = MILESTONE_COPY[milestone];
  const complete = milestone === 100;
  return (
    <div
      role="status"
      className={cx(
        "pop-in relative mb-4 flex items-center gap-3 overflow-hidden rounded-ui-lg py-2 pl-4 pr-1.5 elev-1",
        complete ? "bg-good/12" : "bg-accent-soft",
      )}
    >
      <Sparkles count={complete ? 16 : 10} spread={complete ? 170 : 130} />
      <span
        className={cx("relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-[13px] font-bold tabular-nums elev-0", complete ? "text-good" : "text-accent")}
        aria-hidden="true"
      >
        {complete ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          `${milestone}%`
        )}
      </span>
      <div className="relative min-w-0 flex-1 py-1">
        <div className="text-[15px] font-semibold leading-snug">{copy.title}</div>
        <div className="text-[13px] text-muted">
          <span className="sr-only">{setName}: </span>
          {copy.body}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ui-motion relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

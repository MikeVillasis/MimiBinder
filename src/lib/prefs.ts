"use client";

// Per-device preferences for the "fun" layer, stored in localStorage like the theme (never synced).
// Every read and write is wrapped: private browsing or a full disk must not break the page.
import { useSyncExternalStore } from "react";
import { MOTION_PREF_KEY, markMilestonesShown, pendingMilestone, type Milestone } from "./fun";

const EVENT = "mimibinder:pref-change";

export const PREF = {
  motion: MOTION_PREF_KEY, // "off" disables card shine and motion
  haptics: "mimibinder:haptics", // "off" disables vibration
  setView: "mimibinder:set-view", // "grid" | "pages"
  inspectHint: "mimibinder:hint-inspect", // "done" once dismissed or the inspector was opened
  milestones: "mimibinder:milestones", // JSON: { [setId]: number[] }
} as const;

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the preference just doesn't stick
  }
  if (key === PREF.motion) applyMotionPref();
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  } catch {
    // no window (never on the client)
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** A string preference: `fallback` when nothing is stored, `serverFallback` on the server and while hydrating. */
export function usePref(key: string, fallback: string, serverFallback = fallback): string {
  return useSyncExternalStore(
    subscribe,
    () => readPref(key) ?? fallback,
    () => serverFallback,
  );
}

/* ---- Feel: motion and haptics ---------------------------------------------------------------- */

/** Sets <html data-motion="off"> so CSS can drop the decorative animations. */
export function applyMotionPref() {
  try {
    const root = document.documentElement;
    if (readPref(PREF.motion) === "off") root.setAttribute("data-motion", "off");
    else root.removeAttribute("data-motion");
  } catch {
    // no document
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Decorative motion is allowed: the Settings switch is on and the system does not ask for less motion. */
export function motionOK(): boolean {
  if (typeof window === "undefined") return false;
  return readPref(PREF.motion) !== "off" && !prefersReducedMotion();
}

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}

export function hapticsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

const noopSubscribe = () => () => {};
export function useHapticsSupported(): boolean {
  return useSyncExternalStore(noopSubscribe, hapticsSupported, () => false);
}

const HAPTIC = { tick: 10, success: [12, 50, 18] } as const;

/** A subtle vibration, only where the device supports it and the user has not turned it off. */
export function haptic(kind: keyof typeof HAPTIC = "tick") {
  if (!hapticsSupported() || readPref(PREF.haptics) === "off") return;
  try {
    navigator.vibrate(HAPTIC[kind] as number | number[]);
  } catch {
    // some browsers throw without a user gesture
  }
}

/* ---- Set milestones -------------------------------------------------------------------------- */

// Also kept in memory, so a browser that refuses to store anything still celebrates once per visit.
const shownThisSession: Record<string, number[]> = {};

function readMilestones(): Record<string, number[]> {
  let stored: Record<string, number[]> = {};
  try {
    const v: unknown = JSON.parse(readPref(PREF.milestones) ?? "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) stored = v as Record<string, number[]>;
  } catch {
    // unreadable: start over
  }
  for (const [id, list] of Object.entries(shownThisSession)) {
    stored[id] = [...(Array.isArray(stored[id]) ? stored[id] : []), ...list];
  }
  return stored;
}

/**
 * Returns the milestone to celebrate for this set right now (or null) and records it as shown,
 * so each milestone fires once per set on this device.
 */
export function takeMilestone(setId: string, percent: number): Milestone | null {
  const all = readMilestones();
  const shown = Array.isArray(all[setId]) ? all[setId] : [];
  const m = pendingMilestone(percent, shown);
  if (m == null) return null;
  all[setId] = markMilestonesShown(percent, shown);
  shownThisSession[setId] = all[setId];
  writePref(PREF.milestones, JSON.stringify(all));
  return m;
}

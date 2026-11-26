// Pure helpers behind the "fun" UI (milestones, "New" badge, count-up, foil tiers, binder pages).
// No prices are computed here: the count-up only interpolates between two already-computed totals.
import { fullArtReason } from "./fullArt";
import type { Variant } from "./types";

export const MILESTONES = [25, 50, 75, 100] as const;
export type Milestone = (typeof MILESTONES)[number];

/** Milestones a completion percent has reached (25 → [25], 80 → [25, 50, 75]). */
export function reachedMilestones(percent: number): Milestone[] {
  if (!Number.isFinite(percent)) return [];
  return MILESTONES.filter((m) => percent >= m);
}

/** The highest reached milestone that has not been celebrated yet, or null. */
export function pendingMilestone(percent: number, shown: readonly number[]): Milestone | null {
  const fresh = reachedMilestones(percent).filter((m) => !shown.includes(m));
  return fresh.length ? fresh[fresh.length - 1] : null;
}

/** `shown` plus every milestone reached, so lower ones skipped in one jump never fire later. */
export function markMilestonesShown(percent: number, shown: readonly number[]): number[] {
  const all = new Set<number>(shown.filter((m) => (MILESTONES as readonly number[]).includes(m)));
  reachedMilestones(percent).forEach((m) => all.add(m));
  return [...all].sort((a, b) => a - b);
}

export const MILESTONE_COPY: Record<Milestone, { title: string; body: string }> = {
  25: { title: "A quarter of the way", body: "25% of this set is in your binder. Nice start." },
  50: { title: "Halfway there", body: "Half of this set is yours." },
  75: { title: "Three quarters done", body: "75% collected. The last pockets are the fun ones." },
  100: { title: "Set complete!", body: "Every numbered card in this set is in your binder." },
};

export const NEW_BADGE_MS = 3 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * True for an entry added in the last 3 days. A timestamp slightly in the future (another device's
 * clock, via sync) still counts; an unreadable or far-future one does not.
 */
export function isNewEntry(createdAt: string | undefined, now: number): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  const age = now - t;
  return age < NEW_BADGE_MS && age > -CLOCK_SKEW_MS;
}

export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/** Value shown at progress `t` (0..1) of a count-up. Exactly `to` at t >= 1, never past it. */
export function countUpValue(from: number, to: number, t: number): number {
  if (!(t < 1) || !Number.isFinite(from) || !Number.isFinite(to)) return to;
  if (t <= 0) return from;
  return from + (to - from) * easeOutCubic(t);
}

export type FoilTier = "none" | "sheen" | "rainbow";

/** How strong the decorative foil is on the card page, from TCGdex's rarity text. */
export function foilTier(rarity: string | undefined): FoilTier {
  const r = (rarity ?? "").toLowerCase();
  if (!r || r === "none") return "none";
  if (/ultra|illustration|secret|hyper|special|rainbow|shiny|amazing|radiant|gold|crown|ace spec|mega/.test(r)) return "rainbow";
  if (/uncommon|^common$/.test(r)) return "none";
  if (/rare|holo|double|promo|classic|legend|prime|lv\.x|ex|gx|vmax|vstar|\bv\b/.test(r)) return "sheen";
  return "none";
}

/**
 * Glitter: fine specks over the art that twinkle with the viewing angle (thumbnails, card page, inspector).
 * - "prismatic": full-art and textured cards (ultra, illustration, special illustration, hyper, secret rares;
 *   Japanese SAR, SR, AR, HR, UR, CHR, CSR, SSR), or a number past the set's official count (Japanese cards
 *   often have rarity "None", and set grids have no rarity at all). Coloured specks.
 * - "light": holo rares and an owned holo copy. Silver specks.
 * - "reverse": an owned reverse-holo copy of a card that is not prismatic. Silver specks on the frame only.
 * - "none": commons, uncommons, plain rares, promos, and anything unknown.
 */
export type GlitterTier = "none" | "light" | "reverse" | "prismatic";

export interface GlitterCard {
  rarity?: string;
  /** Printing of an owned copy; search results and set lists don't have one. */
  variant?: Variant;
  localId?: string;
  setOfficialCount?: number;
}

const GLITTER_PRISMATIC = /ultra|illustration|special|hyper|secret|rainbow|full art|gold|crown|amazing|black white rare/i;
const GLITTER_LIGHT = /holo|double rare|ace spec|radiant|shiny|prime|legend|lv\.x|\bv\b|vmax|vstar|\bex\b|\bgx\b|classic/i;
// Japanese "double rare" codes: whole word and case-sensitive, like the full-art codes ("RR", not "Rare").
const GLITTER_LIGHT_CODE = /(^|[^A-Za-z])(RR|RRR)([^A-Za-z]|$)/;

/** How much glitter a card gets (see GlitterTier). ACE SPEC is a holo, not full art: light. */
export function glitterTier(card: GlitterCard | null | undefined): GlitterTier {
  if (!card) return "none";
  const r = (card.rarity ?? "").trim();
  const named = r && r !== "None" ? r : "";
  if (fullArtReason(card) || (named && GLITTER_PRISMATIC.test(named))) return "prismatic";
  if (card.variant === "reverse") return "reverse";
  if (card.variant === "holo") return "light";
  if (named && !/^(un)?common$/i.test(named) && (GLITTER_LIGHT.test(named) || GLITTER_LIGHT_CODE.test(named))) return "light";
  return "none";
}

const GLITTER_RANK: Record<GlitterTier, number> = { none: 0, reverse: 1, light: 2, prismatic: 3 };

/** The showiest of several (e.g. every owned copy of one card). */
export function strongestGlitter(tiers: Iterable<GlitterTier>): GlitterTier {
  let best: GlitterTier = "none";
  for (const t of tiers) if (GLITTER_RANK[t] > GLITTER_RANK[best]) best = t;
  return best;
}

/** Split a list into binder pages of `size` pockets (the last page may be short). */
export function chunkPages<T>(items: readonly T[], size = 9): T[][] {
  const n = Math.max(1, Math.floor(size));
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += n) pages.push(items.slice(i, i + n));
  return pages;
}

/** localStorage key of the "Card shine and motion" switch ("off" = calm). */
export const MOTION_PREF_KEY = "mimibinder:motion";

/** Inline boot script: applies the motion preference before first paint (see layout.tsx). */
export const FEEL_BOOT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  MOTION_PREF_KEY,
)})==="off")document.documentElement.setAttribute("data-motion","off");}catch(e){}})();`;

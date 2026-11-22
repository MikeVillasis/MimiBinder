// Saved grading assessments (the centering tool's results) and, later, the grade PSA actually returned.
// Local only: they live in IndexedDB and in the JSON backup, and are NOT synced to Supabase (photos and notes
// about a card's condition stay on this device). See docs/proposals/GRADING_V2.md.
import { z } from "zod";
import { db, nowIso } from "./database";

/** One flagged corner or edge, as saved (a plain copy of the engine's finding plus a small evidence image). */
export interface SavedFlag {
  /** Engine zone id, e.g. "corner-tl" or "edge-top". */
  zone: string;
  /** "whitening" | "chipping" | "cornerLoss". */
  kind: string;
  /** "minor" | "moderate" | "heavy". */
  severity: string;
  lengthMm: number;
  depthMm: number;
  areaMm2: number;
  /** How many of this face's photos showed it. */
  seenIn?: number;
  /** Small JPEG data URL of the evidence crop. */
  crop?: string;
}

/** One measured face. Ratios are the larger border's share (50..100) at the worst point. */
export interface SavedFace {
  lr: number;
  tb: number;
  lrHeavy: string;
  tbHeavy: string;
  /** Border widths in mm at the worst points. */
  mm: { left: number; right: number; top: number; bottom: number };
  /** Photos averaged for this face, and how far they disagreed (ratio points). */
  shots: number;
  spread?: number;
  flags: SavedFlag[];
  /** Zones that could not be checked at all. */
  notAssessed: string[];
  /** Zones where the whitening check did not run (silver border, glare, no border). */
  noWhitening?: string[];
  blurMm?: number;
  pxPerMm?: number;
}

/** The grade PSA returned, recorded by the user after the card comes back. */
export interface ActualGrade {
  /** 1..10 in half steps up to 8.5 (there is no 9.5). 0 = authentic, no numeric grade. */
  grade: number;
  /** PSA qualifier such as "OC" or "MK", when the label has one. */
  qualifier?: string;
  gradedAt?: string; // YYYY-MM-DD
  cert?: string;
}

export interface GradingAssessment {
  id: string;
  /** TCGdex card id when the check was started from a card. */
  cardId?: string;
  /** Label shown in the log: the card's name, or whatever the user typed. */
  cardName?: string;
  /** Collection entry (owned copy) this check was for. */
  entryId?: string;
  createdAt: string;
  updatedAt: string;
  front?: SavedFace;
  back?: SavedFace;
  /** The front was skipped because the card is full art. */
  frontFullArt?: boolean;
  /** Best PSA grade the measured centering allows (hard limit from PSA's published table). */
  centeringCeiling?: number;
  centeringLimitedBy?: string;
  /** Centering ceiling lowered by corner/edge flags (uncalibrated rule of thumb). */
  probableCeiling?: number;
  probableReasons?: string[];
  notes?: string;
  actual?: ActualGrade;
  /** Small JPEG data URLs of the flattened faces. */
  thumbs?: { front?: string; back?: string };
  /** Version of the thresholds that produced the flags (for later calibration). */
  engine: number;
}

/** Bump when thresholds or the flag logic change, so old log rows can be told apart. */
export const ASSESSMENT_ENGINE_VERSION = 1;

/** PSA's numeric grades: whole grades 1–10 and half grades 1.5–8.5. There is no 9.5. */
export const PSA_GRADES: readonly number[] = [10, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1];
export const PSA_QUALIFIERS: readonly string[] = ["OC", "MC", "MK", "ST", "PD", "OF"];

export function isPsaGrade(g: number): boolean {
  return g === 0 || PSA_GRADES.includes(g);
}

const optStr = z.string().nullish().transform((v) => v ?? undefined);
const optNum = z.number().finite().nullish().transform((v) => v ?? undefined);

const flagSchema = z.object({
  zone: z.string(),
  kind: z.string(),
  severity: z.string(),
  lengthMm: z.number().finite(),
  depthMm: z.number().finite(),
  areaMm2: z.number().finite(),
  seenIn: optNum,
  crop: optStr,
});

const faceSchema = z.object({
  lr: z.number().finite(),
  tb: z.number().finite(),
  lrHeavy: z.string(),
  tbHeavy: z.string(),
  mm: z.object({ left: z.number().finite(), right: z.number().finite(), top: z.number().finite(), bottom: z.number().finite() }),
  shots: z.number().int().min(1).default(1),
  spread: optNum,
  flags: z.array(flagSchema).default([]),
  notAssessed: z.array(z.string()).default([]),
  noWhitening: z.array(z.string()).nullish().transform((v) => v ?? undefined),
  blurMm: optNum,
  pxPerMm: optNum,
});

export const assessmentSchema = z.object({
  id: z.string().min(1),
  cardId: optStr,
  cardName: optStr,
  entryId: optStr,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  front: faceSchema.nullish().transform((v) => v ?? undefined),
  back: faceSchema.nullish().transform((v) => v ?? undefined),
  frontFullArt: z.boolean().nullish().transform((v) => v ?? undefined),
  centeringCeiling: optNum,
  centeringLimitedBy: optStr,
  probableCeiling: optNum,
  probableReasons: z.array(z.string()).nullish().transform((v) => v ?? undefined),
  notes: optStr,
  actual: z
    .object({ grade: z.number().refine(isPsaGrade, "not a PSA grade"), qualifier: optStr, gradedAt: optStr, cert: optStr })
    .nullish()
    .transform((v) => v ?? undefined),
  thumbs: z.object({ front: optStr, back: optStr }).nullish().transform((v) => v ?? undefined),
  engine: z.number().int().default(1),
});

function strip<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export type NewAssessment = Omit<GradingAssessment, "id" | "createdAt" | "updatedAt" | "engine">;

export async function saveAssessment(input: NewAssessment): Promise<GradingAssessment> {
  const now = nowIso();
  const row: GradingAssessment = strip({ ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now, engine: ASSESSMENT_ENGINE_VERSION });
  await db.assessments.add(row);
  return row;
}

export async function updateAssessment(id: string, patch: Partial<Pick<GradingAssessment, "cardName" | "entryId" | "notes">>): Promise<void> {
  await db.transaction("rw", db.assessments, async () => {
    const cur = await db.assessments.get(id);
    if (!cur) throw new Error(`Assessment ${id} not found`);
    await db.assessments.put(strip({ ...cur, ...patch, id, updatedAt: nowIso() }));
  });
}

/** Record (or, with null, clear) the grade PSA returned. */
export async function recordActualGrade(id: string, actual: ActualGrade | null): Promise<void> {
  if (actual && !isPsaGrade(actual.grade)) throw new Error("Not a PSA grade");
  await db.transaction("rw", db.assessments, async () => {
    const cur = await db.assessments.get(id);
    if (!cur) throw new Error(`Assessment ${id} not found`);
    const next: GradingAssessment = { ...cur, updatedAt: nowIso() };
    if (actual) next.actual = strip({ ...actual, qualifier: actual.qualifier || undefined, gradedAt: actual.gradedAt || undefined, cert: actual.cert?.trim() || undefined });
    else delete next.actual;
    await db.assessments.put(next);
  });
}

/** Hard delete: assessments are local only, so there is nothing to tombstone. */
export async function deleteAssessment(id: string): Promise<void> {
  await db.assessments.delete(id);
}

export interface AccuracySummary {
  /** Saved checks, and how many have a returned PSA grade. */
  total: number;
  graded: number;
  /** Graded cards with a centering ceiling, and how many came back at or under it (it should be all of them). */
  centeringChecked: number;
  centeringHeld: number;
  /** Graded cards with a probable ceiling, how many came back at or under it, and how many exactly on it. */
  probableChecked: number;
  probableHeld: number;
  probableExact: number;
  /** Mean of (probable ceiling − PSA grade) over those cards: how far below the ceiling PSA landed. */
  meanGap: number | null;
}

/** The user's own accuracy log: how the ceilings compared with what PSA returned. Ungraded ("authentic") rows are skipped. */
export function accuracySummary(rows: GradingAssessment[]): AccuracySummary {
  const s: AccuracySummary = { total: rows.length, graded: 0, centeringChecked: 0, centeringHeld: 0, probableChecked: 0, probableHeld: 0, probableExact: 0, meanGap: null };
  let gap = 0;
  for (const r of rows) {
    const g = r.actual?.grade;
    if (!g) continue;
    s.graded++;
    if (r.centeringCeiling != null) {
      s.centeringChecked++;
      if (g <= r.centeringCeiling) s.centeringHeld++;
    }
    if (r.probableCeiling != null) {
      s.probableChecked++;
      if (g <= r.probableCeiling) s.probableHeld++;
      if (g === r.probableCeiling) s.probableExact++;
      gap += r.probableCeiling - g;
    }
  }
  if (s.probableChecked) s.meanGap = gap / s.probableChecked;
  return s;
}

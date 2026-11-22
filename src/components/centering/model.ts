// What the centering tool knows about a card, independent of React: one result per photo ("shot"), the
// per-face summary over its shots, the two ceilings, the saved-assessment record and the share text.
import { combineCentering, combineCondition, conditionCeiling, defectLabel, MAX_SHOT_SPREAD, psaCeiling, psaLabel, zoneLabel, zoneSeverity } from "@/lib/centering";
import type { BorderProfile, CenteringResult, CombinedCentering, CombinedCondition, ConditionCeiling, ConditionReport, Face, PhotoQuality, PsaCeiling, ZoneId } from "@/lib/centering";
import type { NewAssessment, SavedFace } from "@/lib/db";
import type { Evidence } from "./evidence";
import { ratio } from "./format";

/** One measured photo of a face. */
export interface Shot {
  /** Null when the lines could not be turned into ratios. */
  centering: CenteringResult | null;
  condition: ConditionReport;
  quality: PhotoQuality;
  evidence: Evidence;
  /** Small JPEG data URL of the flattened card. */
  thumb: string;
}

/** A face over all of its photos. */
export interface FaceSummary {
  face: Face;
  shots: number;
  /** Averaged centering; null when no photo gave ratios. */
  centering: CombinedCentering | null;
  condition: CombinedCondition;
  /** Evidence crops, each taken from the photo its zone finding comes from. */
  evidence: Evidence;
  /** Quality of the latest photo. */
  quality: PhotoQuality;
  thumb: string;
  /** True when the photos disagree by more than MAX_SHOT_SPREAD ratio points. */
  inconsistent: boolean;
}

export function summarizeFace(face: Face, shots: Shot[]): FaceSummary | null {
  if (!shots.length) return null;
  const condition = combineCondition(shots.map((s) => s.condition));
  if (!condition) return null;
  const centering = combineCentering(shots.map((s) => s.centering).filter((c): c is CenteringResult => !!c));
  const evidence: Evidence = {};
  for (const z of [...condition.zones, ...condition.unconfirmed]) {
    const crop = shots[z.source]?.evidence[z.zone];
    if (crop) evidence[z.zone] = crop;
  }
  const last = shots[shots.length - 1];
  return {
    face,
    shots: shots.length,
    centering,
    condition,
    evidence,
    quality: last.quality,
    thumb: last.thumb,
    inconsistent: !!centering && centering.shots > 1 && centering.spread > MAX_SHOT_SPREAD,
  };
}

export interface Verdict {
  /** From PSA's published centering table: a hard limit. Null when no centering was measured. */
  centering: PsaCeiling | null;
  /** From the corner and edge flags: an uncalibrated rule of thumb. Null when nothing is flagged. */
  condition: ConditionCeiling | null;
  /** The lower of the two. Null when there is nothing to go on. */
  probable: number | null;
  /** Which of the two sets the probable ceiling. */
  limitedBy: "centering" | "condition" | "both" | null;
}

export function verdict(front: FaceSummary | null, back: FaceSummary | null, profile?: BorderProfile | null): Verdict {
  const fc = front?.centering ?? null, bc = back?.centering ?? null;
  let centering: PsaCeiling | null = null;
  if (fc || bc) {
    try {
      centering = psaCeiling(fc, bc, { skipFrontAxis: profile?.asymmetric?.axis });
    } catch {
      centering = null;
    }
  }
  const condition = conditionCeiling([front?.condition, back?.condition]);
  if (!centering && !condition) return { centering, condition, probable: null, limitedBy: null };
  const c = centering?.grade ?? 10, k = condition?.grade ?? 10;
  return { centering, condition, probable: Math.min(c, k), limitedBy: !condition || c < k ? "centering" : !centering || k < c ? "condition" : "both" };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

function savedFace(f: FaceSummary, withCrops: boolean): SavedFace | undefined {
  const c = f.centering;
  if (!c) return undefined;
  const whiteningSkipped = f.condition.zones.filter((z) => z.status !== "notAssessed" && !z.checked.whitening).map((z) => z.zone as string);
  return {
    lr: round2(c.lr.worst),
    tb: round2(c.tb.worst),
    lrHeavy: c.lr.heavySide,
    tbHeavy: c.tb.heavySide,
    mm: { left: round2(c.lr.worstMm.a), right: round2(c.lr.worstMm.b), top: round2(c.tb.worstMm.a), bottom: round2(c.tb.worstMm.b) },
    shots: f.shots,
    spread: f.shots > 1 ? round2(c.spread) : undefined,
    flags: f.condition.zones
      .filter((z) => z.status === "flagged")
      .flatMap((z) =>
        z.defects.map((d) => ({
          zone: z.zone as string,
          kind: d.kind as string,
          severity: d.severity as string,
          lengthMm: round2(d.lengthMm),
          depthMm: round2(d.depthMm),
          areaMm2: round2(d.areaMm2),
          seenIn: f.shots > 1 ? z.seenIn : undefined,
          crop: withCrops ? f.evidence[z.zone]?.src : undefined,
        })),
      ),
    notAssessed: f.condition.zones.filter((z) => z.status === "notAssessed").map((z) => z.zone as string),
    noWhitening: whiteningSkipped.length ? whiteningSkipped : undefined,
    blurMm: f.condition.blurMm === f.condition.blurMm ? round2(f.condition.blurMm) : undefined,
    pxPerMm: round1(f.quality.pxPerMm),
  };
}

/** The record to store for this check. `photos: false` leaves out the thumbnails and evidence crops. */
export function buildAssessment(
  front: FaceSummary | null,
  back: FaceSummary | null,
  v: Verdict,
  meta: { cardId?: string; cardName?: string; entryId?: string; notes?: string; frontFullArt?: boolean; photos?: boolean },
): NewAssessment {
  const photos = meta.photos !== false;
  const thumbs = photos && (front || back) ? { front: front?.thumb || undefined, back: back?.thumb || undefined } : undefined;
  return {
    cardId: meta.cardId || undefined,
    cardName: meta.cardName?.trim() || undefined,
    entryId: meta.entryId || undefined,
    notes: meta.notes?.trim() || undefined,
    frontFullArt: meta.frontFullArt || undefined,
    front: front ? savedFace(front, photos) : undefined,
    back: back ? savedFace(back, photos) : undefined,
    centeringCeiling: v.centering?.grade,
    centeringLimitedBy: v.centering?.limitedBy,
    probableCeiling: v.probable ?? undefined,
    probableReasons: v.condition?.reasons,
    thumbs,
  };
}

export const gradeText = (g: number) => `PSA ${g}${psaLabel(g) ? ` (${psaLabel(g)})` : ""}`;

function faceLine(f: FaceSummary): string {
  const c = f.centering;
  if (!c) return `${f.face}: centering not measured`;
  const many = f.shots > 1 ? ` (${f.shots} photos, within ${c.spread.toFixed(1)} points)` : "";
  return `${f.face} ${ratio(c.lr.worst)} left/right, ${ratio(c.tb.worst)} top/bottom${many}`;
}

/** Zones of one face whose whitening check did not run, as a short phrase, or "" when all ran. */
export function whiteningGap(f: FaceSummary): string {
  const zones = f.condition.zones;
  const none = zones.filter((z) => !z.checked.whitening);
  if (!none.length) return "";
  const why = new Set(none.flatMap((z) => z.skipped));
  const reason = why.has("blur") ? "photo too soft" : why.has("lightBorder") ? "silver or light border" : why.has("noBorder") ? "no plain border" : why.has("glare") ? "glare" : "border too thin";
  return `${f.face} whitening${none.length < zones.length ? ` on ${none.length} of 8 zones` : ""} (${reason})`;
}

/** Plain-text summary for sharing or pasting into notes. Says what it is and what it is not. */
export function summaryText(front: FaceSummary | null, back: FaceSummary | null, v: Verdict, opts: { cardName?: string; frontFullArt?: boolean; date?: Date } = {}): string {
  const lines: string[] = [];
  const date = (opts.date ?? new Date()).toISOString().slice(0, 10);
  lines.push(`${opts.cardName ? `${opts.cardName}: ` : ""}MimiBinder grading check, ${date}`);
  if (v.probable != null) lines.push(`Probable ceiling: ${gradeText(v.probable)}. A ceiling, not a predicted grade.`);
  const faces = [front, back].filter((f): f is FaceSummary => !!f);
  if (faces.some((f) => f.centering)) lines.push(`Centering (worst point): ${faces.map(faceLine).join("; ")}.`);
  if (opts.frontFullArt) lines.push("Front centering not measured (full-art card).");
  if (v.centering) lines.push(`Centering allows up to ${gradeText(v.centering.grade)}${v.centering.limitedBy ? `, limited by ${v.centering.limitedBy}` : ""}.`);
  const flags = faces.flatMap((f) =>
    f.condition.zones.filter((z) => z.status === "flagged").map((z) => `${f.face} ${zoneLabel(z.zone)}: ${z.defects.map((d) => defectLabel(d.kind)).join(" and ")} (${zoneSeverity(z)})`),
  );
  if (flags.length) lines.push(`Corner and edge flags (uncalibrated): ${flags.join("; ")}.`);
  else if (faces.length) lines.push("Corner and edge flags: none on the zones that could be checked.");
  const gaps = faces.map(whiteningGap).filter(Boolean);
  const missing = [!front && !opts.frontFullArt ? "front" : "", !back ? "back" : ""].filter(Boolean);
  lines.push(`Not assessed: surface (scratches, print lines, dents)${gaps.length ? `; ${gaps.join("; ")}` : ""}${missing.length ? `; ${missing.join(" and ")} not photographed` : ""}.`);
  return lines.join("\n");
}

/** Zones in display order with the label text the UI and the log share. */
export function flagLabels(flags: { zone: string; kind: string; severity: string }[]): string[] {
  const seen = new Map<string, string[]>();
  for (const f of flags) seen.set(f.zone, [...(seen.get(f.zone) ?? []), f.kind]);
  return [...seen].map(([zone, kinds]) => `${zoneLabel(zone as ZoneId)}: ${[...new Set(kinds)].map((k) => (k === "whitening" || k === "chipping" || k === "cornerLoss" ? defectLabel(k) : k)).join(" and ")}`);
}

// Several photos of the same face: average the centering and say how far the photos disagree; keep a corner or
// edge flag only when at least half of the photos show it. Pure TS.
import type { AxisCentering, CenteringResult, Side } from "./types";
import type { ConditionReport, ZoneFinding, ZoneId } from "./condition";
import { ZONES, zoneSeverity } from "./condition";

export interface CombinedCentering extends CenteringResult {
  /** Number of photos averaged. */
  shots: number;
  /** Largest disagreement between photos on either axis, in ratio points (0 for a single photo). */
  spread: number;
  spreadLR: number;
  spreadTB: number;
}

/** Above this spread (ratio points) the photos disagree too much to trust the average. */
export const MAX_SHOT_SPREAD = 1.5;

/** Left/top border's share (0..100) at the worst point: signed, so photos that disagree on the wider side average correctly. */
function share(a: AxisCentering): number {
  const t = a.worstMm.a + a.worstMm.b;
  return t > 0 ? (100 * a.worstMm.a) / t : 50;
}

function axis(list: AxisCentering[], first: Side, second: Side): { axis: AxisCentering; spread: number } {
  const n = list.length;
  const shares = list.map(share);
  const s = shares.reduce((x, y) => x + y, 0) / n;
  return {
    axis: {
      worst: Math.max(s, 100 - s),
      mean: list.reduce((x, y) => x + y.mean, 0) / n,
      heavySide: s >= 50 ? first : second,
      worstMm: { a: list.reduce((x, y) => x + y.worstMm.a, 0) / n, b: list.reduce((x, y) => x + y.worstMm.b, 0) / n },
    },
    spread: Math.max(...shares) - Math.min(...shares),
  };
}

/** Average of one or more photos of the same face. Null for an empty list. */
export function combineCentering(results: CenteringResult[]): CombinedCentering | null {
  if (!results.length) return null;
  const lr = axis(results.map((r) => r.lr), "left", "right");
  const tb = axis(results.map((r) => r.tb), "top", "bottom");
  return { lr: lr.axis, tb: tb.axis, shots: results.length, spread: Math.max(lr.spread, tb.spread), spreadLR: lr.spread, spreadTB: tb.spread };
}

export interface CombinedZone extends ZoneFinding {
  /** Photos in which this zone was flagged, and which photo the finding (crop, marks) comes from. */
  seenIn: number;
  source: number;
}

export interface CombinedCondition extends Omit<ConditionReport, "zones"> {
  shots: number;
  /** One finding per zone. Flagged only when at least half of the photos flagged it. */
  zones: CombinedZone[];
  /** Flags seen in fewer than half of the photos: shown, but they do not lower the ceiling. */
  unconfirmed: CombinedZone[];
}

const RANK = { minor: 1, moderate: 2, heavy: 3 } as const;

/** Merge the corner/edge reports of several photos of the same face. Null for an empty list. */
export function combineCondition(reports: ConditionReport[]): CombinedCondition | null {
  if (!reports.length) return null;
  const n = reports.length;
  const zones: CombinedZone[] = [];
  const unconfirmed: CombinedZone[] = [];
  for (const id of ZONES as readonly ZoneId[]) {
    const all = reports.map((r, i) => ({ z: r.zones.find((z) => z.zone === id)!, i })).filter((x) => x.z);
    if (!all.length) continue;
    const flagged = all.filter((x) => x.z.status === "flagged");
    // The strongest finding stands for the zone.
    flagged.sort((a, b) => RANK[zoneSeverity(b.z) ?? "minor"] - RANK[zoneSeverity(a.z) ?? "minor"]);
    if (flagged.length && flagged.length * 2 >= n) {
      zones.push({ ...flagged[0].z, seenIn: flagged.length, source: flagged[0].i });
      continue;
    }
    // Otherwise the best-checked photo stands for it (clear beats not assessed).
    const rest = all.filter((x) => x.z.status !== "flagged");
    const pick = rest.find((x) => x.z.status === "clear" && x.z.checked.whitening && x.z.checked.contour) ?? rest.find((x) => x.z.status === "clear") ?? rest[0] ?? all[0];
    zones.push({ ...pick.z, status: pick.z.status === "flagged" ? "clear" : pick.z.status, defects: pick.z.status === "flagged" ? [] : pick.z.defects, seenIn: 0, source: pick.i });
    if (flagged.length) unconfirmed.push({ ...flagged[0].z, seenIn: flagged.length, source: flagged[0].i });
  }
  const mean = (f: (r: ConditionReport) => number) => {
    const v = reports.map(f).filter((x) => x === x);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
  };
  return {
    face: reports[0].face,
    shots: n,
    zones,
    unconfirmed,
    blurMm: mean((r) => r.blurMm),
    glareShare: mean((r) => r.glareShare),
    lightBackground: reports.every((r) => r.lightBackground),
    lightBorder: reports.every((r) => r.lightBorder),
    borderUniformity: mean((r) => r.borderUniformity),
  };
}

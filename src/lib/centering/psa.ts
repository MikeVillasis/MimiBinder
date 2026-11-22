import type { CenteringResult, PsaCenteringLimit } from "./types";

/**
 * Widely quoted PSA centering limits (as of 2026): larger border's share on each axis, at the worst point.
 * PSA 10's front standard reads "approximately 55/45". Grades 7+ may get ~5% front leeway for eye appeal,
 * which we report as a note rather than apply. Sources in docs/research/PSA grade prediction from photos.md.
 */
export const PSA_CENTERING: readonly PsaCenteringLimit[] = [
  { grade: 10, label: "Gem Mint", frontMax: 55, backMax: 75 },
  { grade: 9, label: "Mint", frontMax: 60, backMax: 90 },
  { grade: 8, label: "NM-MT", frontMax: 65, backMax: 90 },
  { grade: 7, label: "NM", frontMax: 70, backMax: 90 },
  { grade: 6, label: "EX-MT", frontMax: 80, backMax: 90 },
  { grade: 5, label: "EX", frontMax: 85, backMax: 90 },
  { grade: 3, label: "VG", frontMax: 90, backMax: 90 },
];

export interface PsaCeiling {
  /** Highest grade both measured faces allow (1 when even the lowest limit is exceeded). */
  grade: number;
  label: string;
  /** What limits it, e.g. "front left/right 61.2/38.8". Undefined when nothing limits it below 10. */
  limitedBy?: string;
  /** Whether each face was measured. An unmeasured face is not a limit (UI must say so). */
  measured: { front: boolean; back: boolean };
}

/** Best PSA grade the measured centering allows. Pass null for a face that was not measured. */
export function psaCeiling(front: CenteringResult | null, back: CenteringResult | null): PsaCeiling {
  const EPS = 1e-6;
  const axes: { face: "front" | "back"; name: string; ratio: number }[] = [];
  for (const [face, r] of [["front", front], ["back", back]] as const) {
    if (!r) continue;
    axes.push({ face, name: "left/right", ratio: r.lr.worst }, { face, name: "top/bottom", ratio: r.tb.worst });
  }
  const measured = { front: front !== null, back: back !== null };
  const limit = (l: PsaCenteringLimit, face: "front" | "back") => (face === "front" ? l.frontMax : l.backMax);
  const describe = (a: (typeof axes)[number]) => `${a.face} ${a.name} ${a.ratio.toFixed(1)}/${(100 - a.ratio).toFixed(1)}`;
  let prevFail: (typeof axes)[number] | undefined;
  for (const l of PSA_CENTERING) {
    // The axis that misses this grade by the most (relative to its own limit), if any.
    let worst: (typeof axes)[number] | undefined;
    let worstExcess = 0;
    for (const a of axes) {
      const excess = a.ratio - limit(l, a.face);
      if (excess > EPS && (!worst || excess > worstExcess)) { worst = a; worstExcess = excess; }
    }
    if (!worst) return { grade: l.grade, label: l.label, limitedBy: prevFail && describe(prevFail), measured };
    prevFail = worst;
  }
  return { grade: 1, label: "Poor", limitedBy: prevFail && describe(prevFail), measured };
}

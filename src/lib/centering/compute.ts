// Worst-point centering from border lines. Lines may be tilted (diamond cut, user-dragged), so each border's
// width is a function of position along the side; the ratio is evaluated at many positions and the worst kept.
import type { AxisCentering, BorderFit, CenteringResult, Line, Side } from "./types";
import { lineXAtY, lineYAtX } from "./geometry";

/** Corner zone (mm) skipped at each end of a side: Pokémon cards have ~3 mm corner radii. */
export const CORNER_ZONE_MM = 3;
const SAMPLES = 101;

function axis(
  outerA: Line, innerA: Line, innerB: Line, outerB: Line,
  /** Lines bounding the sampled range on the other axis (outer and inner of each end). */
  endOuter1: Line, endInner1: Line, endInner2: Line, endOuter2: Line,
  vertical: boolean, pxPerMm: number, sideA: Side, sideB: Side,
): AxisCentering {
  // For left/right (vertical lines), positions run along y; evaluate x on each line at y.
  const at = (l: Line, t: number) => (vertical ? lineXAtY(l, t) : lineYAtX(l, t));
  const endAt = (l: Line, t: number) => (vertical ? lineYAtX(l, t) : lineXAtY(l, t));
  // Midpoint of the card on this axis, to evaluate the end lines.
  const mid = (at(outerA, 0) + at(outerB, 0)) / 2;
  const zone = CORNER_ZONE_MM * pxPerMm;
  let lo = Math.max(endAt(endOuter1, mid) + zone, endAt(endInner1, mid));
  let hi = Math.min(endAt(endOuter2, mid) - zone, endAt(endInner2, mid));
  if (!(hi > lo)) {
    lo = endAt(endOuter1, mid) + zone;
    hi = endAt(endOuter2, mid) - zone;
    if (!(hi > lo)) { lo = endAt(endOuter1, mid); hi = endAt(endOuter2, mid); }
  }
  let worst = -1, sum = 0, wa = 0, wb = 0, heavy: Side = sideA;
  for (let k = 0; k < SAMPLES; k++) {
    const t = lo + ((hi - lo) * k) / (SAMPLES - 1);
    const a = Math.max(0, at(innerA, t) - at(outerA, t));
    const b = Math.max(0, at(outerB, t) - at(innerB, t));
    const tot = a + b;
    const r = tot > 0 ? (100 * Math.max(a, b)) / tot : 50;
    sum += r;
    if (r > worst) { worst = r; wa = a; wb = b; heavy = a >= b ? sideA : sideB; }
  }
  return { worst, mean: sum / SAMPLES, heavySide: heavy, worstMm: { a: wa / pxPerMm, b: wb / pxPerMm } };
}

/** Worst-point and mean ratios from (possibly user-adjusted) border lines. `worstMm.a` is left/top, `b` right/bottom. */
export function computeCentering(fit: BorderFit): CenteringResult {
  const { outer, inner, pxPerMm } = fit;
  return {
    lr: axis(outer.left, inner.left, inner.right, outer.right, outer.top, inner.top, inner.bottom, outer.bottom, true, pxPerMm, "left", "right"),
    tb: axis(outer.top, inner.top, inner.bottom, outer.bottom, outer.left, inner.left, inner.right, outer.right, false, pxPerMm, "top", "bottom"),
  };
}

// Phase 2 of docs/research/PSA grade prediction from photos.md: classical corner and edge checks on the warped
// card, reported as FLAGS with evidence, never as subgrades. Pure TypeScript, Worker-safe.
//
// The card outline (four fitted cut-edge lines joined by 3 mm factory corner arcs) is "unrolled" into a strip:
// one column every 0.1 mm around the perimeter, one row every 0.05 mm from 1.3 mm outside the cut to 2 mm
// inside it, in CIELAB. Everything is then measured against the card's own colours in that strip:
// - Border reference: the local median colour deep in the printed border (0.6–0.9 of its width), with its own
//   spread and its own excursions toward white (photo noise, silver texture, mottled blue). Table reference:
//   0.6–1.2 mm outside the cut.
// - Whitening: pixels in a thin band just inside the cut that moved from the border colour toward paper white by
//   much more than the border itself ever does, and that end inside the band. Strongest on the blue back. Not
//   assessable where the border is itself near white (silver), where there is no printed border (full art) or
//   under glare; that is reported instead of guessed.
// - Missing material (edge chips and notches, worn or dinged corner tips): where the table shows through inside
//   the outline. On edges this is the residual from a straight line re-fitted to the cut; on corners it is the
//   residual from the 3 mm arc, minus what all four corners share (a slightly different factory radius is not
//   a defect).
// - Glare (saturated pixels) and blur (width of the cut-edge step) mask zones out rather than raise flags.
// All thresholds are UNCALIBRATED: they were chosen conservatively on synthetic defects (testing/defects.ts),
// not fitted to cards with known grades. See CONDITION_THRESHOLDS and docs/proposals/GRADING_V2.md.
import type { BorderFit, Face, Line, Point, RGBAImage, Side, WarpResult } from "./types";
import { rgbToLab } from "./image";
import { intersect, lineXAtY, lineYAtX, nlineThrough, robustLine } from "./geometry";

export type CornerId = "tl" | "tr" | "br" | "bl";
export type ZoneId = `corner-${CornerId}` | `edge-${Side}`;
export const ZONES: readonly ZoneId[] = ["corner-tl", "corner-tr", "corner-br", "corner-bl", "edge-top", "edge-right", "edge-bottom", "edge-left"];

/** whitening: paper showing at the cut. chipping: a notch in a straight edge. cornerLoss: a worn or dinged corner tip. */
export type DefectKind = "whitening" | "chipping" | "cornerLoss";
export type Severity = "minor" | "moderate" | "heavy";
/**
 * Why a check did not run: glare; blur; lightBorder (border too close to paper white, e.g. silver); noBorder (no
 * printed border found: full art, or the frame line could not be fitted); thinBorder; lowContrast (the cut edge
 * cannot be told from the table).
 */
export type SkipReason = "glare" | "blur" | "lightBorder" | "noBorder" | "thinBorder" | "lowContrast";

export interface Defect {
  kind: DefectKind;
  severity: Severity;
  /** Length along the outline, mm (sum of all spots of this kind in the zone). */
  lengthMm: number;
  /** Deepest point, mm inside the cut. */
  depthMm: number;
  /** Affected area, mm². */
  areaMm2: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ZoneFinding {
  zone: ZoneId;
  /** flagged: at least one defect. clear: checked, nothing found. notAssessed: neither check could run. */
  status: "clear" | "flagged" | "notAssessed";
  /** Which checks ran on this zone. */
  checked: { whitening: boolean; contour: boolean };
  /** Why a check did not run (empty when both ran). */
  skipped: SkipReason[];
  defects: Defect[];
  /** Evidence crop on the warped canvas (px). Corners: the corner. Edges: the worst spot, else the middle. */
  crop: Rect;
  /** Outline segments of each flagged spot (warped-canvas px), pushed just outside the cut so they do not hide it. */
  marks: Point[][];
}

export interface ConditionReport {
  face: Face;
  zones: ZoneFinding[];
  /** Estimated blur of the cut edge (Gaussian sigma, mm on the card). NaN when it could not be measured. */
  blurMm: number;
  /** Share of outline columns touched by glare. */
  glareShare: number;
  /** True when the table is lighter than the border: thin whitening right at the cut cannot be told from it. */
  lightBackground: boolean;
  /** True when the border is too close to paper white for a whitening check (silver, white). */
  lightBorder: boolean;
  /** Share (0..1) of the outline that has a plain printed border (low = full art or an unreadable frame). */
  borderUniformity: number;
}

/** Uncalibrated, conservative thresholds. Units in the names. Triples are [minor, moderate, heavy]. */
export const CONDITION_THRESHOLDS = {
  calibrated: false as const,
  /** Whitened area in a corner zone, mm². */
  cornerWhiteningMm2: [0.06, 0.8, 4] as const,
  /** Whitened length along an edge zone, mm. */
  edgeWhiteningMm: [1.0, 5, 20] as const,
  /** Depth of a notch in a straight edge, mm (the minor level also grows with blur). */
  chipDepthMm: [0.15, 0.4, 0.9] as const,
  /** Corner contour inside the factory arc, mm (the minor level also grows with blur). */
  cornerLossMm: [0.3, 0.6, 1.0] as const,
  /** A whitened or notched spot shorter than this along the outline is treated as noise, mm. */
  minSpotMm: 0.3,
  /** Notches adding up to more than this along one edge are not chips: the cut edge was misread there, mm. */
  maxChipLengthMm: 6,
  /** Blur (sigma, mm) above which corners and edges are not assessed. */
  maxBlurMm: 0.2,
  /** Zone glare share (highlight plus its 3 mm halo) above which the zone's checks are skipped. */
  maxGlareShare: 0.1,
  /** Smallest toward-white colour shift (ΔE) that can count as whitening, and the smallest share of the way to white. */
  minWhiteShift: 12,
  minWhiteShare: 0.28,
  /** Largest border spread (ΔE) that still counts as a plain printed border. */
  maxBorderSpread: 8,
};

const R_MM = 3; // factory corner radius
const DS = 0.1; // mm between strip columns
const DD = 0.05; // mm between strip rows
const D_MAX = 2.0;
const EXT_MM = 2; // straight edge on each side of the arc that belongs to the corner zone
const WIN = 15; // ± columns (1.5 mm) for local reference colours

interface Outline {
  n: number;
  x: Float32Array;
  y: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
  /** 0 top, 1 TR arc, 2 right, 3 BR arc, 4 bottom, 5 BL arc, 6 left, 7 TL arc. */
  seg: Uint8Array;
  /** mm from the side's start corner (straight) or arc angle 0..π/2 (arc). */
  u: Float32Array;
  /** First column of each of the 8 segments, plus n. */
  start: number[];
  sideLenMm: number[];
  corners: Point[];
}

const SIDE_ORDER: Side[] = ["top", "right", "bottom", "left"];
const CORNER_AFTER: CornerId[] = ["tr", "br", "bl", "tl"]; // corner at the end of each side, clockwise

function buildOutline(fit: BorderFit): Outline | null {
  const p = fit.pxPerMm;
  const nl = (l: Line) => nlineThrough(l.a, l.b);
  const L = { left: nl(fit.outer.left), right: nl(fit.outer.right), top: nl(fit.outer.top), bottom: nl(fit.outer.bottom) };
  const tl = intersect(L.left, L.top), tr = intersect(L.top, L.right), br = intersect(L.right, L.bottom), bl = intersect(L.bottom, L.left);
  if (!tl || !tr || !br || !bl) return null;
  const corners = [tl, tr, br, bl];
  const xs: number[] = [], ys: number[] = [], nxs: number[] = [], nys: number[] = [], segs: number[] = [], us: number[] = [];
  const start: number[] = [];
  const sideLenMm: number[] = [];
  const dirs = corners.map((a, i) => {
    const b = corners[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { tx: (b.x - a.x) / len, ty: (b.y - a.y) / len, len };
  });
  const nArc = Math.round((R_MM * Math.PI) / 2 / DS);
  for (let i = 0; i < 4; i++) {
    const a = corners[i], d = dirs[i], dn = dirs[(i + 1) % 4];
    const lenMm = d.len / p;
    if (lenMm < 4 * R_MM) return null;
    sideLenMm.push(lenMm);
    start.push(xs.length);
    // Inward normal for a clockwise outline with y down.
    const inx = -d.ty, iny = d.tx;
    for (let u = R_MM + DS / 2; u < lenMm - R_MM; u += DS) {
      xs.push(a.x + d.tx * u * p); ys.push(a.y + d.ty * u * p); nxs.push(inx); nys.push(iny); segs.push(2 * i); us.push(u);
    }
    start.push(xs.length);
    const b = corners[(i + 1) % 4];
    const cx = b.x - d.tx * R_MM * p + dn.tx * R_MM * p, cy = b.y - d.ty * R_MM * p + dn.ty * R_MM * p;
    for (let k = 0; k < nArc; k++) {
      const phi = ((k + 0.5) / nArc) * (Math.PI / 2);
      const c = Math.cos(phi), s = Math.sin(phi);
      const ox = -dn.tx * c + d.tx * s, oy = -dn.ty * c + d.ty * s; // outward
      xs.push(cx + ox * R_MM * p); ys.push(cy + oy * R_MM * p); nxs.push(-ox); nys.push(-oy); segs.push(2 * i + 1); us.push(phi);
    }
  }
  start.push(xs.length);
  return {
    n: xs.length, x: Float32Array.from(xs), y: Float32Array.from(ys), nx: Float32Array.from(nxs), ny: Float32Array.from(nys),
    seg: Uint8Array.from(segs), u: Float32Array.from(us), start, sideLenMm, corners,
  };
}

function medianOf(v: number[]): number {
  if (!v.length) return NaN;
  v.sort((a, b) => a - b);
  const h = v.length >> 1;
  return v.length % 2 ? v[h] : 0.5 * (v[h - 1] + v[h]);
}

/** Circular running quantile (0.5 = median) of a per-column channel. */
function runningQuantile(src: Float32Array, n: number, win: number, q = 0.5): Float32Array {
  const out = new Float32Array(n);
  const buf = new Float64Array(2 * win + 1);
  for (let i = 0; i < n; i++) {
    for (let j = -win; j <= win; j++) buf[j + win] = src[(i + j + n) % n];
    buf.sort();
    const pos = q * (buf.length - 1), lo = Math.floor(pos);
    out[i] = lo + 1 < buf.length ? buf[lo] + (buf[lo + 1] - buf[lo]) * (pos - lo) : buf[lo];
  }
  return out;
}

interface Run {
  from: number; // column index (may be negative or ≥ n for zones that wrap; use mod n)
  to: number; // inclusive
}

/** Runs of marked columns in the half-open column range [a, b), bridging gaps of one column. */
function runsIn(mark: Uint8Array, a: number, b: number, n: number, minCols: number): Run[] {
  const out: Run[] = [];
  let s = 0, last = 0, open = false;
  for (let i = a; i < b; i++) {
    if (mark[((i % n) + n) % n]) {
      if (!open) { s = i; open = true; }
      last = i;
    } else if (open && i - last > 1) {
      if (last - s + 1 >= minCols) out.push({ from: s, to: last });
      open = false;
    }
  }
  if (open && last - s + 1 >= minCols) out.push({ from: s, to: last });
  return out;
}

const sev = (v: number, t: readonly [number, number, number]): Severity | null => (v >= t[2] ? "heavy" : v >= t[1] ? "moderate" : v >= t[0] ? "minor" : null);

/** Per-column internals, for tests and tuning only. */
export interface ConditionDebug {
  n: number;
  seg: Uint8Array;
  u: Float32Array;
  colW: Float32Array;
  bL: Float32Array; ba: Float32Array; bb: Float32Array;
  gL: Float32Array; ga: Float32Array; gb: Float32Array;
  spread: Float32Array;
  contrast: Float32Array;
  bnd: Float32Array;
  base: Float32Array;
  missing: Float32Array;
  whiteDepth: Float32Array;
  whiteOk: Uint8Array;
  glare: Uint8Array;
  vLen: Float32Array;
  tol: Float32Array;
  guard: Uint8Array;
}

/**
 * Corner and edge flags for one warped face. `fit.outer` gives the cut edge (possibly user-adjusted) and
 * `fit.inner` the border width, which bounds how deep the whitening band and the border reference may go.
 */
export function assessCondition(warp: WarpResult, fit: BorderFit, face: Face, debug?: (d: ConditionDebug) => void): ConditionReport {
  const T = CONDITION_THRESHOLDS;
  const p = warp.pxPerMm;
  const img = warp.image;
  const ol = buildOutline(fit);
  if (!ol) {
    return {
      face, blurMm: NaN, glareShare: 0, lightBackground: false, lightBorder: false, borderUniformity: 0,
      zones: ZONES.map((zone) => ({ zone, status: "notAssessed", checked: { whitening: false, contour: false }, skipped: ["lowContrast"], defects: [], crop: { x: 0, y: 0, w: img.width, h: img.height }, marks: [] })),
    };
  }
  const n = ol.n;
  const dMin = -Math.min(1.3, warp.marginPx / p - 0.1);
  const rows = Math.round((D_MAX - dMin) / DD) + 1;
  const rowOf = (d: number) => Math.max(0, Math.min(rows - 1, Math.round((d - dMin) / DD)));
  const dOf = (j: number) => dMin + j * DD;

  // ---- Unrolled strip in Lab, lightly smoothed -----------------------------------------------------------------
  const lab = new Float32Array(n * rows * 3);
  const sat = new Uint8Array(n * rows);
  sampleStrip(img, ol, p, dMin, rows, lab, sat);
  smoothStrip(lab, n, rows);
  const at = (i: number, j: number) => (i * rows + j) * 3;

  // ---- Border width per column (mm), from the fitted frame lines ------------------------------------------------
  // A side has a printed border when its frame line was found (or, for hand-built fits, when the side is trusted).
  const sideW = SIDE_ORDER.map((s) => ((fit.innerQuality ? fit.innerQuality[s] >= 0.2 : fit.quality[s] >= 0.3) ? borderWidthMm(fit, s) : NaN));
  const colW = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const sg = ol.seg[i];
    if (sg % 2 === 0) colW[i] = sideW[sg / 2];
    else {
      const a = sideW[(sg - 1) / 2], b = sideW[((sg + 1) / 2) % 4];
      colW[i] = a === a && b === b ? Math.min(a, b) : NaN;
    }
  }
  // The whitening band and the border reference scale with the border (defaults for the rare unknown width).
  // Two candidate reference bands per column:
  //   deep    0.6–0.9 of the border width, with a whitening band up to 0.45 of it (most sides);
  //   shallow 0.22–0.4 of the width, with a band up to 0.2 of it, for where small print sits in the deep band
  //           (bottom border from Sword & Shield on: on real scans the print lies about 1.0–1.8 mm from the cut).
  // The deep one is used wherever it is plain; the shallow one is the fallback.
  const wOf = (i: number) => (colW[i] === colW[i] ? colW[i] : 2.2);
  const BANDS = [
    { lo: (i: number) => Math.min(1.3, 0.6 * wOf(i)), hi: (i: number) => Math.min(1.9, 0.9 * wOf(i)), end: (i: number) => Math.min(1.1, 0.45 * wOf(i)) },
    { lo: (i: number) => Math.min(0.9, 0.22 * wOf(i)), hi: (i: number) => Math.min(1.5, 0.4 * wOf(i)), end: (i: number) => Math.min(0.8, 0.2 * wOf(i)) - 0.03 },
  ];

  // ---- Per-column references --------------------------------------------------------------------------------------
  // Medians across the band, then across neighbouring columns: thin strokes of print and table texture do not
  // shift the references. Spread = median ΔE of the band to its own reference, pooled the same way.
  const bandRows = (k: number, i: number): [number, number] => { const j0 = rowOf(BANDS[k].lo(i)); return [j0, Math.max(j0 + 1, rowOf(BANDS[k].hi(i)))]; };
  const reference = (rowsOf: (i: number) => [number, number]) => {
    const raw = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    const v: number[] = [];
    for (let i = 0; i < n; i++) {
      const [j0, j1] = rowsOf(i);
      for (let c = 0; c < 3; c++) {
        v.length = 0;
        for (let j = j0; j <= j1; j++) v.push(lab[at(i, j) + c]);
        raw[c][i] = medianOf(v);
      }
    }
    const L = runningQuantile(raw[0], n, WIN), a = runningQuantile(raw[1], n, WIN), b = runningQuantile(raw[2], n, WIN);
    const col = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [j0, j1] = rowsOf(i);
      v.length = 0;
      for (let j = j0; j <= j1; j++) { const o = at(i, j); v.push(Math.hypot(lab[o] - L[i], lab[o + 1] - a[i], lab[o + 2] - b[i])); }
      col[i] = medianOf(v);
    }
    return { L, a, b, spread: runningQuantile(col, n, WIN) };
  };
  const refs = [reference((i) => bandRows(0, i)), reference((i) => bandRows(1, i))];
  const jg0 = rowOf(Math.max(dMin, -1.2)), jg1 = rowOf(-0.6);
  const table = reference(() => [jg0, jg1]);
  const gL = table.L, ga = table.a, gb = table.b;
  const bL = new Float32Array(n), ba = new Float32Array(n), bb = new Float32Array(n), spread = new Float32Array(n);
  const which = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const k = refs[0].spread[i] < T.maxBorderSpread || refs[1].spread[i] >= refs[0].spread[i] ? 0 : 1;
    which[i] = k;
    bL[i] = refs[k].L[i]; ba[i] = refs[k].a[i]; bb[i] = refs[k].b[i]; spread[i] = refs[k].spread[i];
  }
  const bandEnd = (i: number) => BANDS[which[i]].end(i);
  const dBorder = (i: number, o: number) => Math.hypot(lab[o] - bL[i], lab[o + 1] - ba[i], lab[o + 2] - bb[i]);
  const dTable = (i: number, o: number) => Math.hypot(lab[o] - gL[i], lab[o + 1] - ga[i], lab[o + 2] - gb[i]);

  // Toward-white direction per column: v = (white − border). `toward` = how far a pixel moved along it (ΔE).
  const vL = new Float32Array(n), vLen = new Float32Array(n), contrast = new Float32Array(n);
  // Border too close to paper white to show whitening: any colourless border that is not dark (silver, grey,
  // white). Deliberately broad, so a silver border in a dim or unevenly lit photo is still recognised.
  const pale = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    vL[i] = Math.min(96, Math.max(bL[i] + 30, 88)) - bL[i];
    vLen[i] = Math.hypot(vL[i], ba[i], bb[i]) || 1;
    contrast[i] = Math.hypot(gL[i] - bL[i], ga[i] - ba[i], gb[i] - bb[i]);
    if ((Math.hypot(ba[i], bb[i]) < 12 && bL[i] > 40) || vLen[i] < 26) pale[i] = 1;
  }
  const toward = (i: number, o: number) => ((lab[o] - bL[i]) * vL[i] - (lab[o + 1] - ba[i]) * ba[i] - (lab[o + 2] - bb[i]) * bb[i]) / vLen[i];
  /**
   * Paper-white-like relative to the border: far enough along the white direction, near that line, and not
   * darker. On a dark border (blue back) paper is much lighter, so the lightness must rise with the shift;
   * that rejects pixels that only lost colour (a blurred mix with a grey or brown table, a shadow). On a light
   * border (yellow) paper is barely lighter and the exposure is unknown, so "not darker" is all that is asked.
   */
  const whiteLike = (i: number, o: number, minShift: number): boolean => {
    const along = toward(i, o);
    if (along < minShift || along < T.minWhiteShare * vLen[i]) return false;
    const t = along / vLen[i];
    const eL = lab[o] - bL[i];
    const off = Math.hypot(eL - t * vL[i], lab[o + 1] - ba[i] + t * ba[i], lab[o + 2] - bb[i] + t * bb[i]);
    if (off > 0.5 * along + 5) return false;
    const dark = Math.max(0, Math.min(1, (65 - bL[i]) / 20));
    return eL >= 0.6 * t * vL[i] * dark - 3;
  };

  // The border's own largest excursions toward white (mottled blue, sheen), pooled as a local 90th percentile:
  // the whitening tolerance must clear them as well as the spread.
  const colExc = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [j0, j1] = bandRows(which[i], i);
    let mx = 0;
    for (let j = j0; j <= j1; j++) { const t = toward(i, at(i, j)); if (t > mx) mx = t; }
    colExc[i] = mx;
  }
  const exc = runningQuantile(colExc, n, WIN, 0.9);
  const tol = new Float32Array(n);
  const plain = new Uint8Array(n); // a printed border of known width and uniform colour
  let plainCols = 0, lightCols = 0;
  for (let i = 0; i < n; i++) {
    if (colW[i] === colW[i] && spread[i] < T.maxBorderSpread) { plain[i] = 1; plainCols++; }
    lightCols += pale[i];
  }
  for (let i = 0; i < n; i++) tol[i] = Math.max(T.minWhiteShift, 4.5 * spread[i], 1.6 * exc[i]);

  // ---- Cut boundary per column: where the table stops showing ------------------------------------------------------
  /** > 0 when the pixel is table-coloured: clearly not border, and at least twice as close to the table. */
  const tableLike = (i: number, j: number): number => {
    const o = at(i, j);
    const dB = dBorder(i, o);
    if (dB <= Math.max(10, 4 * spread[i])) return -1;
    return 0.5 * dB - dTable(i, o);
  };
  const jScan0 = rowOf(-0.6), jScan1 = rowOf(1.4);
  const bnd = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!plain[i] || contrast[i] < 15) continue;
    for (let j = jScan0; j <= jScan1 - 2; j++) {
      if (tableLike(i, j) > 0 || tableLike(i, j + 1) > 0 || tableLike(i, j + 2) > 0) continue;
      // Sub-row position from the last table-like row (the test "table-like" is r < 1/3 with r = dT/(dB+dT)).
      let frac = 0;
      if (j > jScan0) {
        const r = (o: number) => { const dB = dBorder(i, o), dG = dTable(i, o); return dG / (dB + dG + 1e-6); };
        const r1 = r(at(i, j - 1)), r0 = r(at(i, j));
        if (r0 > r1 && r1 < 1 / 3 && r0 >= 1 / 3) frac = (1 / 3 - r1) / (r0 - r1) - 1;
      }
      bnd[i] = dOf(j) + frac * DD;
      break;
    }
  }

  // ---- Glare: saturated pixels deep in the border ---------------------------------------------------------------------
  // Only highlights 0.8 mm or more inside the cut count: clipped white right at the cut is what heavy whitening
  // looks like in a bright photo and must stay visible. A highlight's unsaturated halo is much wider than its
  // clipped core, so the mask is grown by 3 mm along the outline.
  const glare = new Uint8Array(n);
  {
    const j0 = rowOf(0.8), j1 = rowOf(1.8);
    for (let i = 0; i < n; i++) {
      let hit = false;
      for (let j = j0; j <= j1; j++) if (sat[i * rows + j]) { hit = true; break; }
      if (hit) for (let k = -30; k <= 30; k++) glare[(i + k + n) % n] = 1;
    }
  }
  let glareCols = 0;
  for (let i = 0; i < n; i++) { glareCols += glare[i]; if (glare[i]) bnd[i] = NaN; }

  // ---- Straight baselines and missing material ---------------------------------------------------------------------
  const missing = new Float32Array(n).fill(NaN); // mm the boundary sits inside the baseline
  const base = new Float32Array(n); // where the cut should be (mm from the given outline)
  const sideFit: { a: number; b: number; ok: boolean }[] = [];
  for (let s = 0; s < 4; s++) {
    const a = ol.start[2 * s], b = ol.start[2 * s + 1];
    // Every 6th column is plenty for a straight line (the pair RANSAC is quadratic in the point count).
    const STEP = 6;
    const m = Math.ceil((b - a) / STEP);
    const U = new Float64Array(m), D = new Float64Array(m);
    let valid = 0;
    for (let k = 0; k < m; k++) { const i = a + k * STEP; U[k] = ol.u[i]; D[k] = bnd[i]; if (bnd[i] === bnd[i]) valid++; }
    const f = valid >= 20 ? robustLine(U, D, { thresh: 0.08, maxSlope: 0.02 }) : null;
    const ok = !!f && f.inliers >= 0.4 * m && Math.abs(f.a + f.b * (ol.sideLenMm[s] / 2)) < 0.8;
    sideFit.push(f && ok ? { a: f.a, b: f.b, ok } : { a: 0, b: 0, ok: false });
    for (let i = a; i < b; i++) {
      base[i] = sideFit[s].a + sideFit[s].b * ol.u[i];
      if (ok && bnd[i] === bnd[i]) missing[i] = bnd[i] - base[i];
    }
  }
  // Arcs: the baseline is the corner shifted by the two adjacent side offsets.
  const nArc = ol.start[2] - ol.start[1];
  const arcRaw = new Float32Array(4 * nArc).fill(NaN);
  for (let s = 0; s < 4; s++) {
    const a = ol.start[2 * s + 1];
    const f0 = sideFit[s], f1 = sideFit[(s + 1) % 4];
    const o0 = f0.a + f0.b * (ol.sideLenMm[s] - R_MM), o1 = f1.a + f1.b * R_MM;
    for (let k = 0; k < nArc; k++) {
      const i = a + k, phi = ol.u[i];
      base[i] = o0 * Math.cos(phi) + o1 * Math.sin(phi);
      if (f0.ok && f1.ok && bnd[i] === bnd[i]) arcRaw[s * nArc + k] = bnd[i] - base[i];
    }
  }
  // What all four corners share at the same arc position is the factory shape, not damage.
  for (let k = 0; k < nArc; k++) {
    const vals: number[] = [];
    for (let s = 0; s < 4; s++) { const v = arcRaw[s * nArc + k]; if (v === v) vals.push(v); }
    const common = vals.length >= 3 ? Math.max(0, Math.min(0.2, medianOf(vals))) : 0;
    for (let s = 0; s < 4; s++) { const v = arcRaw[s * nArc + k]; if (v === v) missing[ol.start[2 * s + 1] + k] = v - common; }
  }

  // ---- Blur: width of the cut-edge step ------------------------------------------------------------------------------
  const blurMm = estimateBlur(lab, ol, rows, dMin, bL, ba, bb, gL, ga, gb, contrast, bnd);
  const blurOk = !(blurMm > T.maxBlurMm);
  const sigma = blurMm === blurMm ? blurMm : 0.1;

  // ---- Whitening per column ----------------------------------------------------------------------------------------------
  const whiteDepth = new Float32Array(n); // mm of whitened pixels in the band
  const whiteMax = new Float32Array(n); // deepest whitened pixel, mm from the cut
  const whiteOk = new Uint8Array(n); // column could be checked
  const guard = new Uint8Array(n); // something whiter than the border lies just outside the cut here
  for (let i = 0; i < n; i++) {
    // Table (or a stray object) just outside the cut that would itself pass for whitened border: a blurred cut
    // then looks like thin whitening, so the band must start further in.
    const j0 = rowOf(base[i] - 0.6), j1 = rowOf(base[i] - 0.05);
    for (let j = j0; j <= j1; j++) if (whiteLike(i, at(i, j), 0.6 * tol[i])) { for (let k = -4; k <= 4; k++) guard[(i + k + n) % n] = 1; break; }
  }
  // The band of each checkable column: from the cut (further in when guarded) to the band's far end.
  const bandFrom = new Int32Array(n).fill(-1), bandTo = new Int32Array(n), edgeAt = new Float32Array(n);
  let guardCols = 0;
  for (let i = 0; i < n; i++) {
    guardCols += guard[i];
    // Needs a plain printed border that is not itself near white and wide enough, and no glare.
    if (!plain[i] || pale[i] || glare[i] || colW[i] < 0.7) continue;
    whiteOk[i] = 1;
    const edge = bnd[i] === bnd[i] ? Math.max(bnd[i], base[i]) : base[i];
    const d0 = guard[i] ? edge + 0.08 + 2 * sigma : bnd[i] === bnd[i] ? edge : edge + 0.05 + sigma;
    edgeAt[i] = edge;
    bandFrom[i] = rowOf(d0);
    bandTo[i] = rowOf(edge + bandEnd(i));
  }
  // A blotchy border (the mottled blue of a card back) is blotchy all the way round, and a light blotch can sit
  // in the band where the reference band beside it happens to be dark. So the tolerance also clears what the
  // band itself typically shows around the whole card (its upper quartile, which wear on a few spots does not
  // move). Capped at 45% of the way to white, so a card worn all the way round still gets flagged.
  {
    const v: number[] = [];
    for (let i = 0; i < n; i++) {
      if (bandFrom[i] < 0) continue;
      let mx = 0;
      for (let j = bandFrom[i]; j <= bandTo[i]; j++) { if (tableLike(i, j) > 0) continue; const t = toward(i, at(i, j)); if (t > mx) mx = t; }
      v.push(mx);
    }
    v.sort((a, b) => a - b);
    const typical = v.length ? v[Math.floor(0.75 * (v.length - 1))] : 0;
    for (let i = 0; i < n; i++) tol[i] = Math.max(tol[i], Math.min(1.5 * typical, 0.45 * vLen[i]));
  }
  for (let i = 0; i < n; i++) {
    if (bandFrom[i] < 0) continue;
    const j0 = bandFrom[i], j1 = bandTo[i], edge = edgeAt[i];
    let cnt = 0, deep = 0, last = -9;
    for (let j = j0; j <= j1; j++) {
      if (sat[i * rows + j] && guard[i]) continue;
      if (!whiteLike(i, at(i, j), tol[i])) continue;
      if (tableLike(i, j) > 0) continue; // table showing through is missing material, not whitening
      cnt++;
      last = j;
      deep = dOf(j) - edge;
    }
    // Wear is attached to the cut and ends inside the band. A light patch that runs out of the band's far end
    // is sheen (or wear too deep to tell apart from it), so it is not counted.
    if (cnt >= 2 && last < j1 - 1) { whiteDepth[i] = cnt * DD; whiteMax[i] = Math.max(DD, deep); }
  }

  // ---- Zones ----------------------------------------------------------------------------------------------------------------
  const minCols = Math.round(T.minSpotMm / DS);
  const notchMin = Math.max(T.chipDepthMm[0], 0.1 + 1.2 * sigma);
  const lossMin = Math.max(T.cornerLossMm[0], 0.2 + 1.2 * sigma);
  const whiteMark = new Uint8Array(n), chipMark = new Uint8Array(n), lossMark = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (whiteDepth[i] >= 2 * DD) whiteMark[i] = 1;
    if (missing[i] >= notchMin && ol.seg[i] % 2 === 0) chipMark[i] = 1;
    if (missing[i] >= lossMin) lossMark[i] = 1;
  }
  const ext = Math.round(EXT_MM / DS);
  const mm = (v: number) => v * p;
  const col = (i: number) => ((i % n) + n) % n;
  const markPath = (r: Run): Point[] => {
    const pts: Point[] = [];
    for (let i = r.from; i <= r.to; i++) { const c = col(i); pts.push({ x: ol.x[c] - ol.nx[c] * mm(0.45), y: ol.y[c] - ol.ny[c] * mm(0.45) }); }
    return pts;
  };
  const clampRect = (x: number, y: number, w: number, h: number): Rect => {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(img.width, Math.ceil(x + w)), y1 = Math.min(img.height, Math.ceil(y + h));
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  };
  const finish = (zone: ZoneId, a: number, b: number, isCorner: boolean, crop: Rect, runCrop: (r: Run) => Rect): ZoneFinding => {
    let cols = 0, wOk = 0, cOk = 0, gl = 0, light = 0, thin = 0, pl = 0;
    for (let i = a; i < b; i++) {
      const c = col(i);
      cols++;
      wOk += whiteOk[c]; gl += glare[c]; pl += plain[c];
      if (missing[c] === missing[c]) cOk++;
      light += pale[c];
      if (colW[c] < 0.7) thin++;
    }
    const skipped: SkipReason[] = [];
    let whitening = false, contour = false;
    if (!blurOk) skipped.push("blur");
    else if (gl > T.maxGlareShare * cols) skipped.push("glare");
    else if (pl < 0.6 * cols) skipped.push("noBorder");
    else {
      whitening = wOk >= 0.6 * cols;
      contour = cOk >= 0.6 * cols;
      if (!whitening) skipped.push(light >= 0.4 * cols ? "lightBorder" : thin >= 0.4 * cols ? "thinBorder" : "glare");
      if (!contour) skipped.push("lowContrast");
    }
    const defects: Defect[] = [];
    const marks: Point[][] = [];
    const worst: { run: Run | null; size: number } = { run: null, size: 0 };
    const consider = (r: Run, size: number) => { if (size > worst.size) { worst.size = size; worst.run = r; } };
    if (whitening) {
      const runs = runsIn(whiteMark, a, b, n, minCols);
      let len = 0, area = 0, depth = 0;
      for (const r of runs) {
        let ra = 0;
        for (let i = r.from; i <= r.to; i++) { const c = col(i); ra += whiteDepth[c] * DS; depth = Math.max(depth, whiteMax[c]); }
        len += (r.to - r.from + 1) * DS; area += ra;
        consider(r, ra);
      }
      const s = isCorner ? sev(area, T.cornerWhiteningMm2) : sev(len, T.edgeWhiteningMm);
      if (s) { defects.push({ kind: "whitening", severity: s, lengthMm: len, depthMm: depth, areaMm2: area }); for (const r of runs) marks.push(markPath(r)); }
    }
    if (contour) {
      let runs = runsIn(isCorner ? lossMark : chipMark, a, b, n, isCorner ? Math.round(0.5 / DS) : minCols);
      // Notches adding up to many millimetres, or more than three of them on one edge, are not chips: the cut
      // was misread there (stripes on the table, a misplaced outline). Say the edge could not be checked.
      if (!isCorner && (runs.length > 3 || runs.reduce((t, r) => t + (r.to - r.from + 1) * DS, 0) > T.maxChipLengthMm)) { runs = []; contour = false; skipped.push("lowContrast"); }
      // A bite out of the card has intact cut on both sides of it. Where the cut cannot be read next to the
      // "bite" (the outline runs off the card, a stripe on the table), it is not evidence of damage.
      const intact = (from: number, to: number) => {
        let ok = 0;
        for (let i = from; i <= to; i++) { const m = missing[col(i)]; if (m === m && Math.abs(m) < 0.5 * notchMin) ok++; }
        return ok >= 6;
      };
      const flanked = runs.filter((r) => intact(r.from - 25, r.from - 1) && intact(r.to + 1, r.to + 25));
      if (flanked.length < runs.length) { contour = false; skipped.push("lowContrast"); }
      runs = flanked;
      let len = 0, area = 0, depth = 0;
      for (const r of runs) {
        let ra = 0;
        for (let i = r.from; i <= r.to; i++) { const c = col(i); ra += missing[c] * DS; depth = Math.max(depth, missing[c]); }
        len += (r.to - r.from + 1) * DS; area += ra;
        consider(r, ra * 4);
      }
      const s = runs.length ? sev(depth, isCorner ? [lossMin, T.cornerLossMm[1], T.cornerLossMm[2]] : [notchMin, T.chipDepthMm[1], T.chipDepthMm[2]]) : null;
      if (s) { defects.push({ kind: isCorner ? "cornerLoss" : "chipping", severity: s, lengthMm: len, depthMm: depth, areaMm2: area }); for (const r of runs) marks.push(markPath(r)); }
    }
    const status = defects.length ? "flagged" : whitening || contour ? "clear" : "notAssessed";
    return { zone, status, checked: { whitening, contour }, skipped: [...new Set(skipped)], defects, crop: !isCorner && worst.run ? runCrop(worst.run) : crop, marks };
  };

  const found = new Map<ZoneId, ZoneFinding>();
  // Corners: the arc plus EXT_MM of straight edge on each side.
  for (let s = 0; s < 4; s++) {
    const a = ol.start[2 * s + 1] - ext, b = ol.start[2 * s + 2] + ext;
    const c = ol.corners[(s + 1) % 4];
    // 8 mm square: 1.3 mm of table plus 6.7 mm of card, whichever way the corner faces.
    const dirX = s === 0 || s === 1 ? -1 : 1, dirY = s === 1 || s === 2 ? -1 : 1;
    const crop = clampRect(dirX > 0 ? c.x - mm(1.3) : c.x - mm(6.7), dirY > 0 ? c.y - mm(1.3) : c.y - mm(6.7), mm(8), mm(8));
    const id: ZoneId = `corner-${CORNER_AFTER[s]}`;
    found.set(id, finish(id, a, b, true, crop, () => crop));
  }
  for (let s = 0; s < 4; s++) {
    const a = ol.start[2 * s] + ext, b = ol.start[2 * s + 1] - ext;
    // 12 mm along the edge, 1.3 mm of table plus 4.7 mm of card across it.
    const around = (c: number): Rect => {
      if (s % 2 === 0) return clampRect(ol.x[c] - mm(6), ol.ny[c] > 0 ? ol.y[c] - mm(1.3) : ol.y[c] - mm(4.7), mm(12), mm(6));
      return clampRect(ol.nx[c] > 0 ? ol.x[c] - mm(1.3) : ol.x[c] - mm(4.7), ol.y[c] - mm(6), mm(6), mm(12));
    };
    const id: ZoneId = `edge-${SIDE_ORDER[s]}`;
    found.set(id, finish(id, a, b, false, around(col((a + b) >> 1)), (r) => around(col((r.from + r.to) >> 1))));
  }
  debug?.({ n, seg: ol.seg, u: ol.u, colW, bL, ba, bb, gL, ga, gb, spread, contrast, bnd, base, missing, whiteDepth, whiteOk, glare, vLen, tol, guard });
  return {
    face,
    zones: ZONES.map((z) => found.get(z)!),
    blurMm,
    glareShare: glareCols / n,
    lightBackground: guardCols > 0.5 * n,
    lightBorder: lightCols > 0.5 * n,
    borderUniformity: plainCols / n,
  };
}

function borderWidthMm(fit: BorderFit, side: Side): number {
  const p = fit.pxPerMm;
  const o = fit.outer[side], i = fit.inner[side];
  if (side === "left" || side === "right") {
    const y = (o.a.y + o.b.y) / 2;
    return Math.abs(lineXAtY(i, y) - lineXAtY(o, y)) / p;
  }
  const x = (o.a.x + o.b.x) / 2;
  return Math.abs(lineYAtX(i, x) - lineYAtX(o, x)) / p;
}

function sampleStrip(img: RGBAImage, ol: Outline, p: number, dMin: number, rows: number, lab: Float32Array, sat: Uint8Array): void {
  const { width: W, height: H, data } = img;
  const half = (DS * p) / 4; // two taps along the tangent cover one column
  const out = [0, 0, 0];
  for (let i = 0; i < ol.n; i++) {
    const nx = ol.nx[i], ny = ol.ny[i];
    const tx = -ny, ty = nx;
    for (let j = 0; j < rows; j++) {
      const d = (dMin + j * DD) * p;
      const cx = ol.x[i] + nx * d, cy = ol.y[i] + ny * d;
      let r = 0, g = 0, b = 0, mn = 255;
      for (let k = -1; k <= 1; k += 2) {
        let fx = cx + tx * half * k - 0.5, fy = cy + ty * half * k - 0.5;
        fx = fx < 0 ? 0 : fx > W - 1.001 ? W - 1.001 : fx;
        fy = fy < 0 ? 0 : fy > H - 1.001 ? H - 1.001 : fy;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
        const o = (y0 * W + x0) * 4, o2 = o + W * 4;
        const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
        const rr = data[o] * w00 + data[o + 4] * w10 + data[o2] * w01 + data[o2 + 4] * w11;
        const gg = data[o + 1] * w00 + data[o + 5] * w10 + data[o2 + 1] * w01 + data[o2 + 5] * w11;
        const bb = data[o + 2] * w00 + data[o + 6] * w10 + data[o2 + 2] * w01 + data[o2 + 6] * w11;
        r += rr; g += gg; b += bb;
        mn = Math.min(mn, rr, gg, bb);
      }
      rgbToLab(r / 2, g / 2, b / 2, out);
      const q = (i * rows + j) * 3;
      lab[q] = out[0]; lab[q + 1] = out[1]; lab[q + 2] = out[2];
      if (mn >= 245) sat[i * rows + j] = 1;
    }
  }
}

/** [1 2 1]/4 along both strip axes (circular along the outline). */
function smoothStrip(lab: Float32Array, n: number, rows: number): void {
  const tmp = new Float32Array(lab.length);
  const len = rows * 3;
  for (let i = 0; i < n; i++) {
    const im = ((i - 1 + n) % n) * len, ic = i * len, ip = ((i + 1) % n) * len;
    for (let k = 0; k < len; k++) tmp[ic + k] = 0.25 * lab[im + k] + 0.5 * lab[ic + k] + 0.25 * lab[ip + k];
  }
  for (let i = 0; i < n; i++) {
    const base = i * len;
    for (let j = 0; j < rows; j++) {
      const jm = Math.max(0, j - 1), jp = Math.min(rows - 1, j + 1);
      for (let c = 0; c < 3; c++) lab[base + j * 3 + c] = 0.25 * tmp[base + jm * 3 + c] + 0.5 * tmp[base + j * 3 + c] + 0.25 * tmp[base + jp * 3 + c];
    }
  }
}

/** Gaussian sigma (mm) of the cut-edge step, from the steepest slope of the table→border transition. */
function estimateBlur(
  lab: Float32Array, ol: Outline, rows: number, dMin: number,
  bL: Float32Array, ba: Float32Array, bb: Float32Array, gL: Float32Array, ga: Float32Array, gb: Float32Array,
  contrast: Float32Array, bnd: Float32Array,
): number {
  const sig: number[] = [];
  for (let i = 0; i < ol.n; i += 3) {
    if (ol.seg[i] % 2 || contrast[i] < 25 || bnd[i] !== bnd[i]) continue;
    const ux = gL[i] - bL[i], uy = ga[i] - ba[i], uz = gb[i] - bb[i];
    const len2 = ux * ux + uy * uy + uz * uz;
    const jc = Math.round((bnd[i] - dMin) / DD);
    let best = 0;
    for (let j = Math.max(1, jc - 10); j <= Math.min(rows - 2, jc + 10); j++) {
      const o0 = (i * rows + j - 1) * 3, o1 = (i * rows + j + 1) * 3;
      const da = ((lab[o0] - lab[o1]) * ux + (lab[o0 + 1] - lab[o1 + 1]) * uy + (lab[o0 + 2] - lab[o1 + 2]) * uz) / len2 / (2 * DD);
      if (da > best) best = da;
    }
    if (best > 0) sig.push(1 / (best * Math.sqrt(2 * Math.PI)));
  }
  if (sig.length < 20) return NaN;
  const s = medianOf(sig);
  // Remove what the strip's own smoothing and the central difference add.
  return Math.sqrt(Math.max(0.0004, s * s - 0.055 * 0.055));
}

// -------------------------------------------------------------------------------------------------------------------
// From flags to a "probable ceiling". A rule of thumb read off PSA's written grade descriptions (one minor flaw
// at 9, slight fraying at one or two corners at 8, …), NOT a calibrated model: the UI must say so.

export interface ConditionCeiling {
  /** Highest grade the flags plausibly allow. */
  grade: number;
  /** Zones behind it, worst first, e.g. "back top-left corner: whitening". */
  reasons: string[];
  counts: { minor: number; moderate: number; heavy: number };
}

const CORNER_NAME: Record<CornerId, string> = { tl: "top-left", tr: "top-right", br: "bottom-right", bl: "bottom-left" };
export function zoneLabel(z: ZoneId): string {
  return z.startsWith("corner-") ? `${CORNER_NAME[z.slice(7) as CornerId]} corner` : `${z.slice(5)} edge`;
}
const KIND_LABEL: Record<DefectKind, string> = { whitening: "whitening", chipping: "chipped edge", cornerLoss: "worn or dinged tip" };
export const defectLabel = (k: DefectKind) => KIND_LABEL[k];
const RANK: Record<Severity, number> = { minor: 1, moderate: 2, heavy: 3 };

/** Worst severity of a zone, or null when it has no defect. */
export function zoneSeverity(z: Pick<ZoneFinding, "defects">): Severity | null {
  let s: Severity | null = null;
  for (const d of z.defects) if (!s || RANK[d.severity] > RANK[s]) s = d.severity;
  return s;
}

/** The grade the flag counts plausibly allow. Exported so the rule is visible and testable. */
export function ceilingFromCounts(c: { minor: number; moderate: number; heavy: number }): number {
  if (c.heavy >= 2) return 4;
  if (c.heavy === 1 || c.moderate >= 3) return 5;
  if (c.moderate >= 1) return 6;
  if (c.minor >= 3) return 7;
  if (c.minor === 2) return 8;
  if (c.minor === 1) return 9;
  return 10;
}

/** Null when no zone is flagged on any given face (nothing lowers the ceiling). */
export function conditionCeiling(reports: (Pick<ConditionReport, "face" | "zones"> | null | undefined)[]): ConditionCeiling | null {
  const hits: { rank: number; text: string }[] = [];
  const counts = { minor: 0, moderate: 0, heavy: 0 };
  for (const r of reports) {
    if (!r) continue;
    for (const z of r.zones) {
      if (z.status !== "flagged") continue;
      const s = zoneSeverity(z);
      if (!s) continue;
      counts[s]++;
      hits.push({ rank: RANK[s], text: `${r.face} ${zoneLabel(z.zone)}: ${[...new Set(z.defects.map((d) => KIND_LABEL[d.kind]))].join(" and ")}` });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.rank - a.rank);
  return { grade: ceilingFromCounts(counts), reasons: hits.map((h) => h.text), counts };
}

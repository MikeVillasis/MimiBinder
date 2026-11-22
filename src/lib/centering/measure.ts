// Sub-pixel border measurement on the warped canvas.
//
// For each side, ~90 profiles perpendicular to the edge (outside the 3 mm corner radius), each averaged over 5
// canvas lines and converted to CIELAB (so silver-on-white and yellow-on-green edges both show up):
// - Outer (cut) edge: peak of the derivative magnitude of the Gaussian-smoothed Lab profile, the outermost peak of
//   at least half the strongest one, refined with a 3-point parabola.
// - Inner (printed frame) edge: colour distance ΔE to the border's own colour (sampled just inside the cut edge,
//   median over neighbouring profiles so small print or a badge cannot set it). The frame is the first point
//   1–6.5 mm in where ΔE exceeds a threshold *and stays above it* for the next 1.2 mm without dropping back to
//   border colour: small print in the bottom border (Sword & Shield onward) returns to border colour before the
//   frame and is rejected. The edge is the parabola-refined peak of dΔE/dd around that point.
// - Each side's points get a robust (RANSAC + iterated least squares) line fit, so outliers (text, badges, art
//   that matches the border colour) do not move the line. Quality = inlier share × residual penalty.
import type { BorderFit, Face, Line, Side, WarpResult } from "./types";
import { CARD_MM } from "./types";
import { rgbToLab } from "./image";
import { robustLine } from "./geometry";

interface SideGeom {
  /** Canvas coordinate of pixel index k along the profile direction (increasing d = inward). */
  len: number; // side length in canvas px (along u)
  outerPos: number; // canvas coordinate of the nominal cut edge (x for left/right, y for top/bottom)
  dir: 1 | -1; // +1 if increasing canvas coordinate = inward
  vertical: boolean; // left/right: profile runs along x, positions along y
}

function geom(side: Side, warp: WarpResult): SideGeom {
  const p = warp.pxPerMm, m = warp.marginPx;
  const W = CARD_MM.width * p, H = CARD_MM.height * p;
  switch (side) {
    case "left": return { len: H, outerPos: m, dir: 1, vertical: true };
    case "right": return { len: H, outerPos: m + W, dir: -1, vertical: true };
    case "top": return { len: W, outerPos: m, dir: 1, vertical: false };
    case "bottom": return { len: W, outerPos: m + H, dir: -1, vertical: false };
  }
}

export interface SideMeasurement {
  outer: Line;
  inner: Line;
  quality: number;
  outerQuality: number;
  innerQuality: number;
  /** Raw sub-pixel points (canvas px) for debugging/overlays. */
  outerPoints: { u: number; d: number }[];
  innerPoints: { u: number; d: number }[];
}

function gaussKernel(sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(3 * sigma));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp((-i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return k;
}

function smooth3(src: Float32Array, dst: Float32Array, n: number, k: Float32Array): void {
  const r = (k.length - 1) / 2;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0, ws = 0;
      for (let j = -r; j <= r; j++) {
        const ii = i + j;
        if (ii < 0 || ii >= n) continue;
        acc += src[ii * 3 + c] * k[j + r]; ws += k[j + r];
      }
      dst[i * 3 + c] = acc / ws;
    }
  }
}

function parabolicPeak(a: ArrayLike<number>, i: number): number {
  const y0 = a[i - 1], y1 = a[i], y2 = a[i + 1];
  const den = y0 - 2 * y1 + y2;
  if (!(den < 0)) return 0;
  const off = (0.5 * (y0 - y2)) / den;
  return off < -0.5 ? -0.5 : off > 0.5 ? 0.5 : off;
}

function median(v: number[]): number {
  if (!v.length) return NaN;
  const s = v.slice().sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : 0.5 * (s[h - 1] + s[h]);
}

/** Measure one side. Exported for tests and for re-measuring a single side after a manual nudge. */
export function measureSide(warp: WarpResult, face: Face, side: Side): SideMeasurement {
  const { image, pxPerMm: p } = warp;
  const { width: W, height: H, data } = image;
  const g = geom(side, warp);
  const N = 90;
  const uStart = 4.5 * p, uEnd = g.len - 4.5 * p;
  const innerUStart = 6.5 * p, innerUEnd = g.len - 6.5 * p;
  const dMin = -Math.min(1.6 * p, warp.marginPx - 2);
  const dMax = 7.8 * p;
  const n = Math.floor(dMax - dMin);
  const half = Math.max(2, Math.round(0.25 * p)); // average ~0.5 mm of lines (11 at 20 px/mm)
  const raw = new Float32Array(n * 3);
  const lab = new Float32Array(n * 3);
  const sm = new Float32Array(n * 3);
  const grad = new Float32Array(n);
  // Smoothing along the profile: wide enough to average photo noise, far narrower than any border, so the
  // (symmetric) blur does not move step edges.
  const kern = gaussKernel(Math.max(1, 0.1 * p));
  const kernOuter = gaussKernel(Math.max(1, 0.125 * p));
  const smRaw = new Float32Array(n * 3);
  const U = new Float64Array(N);
  const Dout = new Float64Array(N).fill(NaN);
  const profiles: Float32Array[] = [];
  const offsets: number[] = []; // d of profile index 0 (pixel centre)
  const m = warp.marginPx;

  for (let k = 0; k < N; k++) {
    const uc = uStart + ((uEnd - uStart) * k) / (N - 1); // relative to card corner along the side
    const along = Math.round(m + uc - 0.5); // pixel index of the centre line
    U[k] = along + 0.5 - m;
    // Profile pixel index i ↔ d. Start pixel = the one whose centre is nearest outerPos - dir*|dMin|.
    const startCoord = g.outerPos + g.dir * dMin; // canvas coord at d = dMin
    const startPix = g.dir === 1 ? Math.floor(startCoord) : Math.ceil(startCoord) - 1;
    const d0 = g.dir === 1 ? startPix + 0.5 - g.outerPos : g.outerPos - (startPix + 0.5);
    for (let i = 0; i < n; i++) {
      const pix = startPix + g.dir * i;
      let r = 0, gg = 0, b = 0, cnt = 0;
      for (let j = -half; j <= half; j++) {
        const a = along + j;
        const x = g.vertical ? pix : a, y = g.vertical ? a : pix;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const o = (y * W + x) * 4;
        r += data[o]; gg += data[o + 1]; b += data[o + 2]; cnt++;
      }
      if (cnt) { r /= cnt; gg /= cnt; b /= cnt; }
      raw[i * 3] = r; raw[i * 3 + 1] = gg; raw[i * 3 + 2] = b;
      rgbToLab(r, gg, b, lab, i * 3);
    }
    smooth3(lab, sm, n, kern);
    smooth3(raw, smRaw, n, kernOuter);
    profiles.push(sm.slice());
    offsets.push(d0);
    // Outer edge: RGB derivative magnitude in d ∈ [dMin, 1.2 mm] (RGB rather than Lab: Lab amplifies noise on
    // dark backgrounds, and the cut edge against the background is a large step in any space).
    const iMax = Math.min(n - 2, Math.floor(1.2 * p - d0));
    let maxG = 0;
    for (let i = 1; i <= iMax; i++) {
      let s = 0;
      for (let c = 0; c < 3; c++) { const dd = (smRaw[(i + 1) * 3 + c] - smRaw[(i - 1) * 3 + c]) / 2; s += dd * dd; }
      grad[i] = Math.sqrt(s);
      if (grad[i] > maxG) maxG = grad[i];
    }
    grad[0] = 0;
    if (maxG < 1.5) continue;
    for (let i = 1; i < iMax; i++) {
      if (grad[i] >= 0.6 * maxG && grad[i] >= grad[i - 1] && grad[i] > grad[i + 1]) {
        Dout[k] = d0 + i + parabolicPeak(grad, i);
        break;
      }
    }
  }

  const outerFit = robustLine(U, Dout, { thresh: 0.12 * p, maxSlope: 0.03 });
  const outerA = outerFit ? outerFit.a : 0, outerB = outerFit ? outerFit.b : 0;
  const outerQuality = outerFit ? (outerFit.inliers / N) / (1 + (outerFit.rms / (0.04 * p)) ** 2) : 0;

  // Inner edge.
  const Tmin = face === "back" ? 7 : 10;
  const refLo = 0.3 * p, refHi = 0.6 * p;
  const refs: number[][] = [];
  for (let k = 0; k < N; k++) {
    const sm2 = profiles[k], d0 = offsets[k];
    const dO = outerA + outerB * U[k];
    const i0 = Math.max(0, Math.round(dO + refLo - d0)), i1 = Math.min(n - 1, Math.round(dO + refHi - d0));
    const acc = [0, 0, 0];
    for (let i = i0; i <= i1; i++) for (let c = 0; c < 3; c++) acc[c] += sm2[i * 3 + c];
    refs.push(acc.map((v) => v / Math.max(1, i1 - i0 + 1)));
  }
  const localRef: number[][] = [];
  for (let k = 0; k < N; k++) {
    const r: number[] = [];
    for (let c = 0; c < 3; c++) {
      const vals: number[] = [];
      for (let j = Math.max(0, k - 4); j <= Math.min(N - 1, k + 4); j++) vals.push(refs[j][c]);
      r.push(median(vals));
    }
    localRef.push(r);
  }
  const Dist = new Float32Array(n);
  const noise: number[] = [];
  const dists: Float32Array[] = [];
  for (let k = 0; k < N; k++) {
    const sm2 = profiles[k], ref = localRef[k];
    const dd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = sm2[i * 3] - ref[0], b = sm2[i * 3 + 1] - ref[1], c = sm2[i * 3 + 2] - ref[2];
      dd[i] = Math.sqrt(a * a + b * b + c * c);
    }
    dists.push(dd);
    const dO = outerA + outerB * U[k];
    const i0 = Math.max(0, Math.round(dO + refLo - offsets[k])), i1 = Math.min(n - 1, Math.round(dO + refHi - offsets[k]));
    let s = 0;
    for (let i = i0; i <= i1; i++) s += dd[i];
    noise.push(s / Math.max(1, i1 - i0 + 1));
  }
  const T = Math.max(Tmin, 3 * median(noise));
  const Din = new Float64Array(N).fill(NaN);
  const sustain = Math.round(1.2 * p);
  const maxGap = Math.max(2, Math.round(0.15 * p));
  for (let k = 0; k < N; k++) {
    if (U[k] < innerUStart || U[k] > innerUEnd) continue;
    const dd = dists[k], d0 = offsets[k];
    const dO = outerA + outerB * U[k];
    const iS = Math.max(1, Math.round(dO + 0.65 * p - d0));
    const iE = Math.min(n - 2 - sustain, Math.round(dO + 6.5 * p - d0));
    for (let i = iS; i <= iE; i++) {
      if (dd[i] <= T) continue;
      // Sustained: ≥85% above T and no run of border colour (< T/2) longer than maxGap.
      let above = 0, run = 0, ok = true;
      for (let j = i; j < i + sustain; j++) {
        if (dd[j] > T) above++;
        if (dd[j] < 0.5 * T) { if (++run >= maxGap) { ok = false; break; } } else run = 0;
      }
      if (!ok || above < 0.85 * sustain) continue;
      // Locate the edge on the Lab gradient magnitude (independent of the reference colour, which small print
      // can tint): strongest gradient near the crossing, then the centroid of its upper half (noise-robust and
      // unbiased for a symmetric blur).
      const sm2 = profiles[k];
      const lo = Math.max(1, i - Math.round(0.3 * p)), hi = Math.min(n - 2, i + Math.round(0.25 * p));
      let best = -Infinity, bi = i;
      for (let j = lo; j <= hi; j++) {
        let g2 = 0;
        for (let c = 0; c < 3; c++) { const dv = (sm2[(j + 1) * 3 + c] - sm2[(j - 1) * 3 + c]) / 2; g2 += dv * dv; }
        Dist[j] = Math.sqrt(g2);
        if (Dist[j] > best) { best = Dist[j]; bi = j; }
      }
      // Project the derivative on the local step direction (outside → inside colour): linear in the noise, so
      // the centroid stays unbiased where a magnitude would not.
      const cw = Math.max(2, Math.round(0.15 * p));
      const avg = (a: number, b: number, out: number[]) => {
        a = Math.max(0, a); b = Math.min(n - 1, b);
        out[0] = out[1] = out[2] = 0;
        for (let j = a; j <= b; j++) for (let c = 0; c < 3; c++) out[c] += sm2[j * 3 + c];
        for (let c = 0; c < 3; c++) out[c] /= Math.max(1, b - a + 1);
      };
      const cOut = [0, 0, 0], cIn = [0, 0, 0];
      avg(bi - 2 * cw, bi - cw, cOut);
      avg(bi + cw, bi + 2 * cw + 2, cIn);
      let ux = cIn[0] - cOut[0], uy = cIn[1] - cOut[1], uz = cIn[2] - cOut[2];
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
      let pmax = 0;
      const j0 = Math.max(1, bi - cw), j1 = Math.min(n - 2, bi + cw);
      for (let j = j0; j <= j1; j++) {
        Dist[j] = ((sm2[(j + 1) * 3] - sm2[(j - 1) * 3]) * ux + (sm2[(j + 1) * 3 + 1] - sm2[(j - 1) * 3 + 1]) * uy + (sm2[(j + 1) * 3 + 2] - sm2[(j - 1) * 3 + 2]) * uz) / 2;
        if (Dist[j] > pmax) pmax = Dist[j];
      }
      let sw = 0, sx = 0;
      for (let j = j0; j <= j1; j++) {
        const wv = Dist[j] - 0.5 * pmax;
        if (wv > 0) { sw += wv; sx += wv * j; }
      }
      Din[k] = d0 + (sw > 0 ? sx / sw : bi);
      break;
    }
  }
  let innerFit = robustLine(U, Din, { thresh: 0.15 * p, maxSlope: 0.03 });
  if (innerFit && side === "bottom" && face === "front") {
    // Small print sits between the cut edge and the frame, so if a consistent line exists further in, the
    // frame is that one, even when the text produced more points.
    const deeper = new Uint8Array(N);
    let valid = 0;
    for (let k = 0; k < N; k++) {
      if (!Number.isFinite(Din[k])) continue;
      valid++;
      if (Din[k] <= innerFit.a + innerFit.b * U[k] + 0.25 * p) deeper[k] = 1;
    }
    const alt = robustLine(U, Din, { thresh: 0.15 * p, maxSlope: 0.03, exclude: deeper });
    if (alt && alt.inliers >= Math.max(8, 0.3 * valid)) innerFit = alt;
  }
  let innerA: number, innerB: number, innerQuality: number;
  if (innerFit && innerFit.inliers >= 8) {
    innerA = innerFit.a; innerB = innerFit.b;
    let nInner = 0;
    for (let k = 0; k < N; k++) if (U[k] >= innerUStart && U[k] <= innerUEnd) nInner++;
    innerQuality = (innerFit.inliers / nInner) / (1 + (innerFit.rms / (0.05 * p)) ** 2);
  } else {
    innerA = outerA + 2.5 * p; innerB = outerB; innerQuality = 0;
  }

  const toLine = (a: number, b: number): Line => {
    const d1 = a, d2 = a + b * g.len;
    const c1 = g.outerPos + g.dir * d1, c2 = g.outerPos + g.dir * d2;
    return g.vertical ? { a: { x: c1, y: m }, b: { x: c2, y: m + g.len } } : { a: { x: m, y: c1 }, b: { x: m + g.len, y: c2 } };
  };
  const outerPoints: { u: number; d: number }[] = [];
  const innerPoints: { u: number; d: number }[] = [];
  for (let k = 0; k < N; k++) {
    if (Number.isFinite(Dout[k])) outerPoints.push({ u: U[k], d: Dout[k] });
    if (Number.isFinite(Din[k])) innerPoints.push({ u: U[k], d: Din[k] });
  }
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return {
    outer: toLine(outerA, outerB),
    inner: toLine(innerA, innerB),
    outerQuality: clamp01(outerQuality),
    innerQuality: clamp01(innerQuality),
    quality: clamp01(Math.min(outerQuality, innerQuality)),
    outerPoints,
    innerPoints,
  };
}

/** Sub-pixel outer cut-edge and inner frame lines on a warped card. */
export function measureBorders(warp: WarpResult, face: Face): BorderFit {
  const sides: Side[] = ["left", "right", "top", "bottom"];
  const res = Object.fromEntries(sides.map((s) => [s, measureSide(warp, face, s)])) as Record<Side, SideMeasurement>;
  return {
    outer: { left: res.left.outer, right: res.right.outer, top: res.top.outer, bottom: res.bottom.outer },
    inner: { left: res.left.inner, right: res.right.inner, top: res.top.inner, bottom: res.bottom.inner },
    quality: { left: res.left.quality, right: res.right.quality, top: res.top.quality, bottom: res.bottom.quality },
    pxPerMm: warp.pxPerMm,
  };
}

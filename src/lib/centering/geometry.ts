// Small geometry kit: homographies, line fitting and intersections. Pure functions, no allocations in hot paths.
import type { Line, Point, Quad } from "./types";

/** 3x3 matrix, row-major. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Solve A x = b (n x n, row-major) by Gaussian elimination with partial pivoting. Null if singular. */
export function solveLinear(A: number[], b: number[], n: number): number[] | null {
  const m = A.slice();
  const v = b.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r * n + col]) > Math.abs(m[piv * n + col])) piv = r;
    if (Math.abs(m[piv * n + col]) < 1e-12) return null;
    if (piv !== col) {
      for (let c = 0; c < n; c++) {
        const t = m[col * n + c];
        m[col * n + c] = m[piv * n + c];
        m[piv * n + c] = t;
      }
      const t = v[col];
      v[col] = v[piv];
      v[piv] = t;
    }
    for (let r = col + 1; r < n; r++) {
      const f = m[r * n + col] / m[col * n + col];
      if (f === 0) continue;
      for (let c = col; c < n; c++) m[r * n + c] -= f * m[col * n + c];
      v[r] -= f * v[col];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = v[r];
    for (let c = r + 1; c < n; c++) s -= m[r * n + c] * x[c];
    x[r] = s / m[r * n + r];
  }
  return x;
}

/** Homography H with H·src[i] ∝ dst[i] for four point pairs. Null if degenerate. */
export function homographyFrom4(src: readonly Point[], dst: readonly Point[]): Mat3 | null {
  // Normalise both point sets for numerical stability.
  const norm = (pts: readonly Point[]) => {
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length; cy /= pts.length;
    let d = 0;
    for (const p of pts) d += Math.hypot(p.x - cx, p.y - cy);
    const s = d > 0 ? (Math.SQRT2 * pts.length) / d : 1;
    return { cx, cy, s };
  };
  const ns = norm(src);
  const nd = norm(dst);
  const A: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const x = (src[i].x - ns.cx) * ns.s, y = (src[i].y - ns.cy) * ns.s;
    const u = (dst[i].x - nd.cx) * nd.s, v = (dst[i].y - nd.cy) * nd.s;
    A.push(x, y, 1, 0, 0, 0, -u * x, -u * y);
    b.push(u);
    A.push(0, 0, 0, x, y, 1, -v * x, -v * y);
    b.push(v);
  }
  const h = solveLinear(A, b, 8);
  if (!h) return null;
  const Hn: Mat3 = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  // H = Td^-1 · Hn · Ts
  const Ts: Mat3 = [ns.s, 0, -ns.s * ns.cx, 0, ns.s, -ns.s * ns.cy, 0, 0, 1];
  const TdInv: Mat3 = [1 / nd.s, 0, nd.cx, 0, 1 / nd.s, nd.cy, 0, 0, 1];
  const H = matMul(TdInv, matMul(Hn, Ts));
  const k = H[8];
  return Math.abs(k) < 1e-15 ? H : (H.map((e) => e / k) as Mat3);
}

export function matMul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9) as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

export function matInv(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) return null;
  const inv: Mat3 = [
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ];
  return inv.map((v) => v / det) as Mat3;
}

export function applyH(H: Mat3, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

/** Line in normal form: nx·x + ny·y = c, with (nx, ny) a unit vector. */
export interface NLine {
  nx: number;
  ny: number;
  c: number;
}

export function intersect(l1: NLine, l2: NLine): Point | null {
  const det = l1.nx * l2.ny - l1.ny * l2.nx;
  if (Math.abs(det) < 1e-9) return null;
  return { x: (l1.c * l2.ny - l1.ny * l2.c) / det, y: (l1.nx * l2.c - l1.c * l2.nx) / det };
}

export function nlineThrough(a: Point, b: Point): NLine {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  return { nx, ny, c: nx * a.x + ny * a.y };
}

/** Total least-squares line through weighted points. */
export function fitLineTLS(xs: ArrayLike<number>, ys: ArrayLike<number>, idx?: ArrayLike<number>): NLine | null {
  const n = idx ? idx.length : xs.length;
  if (n < 2) return null;
  let mx = 0, my = 0;
  for (let k = 0; k < n; k++) { const i = idx ? idx[k] : k; mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let k = 0; k < n; k++) {
    const i = idx ? idx[k] : k;
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  // Normal = eigenvector of the smallest eigenvalue of the scatter matrix.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy); // direction of the line
  const nx = -Math.sin(theta), ny = Math.cos(theta);
  return { nx, ny, c: nx * mx + ny * my };
}

export interface RobustFit1D {
  /** d = a + b·s */
  a: number;
  b: number;
  inliers: number;
  total: number;
  /** RMS residual of the inliers. */
  rms: number;
  mask: Uint8Array;
}

/** Least squares of d = a + b·s over masked points. */
function lsq(s: ArrayLike<number>, d: ArrayLike<number>, mask: Uint8Array): { a: number; b: number } | null {
  let n = 0, ms = 0, md = 0;
  for (let i = 0; i < s.length; i++) if (mask[i]) { n++; ms += s[i]; md += d[i]; }
  if (n < 2) return null;
  ms /= n; md /= n;
  let sss = 0, ssd = 0;
  for (let i = 0; i < s.length; i++) if (mask[i]) { const ds = s[i] - ms; sss += ds * ds; ssd += ds * (d[i] - md); }
  const b = sss > 1e-12 ? ssd / sss : 0;
  return { a: md - b * ms, b };
}

/**
 * Robust 1D line fit d(s) = a + b·s: exhaustive pair RANSAC (deterministic) with slope bound,
 * then least squares on the inliers, re-thresholded twice. Points with NaN d are ignored.
 */
export function robustLine(
  s: ArrayLike<number>,
  d: ArrayLike<number>,
  opts: { thresh: number; maxSlope: number; exclude?: Uint8Array },
): RobustFit1D | null {
  const n = s.length;
  const valid: number[] = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(d[i]) && !(opts.exclude && opts.exclude[i])) valid.push(i);
  if (valid.length < 3) return null;
  let bestCount = -1, bestCost = Infinity, bestA = 0, bestB = 0;
  const step = valid.length > 120 ? 2 : 1;
  for (let p = 0; p < valid.length; p += step) {
    for (let q = p + 1; q < valid.length; q += step) {
      const i = valid[p], j = valid[q];
      const ds = s[j] - s[i];
      if (Math.abs(ds) < 1e-9) continue;
      const b = (d[j] - d[i]) / ds;
      if (Math.abs(b) > opts.maxSlope) continue;
      const a = d[i] - b * s[i];
      let count = 0, cost = 0;
      for (const k of valid) {
        const r = Math.abs(d[k] - a - b * s[k]);
        if (r < opts.thresh) { count++; cost += r; }
      }
      if (count > bestCount || (count === bestCount && cost < bestCost)) {
        bestCount = count; bestCost = cost; bestA = a; bestB = b;
      }
    }
  }
  if (bestCount < 2) return null;
  const mask = new Uint8Array(n);
  let a = bestA, b = bestB, thresh = opts.thresh;
  let rms = 0, inl = 0;
  for (let iter = 0; iter < 3; iter++) {
    mask.fill(0);
    for (const k of valid) if (Math.abs(d[k] - a - b * s[k]) < thresh) mask[k] = 1;
    const f = lsq(s, d, mask);
    if (!f) break;
    a = f.a; b = f.b;
    let ss = 0; inl = 0;
    for (const k of valid) if (mask[k]) { const r = d[k] - a - b * s[k]; ss += r * r; inl++; }
    rms = Math.sqrt(ss / Math.max(1, inl));
    // Re-threshold on the residual spread (never wider than asked: near-miss outliers such as blurred small
    // print sit just outside it).
    thresh = Math.min(opts.thresh, Math.max(opts.thresh * 0.5, 3 * rms));
  }
  mask.fill(0);
  inl = 0;
  for (const k of valid) if (Math.abs(d[k] - a - b * s[k]) < thresh) { mask[k] = 1; inl++; }
  return { a, b, inliers: inl, total: valid.length, rms, mask };
}

/** Evaluate x on a (non-horizontal) line at a given y. */
export function lineXAtY(l: Line, y: number): number {
  const dy = l.b.y - l.a.y;
  if (Math.abs(dy) < 1e-12) return (l.a.x + l.b.x) / 2;
  return l.a.x + ((l.b.x - l.a.x) * (y - l.a.y)) / dy;
}

/** Evaluate y on a (non-vertical) line at a given x. */
export function lineYAtX(l: Line, x: number): number {
  const dx = l.b.x - l.a.x;
  if (Math.abs(dx) < 1e-12) return (l.a.y + l.b.y) / 2;
  return l.a.y + ((l.b.y - l.a.y) * (x - l.a.x)) / dx;
}

/** Signed area (positive = clockwise on screen, y down). */
export function quadArea(q: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i], r = q[(i + 1) % q.length];
    a += p.x * r.y - r.x * p.y;
  }
  return a / 2;
}

export function isConvex(q: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const p0 = q[i], p1 = q[(i + 1) % q.length], p2 = q[(i + 2) % q.length];
    const cr = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
    if (Math.abs(cr) < 1e-9) return false;
    const s = Math.sign(cr);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Scale every corner (e.g. from a downscaled detection image back to the original: factor = 1/scale). */
export function scaleQuad(q: Quad, factor: number): Quad {
  return q.map((p) => ({ x: p.x * factor, y: p.y * factor })) as Quad;
}

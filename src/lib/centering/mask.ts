// Background-removal pre-filter for detectCard (classical, no ML).
//
// 1. Background model: k-means (k = 5, deterministic farthest-point seeding) in CIELAB over a strip 5% wide around
//    the photo's frame. Each cluster keeps its own spread, so textured tables (wood grain, cloth) become several
//    wide clusters rather than one tight colour. Tiny clusters (< 4% of the strip) are dropped as noise.
// 2. Foreground score per pixel: distance to the nearest background cluster in units of that cluster's spread,
//    with darkening (lower L, same chroma) discounted so soft shadows stay background. Threshold: Otsu on the
//    score, clamped to a sane range. Side effect: a border close to the table colour (silver on white or grey)
//    is classified as table, so the mask can be the card minus its border; detect.ts allows for that.
// 3. Cleanup: close + open (3x3 square, twice), fill holes (card art often looks like the table), keep the largest
//    connected component.
// 4. Shape: convex hull → minimum-area rectangle → points on the component boundary assigned to the rectangle's
//    sides (middle 70% of each side) → total-least-squares line per side → corners. The result is a rough quad that
//    only steers detection; corner precision still comes from detect.ts's sub-pixel refinement on real edges.
// 5. Reliability: the model is rejected (null) when the frame strip is mostly foreground (card fills the frame or
//    crosses it heavily), when the component is too small/large, not rectangular, or not card-shaped.
import type { Point, RGBAImage } from "./types";
import { gaussianBlur, resizeArea, rgbToLab, toRGBFloat } from "./image";
import { fitLineTLS, intersect, isConvex, quadArea, type NLine } from "./geometry";

export interface BackgroundMask {
  /** Rough card quad (convex, either winding) in the coordinates of the image passed in. */
  quad: Point[];
  /** 0..1: rectangularity of the foreground component and how clean the frame strip was. */
  reliability: number;
  /** Foreground mask at mask resolution (1 = card), for debugging/overlays. */
  mask: Uint8Array;
  maskW: number;
  maskH: number;
  /** Mask pixels per input pixel. */
  scale: number;
}

const MASK_EDGE = 256;
const K = 5;

function kmeans(samples: Float32Array, n: number, k: number): { mu: Float32Array; sigma: Float32Array; weight: Float32Array } {
  const mu = new Float32Array(k * 3);
  // Farthest-point seeding from the sample mean (deterministic).
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < n; i++) { mx += samples[i * 3]; my += samples[i * 3 + 1]; mz += samples[i * 3 + 2]; }
  mu[0] = mx / n; mu[1] = my / n; mu[2] = mz / n;
  const dmin = new Float32Array(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let far = 0, farD = -1;
    for (let i = 0; i < n; i++) {
      const dx = samples[i * 3] - mu[(c - 1) * 3], dy = samples[i * 3 + 1] - mu[(c - 1) * 3 + 1], dz = samples[i * 3 + 2] - mu[(c - 1) * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < dmin[i]) dmin[i] = d;
      if (dmin[i] > farD) { farD = dmin[i]; far = i; }
    }
    mu[c * 3] = samples[far * 3]; mu[c * 3 + 1] = samples[far * 3 + 1]; mu[c * 3 + 2] = samples[far * 3 + 2];
  }
  const label = new Uint8Array(n);
  const sum = new Float64Array(k * 4);
  for (let it = 0; it < 10; it++) {
    sum.fill(0);
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const dx = samples[i * 3] - mu[c * 3], dy = samples[i * 3 + 1] - mu[c * 3 + 1], dz = samples[i * 3 + 2] - mu[c * 3 + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd) { bd = d; best = c; }
      }
      label[i] = best;
      sum[best * 4] += samples[i * 3]; sum[best * 4 + 1] += samples[i * 3 + 1]; sum[best * 4 + 2] += samples[i * 3 + 2]; sum[best * 4 + 3]++;
    }
    for (let c = 0; c < k; c++) if (sum[c * 4 + 3] > 0) for (let j = 0; j < 3; j++) mu[c * 3 + j] = sum[c * 4 + j] / sum[c * 4 + 3];
  }
  const sigma = new Float32Array(k), weight = new Float32Array(k);
  const ss = new Float64Array(k);
  for (let i = 0; i < n; i++) {
    const c = label[i];
    const dx = samples[i * 3] - mu[c * 3], dy = samples[i * 3 + 1] - mu[c * 3 + 1], dz = samples[i * 3 + 2] - mu[c * 3 + 2];
    ss[c] += dx * dx + dy * dy + dz * dz;
    weight[c]++;
  }
  for (let c = 0; c < k; c++) { sigma[c] = weight[c] ? Math.sqrt(ss[c] / weight[c]) : 0; weight[c] /= n; }
  return { mu, sigma, weight };
}

function otsu(v: Float32Array, maxV: number): number {
  const B = 128;
  const hist = new Float64Array(B);
  for (let i = 0; i < v.length; i++) hist[Math.min(B - 1, Math.floor((Math.min(v[i], maxV) / maxV) * B))]++;
  let total = 0, sumAll = 0;
  for (let b = 0; b < B; b++) { total += hist[b]; sumAll += b * hist[b]; }
  let wB = 0, sumB = 0, best = 0, thr = B / 2;
  for (let b = 0; b < B; b++) {
    wB += hist[b];
    if (!wB || wB === total) continue;
    sumB += b * hist[b];
    const mB = sumB / wB, mF = (sumAll - sumB) / (total - wB);
    const between = wB * (total - wB) * (mB - mF) ** 2;
    if (between > best) { best = between; thr = b + 1; }
  }
  return (thr / B) * maxV;
}

/** 3x3 binary dilate (max) or erode (min), in place via a temp buffer. */
function morph(m: Uint8Array, w: number, h: number, dilate: boolean, tmp: Uint8Array): void {
  const v = dilate ? 1 : 0;
  // Horizontal
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    tmp[i] = (x > 0 && m[i - 1] === v) || m[i] === v || (x < w - 1 && m[i + 1] === v) ? v : 1 - v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    m[i] = (y > 0 && tmp[i - w] === v) || tmp[i] === v || (y < h - 1 && tmp[i + w] === v) ? v : 1 - v;
  }
}

function convexHull(pts: Point[]): Point[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [], upper: Point[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Minimum-area enclosing rectangle of a convex hull: centre, unit axes, half-sizes. */
function minAreaRect(hull: Point[]) {
  let best = { area: Infinity, ux: 1, uy: 0, minU: 0, maxU: 0, minV: 0, maxV: 0 };
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1e-9) continue;
    const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = p.x * ux + p.y * uy, v = -p.x * uy + p.y * ux;
      if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < best.area) best = { area, ux, uy, minU, maxU, minV, maxV };
  }
  return best;
}

/** Learn the table from the photo's frame and segment the card. Null when the model is not trustworthy. */
export function backgroundMask(img: RGBAImage): BackgroundMask | null {
  const long = Math.max(img.width, img.height);
  const scale = long > MASK_EDGE ? MASK_EDGE / long : 1;
  const w = Math.max(8, Math.round(img.width * scale)), h = Math.max(8, Math.round(img.height * scale));
  const small = scale < 1 ? resizeArea(img, w, h) : img;
  const sx = w / img.width;
  const rgb = toRGBFloat(small);
  gaussianBlur(rgb, w, h, 3, 0.8);
  const n = w * h;
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rgbToLab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], lab, i * 3);

  // 1. Frame strip samples.
  const bx = Math.max(2, Math.round(0.05 * w)), by = Math.max(2, Math.round(0.05 * h));
  const inStrip = (x: number, y: number) => x < bx || x >= w - bx || y < by || y >= h - by;
  let ns = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inStrip(x, y)) ns++;
  // k-means on at most ~4000 strip pixels (regular subsampling).
  const step = Math.max(1, Math.ceil(ns / 4000));
  const samples = new Float32Array(Math.ceil(ns / step) * 3);
  let k = 0, idx = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inStrip(x, y)) continue;
    if (idx++ % step === 0) { samples.set(lab.subarray((y * w + x) * 3, (y * w + x) * 3 + 3), k * 3); k++; }
  }
  const { mu, sigma, weight } = kmeans(samples, k, K);

  // 2. Foreground score: distance to the nearest kept cluster, in units of its spread.
  const score = new Float32Array(n);
  const inv2 = new Float32Array(K);
  for (let c = 0; c < K; c++) inv2[c] = weight[c] < 0.04 ? 0 : 1 / (sigma[c] + 1.5) ** 2;
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    const L = lab[i * 3], A = lab[i * 3 + 1], B = lab[i * 3 + 2];
    for (let c = 0; c < K; c++) {
      if (!inv2[c]) continue;
      // Darker than the cluster with similar chroma reads as shadow: L counts for less in that direction.
      let dx = L - mu[c * 3];
      if (dx < 0) dx *= 0.35;
      const dy = A - mu[c * 3 + 1], dz = B - mu[c * 3 + 2];
      const d = (dx * dx + dy * dy + dz * dz) * inv2[c];
      if (d < best) best = d;
    }
    score[i] = Math.sqrt(best);
  }
  const thr = Math.max(2.5, Math.min(8, otsu(score, 20)));
  const m = new Uint8Array(n);
  let stripFg = 0;
  for (let i = 0; i < n; i++) m[i] = score[i] > thr ? 1 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inStrip(x, y) && m[y * w + x]) stripFg++;
  const stripFrac = stripFg / ns;
  if (stripFrac > 0.3) return null;

  // 3. Cleanup.
  const tmp = new Uint8Array(n);
  morph(m, w, h, true, tmp); morph(m, w, h, true, tmp); morph(m, w, h, false, tmp); morph(m, w, h, false, tmp);
  morph(m, w, h, false, tmp); morph(m, w, h, false, tmp); morph(m, w, h, true, tmp); morph(m, w, h, true, tmp);
  // Fill holes: background not connected to the border becomes foreground.
  const stack = new Int32Array(n);
  const seen = new Uint8Array(n);
  let sp = 0;
  const pushBg = (i: number) => { if (!m[i] && !seen[i]) { seen[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < w; x++) { pushBg(x); pushBg((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { pushBg(y * w); pushBg(y * w + w - 1); }
  while (sp) {
    const i = stack[--sp], x = i % w;
    if (x > 0) pushBg(i - 1); if (x < w - 1) pushBg(i + 1); if (i >= w) pushBg(i - w); if (i < n - w) pushBg(i + w);
  }
  for (let i = 0; i < n; i++) if (!m[i] && !seen[i]) m[i] = 1;
  // Largest 4-connected component.
  const comp = new Int32Array(n).fill(-1);
  let bestId = -1, bestSize = 0, id = 0;
  for (let s = 0; s < n; s++) {
    if (!m[s] || comp[s] >= 0) continue;
    let size = 0;
    sp = 0; stack[sp++] = s; comp[s] = id;
    while (sp) {
      const i = stack[--sp], x = i % w;
      size++;
      if (x > 0 && m[i - 1] && comp[i - 1] < 0) { comp[i - 1] = id; stack[sp++] = i - 1; }
      if (x < w - 1 && m[i + 1] && comp[i + 1] < 0) { comp[i + 1] = id; stack[sp++] = i + 1; }
      if (i >= w && m[i - w] && comp[i - w] < 0) { comp[i - w] = id; stack[sp++] = i - w; }
      if (i < n - w && m[i + w] && comp[i + w] < 0) { comp[i + w] = id; stack[sp++] = i + w; }
    }
    if (size > bestSize) { bestSize = size; bestId = id; }
    id++;
  }
  if (bestId < 0) return null;
  const areaFrac = bestSize / n;
  if (areaFrac < 0.03 || areaFrac > 0.95) return null;
  for (let i = 0; i < n; i++) m[i] = comp[i] === bestId ? 1 : 0;

  // 4. Boundary → hull → min-area rectangle → 4 lines.
  const bnd: Point[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!m[i]) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w]) bnd.push({ x: x + 0.5, y: y + 0.5 });
  }
  const hull = convexHull(bnd);
  if (hull.length < 4) return null;
  const R = minAreaRect(hull);
  const rw = R.maxU - R.minU, rh = R.maxV - R.minV;
  const rectangularity = bestSize / Math.max(1, rw * rh);
  const aspect = Math.min(rw, rh) / Math.max(rw, rh);
  if (rectangularity < 0.8 || aspect < 0.55 || aspect > 0.9) return null;
  // Rectangle sides: u = minU, u = maxU, v = minV, v = maxV.
  const groups: Point[][] = [[], [], [], []];
  const tol = 0.06 * Math.min(rw, rh);
  for (const p of bnd) {
    const u = p.x * R.ux + p.y * R.uy, v = -p.x * R.uy + p.y * R.ux;
    const dists = [Math.abs(v - R.minV), Math.abs(u - R.maxU), Math.abs(v - R.maxV), Math.abs(u - R.minU)];
    let s = 0;
    for (let j = 1; j < 4; j++) if (dists[j] < dists[s]) s = j;
    if (dists[s] > tol) continue;
    const along = s % 2 === 0 ? (u - R.minU) / rw : (v - R.minV) / rh;
    if (along < 0.15 || along > 0.85) continue;
    groups[s].push(p);
  }
  const lines: NLine[] = [];
  for (const gp of groups) {
    if (gp.length < 6) return null;
    const l = fitLineTLS(gp.map((p) => p.x), gp.map((p) => p.y));
    if (!l) return null;
    lines.push(l);
  }
  const quad: Point[] = [];
  for (let s = 0; s < 4; s++) {
    const p = intersect(lines[(s + 3) % 4], lines[s]);
    if (!p) return null;
    quad.push({ x: p.x / sx, y: p.y / sx });
  }
  if (!isConvex(quad) || Math.abs(quadArea(quad)) < 1) return null;
  const reliability = Math.max(0, Math.min(1, (rectangularity - 0.8) / 0.15)) * (1 - stripFrac / 0.3);
  return { quad, reliability, mask: m, maskW: w, maskH: h, scale: sx };
}

/** Fraction of quad `a`'s area that lies inside quad `b` (64x64 grid estimate). */
export function quadCoverage(a: Point[], b: Point[]): number {
  const xs = a.map((p) => p.x), ys = a.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let inA = 0, both = 0;
  const G = 64;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / G, y = y0 + ((j + 0.5) * (y1 - y0)) / G;
    if (!insideQuad(a, x, y)) continue;
    inA++;
    if (insideQuad(b, x, y)) both++;
  }
  return inA ? both / inA : 0;
}

function insideQuad(q: Point[], x: number, y: number): boolean {
  const sgn = quadArea(q) > 0 ? 1 : -1;
  for (let i = 0; i < 4; i++) {
    const p = q[i], r = q[(i + 1) % 4];
    if (sgn * ((r.x - p.x) * (y - p.y) - (r.y - p.y) * (x - p.x)) < 0) return false;
  }
  return true;
}

/** Intersection-over-union of two convex quads, estimated on a 64x64 grid over their joint bounding box. */
export function quadIoU(a: Point[], b: Point[]): number {
  const xs = [...a, ...b].map((p) => p.x), ys = [...a, ...b].map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const inside = (q: Point[], x: number, y: number) => {
    const sgn = quadArea(q) > 0 ? 1 : -1;
    for (let i = 0; i < 4; i++) {
      const p = q[i], r = q[(i + 1) % 4];
      if (sgn * ((r.x - p.x) * (y - p.y) - (r.y - p.y) * (x - p.x)) < 0) return false;
    }
    return true;
  };
  let inter = 0, uni = 0;
  const G = 64;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / G, y = y0 + ((j + 0.5) * (y1 - y0)) / G;
    const ia = inside(a, x, y), ib = inside(b, x, y);
    if (ia && ib) inter++;
    if (ia || ib) uni++;
  }
  return uni ? inter / uni : 0;
}

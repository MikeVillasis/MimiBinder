// Card detection: colour-gradient Hough lines → best card-shaped quadrilateral → sub-pixel line refinement.
//
// 1. Coarse pass on a ≤800 px copy: Gaussian blur, Di Zenzo colour gradient (works for any colour contrast,
//    not just brightness), non-maximum suppression, orientation-constrained Hough voting.
// 2. Candidate quads from two pairs of roughly parallel Hough lines, filtered by convexity, frame coverage and an
//    aspect ratio near 63/88 (opposite sides averaged, which tolerates ~20° of perspective). Each side must be
//    backed by edge pixels along its middle 80%; among well-supported quads the largest wins (so the inner
//    printed frame, which also looks like a card-shaped quad, loses to the cut edge around it).
// 3. Refinement on the input image: for 64 positions along each side's middle 76% (the rounded corners are
//    excluded), a colour profile across the edge; the outermost strong derivative peak, parabola-refined, gives a
//    sub-pixel edge point. A robust line fit per side, then corners = intersections of adjacent lines.
// 4. Corners are ordered TL, TR, BR, BL for a portrait card, choosing the smallest rotation that makes the card
//    portrait. A card lying in landscape is ambiguous (±90°) and an upside-down card cannot be told apart from an
//    upright one: the UI offers a rotate button for that.
import type { DetectResult, Point, Quad, RGBAImage } from "./types";
import { downscale, gaussianBlur, sampleRGB, toRGBFloat } from "./image";
import { dist, intersect, isConvex, quadArea, robustLine, type NLine } from "./geometry";

const CARD_ASPECT = 63 / 88;
const DEG = Math.PI / 180;

interface Grad {
  w: number;
  h: number;
  /** Blurred RGB (interleaved). */
  rgb: Float32Array;
  mag: Float32Array;
  /** Normal direction in [0, π). */
  ang: Float32Array;
  edge: Uint8Array;
  thr: number;
}

function colourGradient(img: RGBAImage): Grad {
  const { width: w, height: h } = img;
  const f = toRGBFloat(img);
  gaussianBlur(f, w, h, 3, 1.0);
  const mag = new Float32Array(w * h);
  const ang = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gxx = 0, gyy = 0, gxy = 0;
      for (let c = 0; c < 3; c++) {
        const p = (i: number, j: number) => f[((y + j) * w + (x + i)) * 3 + c];
        const gx = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1);
        const gy = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1);
        gxx += gx * gx; gyy += gy * gy; gxy += gx * gy;
      }
      const tr = gxx + gyy;
      const lam = 0.5 * (tr + Math.sqrt((gxx - gyy) * (gxx - gyy) + 4 * gxy * gxy));
      const i = y * w + x;
      mag[i] = Math.sqrt(lam) / 8;
      let a = 0.5 * Math.atan2(2 * gxy, gxx - gyy);
      if (a < 0) a += Math.PI;
      ang[i] = a;
    }
  }
  // Threshold: a high percentile of the magnitude (texture-adaptive) with an absolute floor.
  const hist = new Uint32Array(256);
  let maxM = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > maxM) maxM = mag[i];
  const binW = Math.max(1e-6, maxM / 255);
  for (let i = 0; i < mag.length; i++) hist[Math.min(255, Math.floor(mag[i] / binW))]++;
  let acc = 0, p90 = maxM;
  for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= 0.9 * mag.length) { p90 = (b + 1) * binW; break; } }
  const thr = Math.max(6, Math.min(p90, 0.25 * maxM));
  // Non-maximum suppression along the gradient direction.
  const edge = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < thr) continue;
      const dx = Math.round(Math.cos(ang[i])), dy = Math.round(Math.sin(ang[i]));
      if (m >= mag[i + dy * w + dx] && m >= mag[i - dy * w - dx]) edge[i] = 1;
    }
  }
  return { w, h, rgb: f, mag, ang, edge, thr };
}

interface HLine extends NLine {
  votes: number;
}

function hough(g: Grad): HLine[] {
  const { w, h, edge, ang } = g;
  const NT = 360; // 0.5° bins over [0, π)
  const diag = Math.ceil(Math.hypot(w, h));
  const NR = 2 * diag + 1;
  const acc = new Float32Array(NT * NR);
  const cosT = new Float32Array(NT), sinT = new Float32Array(NT);
  for (let t = 0; t < NT; t++) { cosT[t] = Math.cos((t * Math.PI) / NT); sinT[t] = Math.sin((t * Math.PI) / NT); }
  const spread = 4; // ±2°
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!edge[i]) continue;
      const tb = Math.round((ang[i] / Math.PI) * NT);
      // Strong edges count more (up to 3x): the cut edge against the background usually out-contrasts texture.
      const wgt = Math.sqrt(Math.min(9, g.mag[i] / g.thr));
      const px = x + 0.5, py = y + 0.5;
      for (let k = -spread; k <= spread; k++) {
        let t = tb + k;
        let sgn = 1;
        if (t < 0) { t += NT; sgn = -1; } else if (t >= NT) { t -= NT; sgn = -1; }
        const r = Math.round(sgn * (px * cosT[t] + py * sinT[t])) + diag;
        acc[t * NR + r] += wgt;
      }
    }
  }
  // Light smoothing along rho so a slightly bent edge still peaks.
  const minVotes = 0.06 * Math.min(w, h);
  const peaks: HLine[] = [];
  const RT = 4, RR = 3;
  for (let t = 0; t < NT; t++) {
    for (let r = 1; r < NR - 1; r++) {
      const v = acc[t * NR + r];
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -RT; dt <= RT && isMax; dt++) {
        let tt = t + dt, rr0 = r;
        if (tt < 0) { tt += NT; rr0 = 2 * diag - r; } else if (tt >= NT) { tt -= NT; rr0 = 2 * diag - r; }
        for (let dr = -RR; dr <= RR; dr++) {
          const rr = rr0 + dr;
          if (rr < 0 || rr >= NR || (dt === 0 && dr === 0)) continue;
          const u = acc[tt * NR + rr];
          if (u > v || (u === v && (dt < 0 || (dt === 0 && dr < 0)))) { isMax = false; break; }
        }
      }
      if (isMax) peaks.push({ nx: cosT[t], ny: sinT[t], c: r - diag, votes: v });
    }
  }
  peaks.sort((a, b) => b.votes - a.votes);
  return peaks.slice(0, 56);
}

/** Fraction of samples along the middle 80% of segment a→b that sit on an edge aligned with the segment. */
function sideSupport(g: Grad, a: Point, b: Point): number {
  const K = 48;
  const len = dist(a, b);
  if (len < 1) return 0;
  const tx = (b.x - a.x) / len, ty = (b.y - a.y) / len;
  const nx = -ty, ny = tx;
  let normalAng = Math.atan2(ny, nx);
  if (normalAng < 0) normalAng += Math.PI;
  if (normalAng >= Math.PI) normalAng -= Math.PI;
  let hits = 0;
  const lo = g.thr * 0.6;
  for (let k = 0; k < K; k++) {
    const t = 0.1 + (0.8 * (k + 0.5)) / K;
    const cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t;
    let hit = false;
    for (let o = -2; o <= 2 && !hit; o++) {
      const x = Math.floor(cx + nx * o), y = Math.floor(cy + ny * o);
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
      const i = y * g.w + x;
      if (g.mag[i] < lo) continue;
      let d = Math.abs(g.ang[i] - normalAng);
      if (d > Math.PI / 2) d = Math.PI - d;
      if (d < 12 * DEG) hit = true;
    }
    if (hit) hits++;
  }
  return hits / K;
}

/**
 * Border-strip test: the strip just inside each side of a real card is the printed border, one colour all the
 * way round (yellow, silver or blue), and it contrasts with what is just outside. Background lines (wood grain,
 * table edges) and the inner printed frame (art inside) fail it. Returns a score in 0..1 (0 = reject).
 */
function stripScore(g: Grad, q: Point[]): number {
  const K = 24;
  const L = (dist(q[0], q[1]) + dist(q[1], q[2]) + dist(q[2], q[3]) + dist(q[3], q[0])) / 4;
  const delta = Math.max(2.5, 0.0106 * L); // ≈0.8 mm into the border
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  const sample = (x: number, y: number, out: number[]) => {
    const xi = Math.max(0, Math.min(g.w - 1, Math.floor(x))), yi = Math.max(0, Math.min(g.h - 1, Math.floor(y)));
    const o = (yi * g.w + xi) * 3;
    out[0] = g.rgb[o]; out[1] = g.rgb[o + 1]; out[2] = g.rgb[o + 2];
  };
  const inside: number[][] = [];
  const sideMed: number[][] = [];
  let minContrast = Infinity;
  const ci = [0, 0, 0], co = [0, 0, 0];
  for (let s = 0; s < 4; s++) {
    const a = q[s], b = q[(s + 1) % 4];
    const len = dist(a, b);
    let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    if (nx * (cx - (a.x + b.x) / 2) + ny * (cy - (a.y + b.y) / 2) < 0) { nx = -nx; ny = -ny; }
    const ins: number[][] = [];
    const con: number[] = [];
    for (let k = 0; k < K; k++) {
      const t = 0.12 + (0.76 * k) / (K - 1);
      const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      sample(px + nx * delta, py + ny * delta, ci);
      sample(px - nx * delta, py - ny * delta, co);
      ins.push([ci[0], ci[1], ci[2]]);
      con.push(Math.hypot(ci[0] - co[0], ci[1] - co[1], ci[2] - co[2]));
    }
    const med = [0, 1, 2].map((c) => median(ins.map((v) => v[c])));
    sideMed.push(med);
    inside.push(...ins);
    minContrast = Math.min(minContrast, median(con));
  }
  // Spread of the inside strip around the global median colour.
  const gmed = [0, 1, 2].map((c) => median(inside.map((v) => v[c])));
  const spread = median(inside.map((v) => Math.hypot(v[0] - gmed[0], v[1] - gmed[1], v[2] - gmed[2])));
  let sideDev = 0;
  for (const m of sideMed) sideDev = Math.max(sideDev, Math.hypot(m[0] - gmed[0], m[1] - gmed[1], m[2] - gmed[2]));
  const ref = Math.max(30, 0.25 * Math.hypot(gmed[0], gmed[1], gmed[2]));
  if (sideDev > ref * 1.5 || spread > ref || minContrast < 12) return 0;
  return (1 - sideDev / (ref * 1.5)) * (1 - spread / ref) * Math.min(1, minContrast / 40);
}

function median(v: number[]): number {
  const s = v.slice().sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : 0.5 * (s[h - 1] + s[h]);
}

function lineAngle(l: NLine): number {
  let a = Math.atan2(l.ny, l.nx);
  if (a < 0) a += Math.PI;
  if (a >= Math.PI) a -= Math.PI;
  return a;
}

function angDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

interface Cand {
  quad: Point[];
  support: number;
  strip: number;
  area: number;
  aspect: number;
}

function aspectOf(q: Point[]): { aspect: number; oppRatio: number } {
  const s0 = dist(q[0], q[1]), s1 = dist(q[1], q[2]), s2 = dist(q[2], q[3]), s3 = dist(q[3], q[0]);
  const A = (s0 + s2) / 2, B = (s1 + s3) / 2;
  const opp = Math.min(Math.min(s0, s2) / Math.max(s0, s2), Math.min(s1, s3) / Math.max(s1, s3));
  return { aspect: Math.min(A, B) / Math.max(A, B), oppRatio: opp };
}

function findQuadCoarse(g: Grad): Cand | null {
  const lines = hough(g);
  const W = g.w, H = g.h;
  const minDim = Math.min(W, H);
  const pairs: [HLine, HLine][] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i], b = lines[j];
      if (angDiff(lineAngle(a), lineAngle(b)) > 20 * DEG) continue;
      // Separation measured at the image centre.
      const cx = W / 2, cy = H / 2;
      const da = a.nx * cx + a.ny * cy - a.c, db = b.nx * cx + b.ny * cy - b.c;
      // Same normal orientation for both before comparing.
      const sameDir = a.nx * b.nx + a.ny * b.ny > 0 ? 1 : -1;
      const sep = Math.abs(da - sameDir * db);
      if (sep < 0.12 * minDim) continue;
      pairs.push([a, b]);
    }
  }
  const cands: Cand[] = [];
  const imgArea = W * H;
  const tol = 0.02 * Math.max(W, H);
  for (let p = 0; p < pairs.length; p++) {
    for (let q = p + 1; q < pairs.length; q++) {
      const [a, b] = pairs[p], [c, d] = pairs[q];
      const fam = angDiff(lineAngle(a), lineAngle(c));
      if (fam < 60 * DEG) continue;
      if (a === c || a === d || b === c || b === d) continue;
      const p0 = intersect(a, c), p1 = intersect(c, b), p2 = intersect(b, d), p3 = intersect(d, a);
      if (!p0 || !p1 || !p2 || !p3) continue;
      const quad = [p0, p1, p2, p3];
      if (quad.some((pt) => pt.x < -tol || pt.y < -tol || pt.x > W + tol || pt.y > H + tol)) continue;
      if (!isConvex(quad)) continue;
      const area = Math.abs(quadArea(quad));
      if (area < 0.04 * imgArea || area > 0.97 * imgArea) continue;
      const { aspect, oppRatio } = aspectOf(quad);
      if (aspect < 0.56 || aspect > 0.88 || oppRatio < 0.65) continue;
      let minS = 1;
      for (let s = 0; s < 4 && minS >= 0.45; s++) minS = Math.min(minS, sideSupport(g, quad[s], quad[(s + 1) % 4]));
      if (minS < 0.45) continue;
      const strip = stripScore(g, quad);
      if (strip <= 0) continue;
      cands.push({ quad, support: minS, strip, area, aspect });
    }
  }
  if (!cands.length) return null;
  const quality = (c: Cand) => c.support * Math.sqrt(c.strip);
  const best = Math.max(...cands.map(quality));
  // Start from the best-scoring quad, then step outward while a clearly larger, still good quad encloses it:
  // the printed inner frame can score well too, and the cut edge is the outermost card-shaped quad. Quads only
  // slightly larger (a background line next to the edge) do not count as enclosing.
  const sorted = cands.slice().sort((a, b) => quality(b) - quality(a));
  let pick = sorted[0];
  for (;;) {
    let next: Cand | null = null;
    for (const c of sorted) {
      if (quality(c) < 0.6 * best || c.area < pick.area * 1.04) continue;
      if (!pick.quad.every((p) => insideConvex(c.quad, p, 2))) continue;
      if (!next || quality(c) > quality(next)) next = c;
    }
    if (!next) return pick;
    pick = next;
  }
}

/** Point inside a convex polygon (either winding), with a tolerance in pixels. */
function insideConvex(q: Point[], p: Point, tol: number): boolean {
  const sgn = quadArea(q) > 0 ? 1 : -1;
  for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    const len = dist(a, b);
    const cr = ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
    if (cr * sgn < -tol) return false;
  }
  return true;
}

interface SideFit {
  line: NLine;
  inlierFrac: number;
  rms: number;
  n: number;
}

const prof = new Float32Array(3 * 256);
const smooth = new Float32Array(3 * 256);
const deriv = new Float32Array(256);

/**
 * Re-fit one side on the full-resolution detection image. `a`,`b` are the current corners of the side,
 * `inward` the unit normal pointing into the card. Returns the refined line.
 */
function refineSide(img: RGBAImage, a: Point, b: Point, inward: Point, halfWin: number): SideFit | null {
  const N = 64;
  const len = dist(a, b);
  const tx = (b.x - a.x) / len, ty = (b.y - a.y) / len;
  const S = new Float64Array(N), D = new Float64Array(N).fill(NaN);
  const L = Math.min(120, Math.max(4, Math.round(halfWin))) ;
  const n = 2 * L + 1;
  const col = [0, 0, 0];
  for (let k = 0; k < N; k++) {
    const t = 0.12 + (0.76 * k) / (N - 1);
    const cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t;
    S[k] = t * len;
    for (let i = 0; i < n; i++) {
      const o = i - L; // negative = outside
      // Average 5 samples along the edge for noise.
      let r = 0, g = 0, bb = 0;
      for (let j = -2; j <= 2; j++) {
        sampleRGB(img, cx + inward.x * o + tx * j * 1.5, cy + inward.y * o + ty * j * 1.5, col);
        r += col[0]; g += col[1]; bb += col[2];
      }
      prof[i * 3] = r / 5; prof[i * 3 + 1] = g / 5; prof[i * 3 + 2] = bb / 5;
    }
    // Gaussian smoothing (σ≈1) along the profile.
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        let s = 0, ws = 0;
        for (let j = -4; j <= 4; j++) {
          const ii = i + j;
          if (ii < 0 || ii >= n) continue;
          const wgt = Math.exp(-(j * j) / (2 * 1.4 * 1.4));
          s += prof[ii * 3 + c] * wgt; ws += wgt;
        }
        smooth[i * 3 + c] = s / ws;
      }
    }
    let maxD = 0;
    for (let i = 1; i < n - 1; i++) {
      let m = 0;
      for (let c = 0; c < 3; c++) { const d = (smooth[(i + 1) * 3 + c] - smooth[(i - 1) * 3 + c]) / 2; m += d * d; }
      deriv[i] = Math.sqrt(m);
      if (deriv[i] > maxD) maxD = deriv[i];
    }
    deriv[0] = deriv[n - 1] = 0;
    if (maxD < 2) continue;
    // Strongest peak in the (narrow) window: background texture next to the card is weaker than the cut edge.
    let bi = -1;
    for (let i = 1; i < n - 1; i++) if (deriv[i] === maxD) { bi = i; break; }
    if (bi > 0 && bi < n - 1) {
      const y0 = deriv[bi - 1], y1 = deriv[bi], y2 = deriv[bi + 1];
      const den = y0 - 2 * y1 + y2;
      const off = den < 0 ? (0.5 * (y0 - y2)) / den : 0;
      D[k] = bi - L + Math.max(-0.5, Math.min(0.5, off));
    }
  }
  const fit = robustLine(S, D, { thresh: 1.5, maxSlope: 0.06 });
  if (!fit || fit.inliers < 12) return null;
  // Edge point at s: P = a + t̂·s + inward·d(s).
  const p0 = { x: a.x + inward.x * fit.a, y: a.y + inward.y * fit.a };
  const p1 = { x: a.x + tx * len + inward.x * (fit.a + fit.b * len), y: a.y + ty * len + inward.y * (fit.a + fit.b * len) };
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const l = Math.hypot(dx, dy);
  const nx = -dy / l, ny = dx / l;
  return { line: { nx, ny, c: nx * p0.x + ny * p0.y }, inlierFrac: fit.inliers / N, rms: fit.rms, n: fit.inliers };
}

/** Order four convex corners as TL, TR, BR, BL of a portrait card with the smallest rotation. */
export function orderPortrait(pts: Point[]): Quad {
  let q = pts.slice();
  if (quadArea(q) < 0) q = [q[0], q[3], q[2], q[1]]; // make clockwise on screen (y down)
  // Long sides are 1→2 and 3→0 when the top is q[0]→q[1]; choose start so top/bottom are the short sides.
  const s = (i: number) => dist(q[i % 4], q[(i + 1) % 4]);
  let best: Quad | null = null;
  let bestAng = Infinity;
  for (let start = 0; start < 4; start++) {
    const short = s(start) + s(start + 2) <= s(start + 1) + s(start + 3);
    if (!short) continue;
    const tl = q[start], tr = q[(start + 1) % 4], br = q[(start + 2) % 4], bl = q[(start + 3) % 4];
    // Rotation of the top edge (TL→TR) and of the bottom edge (BL→BR) from +x.
    const ang = Math.abs(Math.atan2(tr.y - tl.y + (br.y - bl.y), tr.x - tl.x + (br.x - bl.x)));
    if (ang < bestAng) { bestAng = ang; best = [tl, tr, br, bl]; }
  }
  return best ?? (q as Quad);
}

/** Find the card in a photo: fits straight lines to the four cut edges and intersects them. Null if not found. */
export function detectCard(img: RGBAImage): DetectResult | null {
  if (img.width < 32 || img.height < 32) return null;
  const { image: coarse, scale: cs } = downscale(img, 800);
  const g = colourGradient(coarse);
  const cand = findQuadCoarse(g);
  if (!cand) return null;
  let quad = cand.quad.map((p) => ({ x: p.x / cs, y: p.y / cs }));
  if (quadArea(quad) < 0) quad = [quad[0], quad[3], quad[2], quad[1]];
  let fits: SideFit[] = [];
  const passes = [Math.max(4, 2.5 / cs), 3];
  for (const halfWin of passes) {
    const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4, cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
    fits = [];
    for (let s = 0; s < 4; s++) {
      const a = quad[s], b = quad[(s + 1) % 4];
      const len = dist(a, b);
      let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (nx * (cx - mx) + ny * (cy - my) < 0) { nx = -nx; ny = -ny; }
      const f = refineSide(img, a, b, { x: nx, y: ny }, halfWin);
      if (!f) return null;
      fits.push(f);
    }
    const next: Point[] = [];
    for (let s = 0; s < 4; s++) {
      const p = intersect(fits[(s + 3) % 4].line, fits[s].line);
      if (!p) return null;
      next.push(p);
    }
    quad = next;
  }
  if (!isConvex(quad)) return null;
  const { aspect, oppRatio } = aspectOf(quad);
  if (aspect < 0.56 || aspect > 0.88 || oppRatio < 0.65) return null;
  // Confidence: worst side's inlier share and residual, damped by the aspect-ratio deviation.
  let conf = 1;
  for (const f of fits) conf = Math.min(conf, f.inlierFrac * (1 / (1 + (f.rms / 0.8) ** 2)));
  const aspDev = Math.abs(aspect - CARD_ASPECT) / CARD_ASPECT;
  conf *= Math.max(0, 1 - Math.max(0, aspDev - 0.05) * 4);
  conf *= Math.min(1, cand.support / 0.8);
  return { quad: orderPortrait(quad), confidence: Math.max(0, Math.min(1, conf)) };
}


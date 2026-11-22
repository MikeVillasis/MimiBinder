// Synthetic cards and "phone photos" with exactly known geometry, for accuracy tests. Pure TS (no node APIs).
import type { BorderFit, Face, Line, Point, Quad, RGBAImage } from "../types";
import { CARD_MM } from "../types";
import { homographyFrom4, matInv, type Mat3 } from "../geometry";
import { gaussianBlur } from "../image";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  const u = Math.max(1e-12, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Smooth value noise in [0, 1] from a hashed integer lattice. */
function valueNoise(seed: number) {
  const hash = (i: number, j: number) => {
    let h = (i * 374761393 + j * 668265263 + seed * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/**
 * A card face as a colour function over card millimetres. Returns alpha (0 = outside the card).
 * `edgeDist` (optional) gives a lower bound on the distance in mm to the nearest sharp geometric edge, so the
 * renderer only supersamples where it matters.
 */
export type CardSource = ((xmm: number, ymm: number, out: number[]) => number) & { edgeDist?: (xmm: number, ymm: number) => number };

const outlineDist = (x: number, y: number) => Math.min(Math.abs(x), Math.abs(CARD_MM.width - x), Math.abs(y), Math.abs(CARD_MM.height - y));

export type BorderStyle = "yellow" | "silver" | "blue";

export interface SynthCardSpec {
  face: Face;
  style: BorderStyle;
  /** Border widths in mm (cut edge to the inner frame), measured before tilt. */
  borders: { left: number; right: number; top: number; bottom: number };
  /** Inner frame rotation about its centre, degrees (diamond cut). */
  tiltDeg?: number;
  /** Draw small print in the bottom border. */
  smallPrint?: boolean;
  seed?: number;
}

const CORNER_R = 3;
const FRAME_R = 1.2;

function inRoundedRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Corners (TL, TR, BR, BL) of the inner frame in card mm. */
export function frameCorners(spec: SynthCardSpec): Point[] {
  const { left: L, right: R, top: T, bottom: B } = spec.borders;
  const cx = (L + CARD_MM.width - R) / 2, cy = (T + CARD_MM.height - B) / 2;
  const a = ((spec.tiltDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [
    [L, T], [CARD_MM.width - R, T], [CARD_MM.width - R, CARD_MM.height - B], [L, CARD_MM.height - B],
  ].map(([x, y]) => ({ x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c }));
}

export function makeSynthCard(spec: SynthCardSpec): CardSource {
  const rng = mulberry32(spec.seed ?? 1);
  const { left: L, right: R, top: T, bottom: B } = spec.borders;
  const cx = (L + CARD_MM.width - R) / 2, cy = (T + CARD_MM.height - B) / 2;
  const a = ((spec.tiltDeg ?? 0) * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const fx0 = L, fx1 = CARD_MM.width - R, fy0 = T, fy1 = CARD_MM.height - B;

  // Art raster at 10 px/mm: smooth colour fields + random blobs + noise.
  const AR = 10;
  const aw = CARD_MM.width * AR, ah = CARD_MM.height * AR;
  const art = new Float32Array(aw * ah * 3);
  const n1 = valueNoise((spec.seed ?? 1) * 7 + 1), n2 = valueNoise((spec.seed ?? 1) * 7 + 2), n3 = valueNoise((spec.seed ?? 1) * 7 + 3);
  const blobs = Array.from({ length: 40 }, () => ({
    x: rng() * CARD_MM.width, y: rng() * CARD_MM.height, r: 1 + rng() * 8,
    col: [rng() * 255, rng() * 255, rng() * 255],
  }));
  for (let j = 0; j < ah; j++) {
    for (let i = 0; i < aw; i++) {
      const x = (i + 0.5) / AR, y = (j + 0.5) / AR;
      let r: number, g: number, b: number;
      if (spec.face === "back") {
        // Blue swirl, always lighter than the dark blue border.
        const ang = Math.atan2(y - 44, x - 31.5), rad = Math.hypot(x - 31.5, y - 44);
        const sw = 0.5 + 0.5 * Math.sin(ang * 3 + rad * 0.35 + 3 * n1(x / 6, y / 6));
        r = 40 + 80 * sw; g = 90 + 80 * sw; b = 200 + 40 * sw;
      } else {
        r = 60 + 150 * n1(x / 9, y / 9); g = 120 + 120 * n2(x / 7, y / 7); b = 40 + 180 * n3(x / 11, y / 11);
      }
      const o = (j * aw + i) * 3;
      art[o] = r + (rng() - 0.5) * 40; art[o + 1] = g + (rng() - 0.5) * 40; art[o + 2] = b + (rng() - 0.5) * 40;
    }
  }
  if (spec.face === "front") {
    for (const bl of blobs) {
      for (let j = Math.max(0, Math.floor((bl.y - bl.r) * AR)); j < Math.min(ah, Math.ceil((bl.y + bl.r) * AR)); j++) {
        for (let i = Math.max(0, Math.floor((bl.x - bl.r) * AR)); i < Math.min(aw, Math.ceil((bl.x + bl.r) * AR)); i++) {
          const x = (i + 0.5) / AR, y = (j + 0.5) / AR;
          if ((x - bl.x) ** 2 + (y - bl.y) ** 2 >= bl.r * bl.r) continue;
          const o = (j * aw + i) * 3;
          for (let c = 0; c < 3; c++) art[o + c] = art[o + c] * 0.3 + bl.col[c] * 0.7;
        }
      }
    }
  }

  // Small print mask at 20 px/mm over the bottom border.
  const TR = 20;
  const tw = CARD_MM.width * TR, th = Math.ceil(B * TR) + 2;
  const text = new Uint8Array(tw * th);
  if (spec.smallPrint && B >= 1.5) {
    const top = 0.3, height = Math.min(0.85, B - 0.6); // mm below the frame, glyph height
    for (let xc = 18; xc < 50; xc += 0.6) {
      if (rng() < 0.15) continue; // spaces
      const strokes = 1 + Math.floor(rng() * 3);
      for (let s = 0; s < strokes; s++) {
        const vertical = rng() < 0.6;
        const x0 = xc + rng() * 0.35, y0 = top + (vertical ? 0 : rng() * height);
        const w = vertical ? 0.12 : 0.45, h = vertical ? height * (0.6 + 0.4 * rng()) : 0.12;
        for (let yy = Math.floor(y0 * TR); yy < Math.min(th, Math.ceil((y0 + h) * TR)); yy++)
          for (let xx = Math.floor(x0 * TR); xx < Math.min(tw, Math.ceil((x0 + w) * TR)); xx++) text[yy * tw + xx] = 1;
      }
    }
  }

  const border = (x: number, y: number, out: number[]) => {
    if (spec.style === "yellow") { out[0] = 246; out[1] = 212; out[2] = 72; }
    else if (spec.style === "silver") {
      const v = 12 * Math.sin(0.09 * (x + 1.3 * y)) + 6 * Math.sin(0.31 * (x - y));
      out[0] = 192 + v; out[1] = 194 + v; out[2] = 201 + v;
    } else { out[0] = 28; out[1] = 56; out[2] = 148; }
  };

  const src: CardSource = (x, y, out) => {
    if (!inRoundedRect(x, y, 0, 0, CARD_MM.width, CARD_MM.height, CORNER_R)) return 0;
    // Frame coordinates (undo the tilt).
    const dx = x - cx, dy = y - cy;
    const xf = cx + dx * ca + dy * sa, yf = cy - dx * sa + dy * ca;
    if (inRoundedRect(xf, yf, fx0, fy0, fx1, fy1, FRAME_R)) {
      const i = Math.min(aw - 1, Math.max(0, Math.floor(x * AR))), j = Math.min(ah - 1, Math.max(0, Math.floor(y * AR)));
      const o = (j * aw + i) * 3;
      out[0] = art[o]; out[1] = art[o + 1]; out[2] = art[o + 2];
      return 1;
    }
    border(x, y, out);
    // Small print sits just below the frame's bottom edge (in frame coordinates).
    const ty = yf - fy1;
    if (ty >= 0 && ty < B) {
      const ti = Math.floor(xf * TR), tj = Math.floor(ty * TR);
      if (ti >= 0 && ti < tw && tj < th && text[tj * tw + ti]) { out[0] = 45; out[1] = 42; out[2] = 40; }
    }
    return 1;
  };
  src.edgeDist = (x, y) => {
    const dx = x - cx, dy = y - cy;
    const xf = cx + dx * ca + dy * sa, yf = cy - dx * sa + dy * ca;
    return Math.min(outlineDist(x, y), Math.abs(xf - fx0), Math.abs(xf - fx1), Math.abs(yf - fy0), Math.abs(yf - fy1));
  };
  return src;
}

/** Exact border lines of a synthetic card on a warp canvas (for computeCentering → ground truth). */
export function synthTruthFit(spec: SynthCardSpec, pxPerMm = 20, marginPx = 40): BorderFit {
  const P = (p: Point): Point => ({ x: marginPx + p.x * pxPerMm, y: marginPx + p.y * pxPerMm });
  const W = CARD_MM.width, H = CARD_MM.height;
  const o = [P({ x: 0, y: 0 }), P({ x: W, y: 0 }), P({ x: W, y: H }), P({ x: 0, y: H })];
  const f = frameCorners(spec).map(P);
  const L = (a: Point, b: Point): Line => ({ a, b });
  return {
    outer: { top: L(o[0], o[1]), right: L(o[1], o[2]), bottom: L(o[3], o[2]), left: L(o[0], o[3]) },
    inner: { top: L(f[0], f[1]), right: L(f[1], f[2]), bottom: L(f[3], f[2]), left: L(f[0], f[3]) },
    quality: { left: 1, right: 1, top: 1, bottom: 1 },
    pxPerMm,
  };
}

/**
 * A real card scan (RGBA with transparent rounded corners) as a CardSource, stretched to CARD_MM.
 * `shiftMm` moves the print relative to the cut (a simulated miscut): the outline stays put, the print moves,
 * and the border colour is extended past the scan's edge (clamped sampling), like a printer's bleed.
 */
export function scanSource(scan: RGBAImage, shiftMm: { x: number; y: number } = { x: 0, y: 0 }): CardSource {
  const sx = scan.width / CARD_MM.width, sy = scan.height / CARD_MM.height;
  const { width: w, height: h, data } = scan;
  const bilinear = (fx: number, fy: number, out: number[] | null): number => {
    const x0 = Math.max(0, Math.min(w - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(h - 2, Math.floor(fy)));
    const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0));
    let r = 0, g = 0, b = 0, al = 0;
    const tap = (i: number, j: number, wt: number) => {
      const o = (j * w + i) * 4;
      const aa = (data[o + 3] / 255) * wt;
      r += data[o] * aa; g += data[o + 1] * aa; b += data[o + 2] * aa; al += aa;
    };
    tap(x0, y0, (1 - ax) * (1 - ay)); tap(x0 + 1, y0, ax * (1 - ay)); tap(x0, y0 + 1, (1 - ax) * ay); tap(x0 + 1, y0 + 1, ax * ay);
    if (out && al > 1e-6) { out[0] = r / al; out[1] = g / al; out[2] = b / al; }
    return al;
  };
  const shifted = shiftMm.x !== 0 || shiftMm.y !== 0;
  const src: CardSource = (x, y, out) => {
    const fx = x * sx - 0.5, fy = y * sy - 0.5;
    if (fx < -0.5 || fy < -0.5 || fx > w - 0.5 || fy > h - 0.5) return 0;
    if (!shifted) return bilinear(fx, fy, out);
    const al = bilinear(fx, fy, null);
    if (al <= 1e-6) return 0;
    // Print sample: shifted, clamped into the scan, and kept out of the transparent corners.
    const cr = 3.2;
    let px = Math.max(0.3, Math.min(CARD_MM.width - 0.3, x - shiftMm.x));
    const py = Math.max(0.3, Math.min(CARD_MM.height - 0.3, y - shiftMm.y));
    if ((px < cr || px > CARD_MM.width - cr) && (py < cr || py > CARD_MM.height - cr)) {
      px = Math.max(cr, Math.min(CARD_MM.width - cr, px));
    }
    if (bilinear(px * sx - 0.5, py * sy - 0.5, out) <= 1e-6) return 0;
    return al;
  };
  src.edgeDist = outlineDist;
  return src;
}

export interface PhotoSpec {
  width: number;
  height: number;
  /** In-plane rotation of the card, degrees. 90 = card lying sideways. */
  rotDeg: number;
  /** Camera tilt about the card's x and y axes, degrees (perspective). */
  tiltXDeg: number;
  tiltYDeg: number;
  /** Fraction of the photo's limiting dimension the card's bounding box spans. */
  fill: number;
  background: Background;
  /** Objects on the table next to the card (drawn under the card). */
  distractors?: Distractor[] | ((quad: Quad, rng: () => number) => Distractor[]);
  /** Soft drop shadow of the card on the table: offset and softness in px, opacity 0..1. */
  shadow?: { dx: number; dy: number; soft: number; opacity: number };
  /** Card placement: random (default), or flush against a photo edge (corner `gapPx` from it). */
  placement?: { touch: "left" | "right" | "top" | "bottom"; gapPx: number };
  blurSigma: number;
  noiseSigma: number;
  vignette?: number;
  shading?: number;
  seed: number;
  /** Supersampling per axis (2 = 4 samples per pixel). */
  ss?: number;
}

export type Background = "wood" | "desk" | "dark" | "woodStrong" | "cloth" | "white" | "grey" | "beige";

/** Table clutter, in photo pixels. Shapes are drawn with hard edges (worst case for line detection). */
export type Distractor =
  /** Everything beyond the line through p with outward normal n is `color` (a table edge, a wall, a floor). */
  | { kind: "halfplane"; p: Point; n: Point; color: [number, number, number] }
  /** A rotated rectangle (phone, book, another card), optional rounded corners and a 1-colour border. */
  | { kind: "rect"; c: Point; w: number; h: number; angDeg: number; r: number; color: [number, number, number]; rim?: [number, number, number]; rimPx?: number }
  | { kind: "ellipse"; c: Point; rx: number; ry: number; angDeg: number; color: [number, number, number] };

function distractorColor(ds: Distractor[], x: number, y: number, out: number[]): boolean {
  let hit = false;
  for (const d of ds) {
    if (d.kind === "halfplane") {
      if ((x - d.p.x) * d.n.x + (y - d.p.y) * d.n.y > 0) { out[0] = d.color[0]; out[1] = d.color[1]; out[2] = d.color[2]; hit = true; }
      continue;
    }
    const a = (d.angDeg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const u = (x - d.c.x) * ca + (y - d.c.y) * sa, v = -(x - d.c.x) * sa + (y - d.c.y) * ca;
    if (d.kind === "ellipse") {
      if ((u / d.rx) ** 2 + (v / d.ry) ** 2 <= 1) { out[0] = d.color[0]; out[1] = d.color[1]; out[2] = d.color[2]; hit = true; }
      continue;
    }
    const hw = d.w / 2, hh = d.h / 2;
    const qx = Math.abs(u) - (hw - d.r), qy = Math.abs(v) - (hh - d.r);
    const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - d.r;
    if (sd <= 0) {
      const col = d.rim && sd > -(d.rimPx ?? 0) ? d.rim : d.color;
      out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; hit = true;
    }
  }
  return hit;
}

/** Signed distance from p to a convex polygon (negative inside). */
function polyDist(q: Point[], x: number, y: number): number {
  let inside = true, best = Infinity;
  const sgn = Math.sign((q[1].x - q[0].x) * (q[2].y - q[1].y) - (q[1].y - q[0].y) * (q[2].x - q[1].x)) || 1;
  for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    const ex = b.x - a.x, ey = b.y - a.y, l2 = ex * ex + ey * ey;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / l2));
    best = Math.min(best, Math.hypot(x - a.x - ex * t, y - a.y - ey * t));
    if (sgn * (ex * (y - a.y) - ey * (x - a.x)) < 0) inside = false;
  }
  return inside ? -best : best;
}

export interface SynthPhoto {
  image: RGBAImage;
  /** True card corners (TL, TR, BR, BL of the portrait card) in photo pixels. */
  quad: Quad;
  /** Card mm → photo px. */
  H: Mat3;
}

/** Project a card into a photo with a pinhole camera, over a textured background, then blur, noise and shade it. */
export function makePhoto(card: CardSource, spec: PhotoSpec): SynthPhoto {
  const rng = mulberry32(spec.seed);
  const { width: W, height: Ht } = spec;
  const f = 1.1 * Math.max(W, Ht);
  const rz = (spec.rotDeg * Math.PI) / 180, rx = (spec.tiltXDeg * Math.PI) / 180, ry = (spec.tiltYDeg * Math.PI) / 180;
  const corners3 = [[0, 0], [CARD_MM.width, 0], [CARD_MM.width, CARD_MM.height], [0, CARD_MM.height]].map(([x, y]) => {
    let X = x - CARD_MM.width / 2, Y = y - CARD_MM.height / 2, Z = 0;
    // tilt about x, then y, then in-plane rotation
    [Y, Z] = [Y * Math.cos(rx) - Z * Math.sin(rx), Y * Math.sin(rx) + Z * Math.cos(rx)];
    [X, Z] = [X * Math.cos(ry) + Z * Math.sin(ry), -X * Math.sin(ry) + Z * Math.cos(ry)];
    [X, Y] = [X * Math.cos(rz) - Y * Math.sin(rz), X * Math.sin(rz) + Y * Math.cos(rz)];
    const dist = 300;
    return { x: (f * X) / (Z + dist), y: (f * Y) / (Z + dist) };
  });
  const minX = Math.min(...corners3.map((p) => p.x)), maxX = Math.max(...corners3.map((p) => p.x));
  const minY = Math.min(...corners3.map((p) => p.y)), maxY = Math.max(...corners3.map((p) => p.y));
  const s = Math.min((spec.fill * W) / (maxX - minX), (spec.fill * Ht) / (maxY - minY));
  const bw = (maxX - minX) * s, bh = (maxY - minY) * s;
  let ox = (W - bw) * (0.2 + 0.6 * rng()) - minX * s, oy = (Ht - bh) * (0.2 + 0.6 * rng()) - minY * s;
  if (spec.placement) {
    const g = spec.placement.gapPx;
    if (spec.placement.touch === "left") ox = g - minX * s;
    else if (spec.placement.touch === "right") ox = W - g - bw - minX * s;
    else if (spec.placement.touch === "top") oy = g - minY * s;
    else oy = Ht - g - bh - minY * s;
  }
  const quad = corners3.map((p) => ({ x: p.x * s + ox, y: p.y * s + oy })) as Quad;
  const H = homographyFrom4(
    [{ x: 0, y: 0 }, { x: CARD_MM.width, y: 0 }, { x: CARD_MM.width, y: CARD_MM.height }, { x: 0, y: CARD_MM.height }],
    quad,
  )!;
  const Hi = matInv(H)!;

  const buf = new Float32Array(W * Ht * 3);
  const bgN = valueNoise(spec.seed * 13 + 5), bgN2 = valueNoise(spec.seed * 13 + 6);
  const grainAng = rng() * Math.PI;
  const gc = Math.cos(grainAng), gs = Math.sin(grainAng);
  const bg = (x: number, y: number, out: number[]) => {
    if (spec.background === "wood") {
      const u = x * gc + y * gs, v = -x * gs + y * gc;
      const grain = 0.5 + 0.5 * Math.sin((v + 25 * bgN(u / 120, v / 40)) / 7);
      const k = 0.75 + 0.25 * grain + 0.1 * (bgN2(x / 300, y / 300) - 0.5);
      out[0] = 150 * k; out[1] = 98 * k; out[2] = 55 * k;
    } else if (spec.background === "woodStrong") {
      // High-contrast, fairly straight planks and grain.
      const u = x * gc + y * gs, v = -x * gs + y * gc;
      const grain = 0.5 + 0.5 * Math.sin((v + 6 * bgN(u / 300, v / 60)) / 4.5);
      const plank = Math.floor(v / 260);
      const tone = 0.8 + 0.35 * ((plank * 0.618) % 1);
      const seam = Math.abs(((v % 260) + 260) % 260 - 2) < 3 ? 0.35 : 1;
      const k = tone * (0.55 + 0.45 * grain) * seam;
      out[0] = 165 * k; out[1] = 105 * k; out[2] = 58 * k;
    } else if (spec.background === "cloth") {
      // Busy plaid with flowers: many colours, many straight stripes.
      const u = x * gc + y * gs, v = -x * gs + y * gc;
      const sx = Math.sin(u / 9) > 0.55 ? 1 : 0, sy = Math.sin(v / 13) > 0.4 ? 1 : 0;
      const cell = (Math.floor(u / 70) + Math.floor(v / 70)) & 1;
      let r = cell ? 170 : 60, g = cell ? 40 : 90, b = cell ? 50 : 150;
      if (sx) { r = r * 0.5 + 240 * 0.5; g = g * 0.5 + 220 * 0.5; b = b * 0.5 + 120 * 0.5; }
      if (sy) { r *= 0.6; g *= 0.6; b *= 0.6; }
      const fl = bgN(x / 25, y / 25);
      if (fl > 0.78) { r = 250; g = 245; b = 235; } else if (fl < 0.18) { r = 40; g = 150; b = 70; }
      out[0] = r; out[1] = g; out[2] = b;
    } else if (spec.background === "white" || spec.background === "grey" || spec.background === "beige") {
      const base = spec.background === "white" ? [236, 236, 233] : spec.background === "grey" ? [178, 180, 184] : [228, 206, 158];
      const k = 1 + 0.05 * (bgN(x / 220, y / 220) - 0.5) + 0.03 * (bgN2(x / 5, y / 5) - 0.5);
      out[0] = base[0] * k; out[1] = base[1] * k; out[2] = base[2] * k;
    } else if (spec.background === "desk") {
      const k = 1 + 0.12 * (bgN(x / 200, y / 200) - 0.5) + 0.06 * (bgN2(x / 6, y / 6) - 0.5);
      out[0] = 78 * k; out[1] = 80 * k; out[2] = 86 * k;
    } else {
      const k = 1 + 0.2 * (bgN(x / 150, y / 150) - 0.5);
      out[0] = 30 * k; out[1] = 30 * k; out[2] = 34 * k;
    }
  };
  const bx0 = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.x))) - 2), bx1 = Math.min(W, Math.ceil(Math.max(...quad.map((p) => p.x))) + 2);
  const by0 = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.y))) - 2), by1 = Math.min(Ht, Math.ceil(Math.max(...quad.map((p) => p.y))) + 2);
  const ss = spec.ss ?? 2;
  // Background on a 4 px grid, bilinearly interpolated (it is smooth; per-pixel noise comes later).
  const G = 4, gw = Math.ceil(W / G) + 2, gh = Math.ceil(Ht / G) + 2;
  const bgGrid = new Float32Array(gw * gh * 3);
  const tmp = [0, 0, 0];
  const shQuad = spec.shadow ? quad.map((p) => ({ x: p.x + spec.shadow!.dx, y: p.y + spec.shadow!.dy })) : null;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    bg(i * G, j * G, tmp);
    if (shQuad) {
      const d = polyDist(shQuad, i * G, j * G) / spec.shadow!.soft;
      const t = d <= -1 ? 1 : d >= 1 ? 0 : 0.5 - 0.5 * Math.sin((d * Math.PI) / 2);
      const k = 1 - spec.shadow!.opacity * t;
      tmp[0] *= k; tmp[1] *= k; tmp[2] *= k;
    }
    bgGrid.set(tmp, (j * gw + i) * 3);
  }
  const ds = typeof spec.distractors === "function" ? spec.distractors(quad, mulberry32(spec.seed * 31 + 7)) : (spec.distractors ?? []);
  const dcol = [0, 0, 0];
  const bgAt = (x: number, y: number, out: number[]) => {
    const fx = x / G, fy = y / G, i = Math.floor(fx), j = Math.floor(fy), ax = fx - i, ay = fy - j;
    for (let c = 0; c < 3; c++) {
      const a = bgGrid[(j * gw + i) * 3 + c], b = bgGrid[(j * gw + i + 1) * 3 + c];
      const d = bgGrid[((j + 1) * gw + i) * 3 + c], e = bgGrid[((j + 1) * gw + i + 1) * 3 + c];
      out[c] = (a + (b - a) * ax) * (1 - ay) + (d + (e - d) * ax) * ay;
    }
  };
  const bgc = [0, 0, 0], cc = [0, 0, 0];
  const mmPerPx = CARD_MM.height / Math.min(Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y), Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y)) * 1.5;
  for (let y = 0; y < Ht; y++) {
    for (let x = 0; x < W; x++) {
      bgAt(x + 0.5, y + 0.5, bgc);
      if (ds.length && distractorColor(ds, x + 0.5, y + 0.5, dcol)) { bgc[0] = dcol[0]; bgc[1] = dcol[1]; bgc[2] = dcol[2]; }
      let r = bgc[0], g = bgc[1], b = bgc[2];
      if (x >= bx0 && x < bx1 && y >= by0 && y < by1) {
        const px = x + 0.5, py = y + 0.5;
        const wz = Hi[6] * px + Hi[7] * py + Hi[8];
        const mx = (Hi[0] * px + Hi[1] * py + Hi[2]) / wz, my = (Hi[3] * px + Hi[4] * py + Hi[5]) / wz;
        if (card.edgeDist && card.edgeDist(mx, my) > 2 * mmPerPx) {
          const a = card(mx, my, cc);
          r = cc[0] * a + bgc[0] * (1 - a); g = cc[1] * a + bgc[1] * (1 - a); b = cc[2] * a + bgc[2] * (1 - a);
          const o = (y * W + x) * 3;
          buf[o] = r; buf[o + 1] = g; buf[o + 2] = b;
          continue;
        }
        r = g = b = 0;
        for (let j = 0; j < ss; j++) {
          for (let i = 0; i < ss; i++) {
            const px = x + (i + 0.5) / ss, py = y + (j + 0.5) / ss;
            const wz = Hi[6] * px + Hi[7] * py + Hi[8];
            const a = card((Hi[0] * px + Hi[1] * py + Hi[2]) / wz, (Hi[3] * px + Hi[4] * py + Hi[5]) / wz, cc);
            r += cc[0] * a + bgc[0] * (1 - a); g += cc[1] * a + bgc[1] * (1 - a); b += cc[2] * a + bgc[2] * (1 - a);
          }
        }
        const n = ss * ss;
        r /= n; g /= n; b /= n;
      }
      const o = (y * W + x) * 3;
      buf[o] = r; buf[o + 1] = g; buf[o + 2] = b;
    }
  }
  gaussianBlur(buf, W, Ht, 3, spec.blurSigma);
  const vig = spec.vignette ?? 0.25, sh = spec.shading ?? 0.2;
  const shAng = rng() * 2 * Math.PI;
  const diag = Math.hypot(W, Ht);
  const out = new Uint8ClampedArray(W * Ht * 4);
  // Gaussian noise from a table (fast; quality is irrelevant here).
  const NT = 1 << 16;
  const gtab = new Float32Array(NT);
  for (let i = 0; i < NT; i++) gtab[i] = gauss(rng) * spec.noiseSigma;
  let seedN = ((spec.seed * 2654435761) >>> 0) || 1;
  const noise = () => {
    seedN ^= seedN << 13; seedN ^= seedN >>> 17; seedN ^= seedN << 5;
    return gtab[(seedN >>> 0) & (NT - 1)];
  };
  for (let y = 0; y < Ht; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (diag / 2), dy = (y - Ht / 2) / (diag / 2);
      const k = (1 - vig * (dx * dx + dy * dy)) * (1 + sh * (dx * Math.cos(shAng) + dy * Math.sin(shAng)) / 2);
      const o = (y * W + x) * 3, q = (y * W + x) * 4;
      out[q] = buf[o] * k + noise();
      out[q + 1] = buf[o + 1] * k + noise();
      out[q + 2] = buf[o + 2] * k + noise();
      out[q + 3] = 255;
    }
  }
  return { image: { width: W, height: Ht, data: out }, quad, H };
}

/** Flat, axis-aligned rendering of a card on a background (like a scanner bed), with the exact quad. */
export function flatCard(card: CardSource, pxPerMm: number, marginPx: number, bg: [number, number, number] = [30, 30, 34]): SynthPhoto {
  const W = Math.round(CARD_MM.width * pxPerMm) + 2 * marginPx, Ht = Math.round(CARD_MM.height * pxPerMm) + 2 * marginPx;
  const data = new Uint8ClampedArray(W * Ht * 4);
  const c = [0, 0, 0];
  for (let y = 0; y < Ht; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const a = card((x + 0.25 + 0.5 * i - marginPx) / pxPerMm, (y + 0.25 + 0.5 * j - marginPx) / pxPerMm, c);
        r += c[0] * a + bg[0] * (1 - a); g += c[1] * a + bg[1] * (1 - a); b += c[2] * a + bg[2] * (1 - a);
      }
      const o = (y * W + x) * 4;
      data[o] = r / 4; data[o + 1] = g / 4; data[o + 2] = b / 4; data[o + 3] = 255;
    }
  }
  const m = marginPx, w = CARD_MM.width * pxPerMm, h = CARD_MM.height * pxPerMm;
  const quad: Quad = [{ x: m, y: m }, { x: m + w, y: m }, { x: m + w, y: m + h }, { x: m, y: m + h }];
  return { image: { width: W, height: Ht, data }, quad, H: homographyFrom4([{ x: 0, y: 0 }, { x: CARD_MM.width, y: 0 }, { x: CARD_MM.width, y: CARD_MM.height }, { x: 0, y: CARD_MM.height }], quad)! };
}

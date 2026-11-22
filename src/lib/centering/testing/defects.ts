// Synthetic wear for the condition tests: wraps a CardSource (card mm → colour) with whitened corners and edges,
// edge chips, rounded or dinged corners, plus full-art / holo-like fronts, a mottled blue back and photo glare.
// Shapes and sizes are stated in mm so detection rates can be reported per size. Pure TS.
import type { RGBAImage, Side } from "../types";
import { CARD_MM } from "../types";
import { mulberry32, type CardSource } from "./synth";

const W = CARD_MM.width, H = CARD_MM.height;
const R = 3;
const PAPER: [number, number, number] = [238, 236, 228];

/** Corner index: 0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left. */
export type CornerIndex = 0 | 1 | 2 | 3;

export type SynthDefect =
  /** Paper showing around a corner arc, up to `depthMm` deep, fading out `spanMm` from the corner. */
  | { kind: "cornerWhitening"; corner: CornerIndex; depthMm: number; spanMm?: number }
  /** Paper showing along a side between two positions (mm from the side's left/top end). `patchy` 0 = solid line. */
  | { kind: "edgeWhitening"; side: Side; fromMm: number; toMm: number; depthMm: number; patchy?: number }
  /** A round bite out of a straight edge: about 0.7·radius deep and 1.9·radius long. */
  | { kind: "chip"; side: Side; atMm: number; radiusMm: number; rim?: boolean }
  /** Corner cut to a larger radius than the 3 mm factory one (a worn, rounded tip). */
  | { kind: "roundedCorner"; corner: CornerIndex; radiusMm: number }
  /** Corner tip cut straight across, losing `lossMm` along the diagonal. */
  | { kind: "ding"; corner: CornerIndex; lossMm: number };

function hashNoise(seed: number) {
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

/** Depth inside the factory outline, mm (negative outside). */
function depthInside(x: number, y: number): number {
  const qx = Math.abs(x - W / 2) - (W / 2 - R), qy = Math.abs(y - H / 2) - (H / 2 - R);
  return R - (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0));
}

/** Distances from the two edges that meet at a corner (both ≥ 0 inside the card). */
function cornerLocal(x: number, y: number, c: CornerIndex): [number, number] {
  return [c === 0 || c === 3 ? x : W - x, c === 0 || c === 1 ? y : H - y];
}

/** Position along a side (mm from its left/top end) and depth from that side's cut. */
function sideLocal(x: number, y: number, s: Side): [number, number] {
  switch (s) {
    case "top": return [x, y];
    case "bottom": return [x, H - y];
    case "left": return [y, x];
    case "right": return [y, W - x];
  }
}

/** Apply wear to a card. The result keeps supersampling on around every defect. */
export function withDefects(card: CardSource, defects: SynthDefect[], seed = 1): CardSource {
  const noise = hashNoise(seed * 17 + 3);
  const paper = (x: number, y: number, out: number[]) => {
    const k = 6 * (noise(x * 9, y * 9) - 0.5);
    out[0] = PAPER[0] + k; out[1] = PAPER[1] + k; out[2] = PAPER[2] + k;
  };
  const src: CardSource = (x, y, out) => {
    const a = card(x, y, out);
    if (a <= 0) return 0;
    const depth = depthInside(x, y);
    let white = false;
    for (const d of defects) {
      if (d.kind === "roundedCorner") {
        const [u, v] = cornerLocal(x, y, d.corner);
        if (u < d.radiusMm && v < d.radiusMm && Math.hypot(u - d.radiusMm, v - d.radiusMm) > d.radiusMm) return 0;
      } else if (d.kind === "ding") {
        const [u, v] = cornerLocal(x, y, d.corner);
        if (u + v < R * (2 - Math.SQRT2) + Math.SQRT2 * d.lossMm) return 0;
      } else if (d.kind === "chip") {
        const [u, v] = sideLocal(x, y, d.side);
        const r = Math.hypot(u - d.atMm, v + 0.3 * d.radiusMm);
        if (r < d.radiusMm) return 0;
        if (d.rim && r < d.radiusMm + 0.12) white = true;
      } else if (d.kind === "cornerWhitening") {
        const [u, v] = cornerLocal(x, y, d.corner);
        const span = d.spanMm ?? 4.5;
        const far = Math.hypot(u, v);
        if (far < span) {
          const taper = Math.min(1, (span - far) / 1.5);
          if (depth < d.depthMm * taper * (0.55 + 0.45 * noise(x * 3 + 11, y * 3 + 5))) white = true;
        }
      } else {
        const [u, v] = sideLocal(x, y, d.side);
        if (u >= d.fromMm && u <= d.toMm) {
          const pt = d.patchy ?? 0;
          const k = Math.max(0, noise(u * 2.5 + 31, 7.5) - pt) / (1 - pt);
          const ends = Math.min(1, (u - d.fromMm) / 0.4, (d.toMm - u) / 0.4);
          if (v < d.depthMm * Math.min(1, 0.5 + k) * (k > 0 ? 1 : 0) * Math.max(0.3, ends)) white = true;
        }
      }
    }
    if (white) paper(x, y, out);
    return a;
  };
  const base = card.edgeDist;
  src.edgeDist = (x, y) => {
    for (const d of defects) {
      if (d.kind === "chip" || d.kind === "edgeWhitening") {
        const [u, v] = sideLocal(x, y, d.side);
        const lo = d.kind === "chip" ? d.atMm - d.radiusMm - 0.5 : d.fromMm - 0.5, hi = d.kind === "chip" ? d.atMm + d.radiusMm + 0.5 : d.toMm + 0.5;
        if (u >= lo && u <= hi && v < 2.5) return 0;
      } else {
        const [u, v] = cornerLocal(x, y, d.corner);
        if (u < 7 && v < 7) return 0;
      }
    }
    return base ? base(x, y) : 0;
  };
  return src;
}

/**
 * A full-art front: art runs to the cut, no printed border or frame. `holo` adds foil-like glitter (small
 * near-white specks) and rainbow banding, the textures most likely to be mistaken for whitening.
 */
export function makeFullArtCard(seed: number, opts: { holo?: boolean } = {}): CardSource {
  const n1 = hashNoise(seed * 7 + 1), n2 = hashNoise(seed * 7 + 2), n3 = hashNoise(seed * 7 + 3), n4 = hashNoise(seed * 7 + 4);
  const rng = mulberry32(seed * 31 + 9);
  const blobs = Array.from({ length: 60 }, () => ({ x: rng() * W, y: rng() * H, r: 1 + rng() * 9, col: [rng() * 255, rng() * 255, rng() * 255] }));
  const src: CardSource = (x, y, out) => {
    if (depthInside(x, y) < 0) return 0;
    let r = 50 + 160 * n1(x / 9, y / 9), g = 60 + 150 * n2(x / 7, y / 7), b = 50 + 170 * n3(x / 11, y / 11);
    for (const bl of blobs) {
      if ((x - bl.x) ** 2 + (y - bl.y) ** 2 < bl.r * bl.r) { r = r * 0.3 + bl.col[0] * 0.7; g = g * 0.3 + bl.col[1] * 0.7; b = b * 0.3 + bl.col[2] * 0.7; }
    }
    if (opts.holo) {
      // Rainbow sheen in diagonal bands, plus glitter specks about 0.15–0.3 mm across.
      const band = 0.5 + 0.5 * Math.sin((x + 0.6 * y) / 2.2 + 4 * n4(x / 15, y / 15));
      r += 45 * band * Math.sin((x + y) / 3.1); g += 45 * band * Math.sin((x + y) / 3.1 + 2.1); b += 45 * band * Math.sin((x + y) / 3.1 + 4.2);
      const sp = n4(x * 4.2, y * 4.2);
      if (sp > 0.86) { const k = Math.min(1, (sp - 0.86) / 0.05); r = r * (1 - k) + 250 * k; g = g * (1 - k) + 250 * k; b = b * (1 - k) + 245 * k; }
    }
    out[0] = Math.max(0, Math.min(255, r)); out[1] = Math.max(0, Math.min(255, g)); out[2] = Math.max(0, Math.min(255, b));
    return 1;
  };
  src.edgeDist = (x, y) => Math.min(Math.abs(x), Math.abs(W - x), Math.abs(y), Math.abs(H - y), opts.holo ? 0 : Infinity);
  return src;
}

/**
 * Give a synthetic blue back the mottled border of a real card back: the flat navy of makeSynthCard is replaced
 * by a cloudy mix of navy and mid blue (about 1.5 mm features).
 */
export function mottledBack(card: CardSource, seed = 1): CardSource {
  const n1 = hashNoise(seed * 5 + 2), n2 = hashNoise(seed * 5 + 3);
  const src: CardSource = (x, y, out) => {
    const a = card(x, y, out);
    if (a > 0 && out[0] === 28 && out[1] === 56 && out[2] === 148) {
      const k = Math.max(0, Math.min(1, 1.6 * (0.6 * n1(x / 1.5, y / 1.5) + 0.4 * n2(x / 0.5, y / 0.5)) - 0.3));
      out[0] = 28 + 34 * k; out[1] = 56 + 46 * k; out[2] = 148 + 44 * k;
    }
    return a;
  };
  src.edgeDist = card.edgeDist;
  return src;
}

/** Add a soft specular highlight to a finished photo (in place): an ellipse that saturates at its centre. */
export function addGlare(img: RGBAImage, cx: number, cy: number, rx: number, ry: number, strength = 320): void {
  const { width, height, data } = img;
  const x0 = Math.max(0, Math.floor(cx - 3 * rx)), x1 = Math.min(width, Math.ceil(cx + 3 * rx));
  const y0 = Math.max(0, Math.floor(cy - 3 * ry)), y1 = Math.min(height, Math.ceil(cy + 3 * ry));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const k = strength * Math.exp(-0.5 * (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2));
      if (k < 1) continue;
      const o = (y * width + x) * 4;
      data[o] = Math.min(255, data[o] + k); data[o + 1] = Math.min(255, data[o + 1] + k); data[o + 2] = Math.min(255, data[o + 2] + k);
    }
  }
}

// Shared scenario runner for the accuracy tests: synthetic card → synthetic photo → full pipeline → error.
import type { CenteringResult, Face, Quad } from "../types";
import { analyzePhoto, computeCentering } from "../index";
import { makePhoto, makeSynthCard, mulberry32, synthTruthFit, type BorderStyle, type CardSource, type Distractor, type PhotoSpec, type SynthCardSpec } from "./synth";

export interface Outcome {
  name: string;
  detected: boolean;
  /** Absolute worst-point errors (ratio points). */
  errLR: number;
  errTB: number;
  /** Max corner error of the detected quad, px (after matching the cyclic order). */
  cornerErr: number;
  confidence: number;
  truth: CenteringResult;
  measured?: CenteringResult;
  ms: number;
}

/** Corner error up to a cyclic re-ordering (landscape cards have an ambiguous "top"). */
export function quadError(a: Quad, b: Quad): number {
  let best = Infinity;
  for (let s = 0; s < 4; s++) {
    let m = 0;
    for (let i = 0; i < 4; i++) m = Math.max(m, Math.hypot(a[i].x - b[(i + s) % 4].x, a[i].y - b[(i + s) % 4].y));
    best = Math.min(best, m);
  }
  return best;
}

export function randomPose(seed: number, opts: { maxRot?: number; maxTilt?: number } = {}): Pick<PhotoSpec, "rotDeg" | "tiltXDeg" | "tiltYDeg" | "fill"> {
  const r = mulberry32(seed * 7919 + 17);
  const maxRot = opts.maxRot ?? 30, maxTilt = opts.maxTilt ?? 20;
  // Total tilt ≤ maxTilt, split between the two axes.
  const t = maxTilt * Math.sqrt(r()), phi = r() * 2 * Math.PI;
  return { rotDeg: (2 * r() - 1) * maxRot, tiltXDeg: t * Math.cos(phi), tiltYDeg: t * Math.sin(phi), fill: 0.55 + 0.35 * r() };
}

export function randomCardSpec(seed: number, face: Face, style: BorderStyle): SynthCardSpec {
  const r = mulberry32(seed * 104729 + 3);
  const w = () => 1.6 + 2.4 * r();
  return {
    face, style,
    borders: { left: w(), right: w(), top: w(), bottom: w() },
    tiltDeg: (2 * r() - 1) * 0.4,
    smallPrint: face === "front",
    seed,
  };
}

export function runScenario(
  name: string,
  card: CardSource,
  truth: CenteringResult,
  face: Face,
  photo: PhotoSpec,
): Outcome {
  const t0 = performance.now();
  const ph = makePhoto(card, photo);
  const res = analyzePhoto(ph.image, face, { backgroundFilter: process.env.CENTERING_NO_BGFILTER !== "1" });
  const ms = performance.now() - t0;
  if (!res) return { name, detected: false, errLR: Infinity, errTB: Infinity, cornerErr: Infinity, confidence: 0, truth, ms };
  return {
    name,
    detected: true,
    errLR: Math.abs(res.centering.lr.worst - truth.lr.worst),
    errTB: Math.abs(res.centering.tb.worst - truth.tb.worst),
    cornerErr: quadError(res.quad, ph.quad),
    confidence: res.detect.confidence,
    truth,
    measured: res.centering,
    ms,
  };
}

export function runSynth(name: string, spec: SynthCardSpec, photo: PhotoSpec): Outcome {
  return runScenario(name, makeSynthCard(spec), computeCentering(synthTruthFit(spec)), spec.face, photo);
}

export function summarize(label: string, outs: Outcome[]): { mean: number; max: number; line: string } {
  const errs = outs.flatMap((o) => [o.errLR, o.errTB]);
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  const max = Math.max(...errs);
  const ms = outs.reduce((a, o) => a + o.ms, 0) / outs.length;
  return { mean, max, line: `${label.padEnd(34)} n=${outs.length}  mean ${mean.toFixed(3)}  max ${max.toFixed(3)}  (${ms.toFixed(0)} ms/photo)` };
}

const report = process.env.CENTERING_REPORT === "1";
const STYLES: [Face, BorderStyle, "wood" | "desk" | "dark"][] = [
  ["front", "yellow", "wood"],
  ["front", "silver", "dark"],
  ["back", "blue", "desk"],
];

/** The three border styles over random poses; prints a table when CENTERING_REPORT=1. */
export function runSynthSet(level: "standard" | "heavy", seeds: number[], size: [number, number]): Outcome[] {
  const outs: Outcome[] = [];
  for (const [face, style, bg] of STYLES) {
    for (const s of seeds) {
      const o = runSynth(`${level} ${style} #${s}`, randomCardSpec(s, face, style), {
        width: size[0], height: size[1], ...randomPose(s),
        background: s % 2 ? bg : "wood",
        blurSigma: level === "heavy" ? 2.2 : 1.0,
        noiseSigma: level === "heavy" ? 9 : 3.5,
        seed: s,
      });
      if (report) console.log(`${o.name.padEnd(22)} lr ${o.errLR.toFixed(3)} tb ${o.errTB.toFixed(3)} corner ${o.cornerErr.toFixed(2)} px conf ${o.confidence.toFixed(2)}`);
      outs.push(o);
    }
  }
  if (report) console.log(summarize(level, outs).line);
  return outs;
}


// ---------------------------------------------------------------------------------------------------------------
// Hard scenarios: busy or low-contrast backgrounds, straight distractors, shadows, edge-touching / frame-filling cards.

export const HARD_KINDS = [
  "woodStrong", "cloth", "tableEdge", "secondRect", "clutter", "shadow", "whiteSilver", "beigeYellow", "touchEdge", "fill90",
] as const;
export type HardKind = (typeof HARD_KINDS)[number];

type RGB = [number, number, number];

function cardFrame(q: Quad) {
  const c = { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
  const ang = Math.atan2(q[1].y - q[0].y + q[2].y - q[3].y, q[1].x - q[0].x + q[2].x - q[3].x);
  const w = (Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) + Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y)) / 2;
  const h = (Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y) + Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y)) / 2;
  return { c, ang, w, h, ux: { x: Math.cos(ang), y: Math.sin(ang) }, uy: { x: -Math.sin(ang), y: Math.cos(ang) } };
}

/** One photo of a hard scenario. `seed` picks the card, pose and clutter. */
export function hardScenario(kind: HardKind, seed: number): { spec: SynthCardSpec; photo: PhotoSpec } {
  const r = mulberry32(seed * 7717 + HARD_KINDS.indexOf(kind) * 101 + 5);
  const styles: [Face, BorderStyle][] = [["front", "yellow"], ["front", "silver"], ["back", "blue"]];
  let [face, style] = styles[seed % 3];
  if (kind === "whiteSilver") [face, style] = ["front", "silver"];
  if (kind === "beigeYellow") [face, style] = ["front", "yellow"];
  const spec = randomCardSpec(seed + 1000 * (HARD_KINDS.indexOf(kind) + 1), face, style);
  const pose = randomPose(seed + 500 + 37 * HARD_KINDS.indexOf(kind));
  const photo: PhotoSpec = { width: 1500, height: 2000, ...pose, background: "desk", blurSigma: 1.0, noiseSigma: 3.5, seed: seed * 3 + HARD_KINDS.indexOf(kind) * 1000 + 1 };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  switch (kind) {
    case "woodStrong": photo.background = "woodStrong"; break;
    case "cloth": photo.background = "cloth"; break;
    case "tableEdge": {
      photo.background = pick(["desk", "wood"] as const);
      const side = Math.floor(r() * 4), gap = 12 + r() * 50, tilt = ((r() - 0.5) * 6 * Math.PI) / 180;
      const colour: RGB = r() < 0.5 ? [42, 38, 36] : [232, 230, 226];
      photo.distractors = (q) => {
        const f = cardFrame(q);
        const a = q[side], b = q[(side + 1) % 4];
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        let nx = -(b.y - a.y), ny = b.x - a.x;
        const l = Math.hypot(nx, ny); nx /= l; ny /= l;
        if (nx * (m.x - f.c.x) + ny * (m.y - f.c.y) < 0) { nx = -nx; ny = -ny; }
        const c = Math.cos(tilt), s = Math.sin(tilt);
        // Tilted line touching the side's midpoint offset by `gap`; keep it clear of both corners.
        const n = { x: nx * c - ny * s, y: nx * s + ny * c };
        const off = Math.max(...[a, b].map((p) => (p.x - m.x) * n.x + (p.y - m.y) * n.y));
        return [{ kind: "halfplane", p: { x: m.x + n.x * (gap + Math.max(0, off)), y: m.y + n.y * (gap + Math.max(0, off)) }, n, color: colour }];
      };
      break;
    }
    case "secondRect": {
      photo.background = pick(["desk", "wood", "dark"] as const);
      const phone = r() < 0.5, gap = 15 + r() * 60, dAng = (r() - 0.5) * 6, right = r() < 0.5;
      const colour: RGB = phone ? [22, 22, 26] : pick([[170, 40, 40], [40, 70, 160], [230, 225, 210]] as RGB[]);
      photo.fill = 0.5 + 0.15 * r();
      photo.distractors = (q) => {
        const f = cardFrame(q);
        const h = f.h * (phone ? 1.35 : 1.6), w = phone ? h * 0.48 : h * 0.7;
        const d = f.w / 2 + gap + w / 2;
        const sgn = right ? 1 : -1;
        return [{
          kind: "rect", c: { x: f.c.x + sgn * f.ux.x * d, y: f.c.y + sgn * f.ux.y * d }, w, h,
          angDeg: (f.ang * 180) / Math.PI + dAng, r: phone ? w * 0.12 : 2, color: colour,
          rim: phone ? [150, 152, 158] : undefined, rimPx: phone ? 6 : undefined,
        }];
      };
      break;
    }
    case "clutter": {
      photo.background = pick(["desk", "wood"] as const);
      photo.fill = 0.5 + 0.2 * r();
      photo.distractors = (q, rr) => {
        const f = cardFrame(q);
        const out: Distractor[] = [];
        const n = 5 + Math.floor(rr() * 5);
        for (let i = 0; i < n; i++) {
          const ang = rr() * 2 * Math.PI, dist = (0.55 + 0.5 * rr()) * Math.hypot(f.w, f.h) / 2 + 40;
          const c = { x: f.c.x + Math.cos(ang) * dist, y: f.c.y + Math.sin(ang) * dist };
          const t = rr();
          if (t < 0.3) out.push({ kind: "ellipse", c, rx: 40 + rr() * 50, ry: 40 + rr() * 50, angDeg: rr() * 180, color: [200, 170, 90] });
          else if (t < 0.55) out.push({ kind: "rect", c, w: 200 + rr() * 80, h: 200 + rr() * 80, angDeg: rr() * 90, r: 2, color: [250, 228, 85] }); // sticky note
          else if (t < 0.8) out.push({ kind: "rect", c, w: 600 + rr() * 300, h: 18 + rr() * 10, angDeg: rr() * 180, r: 8, color: [20 + rr() * 200, 20 + rr() * 200, 20 + rr() * 200] }); // pen
          else out.push({ kind: "rect", c, w: 150 + rr() * 250, h: 100 + rr() * 200, angDeg: rr() * 90, r: 10, color: [rr() * 255, rr() * 255, rr() * 255] });
        }
        return out;
      };
      break;
    }
    case "shadow": {
      photo.background = pick(["desk", "grey", "wood"] as const);
      const a = r() * 2 * Math.PI, d = 15 + r() * 30;
      photo.shadow = { dx: Math.cos(a) * d, dy: Math.sin(a) * d, soft: 15 + r() * 35, opacity: 0.35 + 0.25 * r() };
      break;
    }
    case "whiteSilver": photo.background = pick(["white", "grey"] as const); break;
    case "beigeYellow": photo.background = "beige"; break;
    case "touchEdge":
      photo.background = pick(["desk", "wood", "dark"] as const);
      photo.placement = { touch: pick(["left", "right", "top", "bottom"] as const), gapPx: 1 + r() * 5 };
      break;
    case "fill90":
      photo.background = pick(["desk", "wood", "dark"] as const);
      photo.fill = 0.9 + 0.04 * r();
      break;
  }
  return { spec, photo };
}

export function runHard(kind: HardKind, seed: number): Outcome {
  const { spec, photo } = hardScenario(kind, seed);
  return runSynth(`${kind} #${seed}`, spec, photo);
}

/** Detection counted as a success when the corners are within 1.5 px or both ratios within 0.5. */
export const hardSuccess = (o: Outcome) => o.detected && (o.cornerErr <= 1.5 || Math.max(o.errLR, o.errTB) <= 0.5);

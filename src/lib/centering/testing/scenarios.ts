// Shared scenario runner for the accuracy tests: synthetic card → synthetic photo → full pipeline → error.
import type { CenteringResult, Face, Quad } from "../types";
import { analyzePhoto, computeCentering } from "../index";
import { makePhoto, makeSynthCard, mulberry32, synthTruthFit, type BorderStyle, type CardSource, type PhotoSpec, type SynthCardSpec } from "./synth";

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
  const res = analyzePhoto(ph.image, face);
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


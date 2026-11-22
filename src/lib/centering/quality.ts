// Capture quality: is this photo (or this live preview frame) good enough to measure from? Pure TS.
// - frameQuality: cheap sharpness (variance of the Laplacian) and glare (saturated share) for small preview frames.
// - photoQuality: after the card is found, its resolution, tilt, glare and darkness, plus the edge blur measured
//   by the condition check, turned into retake reasons.
import type { Quad, RGBAImage, WarpResult } from "./types";
import { CARD_MM } from "./types";

export interface FrameQuality {
  /** Variance of the 4-neighbour Laplacian of luma. Only comparable between frames of the same size and scene. */
  sharpness: number;
  /** Share of pixels with every channel near the top of the range. */
  glareShare: number;
  /** Mean luma, 0..255. */
  brightness: number;
}

/** Sharpness, glare and brightness of the central `inner` share (0..1 of each dimension) of a small frame. */
export function frameQuality(img: RGBAImage, inner = 0.7): FrameQuality {
  const { width: w, height: h, data } = img;
  const x0 = Math.max(1, Math.floor((w * (1 - inner)) / 2)), x1 = Math.min(w - 1, Math.ceil((w * (1 + inner)) / 2));
  const y0 = Math.max(1, Math.floor((h * (1 - inner)) / 2)), y1 = Math.min(h - 1, Math.ceil((h * (1 + inner)) / 2));
  const luma = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  let n = 0, sum = 0, sum2 = 0, sat = 0, bright = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const c = luma(i);
      const lap = luma(i - 4) + luma(i + 4) + luma(i - w * 4) + luma(i + w * 4) - 4 * c;
      sum += lap; sum2 += lap * lap; bright += c; n++;
      if (data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250) sat++;
    }
  }
  if (!n) return { sharpness: 0, glareShare: 0, brightness: 0 };
  const mean = sum / n;
  return { sharpness: sum2 / n - mean * mean, glareShare: sat / n, brightness: bright / n };
}

export type QualityIssue = "lowRes" | "blurry" | "glare" | "tilted" | "dark";

export interface PhotoQuality {
  /** Photo pixels per card millimetre (the engine wants 10 or more; about 17 gives a 1500 px tall card). */
  pxPerMm: number;
  /** Gaussian sigma of the cut-edge step, mm on the card. NaN when unknown. */
  blurMm: number;
  /** Share of the card covered by saturated highlights. */
  glareShare: number;
  /** How much longer the nearer side is than the opposite one (0 = straight on). */
  skew: number;
  /** Mean luma of the card, 0..255. */
  brightness: number;
  /** Reasons to retake, most important first. Empty when the photo is fine. */
  issues: QualityIssue[];
}

export const QUALITY_LIMITS = { minPxPerMm: 9, maxBlurMm: 0.2, maxGlareShare: 0.012, maxSkew: 0.16, minBrightness: 45 } as const;

/** Quality of a photo once the card's corners are known. `blurMm` comes from assessCondition. */
export function photoQuality(quad: Quad, warp: WarpResult, blurMm: number): PhotoQuality {
  const d = (i: number, j: number) => Math.hypot(quad[i].x - quad[j].x, quad[i].y - quad[j].y);
  const top = d(0, 1), right = d(1, 2), bottom = d(2, 3), left = d(3, 0);
  const pxPerMm = Math.min((top + bottom) / 2 / CARD_MM.width, (left + right) / 2 / CARD_MM.height);
  const ratio = (a: number, b: number) => (a > 0 && b > 0 ? Math.max(a, b) / Math.min(a, b) - 1 : 0);
  const skew = Math.max(ratio(top, bottom), ratio(left, right));
  const { image, marginPx: m } = warp;
  const { width: w, height: h, data } = image;
  let n = 0, sat = 0, bright = 0;
  for (let y = m; y < h - m; y += 3) {
    for (let x = m; x < w - m; x += 3) {
      const i = (y * w + x) * 4;
      n++;
      bright += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250) sat++;
    }
  }
  const glareShare = n ? sat / n : 0;
  const brightness = n ? bright / n : 0;
  const L = QUALITY_LIMITS;
  const issues: QualityIssue[] = [];
  if (blurMm > L.maxBlurMm) issues.push("blurry");
  if (glareShare > L.maxGlareShare) issues.push("glare");
  if (pxPerMm < L.minPxPerMm) issues.push("lowRes");
  if (skew > L.maxSkew) issues.push("tilted");
  if (brightness < L.minBrightness) issues.push("dark");
  return { pxPerMm, blurMm, glareShare, skew, brightness, issues };
}

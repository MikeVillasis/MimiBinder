// Public API of the centering engine. All functions are pure and synchronous (run them in a Worker for big photos).
//
// Pipeline: downscale → detectCard (on the small image) → scaleQuad back to the original → warpCard (from the
// original pixels) → measureBorders → computeCentering → psaCeiling. `analyzePhoto` runs all of it.
//
// Orientation: detectCard returns corners for a portrait card using the smallest rotation that makes it portrait.
// A card lying sideways (≈90°) or upside down is ambiguous, so the UI should offer a rotate button
// (`rotateQuad`) and re-warp.
import type { BorderFit, CenteringResult, DetectResult, Face, Quad, RGBAImage, WarpResult } from "./types";
import { downscale as downscaleImpl } from "./image";
import { detectCard as detectImpl } from "./detect";
import { warpCard as warpImpl } from "./warp";
import { measureBorders as measureImpl } from "./measure";
import { computeCentering as computeImpl } from "./compute";
import { scaleQuad } from "./geometry";

export * from "./types";
export * from "./psa";
export { scaleQuad } from "./geometry";
export { canvasQuad, canvasToImage, DEFAULT_MARGIN_MM, DEFAULT_PX_PER_MM } from "./warp";
export { measureSide, type SideMeasurement } from "./measure";
export { CORNER_ZONE_MM } from "./compute";
export { orderPortrait } from "./detect";

/** Downscale for detection (long edge ≤ maxEdge), box-filtered. Returns the image and the scale (small/original). */
export function downscale(img: RGBAImage, maxEdge = 1600): { image: RGBAImage; scale: number } {
  return downscaleImpl(img, maxEdge);
}

/**
 * Find the card in a photo: fits straight lines to the four cut edges and intersects them. Null if not found.
 * Corners are TL, TR, BR, BL of the card held portrait (smallest rotation; see the note at the top of this file).
 */
export function detectCard(img: RGBAImage): DetectResult | null {
  return detectImpl(img);
}

/** Perspective-correct the card to a portrait canvas of CARD_MM at `pxPerMm`, plus a margin of `marginMm`. */
export function warpCard(img: RGBAImage, quad: Quad, opts?: { pxPerMm?: number; marginMm?: number }): WarpResult {
  return warpImpl(img, quad, opts);
}

/** Sub-pixel outer cut-edge and inner frame lines on a warped card. */
export function measureBorders(warp: WarpResult, face: Face): BorderFit {
  return measureImpl(warp, face);
}

/** Worst-point and mean ratios from (possibly user-adjusted) border lines. `worstMm.a` is left/top, `b` right/bottom. */
export function computeCentering(fit: BorderFit): CenteringResult {
  return computeImpl(fit);
}

/** Rotate the corner order by quarter turns clockwise (for the UI's rotate button). */
export function rotateQuad(q: Quad, quarterTurns = 1): Quad {
  const k = ((quarterTurns % 4) + 4) % 4;
  // Turning the card clockwise in the canonical view means the old left-bottom corner becomes the top-left.
  return [0, 1, 2, 3].map((i) => q[(i - k + 4) % 4]) as Quad;
}

export interface PhotoAnalysis {
  detect: DetectResult;
  /** Quad in original-image pixels. */
  quad: Quad;
  warp: WarpResult;
  fit: BorderFit;
  centering: CenteringResult;
}

/** Whole pipeline on one photo. Null if no card was found. */
export function analyzePhoto(
  img: RGBAImage,
  face: Face,
  opts?: { pxPerMm?: number; marginMm?: number; maxDetectEdge?: number },
): PhotoAnalysis | null {
  const { image, scale } = downscaleImpl(img, opts?.maxDetectEdge ?? 1600);
  const detect = detectImpl(image);
  if (!detect) return null;
  const quad = scaleQuad(detect.quad, 1 / scale);
  const warp = warpImpl(img, quad, opts);
  const fit = measureImpl(warp, face);
  return { detect, quad, warp, fit, centering: computeImpl(fit) };
}

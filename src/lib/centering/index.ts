// Public API of the centering engine. All functions are pure and synchronous (run them in a Worker for big photos).
import type { BorderFit, CenteringResult, DetectResult, Face, Quad, RGBAImage, WarpResult } from "./types";

export * from "./types";
export * from "./psa";

/** Downscale for detection (long edge ≤ maxEdge), box-filtered. Returns the image and the scale (small/original). */
export function downscale(img: RGBAImage, maxEdge = 1600): { image: RGBAImage; scale: number } {
  throw new Error("not implemented");
}

/** Find the card in a photo: fits straight lines to the four cut edges and intersects them. Null if not found. */
export function detectCard(img: RGBAImage): DetectResult | null {
  throw new Error("not implemented");
}

/** Perspective-correct the card to a portrait canvas of CARD_MM at `pxPerMm`, plus a margin of `marginMm`. */
export function warpCard(img: RGBAImage, quad: Quad, opts?: { pxPerMm?: number; marginMm?: number }): WarpResult {
  throw new Error("not implemented");
}

/** Sub-pixel outer cut-edge and inner frame lines on a warped card. */
export function measureBorders(warp: WarpResult, face: Face): BorderFit {
  throw new Error("not implemented");
}

/** Worst-point and mean ratios from (possibly user-adjusted) border lines. */
export function computeCentering(fit: BorderFit): CenteringResult {
  throw new Error("not implemented");
}

// Card-centering engine contract (pure TypeScript, no DOM: safe in a Web Worker and in Vitest).
// Phase 1 of docs/research/PSA grade prediction from photos.md. Coordinates are in pixels, x right, y down.

/** Same layout as the DOM ImageData (RGBA, row-major), without depending on it. */
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Point {
  x: number;
  y: number;
}

/** Card corners in image pixels, clockwise from top-left: [topLeft, topRight, bottomRight, bottomLeft]. */
export type Quad = [Point, Point, Point, Point];

export type Side = "left" | "right" | "top" | "bottom";
export const SIDES: readonly Side[] = ["left", "right", "top", "bottom"];

/** Pokémon card size in mm (portrait). */
export const CARD_MM = { width: 63, height: 88 } as const;

/** A straight line through two points (in warped-canvas pixels). Border lines may be slightly tilted. */
export interface Line {
  a: Point;
  b: Point;
}

export interface DetectResult {
  /** Outer cut-edge corners in the source image (from fitted edge lines, not the rounded contour). */
  quad: Quad;
  /** 0..1; below ~0.5 the UI should ask the user to check the corners. */
  confidence: number;
}

export interface WarpResult {
  /** Canonical, perspective-corrected image: the card plus `marginPx` on every side, portrait. */
  image: RGBAImage;
  pxPerMm: number;
  marginPx: number;
}

/** Outer (cut edge) and inner (printed frame) lines per side, in warped-canvas pixels. */
export interface BorderFit {
  outer: Record<Side, Line>;
  inner: Record<Side, Line>;
  /** 0..1 per side: how consistent the edge samples were. Low = ask the user to check that line. */
  quality: Record<Side, number>;
  /** 0..1 per side for the printed frame alone (0 = no frame line found). Set by measureBorders. */
  innerQuality?: Record<Side, number>;
  /** Pixels per mm of the canvas the lines live in (copied from WarpResult). */
  pxPerMm: number;
}

/** One axis (left/right or top/bottom). Ratios are the larger border's share, 50..100 (57.3 means 57.3/42.7). */
export interface AxisCentering {
  /** Worst (most off-centre) ratio along the whole side length: what PSA judges. */
  worst: number;
  /** Average ratio, for information only. */
  mean: number;
  /** Which border is the larger one at the worst point. */
  heavySide: Side;
  /** Border widths in mm at the worst point. */
  worstMm: { a: number; b: number };
}

export interface CenteringResult {
  lr: AxisCentering;
  tb: AxisCentering;
}

export type Face = "front" | "back";

/** Highest PSA grade centering allows on one face, from the published limits (larger share, %). */
export interface PsaCenteringLimit {
  grade: number;
  label: string;
  frontMax: number;
  backMax: number;
}

// Perspective correction to a canonical portrait canvas.
import type { Point, Quad, RGBAImage, WarpResult } from "./types";
import { CARD_MM } from "./types";
import { applyH, homographyFrom4, type Mat3 } from "./geometry";

export const DEFAULT_PX_PER_MM = 20;
export const DEFAULT_MARGIN_MM = 2;

/** Canvas positions of the card corners (TL, TR, BR, BL) for given warp settings. */
export function canvasQuad(pxPerMm: number, marginPx: number): Quad {
  const w = CARD_MM.width * pxPerMm, h = CARD_MM.height * pxPerMm;
  return [
    { x: marginPx, y: marginPx },
    { x: marginPx + w, y: marginPx },
    { x: marginPx + w, y: marginPx + h },
    { x: marginPx, y: marginPx + h },
  ];
}

/** Homography mapping warped-canvas coordinates to source-image coordinates. */
export function canvasToImageH(quad: Quad, pxPerMm: number, marginPx: number): Mat3 {
  const H = homographyFrom4(canvasQuad(pxPerMm, marginPx), quad);
  if (!H) throw new Error("degenerate quad");
  return H;
}

/** Map a point on the warped canvas back to the source image (e.g. to draw fitted lines on the photo). */
export function canvasToImage(quad: Quad, warp: Pick<WarpResult, "pxPerMm" | "marginPx">, p: Point): Point {
  return applyH(canvasToImageH(quad, warp.pxPerMm, warp.marginPx), p);
}

/** Perspective-correct the card to a portrait canvas of CARD_MM at `pxPerMm`, plus a margin of `marginMm`. */
export function warpCard(img: RGBAImage, quad: Quad, opts?: { pxPerMm?: number; marginMm?: number }): WarpResult {
  const pxPerMm = opts?.pxPerMm ?? DEFAULT_PX_PER_MM;
  const marginPx = Math.round((opts?.marginMm ?? DEFAULT_MARGIN_MM) * pxPerMm);
  const W = Math.round(CARD_MM.width * pxPerMm) + 2 * marginPx;
  const Hh = Math.round(CARD_MM.height * pxPerMm) + 2 * marginPx;
  const H = canvasToImageH(quad, pxPerMm, marginPx);
  const out = new Uint8ClampedArray(W * Hh * 4);
  const { width: sw, height: sh, data: src } = img;
  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = H;
  for (let y = 0; y < Hh; y++) {
    const v = y + 0.5;
    // Numerators/denominator are affine in u along a row.
    let X = h0 * 0.5 + h1 * v + h2;
    let Y = h3 * 0.5 + h4 * v + h5;
    let Z = h6 * 0.5 + h7 * v + h8;
    let o = y * W * 4;
    for (let x = 0; x < W; x++, o += 4, X += h0, Y += h3, Z += h6) {
      const fx = X / Z - 0.5, fy = Y / Z - 0.5;
      if (!(fx > -1 && fy > -1 && fx < sw && fy < sh)) { out[o + 3] = 255; continue; }
      let x0 = Math.floor(fx), y0 = Math.floor(fy);
      let ax = fx - x0, ay = fy - y0;
      if (x0 < 0) { x0 = 0; ax = 0; } else if (x0 >= sw - 1) { x0 = sw - 2; ax = 1; }
      if (y0 < 0) { y0 = 0; ay = 0; } else if (y0 >= sh - 1) { y0 = sh - 2; ay = 1; }
      const i00 = (y0 * sw + x0) * 4, i01 = i00 + sw * 4;
      const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
      out[o] = src[i00] * w00 + src[i00 + 4] * w10 + src[i01] * w01 + src[i01 + 4] * w11;
      out[o + 1] = src[i00 + 1] * w00 + src[i00 + 5] * w10 + src[i01 + 1] * w01 + src[i01 + 5] * w11;
      out[o + 2] = src[i00 + 2] * w00 + src[i00 + 6] * w10 + src[i01 + 2] * w01 + src[i01 + 6] * w11;
      out[o + 3] = 255;
    }
  }
  return { image: { width: W, height: Hh, data: out }, pxPerMm, marginPx };
}

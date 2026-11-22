// Perspective correction to a canonical portrait canvas.
import type { Point, Quad, RGBAImage, WarpResult } from "./types";
import { CARD_MM } from "./types";
import { applyH, homographyFrom4, type Mat3 } from "./geometry";
import { sampleRGB } from "./image";

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
      // Outside the photo, replicate its edge pixels: a black fill would put a false "cut edge" in the margin
      // when the card touches the photo border.
      let fx = X / Z - 0.5, fy = Y / Z - 0.5;
      if (!(fx === fx && fy === fy)) { out[o + 3] = 255; continue; }
      fx = fx < 0 ? 0 : fx > sw - 1 ? sw - 1 : fx;
      fy = fy < 0 ? 0 : fy > sh - 1 ? sh - 1 : fy;
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

/**
 * Re-sample a rectangle of the warped canvas straight from the photo, at `scale` times the canvas resolution.
 * For evidence crops: when the photo is sharper than the 20 px/mm canvas, the crop keeps that detail instead of
 * being an enlargement of the canvas. `rect` is in canvas pixels; the result is rect.w·scale by rect.h·scale.
 */
export function warpRegion(
  img: RGBAImage,
  quad: Quad,
  warp: Pick<WarpResult, "pxPerMm" | "marginPx">,
  rect: { x: number; y: number; w: number; h: number },
  scale: number,
): RGBAImage {
  const H = canvasToImageH(quad, warp.pxPerMm, warp.marginPx);
  const W = Math.max(1, Math.round(rect.w * scale)), Hh = Math.max(1, Math.round(rect.h * scale));
  const out = new Uint8ClampedArray(W * Hh * 4);
  const rgb = [0, 0, 0];
  for (let y = 0; y < Hh; y++) {
    const v = rect.y + (y + 0.5) / scale;
    for (let x = 0; x < W; x++) {
      const u = rect.x + (x + 0.5) / scale;
      const w = H[6] * u + H[7] * v + H[8];
      sampleRGB(img, (H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w, rgb);
      const o = (y * W + x) * 4;
      out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 255;
    }
  }
  return { width: W, height: Hh, data: out };
}

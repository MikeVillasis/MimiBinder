// Raster helpers: area downscale, float planes, blur, bilinear sampling, Lab conversion.
// Coordinates are continuous: pixel (i, j) covers [i, i+1) x [j, j+1), so its centre is (i + 0.5, j + 0.5).
import type { RGBAImage } from "./types";

/**
 * Downscale for detection (long edge ≤ maxEdge) with an exact area (box) filter.
 * Returns the image and the scale (small/original); multiply small-image coordinates by 1/scale to map back.
 */
export function downscale(img: RGBAImage, maxEdge = 1600): { image: RGBAImage; scale: number } {
  const long = Math.max(img.width, img.height);
  if (long <= maxEdge) return { image: img, scale: 1 };
  const scale = maxEdge / long;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  return { image: resizeArea(img, w, h), scale };
}

interface Taps {
  start: Int32Array;
  count: Int32Array;
  idx: Int32Array;
  wt: Float32Array;
}

function areaTaps(src: number, dst: number): Taps {
  const f = src / dst;
  const start = new Int32Array(dst);
  const count = new Int32Array(dst);
  const idx: number[] = [];
  const wt: number[] = [];
  for (let o = 0; o < dst; o++) {
    const a = o * f, b = (o + 1) * f;
    start[o] = idx.length;
    for (let i = Math.floor(a); i < Math.min(src, Math.ceil(b)); i++) {
      const w = Math.min(b, i + 1) - Math.max(a, i);
      if (w > 1e-9) { idx.push(i); wt.push(w / f); }
    }
    count[o] = idx.length - start[o];
  }
  return { start, count, idx: Int32Array.from(idx), wt: Float32Array.from(wt) };
}

/** Area-average resize (downscaling only). */
export function resizeArea(img: RGBAImage, w: number, h: number): RGBAImage {
  const { width: W, height: H, data } = img;
  const tx = areaTaps(W, w);
  const ty = areaTaps(H, h);
  const tmp = new Float32Array(w * H * 4);
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const s0 = tx.start[x], n = tx.count[x];
      for (let k = 0; k < n; k++) {
        const o = row + tx.idx[s0 + k] * 4, wt = tx.wt[s0 + k];
        r += data[o] * wt; g += data[o + 1] * wt; b += data[o + 2] * wt; a += data[o + 3] * wt;
      }
      const t = (y * w + x) * 4;
      tmp[t] = r; tmp[t + 1] = g; tmp[t + 2] = b; tmp[t + 3] = a;
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const s0 = ty.start[y], n = ty.count[y];
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < n; k++) {
        const o = (ty.idx[s0 + k] * w + x) * 4, wt = ty.wt[s0 + k];
        r += tmp[o] * wt; g += tmp[o + 1] * wt; b += tmp[o + 2] * wt; a += tmp[o + 3] * wt;
      }
      const t = (y * w + x) * 4;
      out[t] = r; out[t + 1] = g; out[t + 2] = b; out[t + 3] = a;
    }
  }
  return { width: w, height: h, data: out };
}

/** Separable Gaussian blur of an interleaved float buffer with `ch` channels (in place, clamped borders). */
export function gaussianBlur(buf: Float32Array, w: number, h: number, ch: number, sigma: number): void {
  if (sigma <= 0) return;
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp((-i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const rowLen = w * ch;
  // Horizontal: padded copy of each row, then a straight convolution.
  const pad = new Float32Array((w + 2 * r) * ch);
  for (let y = 0; y < h; y++) {
    const base = y * rowLen;
    for (let x = -r; x < w + r; x++) {
      const xx = x < 0 ? 0 : x >= w ? w - 1 : x;
      for (let c = 0; c < ch; c++) pad[(x + r) * ch + c] = buf[base + xx * ch + c];
    }
    for (let i = 0; i < rowLen; i++) {
      let acc = 0;
      for (let t = 0, j = i; t < k.length; t++, j += ch) acc += pad[j] * k[t];
      buf[base + i] = acc;
    }
  }
  // Vertical: accumulate whole rows (cache friendly).
  const src = buf.slice();
  for (let y = 0; y < h; y++) {
    const base = y * rowLen;
    for (let i = 0; i < rowLen; i++) buf[base + i] = 0;
    for (let t = -r; t <= r; t++) {
      let yy = y + t;
      yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
      const kt = k[t + r], sb = yy * rowLen;
      for (let i = 0; i < rowLen; i++) buf[base + i] += src[sb + i] * kt;
    }
  }
}

/** RGB float planes (interleaved, 3 channels) from RGBA. */
export function toRGBFloat(img: RGBAImage): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n * 3);
  const d = img.data;
  for (let i = 0; i < n; i++) { out[i * 3] = d[i * 4]; out[i * 3 + 1] = d[i * 4 + 1]; out[i * 3 + 2] = d[i * 4 + 2]; }
  return out;
}

/** Bilinear RGB sample at continuous coordinates (x, y) into out[o..o+2]. Clamped at the borders. */
export function sampleRGB(img: RGBAImage, x: number, y: number, out: Float32Array | number[], o = 0): void {
  const { width: w, height: h, data } = img;
  let fx = x - 0.5, fy = y - 0.5;
  fx = fx < 0 ? 0 : fx > w - 1 ? w - 1 : fx;
  fy = fy < 0 ? 0 : fy > h - 1 ? h - 1 : fy;
  const x0 = Math.min(w - 2, Math.floor(fx)), y0 = Math.min(h - 2, Math.floor(fy));
  const ax = fx - Math.max(0, x0), ay = fy - Math.max(0, y0);
  const X0 = Math.max(0, x0), Y0 = Math.max(0, y0);
  const X1 = Math.min(w - 1, X0 + 1), Y1 = Math.min(h - 1, Y0 + 1);
  const i00 = (Y0 * w + X0) * 4, i10 = (Y0 * w + X1) * 4, i01 = (Y1 * w + X0) * 4, i11 = (Y1 * w + X1) * 4;
  for (let c = 0; c < 3; c++) {
    const top = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * ax;
    const bot = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * ax;
    out[o + c] = top + (bot - top) * ay;
  }
}

const SRGB_TO_LINEAR = (() => {
  const t = new Float32Array(255 * 4 + 2);
  for (let i = 0; i < t.length; i++) {
    const v = Math.min(1, i / 1020);
    t[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  return t;
})();

function srgbLin(v: number): number {
  const f = v * 4;
  const i = f <= 0 ? 0 : f >= SRGB_TO_LINEAR.length - 1 ? SRGB_TO_LINEAR.length - 2 : Math.floor(f);
  const a = f - i;
  return SRGB_TO_LINEAR[i] + (SRGB_TO_LINEAR[i + 1] - SRGB_TO_LINEAR[i]) * (a < 0 ? 0 : a > 1 ? 1 : a);
}

const labF = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** CIELAB (D65) of an sRGB colour given as 0..255 floats; writes L, a, b into out[o..o+2]. */
export function rgbToLab(r: number, g: number, b: number, out: Float32Array | number[], o = 0): void {
  const R = srgbLin(r), G = srgbLin(g), B = srgbLin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = labF(X), fy = labF(Y), fz = labF(Z);
  out[o] = 116 * fy - 16;
  out[o + 1] = 500 * (fx - fy);
  out[o + 2] = 200 * (fy - fz);
}

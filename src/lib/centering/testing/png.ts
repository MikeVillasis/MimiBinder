// Test-only PNG codec on node:zlib (no dependencies). Decodes 8-bit greyscale/RGB/RGBA/palette PNGs without
// interlacing, which is what encodePng writes. Not for app code: it imports node built-ins.
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import type { RGBAImage } from "../types";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Palette PNG when the image has at most 256 distinct RGBA colours, else null. */
function encodePalette(img: RGBAImage): Buffer | null {
  const { width, height, data } = img;
  const index = new Map<number, number>();
  const idx = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const key = ((data[i * 4] << 24) | (data[i * 4 + 1] << 16) | (data[i * 4 + 2] << 8) | data[i * 4 + 3]) >>> 0;
    let k = index.get(key);
    if (k === undefined) {
      if (index.size === 256) return null;
      k = index.size;
      index.set(key, k);
    }
    idx[i] = k;
  }
  const plte = new Uint8Array(index.size * 3);
  const trns = new Uint8Array(index.size);
  for (const [key, k] of index) {
    plte[k * 3] = key >>> 24;
    plte[k * 3 + 1] = (key >>> 16) & 0xff;
    plte[k * 3 + 2] = (key >>> 8) & 0xff;
    trns[k] = key & 0xff;
  }
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) raw.set(idx.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  return Buffer.concat([
    SIG, chunk("IHDR", ihdr), chunk("PLTE", plte), chunk("tRNS", trns),
    chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array(0)),
  ]);
}

/** Encode as a palette PNG when possible, else RGBA (or RGB when opaque) with per-row adaptive filtering. */
export function encodePng(img: RGBAImage): Buffer {
  const pal = encodePalette(img);
  if (pal) return pal;
  const { width, height, data } = img;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { opaque = false; break; }
  const bpp = opaque ? 3 : 4;
  const stride = width * bpp;
  const raw = new Uint8Array(height * (stride + 1));
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  const cand = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) for (let c = 0; c < bpp; c++) cur[x * bpp + c] = data[(y * width + x) * 4 + c];
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = y > 0 ? prev[i] : 0;
        const c = i >= bpp && y > 0 ? prev[i - bpp] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (cur[i] - pred) & 0xff;
        cand[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        raw[y * (stride + 1)] = f;
        raw.set(cand, y * (stride + 1) + 1);
      }
    }
    prev.set(cur);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array(0))]);
}

export function decodePng(buf: Uint8Array): RGBAImage {
  const b = Buffer.from(buf);
  if (!b.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  let pos = 8;
  let width = 0, height = 0, colorType = 0, depth = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Buffer[] = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString("ascii", pos + 4, pos + 8);
    const data = b.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") palette = new Uint8Array(data);
    else if (type === "tRNS") trns = new Uint8Array(data);
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, interlace ${interlace})`);
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType as 0 | 2 | 3 | 4 | 6];
  if (!bpp) throw new Error(`unsupported colour type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Uint8ClampedArray(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const bb = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? bb : f === 3 ? (a + bb) >> 1 : paeth(a, bb, c);
      cur[i] = (row[i] + pred) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * bpp;
      if (colorType === 6) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = cur[s + 3]; }
      else if (colorType === 2) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = 255; }
      else if (colorType === 0) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = 255; }
      else if (colorType === 4) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = cur[s + 1]; }
      else {
        const k = cur[s];
        out[o] = palette![k * 3]; out[o + 1] = palette![k * 3 + 1]; out[o + 2] = palette![k * 3 + 2];
        out[o + 3] = trns && k < trns.length ? trns[k] : 255;
      }
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

export const readPng = (path: string): RGBAImage => decodePng(readFileSync(path));
export const writePng = (path: string, img: RGBAImage): void => writeFileSync(path, encodePng(img));

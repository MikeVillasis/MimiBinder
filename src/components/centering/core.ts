// Pipeline steps shared by the Web Worker and the main-thread fallback. No DOM access.
import { assessCondition, detectCard, downscale, measureBorders, photoQuality, warpCard, warpRegion } from "@/lib/centering";
import type { BorderFit, ConditionReport, Face, PhotoQuality, Quad, RGBAImage, WarpResult, ZoneId } from "@/lib/centering";

export interface DetectOut {
  /** Quad in full-resolution pixels, or null when nothing card-like was found. */
  quad: Quad | null;
  confidence: number;
  /** Time spent downscaling and detecting, ms. */
  ms: number;
}

export interface MeasureOut {
  warp: WarpResult;
  fit: BorderFit;
  /** Corner and edge flags (phase 2), computed once from the automatic fit. */
  condition: ConditionReport;
  /** Retake reasons: blur, glare, low resolution, tilt, darkness. */
  quality: PhotoQuality;
  /**
   * Evidence crops (every corner, every flagged edge) re-sampled from the photo at up to 2.5x the canvas
   * resolution. Empty when the photo is no sharper than the canvas: the UI then crops the canvas itself.
   */
  crops: { zone: ZoneId; image: RGBAImage }[];
  /** Time per step, ms. */
  ms: { warp: number; fit: number; condition: number };
}

const store = new Map<Face, RGBAImage>();
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Keep the full-resolution photo, then find the card on a small copy and scale the corners back up. */
export function loadAndDetect(face: Face, img: RGBAImage): DetectOut {
  const t0 = now();
  store.set(face, img);
  const { image, scale } = downscale(img);
  const found = detectCard(image);
  if (!found) return { quad: null, confidence: 0, ms: now() - t0 };
  const k = scale > 0 ? 1 / scale : 1;
  const quad = found.quad.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad;
  return { quad, confidence: found.confidence, ms: now() - t0 };
}

export function measureFace(face: Face, quad: Quad): MeasureOut {
  const img = store.get(face);
  if (!img) throw new Error("Photo is no longer loaded. Please choose it again.");
  const t0 = now();
  const warp = warpCard(img, quad);
  const t1 = now();
  const fit = measureBorders(warp, face);
  const t2 = now();
  const condition = assessCondition(warp, fit, face);
  const quality = photoQuality(quad, warp, condition.blurMm);
  const scale = Math.min(2.5, quality.pxPerMm / warp.pxPerMm);
  const crops: MeasureOut["crops"] = [];
  if (scale >= 1.15) {
    for (const z of condition.zones) {
      if (z.zone.startsWith("corner-") || z.status === "flagged") crops.push({ zone: z.zone, image: warpRegion(img, quad, warp, z.crop, scale) });
    }
  }
  return { warp, fit, condition, quality, crops, ms: { warp: t1 - t0, fit: t2 - t1, condition: now() - t2 } };
}

export function release(face: Face) {
  store.delete(face);
}

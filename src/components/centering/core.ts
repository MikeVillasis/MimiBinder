// Pipeline steps shared by the Web Worker and the main-thread fallback. No DOM access.
import { detectCard, downscale, measureBorders, warpCard } from "@/lib/centering";
import type { BorderFit, Face, Quad, RGBAImage, WarpResult } from "@/lib/centering";

export interface DetectOut {
  /** Quad in full-resolution pixels, or null when nothing card-like was found. */
  quad: Quad | null;
  confidence: number;
}

export interface MeasureOut {
  warp: WarpResult;
  fit: BorderFit;
}

const store = new Map<Face, RGBAImage>();

/** Keep the full-resolution photo, then find the card on a small copy and scale the corners back up. */
export function loadAndDetect(face: Face, img: RGBAImage): DetectOut {
  store.set(face, img);
  const { image, scale } = downscale(img);
  const found = detectCard(image);
  if (!found) return { quad: null, confidence: 0 };
  const k = scale > 0 ? 1 / scale : 1;
  const quad = found.quad.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad;
  return { quad, confidence: found.confidence };
}

export function measureFace(face: Face, quad: Quad): MeasureOut {
  const img = store.get(face);
  if (!img) throw new Error("Photo is no longer loaded. Please choose it again.");
  const warp = warpCard(img, quad);
  const fit = measureBorders(warp, face);
  return { warp, fit };
}

export function release(face: Face) {
  store.delete(face);
}

// Evidence images for the corner and edge flags: small crops of the flattened card, with the flagged spots
// marked. Made on the main thread from the warped pixels (which never leave the device).
import type { ConditionReport, Point, Rect, RGBAImage, ZoneId } from "@/lib/centering";

export interface EvidenceCrop {
  /** JPEG data URL of the crop. */
  src: string;
  /** Crop size in warped-canvas px (the coordinate space of `marks`). */
  w: number;
  h: number;
  /** Flagged spots as polylines, relative to the crop's top-left. */
  marks: Point[][];
}

export type Evidence = Partial<Record<ZoneId, EvidenceCrop>>;

function canvasOf(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

/** Cut `rect` out of an RGBA image, scaled so its long edge is `longEdge` px (never upscaled past 3x). */
export function cropToDataUrl(image: RGBAImage, rect: Rect, longEdge = 240, quality = 0.86): string {
  const src = canvasOf(rect.w, rect.h);
  if (!src) return "";
  const data = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const from = ((rect.y + y) * image.width + rect.x) * 4;
    data.set(image.data.subarray(from, from + rect.w * 4), y * rect.w * 4);
  }
  src.ctx.putImageData(new ImageData(data, rect.w, rect.h), 0, 0);
  const k = Math.min(3, longEdge / Math.max(rect.w, rect.h));
  const out = canvasOf(Math.max(1, Math.round(rect.w * k)), Math.max(1, Math.round(rect.h * k)));
  if (!out) return "";
  out.ctx.imageSmoothingEnabled = true;
  out.ctx.imageSmoothingQuality = "high";
  out.ctx.drawImage(src.canvas, 0, 0, out.canvas.width, out.canvas.height);
  return out.canvas.toDataURL("image/jpeg", quality);
}

/**
 * Crops for every corner and for every flagged edge. `sharp` holds crops the worker re-sampled from the photo
 * at a higher resolution than the canvas; zones without one are cut from the canvas.
 */
export function buildEvidence(image: RGBAImage, report: ConditionReport, sharp: { zone: ZoneId; image: RGBAImage }[] = []): Evidence {
  const out: Evidence = {};
  const hi = new Map(sharp.map((c) => [c.zone, c.image]));
  for (const z of report.zones) {
    if (!z.zone.startsWith("corner-") && z.status !== "flagged") continue;
    const better = hi.get(z.zone);
    const src = better ? cropToDataUrl(better, { x: 0, y: 0, w: better.width, h: better.height }, 480) : cropToDataUrl(image, z.crop);
    if (!src) continue;
    out[z.zone] = { src, w: z.crop.w, h: z.crop.h, marks: z.marks.map((line) => line.map((p) => ({ x: p.x - z.crop.x, y: p.y - z.crop.y }))) };
  }
  return out;
}

/** Small JPEG of the whole flattened card, for the saved assessment. */
export function thumbnail(image: RGBAImage, longEdge = 360): string {
  return cropToDataUrl(image, { x: 0, y: 0, w: image.width, h: image.height }, longEdge, 0.8);
}

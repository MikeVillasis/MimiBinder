import type { RGBAImage } from "@/lib/centering";

const MAX_EDGE = 6000; // keeps memory sane for 50 MP photos; still far more than the 20 px/mm warp needs

export interface Decoded {
  bitmap: ImageBitmap;
  /** Pixel space used for all coordinates (bitmap scaled so the long edge <= MAX_EDGE). */
  width: number;
  height: number;
  getPixels: () => RGBAImage;
}

type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeContext(w: number, h: number): Ctx2D {
  if (typeof OffscreenCanvas !== "undefined") {
    const ctx = new OffscreenCanvas(w, h).getContext("2d", { willReadFrequently: true });
    if (ctx) return ctx;
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  return ctx;
}

/** Decode a photo with EXIF orientation applied. Pixels are read lazily (each call returns a fresh copy). */
export async function decodePhoto(file: Blob): Promise<Decoded> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * k);
  const height = Math.round(bitmap.height * k);
  const getPixels = (): RGBAImage => {
    const ctx = makeContext(width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const d = ctx.getImageData(0, 0, width, height);
    return { width, height, data: d.data };
  };
  return { bitmap, width, height, getPixels };
}

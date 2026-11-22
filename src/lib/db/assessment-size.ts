// Size guard for syncing saved grading assessments. A row carries its thumbnails and evidence crops as JPEG data
// URLs inside the jsonb `data` column, so before a row is pushed it is kept under SYNC_ROW_BUDGET bytes:
//   1. re-encode the images smaller (JPEG, lower quality) while that shrinks them;
//   2. if it is still too big, drop images (largest evidence crop first, then the back thumbnail, then the front).
// The local row is never changed: only the copy that is pushed. Pure except `browserReencode` (canvas).
import type { GradingAssessment } from "./assessments";

/** Upper bound for one pushed assessment row (JSON bytes). Typical rows are well under it. */
export const SYNC_ROW_BUDGET = 180_000;

/** Re-encode a data URL so its long edge is at most `longEdge` px, as JPEG at `quality`. Null when not possible. */
export type Reencode = (dataUrl: string, longEdge: number, quality: number) => Promise<string | null>;

/** Steps tried in order until the row fits. */
const STEPS: readonly { longEdge: number; quality: number }[] = [
  { longEdge: 320, quality: 0.7 },
  { longEdge: 240, quality: 0.6 },
  { longEdge: 160, quality: 0.5 },
];

const encoder = new TextEncoder();

/** Size of the row as it is sent (UTF-8 JSON). */
export function assessmentBytes(row: GradingAssessment): number {
  return encoder.encode(JSON.stringify(row)).length;
}

const isImage = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/");

/** Every distinct image data URL in the row. */
export function imagesOf(row: GradingAssessment): string[] {
  const out = new Set<string>();
  for (const face of [row.front, row.back]) for (const f of face?.flags ?? []) if (isImage(f.crop)) out.add(f.crop);
  if (isImage(row.thumbs?.front)) out.add(row.thumbs.front);
  if (isImage(row.thumbs?.back)) out.add(row.thumbs.back);
  return [...out];
}

/** Copy of the row with every image replaced by `fn(src)` (undefined removes it). Never mutates `row`. */
export function mapImages(row: GradingAssessment, fn: (src: string) => string | undefined): GradingAssessment {
  const next: GradingAssessment = { ...row };
  for (const side of ["front", "back"] as const) {
    const face = row[side];
    if (!face) continue;
    next[side] = {
      ...face,
      flags: face.flags.map((f) => {
        if (!isImage(f.crop)) return f;
        const crop = fn(f.crop);
        const copy = { ...f };
        if (crop) copy.crop = crop;
        else delete copy.crop;
        return copy;
      }),
    };
  }
  if (row.thumbs) {
    const thumbs: { front?: string; back?: string } = {};
    for (const side of ["front", "back"] as const) {
      const v = row.thumbs[side];
      const out = isImage(v) ? fn(v) : v;
      if (out) thumbs[side] = out;
    }
    if (thumbs.front || thumbs.back) next.thumbs = thumbs;
    else delete next.thumbs;
  }
  return next;
}

/**
 * Drop images until the row fits `budget`: evidence crops (largest first), then the back thumbnail, then the
 * front one. Returns the row unchanged when it already fits.
 */
export function dropImagesToFit(row: GradingAssessment, budget = SYNC_ROW_BUDGET): GradingAssessment {
  if (assessmentBytes(row) <= budget) return row;
  const thumbs = new Set([row.thumbs?.front, row.thumbs?.back].filter(isImage));
  const crops = imagesOf(row)
    .filter((s) => !thumbs.has(s))
    .sort((a, b) => b.length - a.length);
  const order = [...crops, ...[row.thumbs?.back, row.thumbs?.front].filter(isImage)];
  const dropped = new Set<string>();
  let cur = row;
  for (const src of order) {
    dropped.add(src);
    cur = mapImages(row, (s) => (dropped.has(s) ? undefined : s));
    if (assessmentBytes(cur) <= budget) return cur;
  }
  return cur;
}

/**
 * The copy of `row` to push: unchanged when it fits; otherwise images re-encoded smaller (when `reencode` can),
 * and as a last resort images dropped. Tombstones and image-free rows pass straight through.
 */
export async function shrinkForSync(
  row: GradingAssessment,
  reencode: Reencode | null = browserReencode,
  budget = SYNC_ROW_BUDGET,
): Promise<GradingAssessment> {
  if (assessmentBytes(row) <= budget) return row;
  const sources = imagesOf(row);
  let cur = row;
  if (reencode && sources.length) {
    const best = new Map(sources.map((s) => [s, s]));
    for (const step of STEPS) {
      for (const src of sources) {
        let out: string | null = null;
        try {
          out = await reencode(best.get(src)!, step.longEdge, step.quality);
        } catch {
          out = null;
        }
        if (out && isImage(out) && out.length < best.get(src)!.length) best.set(src, out);
      }
      cur = mapImages(row, (s) => best.get(s) ?? s);
      if (assessmentBytes(cur) <= budget) return cur;
    }
  }
  return dropImagesToFit(cur, budget);
}

/** Canvas re-encoder (browser only; returns null on the server or when the image cannot be decoded). */
export const browserReencode: Reencode = async (dataUrl, longEdge, quality) => {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  const k = Math.min(1, longEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
};

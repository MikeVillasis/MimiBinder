import { describe, expect, it } from "vitest";
import { assessmentBytes, dropImagesToFit, imagesOf, shrinkForSync, SYNC_ROW_BUDGET, type Reencode } from "./assessment-size";
import type { GradingAssessment, SavedFlag } from "./assessments";

/** A fake JPEG data URL of roughly `bytes` characters, tagged so tests can tell images apart. */
const img = (tag: string, bytes: number) => `data:image/jpeg;base64,${tag}${"A".repeat(Math.max(0, bytes - 23 - tag.length))}`;

const flag = (zone: string, crop?: string): SavedFlag => ({ zone, kind: "whitening", severity: "minor", lengthMm: 1, depthMm: 0.2, areaMm2: 0.2, ...(crop ? { crop } : {}) });
const face = (flags: SavedFlag[]) => ({ lr: 55, tb: 52, lrHeavy: "left", tbHeavy: "top", mm: { left: 2, right: 2, top: 2, bottom: 2 }, shots: 1, flags, notAssessed: [] });

const row = (over: Partial<GradingAssessment> = {}): GradingAssessment => ({
  id: "a1",
  cardId: "sv03.5-025",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  engine: 1,
  ...over,
});

/** Like the real thing: 2 thumbnails of ~40 KB and 8 evidence crops of ~30 KB (one shared by two defects). */
function bigRow(): GradingAssessment {
  const shared = img("cTL", 30_000);
  const frontFlags = [flag("corner-tl", shared), flag("corner-tl", shared), flag("corner-tr", img("cTR", 30_000)), flag("edge-top", img("eT", 30_000))];
  const backFlags = ["bl", "br", "bt", "bb", "bx"].map((z) => flag(`corner-${z}`, img(z, 30_000)));
  return row({ front: face(frontFlags), back: face(backFlags), thumbs: { front: img("TF", 40_000), back: img("TB", 40_000) }, notes: "héllo" });
}

/** Fake re-encoder: output size scales with the long edge squared and the quality. */
const fakeReencode: Reencode = async (src, longEdge, quality) => {
  const tag = src.slice(23, 26);
  return img(tag, Math.round(src.length * (longEdge / 480) ** 2 * quality));
};

describe("assessment size guard", () => {
  it("measures UTF-8 JSON bytes", () => {
    const r = row({ notes: "é" });
    expect(assessmentBytes(r)).toBe(JSON.stringify(r).length + 1);
  });

  it("leaves a small row (and a tombstone) untouched", async () => {
    const small = row({ thumbs: { front: img("TF", 30_000) } });
    expect(await shrinkForSync(small, fakeReencode)).toBe(small);
    const tomb = row({ deletedAt: "2026-01-02T00:00:00.000Z" });
    expect(await shrinkForSync(tomb, null)).toBe(tomb);
  });

  it("re-encodes images until the row fits, keeping every image", async () => {
    const big = bigRow();
    expect(assessmentBytes(big)).toBeGreaterThan(SYNC_ROW_BUDGET);
    const out = await shrinkForSync(big, fakeReencode);
    expect(assessmentBytes(out)).toBeLessThanOrEqual(SYNC_ROW_BUDGET);
    expect(imagesOf(out)).toHaveLength(imagesOf(big).length);
    expect(out.thumbs?.front).toMatch(/^data:image\/jpeg;base64,TF/);
    // The shared crop stays shared.
    expect(out.front!.flags[0].crop).toBe(out.front!.flags[1].crop);
    // The local row is never mutated.
    expect(big.thumbs!.front!.length).toBe(40_000);
    expect(out.notes).toBe("héllo");
  });

  it("drops crops (largest first), then the back thumbnail, then the front, when re-encoding cannot help", async () => {
    const big = bigRow();
    big.back!.flags[0].crop = img("XL", 60_000);
    const out = await shrinkForSync(big, null, 120_000);
    expect(assessmentBytes(out)).toBeLessThanOrEqual(120_000);
    expect(out.back!.flags[0].crop).toBeUndefined(); // the largest crop went first
    expect(out.thumbs?.front).toBeDefined();
    expect(out.thumbs?.back).toBeDefined();
    expect(out.back!.flags).toHaveLength(5); // flags themselves are kept

    const tiny = dropImagesToFit(bigRow(), 2_000);
    expect(imagesOf(tiny)).toEqual([]);
    expect(tiny.thumbs).toBeUndefined();
    expect(tiny.front!.flags.every((f) => f.crop === undefined)).toBe(true);
  });

  it("ignores a re-encoder that fails or makes images bigger", async () => {
    const broken: Reencode = async () => {
      throw new Error("decode failed");
    };
    const worse: Reencode = async (src) => src + "AAAA";
    for (const r of [broken, worse]) {
      const out = await shrinkForSync(bigRow(), r);
      expect(assessmentBytes(out)).toBeLessThanOrEqual(SYNC_ROW_BUDGET);
    }
  });
});

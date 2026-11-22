import { describe, expect, it } from "vitest";
import { CARD_MM, detectCard, downscale, rotateQuad, warpCard, type RGBAImage } from "./index";
import { makePhoto, makeSynthCard, type CardSource } from "./testing/synth";
import { quadError, randomCardSpec, runSynth } from "./testing/scenarios";

const blankCard: CardSource = () => 0;
const rect = (w: number, h: number): CardSource => (x, y, out) => {
  if (x < 0 || y < 0 || x > w || y > h) return 0;
  out[0] = out[1] = out[2] = 235;
  return 1;
};
const photo = (card: CardSource, bg: "wood" | "desk" | "dark", seed = 9) =>
  makePhoto(card, { width: 900, height: 1200, rotDeg: 10, tiltXDeg: 0, tiltYDeg: 0, fill: 0.7, background: bg, blurSigma: 1, noiseSigma: 4, seed }).image;

describe("detectCard", () => {
  it.each(["wood", "desk", "dark"] as const)("returns null with no card on %s", (bg) => {
    expect(detectCard(photo(blankCard, bg))).toBeNull();
  });

  it("returns null for flat images", () => {
    const img: RGBAImage = { width: 400, height: 300, data: new Uint8ClampedArray(400 * 300 * 4).fill(128) };
    expect(detectCard(img)).toBeNull();
  });

  it.each([[63, 63], [40, 88]])("returns null for a %ix%i mm rectangle (wrong aspect ratio)", (w, h) => {
    expect(detectCard(photo(rect(w, h), "wood"))).toBeNull();
  });

  it.each([90, 100, 180])("handles a card rotated %i° (landscape / upside down)", { timeout: 30_000 }, (rot) => {
    const o = runSynth(`rot ${rot}`, randomCardSpec(3, "front", "silver"), {
      width: 1400, height: 1050, rotDeg: rot, tiltXDeg: 5, tiltYDeg: 3, fill: 0.8, background: "wood", blurSigma: 1, noiseSigma: 3.5, seed: 4,
    });
    expect(o.detected).toBe(true);
    // Corners match up to the ambiguous 90°/180° re-labelling; the ratios do not depend on it.
    expect(o.cornerErr).toBeLessThan(1);
    expect(o.errLR).toBeLessThanOrEqual(0.5);
    expect(o.errTB).toBeLessThanOrEqual(0.5);
  });

  it("orders corners TL, TR, BR, BL for an upright card", { timeout: 30_000 }, () => {
    const ph = makePhoto(makeSynthCard(randomCardSpec(2, "front", "yellow")), {
      width: 1200, height: 1600, rotDeg: -20, tiltXDeg: 10, tiltYDeg: -6, fill: 0.7, background: "desk", blurSigma: 1, noiseSigma: 3, seed: 2,
    });
    const d = detectCard(downscale(ph.image).image)!;
    expect(d).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      expect(Math.hypot(d.quad[i].x - ph.quad[i].x, d.quad[i].y - ph.quad[i].y)).toBeLessThan(1);
    }
    expect(d.confidence).toBeGreaterThan(0.8);
    expect(quadError(rotateQuad(rotateQuad(d.quad)), ph.quad)).toBeLessThan(1);
  });
});

describe("downscale / warpCard", () => {
  it("box-filters to the requested long edge and reports the scale", () => {
    const img: RGBAImage = { width: 4000, height: 3000, data: new Uint8ClampedArray(4000 * 3000 * 4).fill(200) };
    const { image, scale } = downscale(img, 1600);
    expect(image.width).toBe(1600);
    expect(image.height).toBe(1200);
    expect(scale).toBeCloseTo(0.4, 9);
    expect(image.data[4 * 1000]).toBe(200);
    expect(downscale(image, 1600).image).toBe(image);
  });

  it("warps to CARD_MM x pxPerMm plus the margin", () => {
    const ph = makePhoto(makeSynthCard(randomCardSpec(1, "front", "yellow")), {
      width: 600, height: 800, rotDeg: 5, tiltXDeg: 0, tiltYDeg: 0, fill: 0.8, background: "dark", blurSigma: 0, noiseSigma: 0, seed: 1,
    });
    const w = warpCard(ph.image, ph.quad, { pxPerMm: 10, marginMm: 1.5 });
    expect(w.marginPx).toBe(15);
    expect(w.image.width).toBe(CARD_MM.width * 10 + 30);
    expect(w.image.height).toBe(CARD_MM.height * 10 + 30);
    // Card centre is card-coloured art, the margin is the dark background.
    const px = (x: number, y: number) => w.image.data[(y * w.image.width + x) * 4];
    expect(px(5, 5)).toBeLessThan(60);
    expect(w.image.data[(Math.round(w.image.height / 2) * w.image.width + 330) * 4 + 3]).toBe(255);
    expect(px(15 + 10, Math.round(w.image.height / 2))).toBeGreaterThan(200); // yellow border, 1 mm in
  });
});

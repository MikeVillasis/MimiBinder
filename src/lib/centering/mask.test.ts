import { describe, expect, it } from "vitest";
import { backgroundMask, detectCard, downscale, quadCoverage, quadIoU } from "./index";
import { makePhoto, makeSynthCard, type CardSource } from "./testing/synth";
import { hardScenario, randomCardSpec } from "./testing/scenarios";

const small = (card: CardSource, bg: "wood" | "desk" | "cloth", fill = 0.7, seed = 3) =>
  downscale(makePhoto(card, { width: 900, height: 1200, rotDeg: 15, tiltXDeg: 8, tiltYDeg: -5, fill, background: bg, blurSigma: 1, noiseSigma: 3.5, seed }).image, 800);

describe("backgroundMask", () => {
  it.each(["wood", "desk", "cloth"] as const)("segments a card on %s", (bg) => {
    const card = makeSynthCard(randomCardSpec(4, "back", "blue"));
    const ph = makePhoto(card, { width: 900, height: 1200, rotDeg: 15, tiltXDeg: 8, tiltYDeg: -5, fill: 0.7, background: bg, blurSigma: 1, noiseSigma: 3.5, seed: 3 });
    const { image, scale } = downscale(ph.image, 800);
    const m = backgroundMask(image)!;
    expect(m).not.toBeNull();
    expect(quadIoU(m.quad, ph.quad.map((p) => ({ x: p.x * scale, y: p.y * scale })))).toBeGreaterThan(0.9);
  });

  it("gives up when there is no card or the card fills the frame", () => {
    expect(backgroundMask(small((() => 0) as unknown as CardSource, "desk").image)).toBeNull();
    const { spec, photo } = hardScenario("fill90", 1);
    const ph = makePhoto(makeSynthCard(spec), { ...photo, width: 750, height: 1000 });
    const m = backgroundMask(downscale(ph.image, 800).image);
    // Either unreliable (null) or still the card, never something else.
    if (m) expect(quadCoverage(m.quad, ph.quad.map((p) => ({ x: p.x, y: p.y })))).toBeGreaterThan(0.9);
  });

  it("does not change an easy detection", () => {
    const ph = makePhoto(makeSynthCard(randomCardSpec(2, "front", "yellow")), { width: 1200, height: 1600, rotDeg: -12, tiltXDeg: 6, tiltYDeg: 4, fill: 0.7, background: "desk", blurSigma: 1, noiseSigma: 3.5, seed: 8 });
    const a = detectCard(ph.image, { backgroundFilter: false })!, b = detectCard(ph.image)!;
    for (let i = 0; i < 4; i++) expect(Math.hypot(a.quad[i].x - b.quad[i].x, a.quad[i].y - b.quad[i].y)).toBeLessThan(1e-9);
  });
});

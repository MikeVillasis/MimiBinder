// Small pure pieces around the corner/edge check: photo quality, several photos of one face, set-aware notes,
// and the centering ceiling with an axis left out.
import { describe, expect, it } from "vitest";
import {
  borderProfile, combineCentering, combineCondition, frameQuality, looksFullArt, MAX_SHOT_SPREAD, measureBorders, photoQuality, psaCeiling, psaLabel, QUALITY_LIMITS, ZONES,
  type AxisCentering, type BorderFit, type CenteringResult, type ConditionReport, type Quad, type RGBAImage, type Severity, type ZoneId,
} from "./index";
import { makeFullArtCard } from "./testing/defects";
import { flatCard, makeSynthCard } from "./testing/synth";
import { randomCardSpec } from "./testing/scenarios";

const axis = (a: number, b: number, first: "left" | "top", second: "right" | "bottom"): AxisCentering => ({
  worst: (100 * Math.max(a, b)) / (a + b), mean: (100 * Math.max(a, b)) / (a + b), heavySide: a >= b ? first : second, worstMm: { a, b },
});
const centering = (l: number, r: number, t: number, b: number): CenteringResult => ({ lr: axis(l, r, "left", "right"), tb: axis(t, b, "top", "bottom") });

describe("frameQuality", () => {
  const frame = (f: (x: number, y: number) => number): RGBAImage => {
    const w = 120, h = 90, data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), o = (y * w + x) * 4; data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255; }
    return { width: w, height: h, data };
  };
  it("a sharp pattern scores far above the same pattern blurred", () => {
    const sharp = frameQuality(frame((x, y) => ((x >> 2) + (y >> 2)) % 2 ? 200 : 40));
    const soft = frameQuality(frame((x, y) => 120 + 80 * Math.sin(x / 9) * Math.cos(y / 9)));
    expect(sharp.sharpness).toBeGreaterThan(20 * soft.sharpness);
    expect(sharp.brightness).toBeGreaterThan(100);
  });
  it("counts saturated pixels as glare", () => {
    expect(frameQuality(frame(() => 120)).glareShare).toBe(0);
    expect(frameQuality(frame((x) => (x > 60 ? 255 : 120))).glareShare).toBeGreaterThan(0.3);
    expect(frameQuality(frame(() => 20)).brightness).toBeLessThan(45);
  });
});

describe("photoQuality", () => {
  const warp = (v: number) => ({ image: { width: 300, height: 400, data: new Uint8ClampedArray(300 * 400 * 4).fill(v) }, pxPerMm: 4, marginPx: 8 });
  const quad = (w: number, h: number, squeeze = 0): Quad => [{ x: squeeze, y: 0 }, { x: w - squeeze, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  it("passes a sharp, straight, well-lit, large photo", () => {
    const q = photoQuality(quad(1260, 1760), warp(150), 0.08);
    expect(q.issues).toEqual([]);
    expect(q.pxPerMm).toBeCloseTo(20, 5);
    expect(q.skew).toBeCloseTo(0, 6);
  });
  it("names each reason to retake", () => {
    expect(photoQuality(quad(1260, 1760), warp(150), QUALITY_LIMITS.maxBlurMm + 0.05).issues).toEqual(["blurry"]);
    expect(photoQuality(quad(400, 560), warp(150), 0.08).issues).toEqual(["lowRes"]);
    expect(photoQuality(quad(1260, 1760, 160), warp(150), 0.08).issues).toEqual(["tilted"]);
    expect(photoQuality(quad(1260, 1760), warp(20), 0.08).issues).toEqual(["dark"]);
    expect(photoQuality(quad(1260, 1760), warp(255), 0.08).issues).toEqual(["glare"]);
    // Unknown blur is not a reason by itself.
    expect(photoQuality(quad(1260, 1760), warp(150), NaN).issues).toEqual([]);
  });
});

describe("combineCentering", () => {
  it("returns a single photo unchanged", () => {
    const c = combineCentering([centering(2, 3, 2.5, 2.5)])!;
    expect(c.shots).toBe(1);
    expect(c.spread).toBe(0);
    expect(c.lr.worst).toBeCloseTo(60, 6);
    expect(c.lr.heavySide).toBe("right");
  });
  it("averages photos and reports how far they disagree", () => {
    const c = combineCentering([centering(2, 3, 2.5, 2.5), centering(2.1, 2.9, 2.5, 2.5), centering(1.95, 3.05, 2.6, 2.4)])!;
    expect(c.shots).toBe(3);
    expect(c.lr.worst).toBeCloseTo((60 + 58 + 61) / 3, 6);
    expect(c.spreadLR).toBeCloseTo(3, 6);
    expect(c.spread).toBeCloseTo(3, 6);
    expect(c.spread).toBeGreaterThan(MAX_SHOT_SPREAD);
    expect(c.lr.worstMm.a).toBeCloseTo((2 + 2.1 + 1.95) / 3, 6);
  });
  it("photos that disagree on the wider side average toward 50/50, not away from it", () => {
    const c = combineCentering([centering(2.6, 2.4, 2.5, 2.5), centering(2.4, 2.6, 2.5, 2.5)])!;
    expect(c.lr.worst).toBeCloseTo(50, 6);
    expect(c.spreadLR).toBeCloseTo(4, 6);
  });
  it("is null for no photos", () => {
    expect(combineCentering([])).toBeNull();
  });
});

describe("combineCondition", () => {
  const rep = (flags: Partial<Record<ZoneId, Severity>>, unchecked: ZoneId[] = []): ConditionReport => ({
    face: "back", blurMm: 0.1, glareShare: 0, lightBackground: false, lightBorder: false, borderUniformity: 1,
    zones: ZONES.map((z) => ({
      zone: z,
      status: unchecked.includes(z) ? "notAssessed" : flags[z] ? "flagged" : "clear",
      checked: { whitening: !unchecked.includes(z), contour: !unchecked.includes(z) },
      skipped: unchecked.includes(z) ? ["glare"] : [],
      defects: flags[z] ? [{ kind: "whitening", severity: flags[z]!, lengthMm: 1, depthMm: 0.2, areaMm2: 0.2 }] : [],
      crop: { x: 0, y: 0, w: 1, h: 1 }, marks: [],
    })),
  });
  const z = (c: NonNullable<ReturnType<typeof combineCondition>>, id: ZoneId) => c.zones.find((x) => x.zone === id)!;

  it("keeps a flag seen in at least half of the photos, with the strongest finding", () => {
    const c = combineCondition([rep({ "corner-tl": "minor" }), rep({ "corner-tl": "moderate" }), rep({})])!;
    expect(c.shots).toBe(3);
    expect(z(c, "corner-tl").status).toBe("flagged");
    expect(z(c, "corner-tl").seenIn).toBe(2);
    expect(z(c, "corner-tl").defects[0].severity).toBe("moderate");
    expect(z(c, "corner-tl").source).toBe(1);
    expect(c.unconfirmed).toEqual([]);
  });
  it("lists a flag seen in a minority of photos without counting it", () => {
    const c = combineCondition([rep({ "edge-top": "minor" }), rep({}), rep({})])!;
    expect(z(c, "edge-top").status).toBe("clear");
    expect(z(c, "edge-top").defects).toEqual([]);
    expect(c.unconfirmed.map((u) => u.zone)).toEqual(["edge-top"]);
    expect(c.unconfirmed[0].seenIn).toBe(1);
  });
  it("with two photos, one sighting is enough", () => {
    const c = combineCondition([rep({ "edge-top": "minor" }), rep({})])!;
    expect(z(c, "edge-top").status).toBe("flagged");
    expect(z(c, "edge-top").seenIn).toBe(1);
  });
  it("a zone checked in one photo counts as checked", () => {
    const c = combineCondition([rep({}, ["corner-br"]), rep({})])!;
    expect(z(c, "corner-br").status).toBe("clear");
    expect(z(c, "corner-br").source).toBe(1);
    expect(z(combineCondition([rep({}, ["corner-br"])])!, "corner-br").status).toBe("notAssessed");
  });
});

describe("borderProfile", () => {
  it("knows the sets that are off-centre by design", () => {
    expect(borderProfile({ id: "ecard1-1", setId: "ecard1", serieId: "ecard" }).asymmetric?.axis).toBe("lr");
    expect(borderProfile({ id: "ex3-1", setId: "ex3", serieId: "ex" }).asymmetric?.axis).toBe("tb");
    expect(borderProfile({ id: "ex4-1", setId: "ex4", serieId: "ex" }).asymmetric).toBeUndefined();
    expect(borderProfile({ id: "swsh1-1", setId: "swsh1", serieId: "swsh" }).asymmetric).toBeUndefined();
  });
  it("knows which eras print silver borders", () => {
    expect(borderProfile({ id: "sv01-001", setId: "sv01", serieId: "sv" }).border).toBe("silver");
    expect(borderProfile({ id: "me01-001", setId: "me01", serieId: "me" }).border).toBe("silver");
    expect(borderProfile({ id: "swsh1-1", setId: "swsh1", serieId: "swsh" }).border).toBe("yellow");
    expect(borderProfile({ id: "ja:SV2a-001", setId: "ja:SV2a", serieId: "ja:SV" }).border).toBe("silver");
    expect(borderProfile({}).border).toBe("unknown");
  });
  it("only hints at full art from the rarity", () => {
    expect(borderProfile({ rarity: "Special illustration rare" }).likelyFullArt).toBe(true);
    expect(borderProfile({ rarity: "Hyper rare" }).likelyFullArt).toBe(true);
    expect(borderProfile({ rarity: "Common" }).likelyFullArt).toBe(false);
    expect(borderProfile({ rarity: "Double rare" }).likelyFullArt).toBe(false);
    expect(borderProfile({}).likelyFullArt).toBe(false);
  });
});

describe("looksFullArt", () => {
  const fitOf = (card: ReturnType<typeof makeSynthCard>): BorderFit => {
    const flat = flatCard(card, 20, 40);
    return measureBorders({ image: flat.image, pxPerMm: 20, marginPx: 40 }, "front");
  };
  it("is true for art that runs to the cut and false for bordered cards", { timeout: 30_000 }, () => {
    expect(looksFullArt(fitOf(makeFullArtCard(1)))).toBe(true);
    expect(looksFullArt(fitOf(makeFullArtCard(2, { holo: true })))).toBe(true);
    expect(looksFullArt(fitOf(makeSynthCard(randomCardSpec(1, "front", "yellow"))))).toBe(false);
    expect(looksFullArt(fitOf(makeSynthCard(randomCardSpec(2, "front", "silver"))))).toBe(false);
  });
  it("needs the frame qualities", () => {
    const l = { a: { x: 0, y: 0 }, b: { x: 0, y: 1 } };
    expect(looksFullArt({ outer: { left: l, right: l, top: l, bottom: l }, inner: { left: l, right: l, top: l, bottom: l }, quality: { left: 0, right: 0, top: 0, bottom: 0 }, pxPerMm: 20 })).toBe(false);
  });
});

describe("psaCeiling with an axis left out", () => {
  it("ignores the front axis a set is off-centre on by design", () => {
    const front = centering(4.5, 1.5, 2.5, 2.5); // 75/25 left/right, like an e-Card front
    expect(psaCeiling(front, null).grade).toBe(6);
    expect(psaCeiling(front, null, { skipFrontAxis: "lr" }).grade).toBe(10);
    // The back is never skipped.
    expect(psaCeiling(null, centering(4.5, 1.5, 2.5, 2.5), { skipFrontAxis: "lr" }).grade).toBe(10);
    expect(psaCeiling(null, centering(4.6, 1.4, 2.5, 2.5), { skipFrontAxis: "lr" }).grade).toBe(9);
  });
  it("names whole grades", () => {
    expect(psaLabel(10)).toBe("Gem Mint");
    expect(psaLabel(8)).toBe("NM-MT");
    expect(psaLabel(4)).toBe("VG-EX");
  });
});

// Corner and edge flags (phase 2). Synthetic wear from testing/defects.ts is planted on synthetic cards, which
// are then photographed and run through the whole pipeline. The full detection-rate and false-positive table is
// in bench.test.ts (CENTERING_BENCH=1); this file keeps a fast, fixed subset that must not regress.
import path from "node:path";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzePhoto, assessCondition, ceilingFromCounts, conditionCeiling, CONDITION_THRESHOLDS, ZONES, zoneLabel, type ConditionReport, type ZoneFinding, type ZoneId } from "./index";
import { cleanFullArtSet, cleanGlareSet, cleanRate, cleanSet, conditionCard, conditionPhoto, detectionRate, runCondition } from "./testing/conditionEval";
import { withDefects } from "./testing/defects";
import { readPng } from "./testing/png";
import { makePhoto, scanSource } from "./testing/synth";

const zone = (r: ConditionReport, id: ZoneId) => r.zones.find((z) => z.zone === id)!;
const kinds = (z: ZoneFinding) => z.defects.map((d) => d.kind);

describe("assessCondition", () => {
  it("flags planted wear in the right zones and nothing else (blue back, dark table)", { timeout: 60_000 }, () => {
    const { card, face } = conditionCard("backMottled", 4);
    const worn = withDefects(card, [
      { kind: "cornerWhitening", corner: 0, depthMm: 0.4 },
      { kind: "edgeWhitening", side: "right", fromMm: 30, toMm: 42, depthMm: 0.25, patchy: 0.2 },
      { kind: "chip", side: "bottom", atMm: 25, radiusMm: 0.8 },
      { kind: "roundedCorner", corner: 2, radiusMm: 5 },
    ], 4);
    const out = runCondition(worn, face, conditionPhoto(4, "dark"));
    expect(out.report).not.toBeNull();
    const r = out.report!;
    expect(r.zones.map((z) => z.zone)).toEqual([...ZONES]);
    expect(kinds(zone(r, "corner-tl"))).toEqual(["whitening"]);
    expect(kinds(zone(r, "edge-right"))).toEqual(["whitening"]);
    expect(kinds(zone(r, "edge-bottom"))).toEqual(["chipping"]);
    expect(kinds(zone(r, "corner-br"))).toContain("cornerLoss");
    for (const id of ["corner-tr", "corner-bl", "edge-top", "edge-left"] as ZoneId[]) expect(zone(r, id).status, id).toBe("clear");
    // Measured sizes are in the right range (planted: 12 mm of edge whitening, a chip 0.56 mm deep, 0.83 mm lost at the tip).
    const ew = zone(r, "edge-right").defects[0];
    expect(ew.lengthMm).toBeGreaterThan(6);
    expect(ew.lengthMm).toBeLessThan(14);
    const chip = zone(r, "edge-bottom").defects[0];
    expect(chip.depthMm).toBeGreaterThan(0.35);
    expect(chip.depthMm).toBeLessThan(0.75);
    const loss = zone(r, "corner-br").defects.find((d) => d.kind === "cornerLoss")!;
    expect(loss.depthMm).toBeGreaterThan(0.55);
    expect(loss.depthMm).toBeLessThan(1.1);
    // Evidence: every flagged zone has a crop inside the canvas and at least one mark.
    for (const z of r.zones.filter((x) => x.status === "flagged")) {
      expect(z.marks.length, z.zone).toBeGreaterThan(0);
      expect(z.crop.w).toBeGreaterThan(20);
      expect(z.crop.x).toBeGreaterThanOrEqual(0);
    }
    expect(out.ms).toBeLessThan(1500);
  });

  it("detection rates on a dark table stay high (fixed seeds)", { timeout: 120_000 }, () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    const blueYellow = ["backMottled", "yellow", "backFlat"] as const;
    const cw = detectionRate("corner whitening 0.3 mm", { type: "cornerWhitening", depthMm: 0.3 }, seeds, { kinds: [...blueYellow] });
    expect(cw.flagged).toBeGreaterThanOrEqual(5);
    expect(cw.strayPhotos).toBe(0);
    const chip = detectionRate("chip r 0.7 mm", { type: "chip", radiusMm: 0.7 }, seeds);
    expect(chip.rightKind).toBeGreaterThanOrEqual(5);
    const ding = detectionRate("ding 0.8 mm", { type: "ding", lossMm: 0.8 }, seeds);
    expect(ding.rightKind).toBeGreaterThanOrEqual(5);
  });

  it("raises no flags on clean cards: plain borders, mottled back, light table", { timeout: 120_000 }, () => {
    const dark = cleanRate("dark", cleanSet([1, 2, 3, 4, 5, 6, 7, 8], "dark"));
    expect(dark.detail).toEqual([]);
    expect(dark.photos).toBe(8);
    const light = cleanRate("light", cleanSet([101, 102, 103, 104], "light"));
    expect(light.detail).toEqual([]);
  });

  it("does not assess whitening on a silver border, and says why", { timeout: 60_000 }, () => {
    const { card, face } = conditionCard("silver", 3);
    const worn = withDefects(card, [{ kind: "cornerWhitening", corner: 1, depthMm: 0.6 }, { kind: "chip", side: "left", atMm: 40, radiusMm: 0.8 }], 3);
    const r = runCondition(worn, face, conditionPhoto(3, "dark")).report!;
    expect(r.lightBorder).toBe(true);
    for (const z of r.zones) {
      expect(z.checked.whitening, z.zone).toBe(false);
      expect(z.skipped, z.zone).toContain("lightBorder");
    }
    // The shape check still runs on silver: the chip is found, the whitened corner is (honestly) not.
    expect(kinds(zone(r, "edge-left"))).toEqual(["chipping"]);
    expect(zone(r, "corner-tr").status).toBe("clear");
  });

  it("does not assess a full-art front (no printed border), holo or not", { timeout: 60_000 }, () => {
    for (const holo of [false, true]) {
      const row = cleanRate("full art", cleanFullArtSet([1, 2], holo));
      expect(row.detail).toEqual([]);
      expect(row.notAssessedZones).toBe(row.zones);
    }
  });

  it("masks glare instead of flagging it", { timeout: 60_000 }, () => {
    const row = cleanRate("glare", cleanGlareSet([501, 502, 503, 504, 505, 506]));
    expect(row.detail).toEqual([]);
    expect(row.notAssessedZones).toBeGreaterThan(0);
  });

  it("stops assessing when the photo is too blurred, and reports the blur", { timeout: 60_000 }, () => {
    const { card, face } = conditionCard("backFlat", 2);
    const sharp = runCondition(card, face, { ...conditionPhoto(2, "dark"), blurSigma: 1 }).report!;
    const soft = runCondition(card, face, { ...conditionPhoto(2, "dark"), blurSigma: 4.5 }).report!;
    expect(sharp.blurMm).toBeLessThan(0.15);
    expect(soft.blurMm).toBeGreaterThan(CONDITION_THRESHOLDS.maxBlurMm);
    expect(soft.blurMm).toBeGreaterThan(2 * sharp.blurMm);
    for (const z of soft.zones) {
      expect(z.status, z.zone).toBe("notAssessed");
      expect(z.skipped).toContain("blur");
    }
  });

  it("real scans: clean cards raise no flag; the bottom border with small print is still checked", { timeout: 60_000 }, () => {
    const FIX = path.join(__dirname, "testing", "fixtures");
    const file = path.join(FIX, "swsh12.5-003.png");
    if (!existsSync(file)) return;
    const src = scanSource(readPng(file));
    const run = (card: typeof src) => {
      const res = analyzePhoto(makePhoto(card, conditionPhoto(1, "dark")).image, "front")!;
      return assessCondition(res.warp, res.fit, "front");
    };
    const clean = run(src);
    for (const z of clean.zones) {
      expect(z.status, z.zone).toBe("clear");
      expect(z.checked, z.zone).toEqual({ whitening: true, contour: true });
    }
    const worn = run(withDefects(src, [{ kind: "edgeWhitening", side: "bottom", fromMm: 20, toMm: 32, depthMm: 0.25 }], 1));
    expect(kinds(zone(worn, "edge-bottom"))).toEqual(["whitening"]);
    expect(worn.zones.filter((z) => z.status === "flagged")).toHaveLength(1);
  });

  it("survives a degenerate fit", () => {
    const img = { width: 200, height: 200, data: new Uint8ClampedArray(200 * 200 * 4).fill(128) };
    const l = { a: { x: 10, y: 10 }, b: { x: 10, y: 190 } };
    const fit = { outer: { left: l, right: l, top: l, bottom: l }, inner: { left: l, right: l, top: l, bottom: l }, quality: { left: 0, right: 0, top: 0, bottom: 0 }, pxPerMm: 20 };
    const r = assessCondition({ image: img, pxPerMm: 20, marginPx: 40 }, fit, "front");
    expect(r.zones).toHaveLength(8);
    expect(r.zones.every((z) => z.status === "notAssessed")).toBe(true);
  });
});

describe("conditionCeiling", () => {
  const rep = (face: "front" | "back", flags: [ZoneId, "minor" | "moderate" | "heavy"][]): ConditionReport => ({
    face, blurMm: 0.08, glareShare: 0, lightBackground: false, lightBorder: false, borderUniformity: 1,
    zones: ZONES.map((z) => {
      const f = flags.find((x) => x[0] === z);
      return {
        zone: z, status: f ? "flagged" : "clear", checked: { whitening: true, contour: true }, skipped: [], crop: { x: 0, y: 0, w: 1, h: 1 }, marks: [],
        defects: f ? [{ kind: "whitening", severity: f[1], lengthMm: 1, depthMm: 0.2, areaMm2: 0.2 }] : [],
      };
    }),
  });

  it("is null when nothing is flagged", () => {
    expect(conditionCeiling([rep("front", []), rep("back", []), null])).toBeNull();
  });

  it("follows the stated rule of thumb and names the zones, worst first", () => {
    expect(conditionCeiling([rep("back", [["corner-tl", "minor"]])])!.grade).toBe(9);
    expect(conditionCeiling([rep("back", [["corner-tl", "minor"]]), rep("front", [["edge-top", "minor"]])])!.grade).toBe(8);
    expect(conditionCeiling([rep("back", [["corner-tl", "minor"], ["corner-tr", "minor"], ["corner-bl", "minor"]])])!.grade).toBe(7);
    const c = conditionCeiling([rep("back", [["corner-tl", "minor"], ["edge-left", "moderate"]])])!;
    expect(c.grade).toBe(6);
    expect(c.reasons[0]).toBe("back left edge: whitening");
    expect(c.reasons[1]).toBe("back top-left corner: whitening");
    expect(c.counts).toEqual({ minor: 1, moderate: 1, heavy: 0 });
    expect(conditionCeiling([rep("back", [["corner-tl", "heavy"]])])!.grade).toBe(5);
    expect(conditionCeiling([rep("back", [["corner-tl", "heavy"], ["corner-br", "heavy"]])])!.grade).toBe(4);
  });

  it("never names a grade PSA does not issue", () => {
    for (let minor = 0; minor < 9; minor++) for (let moderate = 0; moderate < 9; moderate++) for (let heavy = 0; heavy < 9; heavy++) {
      const g = ceilingFromCounts({ minor, moderate, heavy });
      expect(Number.isInteger(g)).toBe(true);
      expect(g).toBeGreaterThanOrEqual(4);
      expect(g).toBeLessThanOrEqual(10);
    }
  });

  it("labels zones in plain words", () => {
    expect(zoneLabel("corner-br")).toBe("bottom-right corner");
    expect(zoneLabel("edge-top")).toBe("top edge");
  });

  it("marks its thresholds as uncalibrated", () => {
    expect(CONDITION_THRESHOLDS.calibrated).toBe(false);
  });
});

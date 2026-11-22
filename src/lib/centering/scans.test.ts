// Real TCGdex scans (testing/fixtures, 600x825). A scan is flat and aligned, so measuring it directly is the
// reference. The print is also shifted against the cut (a simulated miscut) to get off-centre cards; the
// reference must then move by exactly the shift. Photos of the (shifted) scan must agree with the reference.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeCentering, measureBorders } from "./index";
import { readPng } from "./testing/png";
import { flatCard, scanSource } from "./testing/synth";
import { randomPose, runScenario, summarize } from "./testing/scenarios";

const report = process.env.CENTERING_REPORT === "1";
const FIX = path.join(__dirname, "testing", "fixtures");
const SCANS = [
  { file: "swsh12.5-003.png", what: "Crown Zenith Bellossom (yellow border, small print)" },
  { file: "sv03.5-001.png", what: "151 Bulbasaur (silver border, badge)" },
  { file: "sv01-001.png", what: "Scarlet & Violet Pineco (silver border)" },
];
const SHIFT = { x: -0.8, y: 0.6 }; // mm: print moved left and down

function reference(src: ReturnType<typeof scanSource>) {
  const flat = flatCard(src, 20, 40);
  const fit = measureBorders({ image: flat.image, pxPerMm: 20, marginPx: 40 }, "front");
  return { fit, c: computeCentering(fit) };
}

describe.each(SCANS)("real scan $file", ({ file, what }) => {
  const p = path.join(FIX, file);
  it.skipIf(!existsSync(p))(`${what}: photos agree with the flat-scan reference`, { timeout: 60_000 }, () => {
    const scan = readPng(p);
    const ref0 = reference(scanSource(scan));
    const src = scanSource(scan, SHIFT);
    const ref = reference(src);
    for (const s of ["left", "right", "top", "bottom"] as const) expect(ref.fit.quality[s], s).toBeGreaterThan(0.3); // small print takes ~40% of the bottom profiles
    // The reference itself: borders move by the shift (±0.03 mm).
    expect(ref.c.lr.worstMm.a - ref0.c.lr.worstMm.a).toBeCloseTo(SHIFT.x, 1);
    expect(Math.abs(ref.c.lr.worstMm.a - ref0.c.lr.worstMm.a - SHIFT.x)).toBeLessThan(0.03);
    expect(Math.abs(ref.c.tb.worstMm.a - ref0.c.tb.worstMm.a - SHIFT.y)).toBeLessThan(0.03);
    expect(Math.abs(ref.c.tb.worstMm.b - ref0.c.tb.worstMm.b + SHIFT.y)).toBeLessThan(0.03);
    if (report) console.log(file, "reference", ref0.c.lr.worst.toFixed(2), ref0.c.tb.worst.toFixed(2), "shifted", ref.c.lr.worst.toFixed(2), ref.c.tb.worst.toFixed(2));

    const outs = [1, 2, 3].map((s) => {
      const heavy = s === 3;
      return runScenario(`${file} #${s}${heavy ? " heavy" : ""}`, src, ref.c, "front", {
        width: heavy ? 1500 : 1200, height: heavy ? 2000 : 1600, ...randomPose(s + 100),
        background: (["wood", "desk", "dark"] as const)[s % 3],
        blurSigma: heavy ? 2 : 1, noiseSigma: heavy ? 8 : 3.5, seed: s + 100,
      });
    });
    if (report) for (const o of outs) console.log(`${o.name.padEnd(30)} lr ${o.errLR.toFixed(3)} tb ${o.errTB.toFixed(3)} corner ${o.cornerErr.toFixed(2)}`);
    if (report) console.log(summarize(file, outs).line);
    for (const o of outs) {
      const tol = o.name.endsWith("heavy") ? 1 : 0.5;
      expect(o.detected, o.name).toBe(true);
      expect(o.errLR, o.name).toBeLessThanOrEqual(tol);
      expect(o.errTB, o.name).toBeLessThanOrEqual(tol);
    }
  });
});

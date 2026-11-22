// End-to-end accuracy on synthetic phone photos: known card geometry → random pose/background/blur/noise →
// downscale → detectCard → warpCard → measureBorders → computeCentering, compared with the exact worst-point ratios.
// Set CENTERING_REPORT=1 to print the per-photo table.
import { describe, expect, it } from "vitest";
import { runSynthSet as run } from "./testing/scenarios";

describe("synthetic photos", () => {
  it("standard blur/noise (1200x1600, card ≈ 10–15 px/mm): worst-point ratio within ±0.5", { timeout: 60_000 }, () => {
    const outs = run("standard", [1, 2, 3], [1200, 1600]);
    for (const o of outs) {
      expect(o.detected, o.name).toBe(true);
      expect(o.cornerErr, o.name).toBeLessThan(1.5);
      expect(o.confidence, o.name).toBeGreaterThan(0.5);
      expect(o.errLR, o.name).toBeLessThanOrEqual(0.5);
      expect(o.errTB, o.name).toBeLessThanOrEqual(0.5);
    }
  });
});

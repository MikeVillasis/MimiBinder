// Heavier blur and noise than accuracy.test.ts; tolerance ±1 point. See testing/scenarios.ts.
import { describe, expect, it } from "vitest";
import { runSynthSet as run } from "./testing/scenarios";

describe("synthetic photos, heavy", () => {
  it("blur σ 2.2 px, noise σ 9 (1500x2000, card ≈ 13–19 px/mm): within ±1", { timeout: 60_000 }, () => {
    const outs = run("heavy", [5, 6, 7], [1500, 2000]);
    for (const o of outs) {
      expect(o.detected, o.name).toBe(true);
      expect(o.errLR, o.name).toBeLessThanOrEqual(1);
      expect(o.errTB, o.name).toBeLessThanOrEqual(1);
    }
  });
});

// Hard detection scenarios (busy tables, straight distractors). See testing/scenarios.ts → hardScenario.
// Each photo must have corners within 1.5 px or both worst-point ratios within 0.5 of the truth.
import { describe, expect, it } from "vitest";
import { hardSuccess, runHard, type HardKind } from "./testing/scenarios";

const CASES: [HardKind, number][] = [
  ["woodStrong", 1], ["woodStrong", 2],
  ["woodStrong", 11], // the plain detector picked the printed inner frame of a blue back; the mask fixes it
  ["cloth", 1], ["cloth", 2],
  ["tableEdge", 1], ["tableEdge", 2],
  ["secondRect", 1], ["secondRect", 2],
  ["clutter", 1], ["clutter", 2],
];

describe("hard scenarios A", () => {
  it.each(CASES)("%s #%i", { timeout: 30_000 }, (kind, seed) => {
    const o = runHard(kind, seed);
    expect(hardSuccess(o), `corner ${o.cornerErr.toFixed(2)} lr ${o.errLR.toFixed(2)} tb ${o.errTB.toFixed(2)}`).toBe(true);
    expect(Math.max(o.errLR, o.errTB)).toBeLessThanOrEqual(0.5);
  });
});

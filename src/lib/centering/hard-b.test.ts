// Hard detection scenarios (shadows, low-contrast tables, card at the photo edge or filling it).
import { describe, expect, it } from "vitest";
import { hardSuccess, runHard, type HardKind } from "./testing/scenarios";

const CASES: [HardKind, number][] = [
  ["shadow", 1], ["shadow", 2],
  ["whiteSilver", 1], ["whiteSilver", 2],
  ["beigeYellow", 1], ["beigeYellow", 2],
  ["touchEdge", 1], ["touchEdge", 2],
  ["touchEdge", 23], // the warp used to fill outside the photo with black, a false cut edge
  ["fill90", 1], ["fill90", 2],
  ["fill90", 3],
];

describe("hard scenarios B", () => {
  it.each(CASES)("%s #%i", { timeout: 30_000 }, (kind, seed) => {
    const o = runHard(kind, seed);
    expect(hardSuccess(o), `corner ${o.cornerErr.toFixed(2)} lr ${o.errLR.toFixed(2)} tb ${o.errTB.toFixed(2)}`).toBe(true);
    expect(Math.max(o.errLR, o.errTB)).toBeLessThanOrEqual(0.5);
  });
});

import { describe, expect, it } from "vitest";
import { psaCeiling, PSA_CENTERING } from "./psa";
import type { CenteringResult } from "./types";

const face = (lr: number, tb: number): CenteringResult => ({
  lr: { worst: lr, mean: lr, heavySide: "left", worstMm: { a: 0, b: 0 } },
  tb: { worst: tb, mean: tb, heavySide: "top", worstMm: { a: 0, b: 0 } },
});

describe("psaCeiling", () => {
  it("is 10 for perfect centering and nothing limits it", () => {
    const r = psaCeiling(face(50, 50), face(50, 50));
    expect(r.grade).toBe(10);
    expect(r.label).toBe("Gem Mint");
    expect(r.limitedBy).toBeUndefined();
    expect(r.measured).toEqual({ front: true, back: true });
  });

  it("passes exactly at each front limit and fails just above it", () => {
    for (let i = 0; i < PSA_CENTERING.length; i++) {
      const l = PSA_CENTERING[i];
      expect(psaCeiling(face(l.frontMax, 50), null).grade).toBe(l.grade);
      const above = psaCeiling(face(l.frontMax + 0.01, 50), null);
      expect(above.grade).toBe(PSA_CENTERING[i + 1]?.grade ?? 1);
      expect(above.limitedBy).toBe(`front left/right ${(l.frontMax + 0.01).toFixed(1)}/${(100 - l.frontMax - 0.01).toFixed(1)}`);
    }
  });

  it("applies the back limits to the back face", () => {
    expect(psaCeiling(null, face(50, 75)).grade).toBe(10);
    const r = psaCeiling(null, face(50, 75.2));
    expect(r.grade).toBe(9);
    expect(r.limitedBy).toBe("back top/bottom 75.2/24.8");
    // The back allows 90 from grade 9 down, so past 90 there is nothing left but 1.
    expect(psaCeiling(null, face(90, 50)).grade).toBe(9);
    const worst = psaCeiling(null, face(90.1, 50));
    expect(worst.grade).toBe(1);
    expect(worst.limitedBy).toBe("back left/right 90.1/9.9");
  });

  it("tolerates floating-point noise at the boundary", () => {
    expect(psaCeiling(face(55 + 1e-9, 50), null).grade).toBe(10);
  });

  it("takes the lower of the two faces and names the face that limits it", () => {
    const r = psaCeiling(face(61.2, 52), face(70, 60));
    expect(r.grade).toBe(8);
    expect(r.limitedBy).toBe("front left/right 61.2/38.8");
    const b = psaCeiling(face(52, 52), face(80, 60));
    expect(b.grade).toBe(9);
    expect(b.limitedBy).toBe("back left/right 80.0/20.0");
  });

  it("returns grade 1 beyond every limit", () => {
    const r = psaCeiling(face(95, 50), null);
    expect(r.grade).toBe(1);
    expect(r.limitedBy).toBe("front left/right 95.0/5.0");
  });

  it("treats a missing face as unmeasured, not limiting", () => {
    const r = psaCeiling(null, null);
    expect(r.grade).toBe(10);
    expect(r.measured).toEqual({ front: false, back: false });
    expect(psaCeiling(face(57, 50), null).measured).toEqual({ front: true, back: false });
  });
});

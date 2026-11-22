import { describe, expect, it } from "vitest";
import { computeCentering } from "./index";
import { applyH, homographyFrom4, matInv, robustLine } from "./geometry";
import type { BorderFit, Line } from "./types";

const P = 20, M = 40;
const W = 63 * P, H = 88 * P;
const v = (x: number): Line => ({ a: { x, y: M }, b: { x, y: M + H } });
const h = (y: number): Line => ({ a: { x: M, y }, b: { x: M + W, y } });

function fit(l: number, r: number, t: number, b: number): BorderFit {
  return {
    outer: { left: v(M), right: v(M + W), top: h(M), bottom: h(M + H) },
    inner: { left: v(M + l * P), right: v(M + W - r * P), top: h(M + t * P), bottom: h(M + H - b * P) },
    quality: { left: 1, right: 1, top: 1, bottom: 1 },
    pxPerMm: P,
  };
}

describe("computeCentering", () => {
  it("measures straight borders", () => {
    const c = computeCentering(fit(2, 3, 2.5, 2.5));
    expect(c.lr.worst).toBeCloseTo(60, 6);
    expect(c.lr.mean).toBeCloseTo(60, 6);
    expect(c.lr.heavySide).toBe("right");
    expect(c.lr.worstMm.a).toBeCloseTo(2, 6);
    expect(c.lr.worstMm.b).toBeCloseTo(3, 6);
    expect(c.tb.worst).toBeCloseTo(50, 6);
  });

  it("finds the worst point of a tilted frame, not the average", () => {
    // Left frame line runs from 2.0 mm (top) to 3.0 mm (bottom); right stays at 2.5 mm.
    const f = fit(2, 2.5, 2.5, 2.5);
    f.inner.left = { a: { x: M + 2 * P, y: M }, b: { x: M + 3 * P, y: M + H } };
    const c = computeCentering(f);
    // Sampled range: the frame (2.5 mm from top/bottom), clipped to 3 mm corner zones → y ∈ [3, 85] mm.
    const leftAt = (ymm: number) => 2 + ymm / 88;
    const ratio = (l: number) => (100 * Math.max(l, 2.5)) / (l + 2.5);
    const expected = Math.max(ratio(leftAt(3)), ratio(leftAt(85)));
    expect(c.lr.worst).toBeCloseTo(expected, 4);
    // Worst at the top, where the left border is thinnest (2.03 mm against 2.5 mm).
    expect(c.lr.heavySide).toBe("right");
    expect(c.lr.mean).toBeLessThan(c.lr.worst);
  });

  it("works with user-dragged lines given in any direction and length", () => {
    const f = fit(2, 3, 2, 3);
    f.inner.left = { a: { x: M + 2 * P, y: M + 500 }, b: { x: M + 2 * P, y: M + 100 } };
    f.inner.top = { a: { x: M + 900, y: M + 2 * P }, b: { x: M + 300, y: M + 2 * P } };
    const c = computeCentering(f);
    expect(c.lr.worst).toBeCloseTo(60, 6);
    expect(c.tb.worst).toBeCloseTo(60, 6);
    expect(c.tb.heavySide).toBe("bottom");
  });
});

describe("geometry", () => {
  it("homography maps the four points and inverts", () => {
    const src = [{ x: 0, y: 0 }, { x: 63, y: 0 }, { x: 63, y: 88 }, { x: 0, y: 88 }];
    const dst = [{ x: 410.2, y: 120.7 }, { x: 1180.5, y: 300.1 }, { x: 990.3, y: 1400.9 }, { x: 205.4, y: 1180.2 }];
    const Hm = homographyFrom4(src, dst)!;
    for (let i = 0; i < 4; i++) {
      const p = applyH(Hm, src[i]);
      expect(p.x).toBeCloseTo(dst[i].x, 6);
      expect(p.y).toBeCloseTo(dst[i].y, 6);
    }
    const back = applyH(matInv(Hm)!, applyH(Hm, { x: 20, y: 30 }));
    expect(back.x).toBeCloseTo(20, 6);
    expect(back.y).toBeCloseTo(30, 6);
  });

  it("robust line ignores a 40% cluster of outliers", () => {
    const s: number[] = [], d: number[] = [];
    for (let i = 0; i < 50; i++) { s.push(i * 10); d.push(i % 5 < 2 ? 20 + (i % 3) : 40 + 0.01 * i * 10); }
    const f = robustLine(s, d, { thresh: 2, maxSlope: 0.1 })!;
    expect(f.a).toBeCloseTo(40, 6);
    expect(f.b).toBeCloseTo(0.01, 6);
  });
});

import { describe, expect, it } from "vitest";
import type { Quad } from "@/lib/centering";
import { alignQuad, toPhoto, toView, turn, uprightRotation, viewSize } from "./orient";

const W = 4000;
const H = 3000;

describe("view rotation", () => {
  it("round-trips points for every rotation", () => {
    for (const r of [0, 90, 180, 270] as const) {
      const p = { x: 123, y: 2345 };
      expect(toPhoto(toView(p, W, H, r), W, H, r)).toEqual(p);
      const v = viewSize(W, H, r);
      const corner = toView({ x: W, y: H }, W, H, r);
      expect(corner.x >= 0 && corner.x <= v.w && corner.y >= 0 && corner.y <= v.h).toBe(true);
    }
  });

  it("turns both ways and wraps", () => {
    expect(turn(0, -90)).toBe(270);
    expect(turn(270, 90)).toBe(0);
    expect(turn(90, 90)).toBe(180);
  });
});

describe("upright rotation", () => {
  // A portrait card lying on its side in a landscape photo, top edge on the photo's right (needs a 270° view).
  const sidewaysRightTop: Quad = [
    { x: 3000, y: 600 }, // TL
    { x: 3000, y: 2400 }, // TR
    { x: 1000, y: 2400 }, // BR
    { x: 1000, y: 600 }, // BL
  ];

  it("picks the rotation that puts the card's top edge at the top of the screen", () => {
    expect(uprightRotation(sidewaysRightTop)).toBe(270);
    const upright: Quad = [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 800 }, { x: 100, y: 800 }];
    expect(uprightRotation(upright)).toBe(0);
    const upsideDown: Quad = [upright[2], upright[3], upright[0], upright[1]];
    expect(uprightRotation(upsideDown)).toBe(180);
  });

  it("re-labels corners so the top edge is the one nearest the top of the screen", () => {
    // Shown at 90° clockwise, the photo's left edge (x≈1000) becomes the screen top.
    const q = alignQuad(sidewaysRightTop, W, H, 90);
    const v = q.map((p) => toView(p, W, H, 90));
    expect((v[0].y + v[1].y) / 2).toBeLessThan((v[2].y + v[3].y) / 2); // top edge above bottom edge
    expect(v[0].x).toBeLessThan(v[1].x); // TL left of TR
    expect(uprightRotation(q)).toBe(90);
    // Already upright for its rotation: unchanged.
    expect(alignQuad(sidewaysRightTop, W, H, 270)).toEqual(sidewaysRightTop);
  });
});

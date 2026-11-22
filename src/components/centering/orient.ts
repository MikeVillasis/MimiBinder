// How the photo is turned on screen in the corner step (pure, unit tested). Only the *view* rotates: corner
// coordinates stay in photo pixels, so measurement never touches rotated pixels.
import type { Point, Quad } from "@/lib/centering";

/** Clockwise view rotation in degrees. */
export type Rotation = 0 | 90 | 180 | 270;

export function turn(r: Rotation, by: 90 | -90): Rotation {
  return ((((r + by) % 360) + 360) % 360) as Rotation;
}

/** Size of the photo as shown on screen. */
export function viewSize(w: number, h: number, r: Rotation): { w: number; h: number } {
  return r === 90 || r === 270 ? { w: h, h: w } : { w, h };
}

/** Photo pixel → on-screen (rotated) pixel. */
export function toView(p: Point, w: number, h: number, r: Rotation): Point {
  switch (r) {
    case 0:
      return { x: p.x, y: p.y };
    case 90:
      return { x: h - p.y, y: p.x };
    case 180:
      return { x: w - p.x, y: h - p.y };
    case 270:
      return { x: p.y, y: w - p.x };
  }
}

/** On-screen (rotated) pixel → photo pixel. */
export function toPhoto(v: Point, w: number, h: number, r: Rotation): Point {
  switch (r) {
    case 0:
      return { x: v.x, y: v.y };
    case 90:
      return { x: v.y, y: h - v.x };
    case 180:
      return { x: w - v.x, y: h - v.y };
    case 270:
      return { x: w - v.y, y: v.x };
  }
}

/** A direction (not a point) in photo space, as seen on screen. */
function dirToView(d: Point, r: Rotation): Point {
  switch (r) {
    case 0:
      return d;
    case 90:
      return { x: -d.y, y: d.x };
    case 180:
      return { x: -d.x, y: -d.y };
    case 270:
      return { x: d.y, y: -d.x };
  }
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The rotation that shows the card upright: its top edge (corners 0→1) at the top of the screen. */
export function uprightRotation(quad: Quad): Rotation {
  const up = { x: mid(quad[0], quad[1]).x - mid(quad[3], quad[2]).x, y: mid(quad[0], quad[1]).y - mid(quad[3], quad[2]).y };
  let best: Rotation = 0;
  let bestY = Infinity;
  for (const r of [0, 90, 180, 270] as Rotation[]) {
    const v = dirToView(up, r);
    const len = Math.hypot(v.x, v.y) || 1;
    if (v.y / len < bestY - 1e-9) {
      bestY = v.y / len;
      best = r;
    }
  }
  return best;
}

/**
 * Re-label the corners (keeping their clockwise order) so the top edge is the edge nearest the top of the
 * screen for this rotation. Corner order decides which way up the card is measured.
 */
export function alignQuad(quad: Quad, w: number, h: number, r: Rotation): Quad {
  let best = 0;
  let bestY = Infinity;
  for (let s = 0; s < 4; s++) {
    const y = toView(mid(quad[s], quad[(s + 1) % 4]), w, h, r).y;
    if (y < bestY - 1e-9) {
      bestY = y;
      best = s;
    }
  }
  return [quad[best], quad[(best + 1) % 4], quad[(best + 2) % 4], quad[(best + 3) % 4]];
}

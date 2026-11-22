import type { AxisCentering, Side } from "@/lib/centering";

const label: Record<Side, string> = { left: "Left", right: "Right", top: "Top", bottom: "Bottom" };
export const sideLabel = (s: Side) => label[s];

/** "57/43" from the larger border's share (50..100). */
export function ratio(worst: number): string {
  const a = Math.round(worst);
  return `${a}/${100 - a}`;
}
export function ratio1(worst: number): string {
  return `${worst.toFixed(1)}/${(100 - worst).toFixed(1)}`;
}

/** Border widths in mm as [first side, second side] of the axis, consistent with the heavy side. */
export function widths(axis: AxisCentering, axisName: "lr" | "tb") {
  const [first, second]: Side[] = axisName === "lr" ? ["left", "right"] : ["top", "bottom"];
  const big = Math.max(axis.worstMm.a, axis.worstMm.b);
  const small = Math.min(axis.worstMm.a, axis.worstMm.b);
  const firstHeavy = axis.heavySide === first;
  return { first, second, firstMm: firstHeavy ? big : small, secondMm: firstHeavy ? small : big };
}

import { describe, expect, it } from "vitest";
import {
  chunkPages,
  countUpValue,
  easeOutCubic,
  foilTier,
  isNewEntry,
  markMilestonesShown,
  NEW_BADGE_MS,
  pendingMilestone,
  reachedMilestones,
} from "./fun";

describe("milestones", () => {
  it("lists the milestones a percent has reached", () => {
    expect(reachedMilestones(0)).toEqual([]);
    expect(reachedMilestones(24.9)).toEqual([]);
    expect(reachedMilestones(25)).toEqual([25]);
    expect(reachedMilestones(80)).toEqual([25, 50, 75]);
    expect(reachedMilestones(100)).toEqual([25, 50, 75, 100]);
    expect(reachedMilestones(NaN)).toEqual([]);
  });

  it("celebrates the highest new milestone only", () => {
    expect(pendingMilestone(10, [])).toBeNull();
    expect(pendingMilestone(30, [])).toBe(25);
    expect(pendingMilestone(80, [])).toBe(75);
    expect(pendingMilestone(80, [25])).toBe(75);
    expect(pendingMilestone(100, [25, 50, 75])).toBe(100);
  });

  it("fires once per set per milestone", () => {
    let shown: number[] = [];
    expect(pendingMilestone(55, shown)).toBe(50);
    shown = markMilestonesShown(55, shown);
    expect(shown).toEqual([25, 50]); // 25 was skipped in the jump and must not fire later
    expect(pendingMilestone(55, shown)).toBeNull();
    expect(pendingMilestone(60, shown)).toBeNull();
    // dropping below and climbing back does not celebrate again
    expect(pendingMilestone(40, shown)).toBeNull();
    expect(pendingMilestone(52, markMilestonesShown(40, shown))).toBeNull();
    expect(pendingMilestone(76, shown)).toBe(75);
  });

  it("ignores junk in the stored list", () => {
    expect(markMilestonesShown(30, [50, 7, 50])).toEqual([25, 50]);
  });
});

describe("isNewEntry", () => {
  const now = Date.parse("2026-11-22T12:00:00.000Z");
  it("is true for the last 3 days only", () => {
    expect(isNewEntry("2026-11-22T11:59:00.000Z", now)).toBe(true);
    expect(isNewEntry(new Date(now - NEW_BADGE_MS + 1000).toISOString(), now)).toBe(true);
    expect(isNewEntry(new Date(now - NEW_BADGE_MS).toISOString(), now)).toBe(false);
    expect(isNewEntry("2026-11-10T00:00:00.000Z", now)).toBe(false);
  });
  it("tolerates small clock skew but not far-future or bad dates", () => {
    expect(isNewEntry("2026-11-22T13:00:00.000Z", now)).toBe(true);
    expect(isNewEntry("2026-12-25T00:00:00.000Z", now)).toBe(false);
    expect(isNewEntry("not a date", now)).toBe(false);
    expect(isNewEntry(undefined, now)).toBe(false);
  });
});

describe("count-up", () => {
  it("starts on the previous value and ends exactly on the real value", () => {
    expect(countUpValue(0, 1234.56, 0)).toBe(0);
    expect(countUpValue(10, 1234.56, 0)).toBe(10);
    expect(countUpValue(0, 1234.56, 1)).toBe(1234.56);
    expect(countUpValue(0, 1234.56, 1.7)).toBe(1234.56);
    expect(countUpValue(0, 0.1 + 0.2, 1)).toBe(0.1 + 0.2);
    expect(countUpValue(0, 3.18, NaN)).toBe(3.18);
  });
  it("never overshoots, up or down", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const up = countUpValue(0, 500, t);
      expect(up).toBeGreaterThanOrEqual(0);
      expect(up).toBeLessThanOrEqual(500);
      const down = countUpValue(500, 20, t);
      expect(down).toBeGreaterThanOrEqual(20);
      expect(down).toBeLessThanOrEqual(500);
    }
  });
  it("eases from 0 to 1 and clamps", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-3)).toBe(0);
    expect(easeOutCubic(9)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("foilTier", () => {
  it("maps rarity text to a foil strength", () => {
    expect(foilTier(undefined)).toBe("none");
    expect(foilTier("Common")).toBe("none");
    expect(foilTier("Uncommon")).toBe("none");
    expect(foilTier("Rare")).toBe("sheen");
    expect(foilTier("Holo Rare")).toBe("sheen");
    expect(foilTier("Double rare")).toBe("sheen");
    expect(foilTier("Ultra Rare")).toBe("rainbow");
    expect(foilTier("Special illustration rare")).toBe("rainbow");
    expect(foilTier("Secret Rare")).toBe("rainbow");
    expect(foilTier("Hyper rare")).toBe("rainbow");
  });
});

describe("chunkPages", () => {
  it("splits into pages of nine pockets", () => {
    const pages = chunkPages(Array.from({ length: 20 }, (_, i) => i));
    expect(pages.map((p) => p.length)).toEqual([9, 9, 2]);
    expect(pages.flat()).toHaveLength(20);
    expect(chunkPages([])).toEqual([]);
  });
});

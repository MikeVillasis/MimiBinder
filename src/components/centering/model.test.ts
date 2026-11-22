import { describe, expect, it } from "vitest";
import { ZONES, type AxisCentering, type CenteringResult, type ConditionReport, type PhotoQuality, type Severity, type ZoneId } from "@/lib/centering";
import { buildAssessment, flagLabels, gradeText, summarizeFace, summaryText, verdict, type Shot } from "./model";

const axis = (a: number, b: number, first: "left" | "top", second: "right" | "bottom"): AxisCentering => ({
  worst: (100 * Math.max(a, b)) / (a + b), mean: (100 * Math.max(a, b)) / (a + b), heavySide: a >= b ? first : second, worstMm: { a, b },
});
const centering = (l: number, r: number, t: number, b: number): CenteringResult => ({ lr: axis(l, r, "left", "right"), tb: axis(t, b, "top", "bottom") });
const quality: PhotoQuality = { pxPerMm: 18.2, blurMm: 0.08, glareShare: 0, skew: 0.02, brightness: 140, issues: [] };

function report(face: "front" | "back", flags: Partial<Record<ZoneId, Severity>> = {}, opts: { noWhitening?: boolean } = {}): ConditionReport {
  return {
    face, blurMm: 0.08, glareShare: 0, lightBackground: false, lightBorder: !!opts.noWhitening, borderUniformity: 1,
    zones: ZONES.map((z) => ({
      zone: z, status: flags[z] ? "flagged" : "clear", checked: { whitening: !opts.noWhitening, contour: true }, skipped: opts.noWhitening ? ["lightBorder"] : [],
      defects: flags[z] ? [{ kind: "whitening", severity: flags[z]!, lengthMm: 1.234, depthMm: 0.256, areaMm2: 0.321 }] : [],
      crop: { x: 0, y: 0, w: 10, h: 10 }, marks: [],
    })),
  };
}
const shot = (c: CenteringResult | null, r: ConditionReport, tag = "t"): Shot => ({
  centering: c, condition: r, quality, thumb: `data:image/jpeg;base64,${tag}`,
  evidence: Object.fromEntries(r.zones.filter((z) => z.status === "flagged").map((z) => [z.zone, { src: `data:image/jpeg;base64,${tag}-${z.zone}`, w: 10, h: 10, marks: [] }])),
});

describe("summarizeFace", () => {
  it("is null without photos", () => {
    expect(summarizeFace("front", [])).toBeNull();
  });
  it("averages photos, flags disagreement and takes evidence from the photo that showed the flag", () => {
    const s = summarizeFace("back", [shot(centering(2, 3, 2.5, 2.5), report("back"), "a"), shot(centering(2.1, 2.9, 2.5, 2.5), report("back", { "corner-tl": "minor" }), "b")])!;
    expect(s.shots).toBe(2);
    expect(s.centering!.lr.worst).toBeCloseTo(59, 6);
    expect(s.inconsistent).toBe(true); // 2 points apart
    expect(s.condition.zones.find((z) => z.zone === "corner-tl")!.status).toBe("flagged");
    expect(s.evidence["corner-tl"]!.src).toBe("data:image/jpeg;base64,b-corner-tl");
    expect(s.thumb).toBe("data:image/jpeg;base64,b");
  });
  it("keeps the flags when the lines gave no ratios", () => {
    const s = summarizeFace("front", [shot(null, report("front", { "edge-top": "moderate" }))])!;
    expect(s.centering).toBeNull();
    expect(s.inconsistent).toBe(false);
    expect(s.condition.zones.find((z) => z.zone === "edge-top")!.status).toBe("flagged");
  });
});

describe("verdict", () => {
  const front = (c: CenteringResult, flags = {}) => summarizeFace("front", [shot(c, report("front", flags))]);
  const back = (c: CenteringResult, flags = {}) => summarizeFace("back", [shot(c, report("back", flags))]);

  it("has nothing to say without photos", () => {
    expect(verdict(null, null)).toEqual({ centering: null, condition: null, probable: null, limitedBy: null });
  });
  it("is the centering ceiling when nothing is flagged", () => {
    const v = verdict(front(centering(2.1, 2.9, 2.5, 2.5)), back(centering(2.5, 2.5, 2.5, 2.5)));
    expect(v.centering!.grade).toBe(9);
    expect(v.condition).toBeNull();
    expect(v.probable).toBe(9);
    expect(v.limitedBy).toBe("centering");
  });
  it("is lowered by flags, and says which of the two limits it", () => {
    const v = verdict(front(centering(2.5, 2.5, 2.5, 2.5)), back(centering(2.5, 2.5, 2.5, 2.5), { "corner-tl": "minor", "corner-br": "minor" }));
    expect(v.centering!.grade).toBe(10);
    expect(v.condition!.grade).toBe(8);
    expect(v.probable).toBe(8);
    expect(v.limitedBy).toBe("condition");
    const both = verdict(front(centering(2.1, 2.9, 2.5, 2.5)), back(centering(2.5, 2.5, 2.5, 2.5), { "corner-tl": "minor" }));
    expect(both.probable).toBe(9);
    expect(both.limitedBy).toBe("both");
    const cent = verdict(front(centering(1.5, 3.5, 2.5, 2.5)), back(centering(2.5, 2.5, 2.5, 2.5), { "corner-tl": "minor" }));
    expect(cent.probable).toBe(7);
    expect(cent.limitedBy).toBe("centering");
  });
  it("leaves out a front axis that is off-centre by design", () => {
    const eCard = { border: "yellow" as const, likelyFullArt: false, asymmetric: { axis: "lr" as const, why: "" } };
    expect(verdict(front(centering(4.5, 1.5, 2.5, 2.5)), null).probable).toBe(6);
    expect(verdict(front(centering(4.5, 1.5, 2.5, 2.5)), null, eCard).probable).toBe(10);
  });
  it("never yields a grade PSA does not issue", () => {
    for (const sev of ["minor", "moderate", "heavy"] as Severity[]) {
      const v = verdict(null, back(centering(2.5, 2.5, 2.5, 2.5), { "corner-tl": sev, "edge-top": sev }));
      expect(Number.isInteger(v.probable)).toBe(true);
    }
  });
});

describe("buildAssessment", () => {
  const f = summarizeFace("front", [shot(centering(2.1, 2.9, 2.4, 2.6), report("front", {}, { noWhitening: true }), "f")])!;
  const b = summarizeFace("back", [shot(centering(2.5, 2.5, 2.5, 2.5), report("back", { "corner-tl": "minor" }), "b1"), shot(centering(2.52, 2.48, 2.5, 2.5), report("back", { "corner-tl": "minor" }), "b2")])!;
  const v = verdict(f, b);

  it("stores ratios, flags, ceilings and small photos", () => {
    const a = buildAssessment(f, b, v, { cardId: "sv01-001", cardName: " Pineco · SV #001 ", entryId: "e1", notes: " spring batch " });
    expect(a.cardId).toBe("sv01-001");
    expect(a.cardName).toBe("Pineco · SV #001");
    expect(a.entryId).toBe("e1");
    expect(a.notes).toBe("spring batch");
    expect(a.front!.lr).toBeCloseTo(58, 2);
    expect(a.front!.lrHeavy).toBe("right");
    expect(a.front!.mm).toEqual({ left: 2.1, right: 2.9, top: 2.4, bottom: 2.6 });
    expect(a.front!.shots).toBe(1);
    expect(a.front!.spread).toBeUndefined();
    expect(a.front!.noWhitening).toHaveLength(8);
    expect(a.back!.shots).toBe(2);
    expect(a.back!.spread).toBeCloseTo(0.4, 2);
    expect(a.back!.flags).toEqual([{ zone: "corner-tl", kind: "whitening", severity: "minor", lengthMm: 1.23, depthMm: 0.26, areaMm2: 0.32, seenIn: 2, crop: "data:image/jpeg;base64,b1-corner-tl" }]);
    expect(a.back!.pxPerMm).toBe(18.2);
    expect(a.centeringCeiling).toBe(9);
    expect(a.probableCeiling).toBe(9);
    expect(a.probableReasons).toEqual(["back top-left corner: whitening"]);
    expect(a.thumbs).toEqual({ front: "data:image/jpeg;base64,f", back: "data:image/jpeg;base64,b2" });
  });
  it("can leave the photos out", () => {
    const a = buildAssessment(f, b, v, { photos: false });
    expect(a.thumbs).toBeUndefined();
    expect(a.back!.flags[0].crop).toBeUndefined();
    expect(JSON.stringify(a)).not.toContain("data:image");
  });
  it("records a skipped full-art front", () => {
    const a = buildAssessment(null, b, verdict(null, b), { frontFullArt: true });
    expect(a.front).toBeUndefined();
    expect(a.frontFullArt).toBe(true);
  });
});

describe("summaryText", () => {
  const f = summarizeFace("front", [shot(centering(2.1, 2.9, 2.4, 2.6), report("front", {}, { noWhitening: true }))])!;
  const b = summarizeFace("back", [shot(centering(2.5, 2.5, 2.5, 2.5), report("back", { "corner-tl": "minor" })), shot(centering(2.52, 2.48, 2.5, 2.5), report("back", { "corner-tl": "minor" }))])!;
  it("states the ceiling as a ceiling and lists what was not assessed", () => {
    const t = summaryText(f, b, verdict(f, b), { cardName: "Pineco", date: new Date("2026-11-22T12:00:00Z") });
    expect(t).toContain("Pineco: MimiBinder grading check, 2026-11-22");
    expect(t).toContain("Probable ceiling: PSA 9 (Mint). A ceiling, not a predicted grade.");
    expect(t).toContain("front 58/42 left/right, 52/48 top/bottom");
    expect(t).toContain("back 50/50 left/right, 50/50 top/bottom (2 photos, within 0.4 points)");
    expect(t).toContain("Corner and edge flags (uncalibrated): back top-left corner: whitening (minor).");
    expect(t).toContain("Not assessed: surface (scratches, print lines, dents); front whitening (silver or light border).");
    expect(t).not.toMatch(/9\.5/);
  });
  it("says when a side was not photographed or was skipped", () => {
    expect(summaryText(f, null, verdict(f, null))).toContain("back not photographed");
    const t = summaryText(null, b, verdict(null, b), { frontFullArt: true });
    expect(t).toContain("Front centering not measured (full-art card).");
    expect(t).not.toContain("front not photographed");
  });
});

describe("labels", () => {
  it("formats grades and flags", () => {
    expect(gradeText(8)).toBe("PSA 8 (NM-MT)");
    expect(flagLabels([{ zone: "corner-tl", kind: "whitening", severity: "minor" }, { zone: "corner-tl", kind: "cornerLoss", severity: "moderate" }, { zone: "edge-top", kind: "chipping", severity: "minor" }])).toEqual([
      "top-left corner: whitening and worn or dinged tip",
      "top edge: chipped edge",
    ]);
  });
});

// Benchmark sweeps (not part of the normal run). They print the numbers quoted in docs/HANDOFF.md and
// docs/proposals/GRADING_V2.md.
//
//   CENTERING_BENCH=1 npx vitest run src/lib/centering/bench.test.ts
//     centering: standard / heavy synthetic accuracy, real-scan agreement, the 10 hard kinds x 24 seeds (240 photos)
//     condition: detection rates for planted wear and false positives on clean cards (about 600 photos)
//   CENTERING_BENCH=centering | condition   runs only that part.
//   CENTERING_BENCH_N=<n>                   seeds per condition row (default 16).
//   CENTERING_BENCH_OUT=<file prefix>       also writes <prefix>-centering.txt / <prefix>-condition.txt.
//   CENTERING_SAMPLES_OUT=<dir>             writes synthetic defect photos (PNG) for browser checks instead.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzePhoto, assessCondition, computeCentering, measureBorders } from "./index";
import { cleanFullArtSet, cleanGlareSet, cleanHardSet, cleanRate, cleanSet, conditionCard, detectionRate, fmtClean, fmtRate, type DefectCase } from "./testing/conditionEval";
import { addGlare, makeFullArtCard, withDefects } from "./testing/defects";
import { readPng, writePng } from "./testing/png";
import { flatCard, makePhoto, scanSource, type CardSource, type PhotoSpec, type SynthPhoto } from "./testing/synth";
import { HARD_KINDS, hardSuccess, randomPose, runHard, runScenario, runSynthSet, summarize, type Outcome } from "./testing/scenarios";
import type { Face } from "./types";

const mode = process.env.CENTERING_BENCH ?? "";
const want = (part: string) => mode === "1" || mode === part;
const FIX = path.join(__dirname, "testing", "fixtures");
const range = (a: number, n: number) => Array.from({ length: n }, (_, i) => a + i);

function report(part: string, lines: string[]) {
  const out = process.env.CENTERING_BENCH_OUT;
  if (out) writeFileSync(`${out}-${part}.txt`, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
}

describe.skipIf(!want("centering"))("centering benchmark", () => {
  it("standard, heavy, scans, hard", { timeout: 1_800_000 }, () => {
    const lines: string[] = [];
    lines.push(summarize("standard (1200x1600)", runSynthSet("standard", [1, 2, 3, 4, 5, 6], [1200, 1600])).line);
    lines.push(summarize("heavy (1500x2000)", runSynthSet("heavy", [5, 6, 7, 8, 9, 10], [1500, 2000])).line);
    const scans: Outcome[] = [];
    for (const file of ["swsh12.5-003.png", "sv03.5-001.png", "sv01-001.png"]) {
      const p = path.join(FIX, file);
      if (!existsSync(p)) continue;
      const src = scanSource(readPng(p), { x: -0.8, y: 0.6 });
      const flat = flatCard(src, 20, 40);
      const ref = computeCentering(measureBorders({ image: flat.image, pxPerMm: 20, marginPx: 40 }, "front"));
      for (const s of [1, 2, 3, 4]) {
        scans.push(
          runScenario(`${file} #${s}`, src, ref, "front", {
            width: 1200, height: 1600, ...randomPose(s + 100), background: (["wood", "desk", "dark"] as const)[s % 3], blurSigma: 1, noiseSigma: 3.5, seed: s + 100,
          }),
        );
      }
    }
    lines.push(summarize("real scans (1200x1600)", scans).line);
    let pass = 0, total = 0;
    for (const kind of HARD_KINDS) {
      let ok = 0;
      const fails: number[] = [];
      for (let seed = 1; seed <= 24; seed++) {
        total++;
        if (hardSuccess(runHard(kind, seed))) { ok++; pass++; } else fails.push(seed);
      }
      lines.push(`hard ${kind.padEnd(12)} ${ok}/24${fails.length ? `  failed seeds: ${fails.join(", ")}` : ""}`);
    }
    lines.push(`hard total ${pass}/${total}`);
    report("centering", lines);
    expect(total).toBe(240);
  });
});

describe.skipIf(!want("condition"))("corner and edge benchmark", () => {
  it("detection rates and false positives", { timeout: 3_600_000 }, () => {
    const lines: string[] = [];
    const N = Number(process.env.CENTERING_BENCH_N ?? 16);
    const seeds = range(1, N);
    const blueYellow = ["backMottled", "yellow", "backFlat"] as const;
    const whitening: [string, DefectCase][] = [
      ["corner whitening 0.15 mm deep", { type: "cornerWhitening", depthMm: 0.15 }],
      ["corner whitening 0.3 mm deep", { type: "cornerWhitening", depthMm: 0.3 }],
      ["corner whitening 0.6 mm deep", { type: "cornerWhitening", depthMm: 0.6 }],
      ["edge whitening 3 mm x 0.15 mm", { type: "edgeWhitening", lengthMm: 3, depthMm: 0.15 }],
      ["edge whitening 10 mm x 0.25 mm", { type: "edgeWhitening", lengthMm: 10, depthMm: 0.25 }],
    ];
    const contour: [string, DefectCase][] = [
      ["edge chip r 0.4 mm (0.28 deep)", { type: "chip", radiusMm: 0.4 }],
      ["edge chip r 0.7 mm (0.5 deep)", { type: "chip", radiusMm: 0.7 }],
      ["edge chip r 1.2 mm (0.85 deep)", { type: "chip", radiusMm: 1.2 }],
      ["rounded corner r 4 mm (0.41 lost)", { type: "roundedCorner", radiusMm: 4 }],
      ["rounded corner r 5 mm (0.83 lost)", { type: "roundedCorner", radiusMm: 5 }],
      ["corner ding 0.4 mm", { type: "ding", lossMm: 0.4 }],
      ["corner ding 0.8 mm", { type: "ding", lossMm: 0.8 }],
    ];
    lines.push("--- detection, dark plain table, blue and yellow borders (whitening) ---");
    for (const [l, c] of whitening) lines.push(fmtRate(detectionRate(l, c, seeds, { kinds: [...blueYellow] })));
    lines.push("--- detection, light table (white/grey/beige), blue and yellow borders ---");
    for (const [l, c] of whitening) lines.push(fmtRate(detectionRate(l + " [light]", c, seeds, { bg: "light", kinds: [...blueYellow] })));
    lines.push("--- detection, silver border (whitening not assessable) ---");
    lines.push(fmtRate(detectionRate("corner whitening 0.6 mm [silver]", whitening[2][1], seeds.slice(0, 8), { kinds: ["silver"] })));
    lines.push("--- detection, shape defects, all four card kinds, dark table ---");
    for (const [l, c] of contour) lines.push(fmtRate(detectionRate(l, c, seeds)));
    lines.push("--- detection, shape defects, light table ---");
    for (const [l, c] of contour) lines.push(fmtRate(detectionRate(l + " [light]", c, seeds, { bg: "light" })));
    lines.push("--- detection, heavy blur and noise, dark table ---");
    lines.push(fmtRate(detectionRate("corner whitening 0.6 mm [heavy]", whitening[2][1], seeds, { kinds: [...blueYellow], level: "heavy" })));
    lines.push(fmtRate(detectionRate("edge chip r 1.2 mm [heavy]", contour[2][1], seeds, { level: "heavy" })));
    lines.push("--- false positives on clean cards ---");
    const clean = [
      cleanRate("clean, dark plain table", cleanSet(range(1, 2 * N), "dark")),
      cleanRate("clean, light table", cleanSet(range(101, N), "light")),
      cleanRate("clean, busy table (planks, plaid)", cleanSet(range(201, N), "busy")),
      cleanRate("clean, hard scenes (shadow, clutter, ...)", cleanHardSet(["shadow", "clutter", "tableEdge", "secondRect", "touchEdge", "fill90"], range(1, Math.max(2, N / 4)))),
      cleanRate("clean, heavy blur and noise", cleanSet(range(301, N), "dark", "heavy")),
      cleanRate("clean, low resolution (900x1200)", cleanSet(range(401, N), "dark", "lowres")),
      cleanRate("clean, glare over a corner or edge", cleanGlareSet(range(501, N))),
      cleanRate("clean full art (no border)", cleanFullArtSet(range(1, N / 2), false)),
      cleanRate("clean full art, holo glitter", cleanFullArtSet(range(1, N / 2), true)),
    ];
    let photos = 0, flagged = 0, zones = 0, flaggedZones = 0;
    for (const r of clean) {
      lines.push(fmtClean(r));
      for (const d of r.detail) lines.push("     " + d);
      photos += r.photos; flagged += r.flaggedPhotos; zones += r.zones; flaggedZones += r.flaggedZones;
    }
    lines.push(`clean total: ${flagged}/${photos} photos with a false flag, ${flaggedZones}/${zones} zones`);
    report("condition", lines);
    expect(photos).toBeGreaterThan(0);
  });
});

// Synthetic defect photos for the browser checks (large PNGs; nothing is written unless the directory is given).
describe.skipIf(!process.env.CENTERING_SAMPLES_OUT)("defect sample photos", () => {
  it("writes them", { timeout: 1_800_000 }, () => {
    const out = process.env.CENTERING_SAMPLES_OUT!;
    mkdirSync(out, { recursive: true });
    const notes: string[] = [];
    const photo = (seed: number, bg: PhotoSpec["background"], over: Partial<PhotoSpec> = {}): PhotoSpec => ({
      width: 3000, height: 4000, ...randomPose(seed, { maxRot: 18, maxTilt: 10 }), fill: 0.8, background: bg, blurSigma: 1.6, noiseSigma: 3.5, seed, ...over,
    });
    const save = (name: string, card: CardSource, face: Face, spec: PhotoSpec, what: string, post?: (p: SynthPhoto) => void) => {
      const ph = makePhoto(card, spec);
      post?.(ph);
      writePng(path.join(out, name), ph.image);
      const res = analyzePhoto(ph.image, face);
      let line = `${name} (${spec.width}x${spec.height}, ${face}): ${what}\n  engine: `;
      if (!res) line += "card not found";
      else {
        const c = computeCentering(res.fit);
        const r = assessCondition(res.warp, res.fit, face);
        line += `lr ${c.lr.worst.toFixed(1)} tb ${c.tb.worst.toFixed(1)} blur ${r.blurMm.toFixed(2)} mm; ` + r.zones.map((z) => `${z.zone}=${z.status === "flagged" ? z.defects.map((d) => `${d.kind}/${d.severity}`).join("+") : z.status}`).join(" ");
      }
      notes.push(line);
    };
    const back = (seed: number) => conditionCard("backMottled", seed).card;
    save("back_worn.png", withDefects(back(4), [
      { kind: "cornerWhitening", corner: 0, depthMm: 0.4 },
      { kind: "edgeWhitening", side: "right", fromMm: 30, toMm: 42, depthMm: 0.25, patchy: 0.2 },
      { kind: "chip", side: "bottom", atMm: 25, radiusMm: 0.8 },
      { kind: "ding", corner: 2, lossMm: 0.6 },
    ], 4), "back", photo(4, "desk"), "mottled blue back: whitened top-left corner (0.4 mm), 12 mm of whitening on the right edge, a chip in the bottom edge, a dinged bottom-right corner");
    save("back_clean.png", back(7), "back", photo(7, "dark"), "clean mottled blue back");
    save("back_clean_2.png", back(7), "back", photo(71, "desk"), "the same clean back, second photo (another pose)");
    save("back_clean_3.png", back(7), "back", photo(72, "wood"), "the same clean back, third photo (another pose)");
    save("back_minor.png", withDefects(back(9), [{ kind: "cornerWhitening", corner: 1, depthMm: 0.2, spanMm: 3 }], 9), "back", photo(9, "dark"), "mottled back with one lightly whitened corner (top-right, 0.2 mm)");
    const swsh = path.join(FIX, "swsh12.5-003.png"), sv = path.join(FIX, "sv03.5-001.png");
    if (existsSync(swsh)) {
      save("front_yellow_worn.png", withDefects(scanSource(readPng(swsh), { x: -0.5, y: 0.3 }), [{ kind: "cornerWhitening", corner: 3, depthMm: 0.35 }, { kind: "edgeWhitening", side: "top", fromMm: 20, toMm: 28, depthMm: 0.2 }], 2), "front", photo(12, "desk"), "real Crown Zenith scan (yellow): whitened bottom-left corner, 8 mm of whitening on the top edge");
    }
    if (existsSync(sv)) save("front_silver.png", scanSource(readPng(sv)), "front", photo(13, "dark"), "real 151 Bulbasaur scan (silver border): whitening cannot be assessed");
    save("fullart_holo.png", makeFullArtCard(3, { holo: true }), "front", photo(14, "dark"), "full-art holo front: no printed border");
    save("back_blurry.png", back(7), "back", photo(15, "desk", { blurSigma: 9 }), "clean back, badly out of focus");
    save("back_glare.png", back(7), "back", photo(16, "desk"), "clean back with a specular highlight in the middle and over the top edge", (p) => {
      const q = p.quad;
      const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
      addGlare(p.image, cx, cy, 260, 200, 330);
      addGlare(p.image, (q[0].x + q[1].x) / 2, (q[0].y + q[1].y) / 2 + 40, 170, 120, 330);
    });
    save("back_lowres.png", back(7), "back", photo(17, "desk", { width: 690, height: 920, blurSigma: 0.8 }), "clean back, small photo (card about 700 px tall)");
    writeFileSync(path.join(out, "README.txt"), "Synthetic defect photos for the grading UI checks (src/lib/centering/bench.test.ts, CENTERING_SAMPLES_OUT).\n\n" + notes.join("\n\n") + "\n");
    expect(notes.length).toBeGreaterThan(8);
  });
});

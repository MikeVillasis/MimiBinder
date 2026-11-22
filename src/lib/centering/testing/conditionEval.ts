// Detection-rate and false-positive harness for the corner/edge checks (condition.ts): synthetic card → optional
// synthetic wear → synthetic phone photo → full pipeline → assessCondition, scored per zone.
import { analyzePhoto, assessCondition } from "../index";
import type { ConditionReport, DefectKind, ZoneId } from "../condition";
import type { Face, RGBAImage, Side } from "../types";
import { CARD_MM } from "../types";
import { addGlare, makeFullArtCard, mottledBack, withDefects, type CornerIndex, type SynthDefect } from "./defects";
import { hardScenario, randomCardSpec, randomPose, type HardKind } from "./scenarios";
import { makePhoto, makeSynthCard, mulberry32, type Background, type CardSource, type PhotoSpec, type SynthPhoto } from "./synth";

const CORNER_ZONE: ZoneId[] = ["corner-tl", "corner-tr", "corner-br", "corner-bl"];
const SIDES: Side[] = ["top", "right", "bottom", "left"];

export type BgClass = "dark" | "light" | "busy";
const BG: Record<BgClass, Background[]> = { dark: ["desk", "dark", "wood"], light: ["white", "grey", "beige"], busy: ["woodStrong", "cloth"] };

export type CardKind = "backFlat" | "backMottled" | "yellow" | "silver";
const KINDS: CardKind[] = ["backMottled", "yellow", "backFlat", "silver"];

export function conditionCard(kind: CardKind, seed: number): { card: CardSource; face: Face } {
  if (kind === "yellow" || kind === "silver") return { card: makeSynthCard(randomCardSpec(seed, "front", kind)), face: "front" };
  const flat = makeSynthCard(randomCardSpec(seed, "back", "blue"));
  return { card: kind === "backMottled" ? mottledBack(flat, seed) : flat, face: "back" };
}

export function conditionPhoto(seed: number, bg: BgClass, level: "standard" | "heavy" | "lowres" = "standard"): PhotoSpec {
  const r = mulberry32(seed * 911 + 13);
  const size = level === "lowres" ? [900, 1200] : [1500, 2000];
  return {
    width: size[0], height: size[1], ...randomPose(seed + 40, { maxRot: 25, maxTilt: 12 }), fill: 0.62 + 0.26 * r(),
    background: BG[bg][Math.floor(r() * BG[bg].length)],
    blurSigma: level === "heavy" ? 2.2 : 1.0, noiseSigma: level === "heavy" ? 9 : 3.5, seed,
  };
}

export interface CondOutcome {
  detected: boolean;
  report: ConditionReport | null;
  /** assessCondition time only. */
  ms: number;
  photo: SynthPhoto;
}

export function runCondition(card: CardSource, face: Face, photo: PhotoSpec, post?: (p: SynthPhoto) => void): CondOutcome {
  const ph = makePhoto(card, photo);
  post?.(ph);
  const res = analyzePhoto(ph.image, face);
  if (!res) return { detected: false, report: null, ms: 0, photo: ph };
  const t0 = performance.now();
  const report = assessCondition(res.warp, res.fit, face);
  return { detected: true, report, ms: performance.now() - t0, photo: ph };
}

/** A defect to plant and where it should be flagged. */
export interface Planted {
  defect: SynthDefect;
  zone: ZoneId;
  kind: DefectKind;
  /** Zones that may legitimately be flagged too (the defect spills into them). */
  near: ZoneId[];
}

const edgeZone = (s: Side): ZoneId => `edge-${s}`;
const sideLen = (s: Side) => (s === "top" || s === "bottom" ? CARD_MM.width : CARD_MM.height);
/** Edges that meet at a corner (corner index 0 TL, 1 TR, 2 BR, 3 BL). */
const cornerEdges = (c: CornerIndex): ZoneId[] => [edgeZone((["top", "top", "bottom", "bottom"] as Side[])[c]), edgeZone((["left", "right", "right", "left"] as Side[])[c])];

export type DefectCase =
  | { type: "cornerWhitening"; depthMm: number }
  | { type: "edgeWhitening"; lengthMm: number; depthMm: number }
  | { type: "chip"; radiusMm: number }
  | { type: "roundedCorner"; radiusMm: number }
  | { type: "ding"; lossMm: number };

export function plant(c: DefectCase, seed: number): Planted {
  const r = mulberry32(seed * 577 + 5);
  const corner = Math.floor(r() * 4) as CornerIndex;
  const side = SIDES[Math.floor(r() * 4)];
  switch (c.type) {
    case "cornerWhitening":
      return { defect: { kind: "cornerWhitening", corner, depthMm: c.depthMm }, zone: CORNER_ZONE[corner], kind: "whitening", near: [] };
    case "roundedCorner":
      return { defect: { kind: "roundedCorner", corner, radiusMm: c.radiusMm }, zone: CORNER_ZONE[corner], kind: "cornerLoss", near: cornerEdges(corner) };
    case "ding":
      return { defect: { kind: "ding", corner, lossMm: c.lossMm }, zone: CORNER_ZONE[corner], kind: "cornerLoss", near: cornerEdges(corner) };
    case "chip": {
      const at = 10 + r() * (sideLen(side) - 20);
      return { defect: { kind: "chip", side, atMm: at, radiusMm: c.radiusMm, rim: r() < 0.5 }, zone: edgeZone(side), kind: "chipping", near: [] };
    }
    case "edgeWhitening": {
      const from = 9 + r() * (sideLen(side) - 18 - c.lengthMm);
      return { defect: { kind: "edgeWhitening", side, fromMm: from, toMm: from + c.lengthMm, depthMm: c.depthMm, patchy: 0.2 }, zone: edgeZone(side), kind: "whitening", near: [] };
    }
  }
}

export interface RateRow {
  label: string;
  n: number;
  /** Target zone flagged with any defect kind. */
  flagged: number;
  /** Target zone flagged with the planted kind. */
  rightKind: number;
  /** Target zone reported "not assessed" for the relevant check (counted as a miss, but shown). */
  notAssessed: number;
  /** Photos where a zone that should be clean was flagged. */
  strayPhotos: number;
  undetected: number;
}

export function detectionRate(label: string, c: DefectCase, seeds: number[], opts: { bg?: BgClass; kinds?: CardKind[]; level?: "standard" | "heavy" | "lowres" } = {}): RateRow {
  const row: RateRow = { label, n: 0, flagged: 0, rightKind: 0, notAssessed: 0, strayPhotos: 0, undetected: 0 };
  const kinds = opts.kinds ?? KINDS;
  for (const seed of seeds) {
    const { card, face } = conditionCard(kinds[seed % kinds.length], seed);
    const p = plant(c, seed);
    const out = runCondition(withDefects(card, [p.defect], seed), face, conditionPhoto(seed, opts.bg ?? "dark", opts.level));
    row.n++;
    if (!out.report) { row.undetected++; continue; }
    const z = out.report.zones.find((x) => x.zone === p.zone)!;
    if (z.status === "flagged") { row.flagged++; if (z.defects.some((d) => d.kind === p.kind)) row.rightKind++; }
    else if (!(p.kind === "whitening" ? z.checked.whitening : z.checked.contour)) row.notAssessed++;
    if (out.report.zones.some((x) => x.zone !== p.zone && !p.near.includes(x.zone) && x.status === "flagged")) row.strayPhotos++;
  }
  return row;
}

export interface CleanRow {
  label: string;
  photos: number;
  /** Photos with at least one flagged zone (a false positive on a clean card). */
  flaggedPhotos: number;
  zones: number;
  flaggedZones: number;
  /** Zones where neither check ran. */
  notAssessedZones: number;
  undetected: number;
  msMean: number;
  detail: string[];
}

export function cleanRate(label: string, photos: { name: string; card: CardSource; face: Face; photo: PhotoSpec; post?: (p: SynthPhoto) => void }[]): CleanRow {
  const row: CleanRow = { label, photos: 0, flaggedPhotos: 0, zones: 0, flaggedZones: 0, notAssessedZones: 0, undetected: 0, msMean: 0, detail: [] };
  let ms = 0;
  for (const p of photos) {
    const out = runCondition(p.card, p.face, p.photo, p.post);
    if (!out.report) { row.undetected++; continue; }
    row.photos++;
    ms += out.ms;
    let any = false;
    for (const z of out.report.zones) {
      row.zones++;
      if (z.status === "flagged") { row.flaggedZones++; any = true; row.detail.push(`${p.name} ${z.zone}: ${z.defects.map((d) => `${d.kind} ${d.severity} ${d.lengthMm.toFixed(1)}mm/${d.depthMm.toFixed(2)}mm`).join(", ")}`); }
      else if (z.status === "notAssessed") row.notAssessedZones++;
    }
    if (any) row.flaggedPhotos++;
  }
  row.msMean = row.photos ? ms / row.photos : 0;
  return row;
}

/** Clean cards over the four card kinds on one background class. */
export function cleanSet(seeds: number[], bg: BgClass, level: "standard" | "heavy" | "lowres" = "standard") {
  return seeds.map((seed) => {
    const kind = KINDS[seed % KINDS.length];
    return { name: `${kind} ${bg} #${seed}`, ...conditionCard(kind, seed), photo: conditionPhoto(seed, bg, level) };
  });
}

/** Clean cards in the hard detection scenarios of scenarios.ts (clutter, shadows, table edges, …). */
export function cleanHardSet(kinds: HardKind[], seeds: number[]) {
  return kinds.flatMap((kind) => seeds.map((seed) => {
    const { spec, photo } = hardScenario(kind, seed);
    return { name: `${kind} #${seed}`, card: makeSynthCard(spec), face: spec.face, photo };
  }));
}

export function cleanFullArtSet(seeds: number[], holo: boolean) {
  return seeds.map((seed) => ({ name: `fullart${holo ? " holo" : ""} #${seed}`, card: makeFullArtCard(seed, { holo }), face: "front" as Face, photo: conditionPhoto(seed, "dark") }));
}

/** Clean cards with a specular highlight placed over one corner or one edge of the card. */
export function cleanGlareSet(seeds: number[]) {
  return seeds.map((seed) => {
    const kind = KINDS[seed % 3]; // glare on silver is not interesting: whitening is not assessed there
    const r = mulberry32(seed * 131 + 7);
    const post = (p: SynthPhoto) => {
      const q = p.quad;
      const i = Math.floor(r() * 4);
      const onCorner = r() < 0.5;
      const a = q[i], b = q[(i + 1) % 4];
      const t = onCorner ? 0.04 : 0.3 + 0.4 * r();
      const c = { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
      const e = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      // Pull the highlight a little toward the card centre so it straddles the border.
      glareAt(p.image, e.x + (c.x - e.x) * 0.04, e.y + (c.y - e.y) * 0.04, 40 + 60 * r(), 25 + 40 * r());
    };
    return { name: `glare ${kind} #${seed}`, ...conditionCard(kind, seed), photo: conditionPhoto(seed, "dark"), post };
  });
}

function glareAt(img: RGBAImage, x: number, y: number, rx: number, ry: number) {
  addGlare(img, x, y, rx, ry, 330);
}

export const fmtRate = (r: RateRow) =>
  `${r.label.padEnd(44)} n=${String(r.n).padStart(3)}  flagged ${String(r.flagged).padStart(3)} (${((100 * r.flagged) / Math.max(1, r.n)).toFixed(0).padStart(3)}%)  right kind ${String(r.rightKind).padStart(3)}  not assessed ${String(r.notAssessed).padStart(3)}  stray flags ${r.strayPhotos}  card not found ${r.undetected}`;

export const fmtClean = (r: CleanRow) =>
  `${r.label.padEnd(44)} photos=${String(r.photos).padStart(3)}  with a false flag ${String(r.flaggedPhotos).padStart(3)} (${((100 * r.flaggedPhotos) / Math.max(1, r.photos)).toFixed(1)}%)  zones ${r.flaggedZones}/${r.zones} (${((100 * r.flaggedZones) / Math.max(1, r.zones)).toFixed(2)}%)  not assessed ${r.notAssessedZones}  card not found ${r.undetected}  ${r.msMean.toFixed(0)} ms`;

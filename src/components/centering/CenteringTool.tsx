"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getCard } from "@/lib/api-client";
import { borderProfile, looksFullArt, QUALITY_LIMITS } from "@/lib/centering";
import type { BorderFit, BorderProfile, ConditionReport, Face, PhotoQuality, QualityIssue, Quad, RGBAImage, Side } from "@/lib/centering";
import type { CardDetail } from "@/lib/types";
import { CardImage } from "../CardImage";
import { Button, PageHeader, SectionHeader, Surface, cx } from "../ui";
import { AssessmentLog } from "./AssessmentLog";
import { fullArtReason } from "./fullArt";
import { CaptureButtons } from "./CaptureButtons";
import { ConditionPanel } from "./ConditionPanel";
import { CornerEditor } from "./CornerEditor";
import { alignQuad, toPhoto, turn, uprightRotation, viewSize, type Rotation } from "./orient";
import { decodePhoto, type Decoded } from "./decode";
import { CenteringEngine } from "./engine";
import { buildEvidence, thumbnail, type Evidence } from "./evidence";
import { summarizeFace, verdict, type Shot } from "./model";
import { Readout } from "./Readout";
import { ResultEditor, safeCentering } from "./ResultEditor";
import type { SaveCard } from "./SaveSheet";
import { Summary } from "./Summary";

const MIN_CONFIDENCE = 0.5;
/** Photos of one face that are averaged. More adds little and costs the user time. */
const MAX_SHOTS = 3;

/** What the engine found on the current photo besides the border lines. */
interface ShotExtras {
  condition: ConditionReport;
  quality: PhotoQuality;
  evidence: Evidence;
  thumb: string;
  /** Milliseconds: finding the card, and warp + lines + corner/edge check. */
  ms: { detect: number; measure: number };
}

interface FaceState {
  status: "empty" | "working" | "corners" | "measured" | "error";
  busy: string;
  quad: Quad | null;
  detected: Quad | null;
  /** Why we are asking for corners: no detection, low confidence, or fine. */
  note: string | null;
  /** False until the user has moved a corner, when the card was not found: never measure a default rectangle. */
  placed: boolean;
  /** How the photo is turned on screen in the corner step (clockwise). Corners stay in photo pixels. */
  rot: Rotation;
  fit: BorderFit | null;
  origFit: BorderFit | null;
  extras: ShotExtras | null;
  detectMs: number;
  /** Earlier, finished photos of this face (averaged with the current one). */
  earlier: Shot[];
  /** The user has seen the lines and accepted or moved them (until then an all-dashed front is not trusted). */
  confirmed: boolean;
  error: string | null;
}

const EMPTY: FaceState = { status: "empty", busy: "", quad: null, detected: null, note: null, placed: true, rot: 0, fit: null, origFit: null, extras: null, detectMs: 0, earlier: [], confirmed: false, error: null };

/** Heavy buffers live here (references only): the decoded photo and the warped card. */
interface Buffers {
  decoded: Decoded | null;
  warp: RGBAImage | null;
}

/** A centred, upright card-shaped starting quad as seen on screen, returned in photo pixels. */
function defaultQuad(w: number, h: number, rot: Rotation = 0): Quad {
  const v = viewSize(w, h, rot);
  const ch = Math.min(v.h * 0.72, (v.w * 0.8 * 88) / 63);
  const cw = (ch * 63) / 88;
  const x0 = (v.w - cw) / 2;
  const y0 = (v.h - ch) / 2;
  const corners = [
    { x: x0, y: y0 },
    { x: x0 + cw, y: y0 },
    { x: x0 + cw, y: y0 + ch },
    { x: x0, y: y0 + ch },
  ];
  return corners.map((p) => toPhoto(p, w, h, rot)) as Quad;
}

const TIPS = [
  "Take the card out of its sleeve or top loader.",
  "Lay it flat on a plain, dark surface: wear at the edges shows best against it.",
  "Shoot straight down from 25 to 40 cm.",
  "Use soft, even light with no glare.",
  "Let the card fill most of the frame.",
];

/** The current photo as a finished shot, when it is measured. */
function currentShot(st: FaceState, face: Face): Shot | null {
  if (st.status !== "measured" || !st.fit || !st.extras) return null;
  // A front where every frame line is low-confidence (dashed) is probably a full-art card: its ratios mean
  // nothing, so they do not set a ceiling until the user confirms or moves the lines.
  const unreliable = face === "front" && !st.confirmed && lowEverywhere(st.fit);
  return { centering: unreliable ? null : safeCentering(st.fit), condition: st.extras.condition, quality: st.extras.quality, evidence: st.extras.evidence, thumb: st.extras.thumb };
}
/** Every side's frame line is low-confidence (drawn dashed). */
const lowEverywhere = (fit: BorderFit) => (["left", "right", "top", "bottom"] as Side[]).every((s) => fit.quality[s] < 0.6);
const shotsOf = (st: FaceState, face: Face): Shot[] => {
  const cur = currentShot(st, face);
  return cur ? [...st.earlier, cur] : st.earlier;
};

function Spinner({ label }: { label: string }) {
  return (
    <Surface role="status" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-surface-3 border-t-accent motion-reduce:animate-none" aria-hidden="true" />
      <p className="text-sm font-medium">{label}</p>
    </Surface>
  );
}

const noopSubscribe = () => () => {};

/** The card named by ?card=, loaded once. */
function useCardParam(): { id: string | null; card?: CardDetail; failed: boolean } {
  // Read ?card= after mount instead of useSearchParams: the page then prerenders as plain static HTML
  // (with useSearchParams + Suspense, the prerender left a hidden duplicate of the page in the DOM).
  const search = useSyncExternalStore(noopSubscribe, () => window.location.search, () => "");
  const id = new URLSearchParams(search).get("card");
  const [state, setState] = useState<{ id: string; card?: CardDetail; failed?: boolean }>({ id: "" });
  useEffect(() => {
    if (!id) return;
    let live = true;
    getCard(id)
      .then((card) => live && setState({ id, card }))
      .catch(() => live && setState({ id, failed: true }));
    return () => {
      live = false;
    };
  }, [id]);
  return { id, card: state.id === id ? state.card : undefined, failed: state.id === id && !!state.failed };
}

function CardHeader({ id, card, failed }: { id: string | null; card?: CardDetail; failed: boolean }) {
  if (!id) return null;
  return (
    <Surface padded="sm" className="mb-1 flex items-center gap-3">
      <div className="w-14 shrink-0">{card ? <CardImage image={card.image} name={card.name} /> : <div className="skeleton aspect-[63/88] w-full rounded-lg" aria-hidden="true" />}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium tracking-wide text-muted">Checking</div>
        <div className="truncate font-semibold">{card ? card.name : failed ? id : "Loading card…"}</div>
        <Link href={`/card/${encodeURIComponent(id)}`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
          ← Back to card
        </Link>
      </div>
    </Surface>
  );
}

type StepState = "done" | "current" | "todo" | "skipped";

/** Where the user is: front, back, result. Not a control (the tabs are); it says what comes next. */
function Steps({ front, back, result, next }: { front: StepState; back: StepState; result: StepState; next: string }) {
  const items: [string, StepState][] = [["Front", front], ["Back", back], ["Result", result]];
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex items-center gap-2 text-[13px]" aria-label="Progress">
        {items.map(([label, s], i) => (
          <li key={label} className="flex items-center gap-2" aria-current={s === "current" ? "step" : undefined}>
            {i > 0 && <span className="h-px w-4 bg-line sm:w-8" aria-hidden="true" />}
            <span
              className={cx(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                s === "done" ? "bg-good text-bg" : s === "current" ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
              )}
              aria-hidden="true"
            >
              {s === "done" ? "✓" : s === "skipped" ? "–" : i + 1}
            </span>
            <span className={cx(s === "current" ? "font-semibold text-fg" : "text-muted")}>
              {label}
              <span className="sr-only">{s === "done" ? " (done)" : s === "skipped" ? " (skipped)" : s === "current" ? " (current step)" : ""}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm" role="status" aria-live="polite">
        <span className="font-semibold">Next:</span> {next}
      </p>
    </div>
  );
}

const ISSUE_TEXT: Record<QualityIssue, (q: PhotoQuality) => string> = {
  blurry: (q) => `The photo is soft (the card's edge is blurred by about ${q.blurMm.toFixed(2)} mm). Tap the card to focus and hold still.`,
  glare: () => "Glare covers part of the card. Tilt the card or move the light.",
  lowRes: (q) => `The card is only about ${Math.round(q.pxPerMm * 88)} px tall in this photo (${Math.round(QUALITY_LIMITS.minPxPerMm * 88)} px is the minimum, 1500 px or more is best). Move closer or use the main camera.`,
  tilted: () => "The photo was taken at an angle. Hold the phone flat, straight above the card.",
  dark: () => "The photo is dark. Add light.",
};

function QualityNote({ quality }: { quality: PhotoQuality }) {
  if (!quality.issues.length) return null;
  return (
    <div role="status" className="rounded-ui-md bg-danger/10 p-3 text-sm">
      <p className="font-semibold text-danger">A retake would help</p>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed">
        {quality.issues.map((i) => (
          <li key={i}>{ISSUE_TEXT[i](quality)}</li>
        ))}
      </ul>
      <p className="mt-1 text-[13px] text-muted">The numbers below are still measured, but trust them less.</p>
    </div>
  );
}

export function CenteringTool() {
  const [faces, setFaces] = useState<Record<Face, FaceState>>({ front: EMPTY, back: EMPTY });
  const [bufs, setBufs] = useState<Record<Face, Buffers>>({ front: { decoded: null, warp: null }, back: { decoded: null, warp: null } });
  const [tab, setTab] = useState<Face>("front");
  // null = follow the card's rarity (full-art cards start ticked); true/false = the user chose.
  const [skipChoice, setSkipChoice] = useState<boolean | null>(null);
  /** Faces where the "take a second photo" suggestion was skipped. */
  const [secondSkipped, setSecondSkipped] = useState<Record<Face, boolean>>({ front: false, back: false });
  const [focusSide, setFocusSide] = useState<{ face: Face; side: Side; n: number } | null>(null);
  const engine = useRef<CenteringEngine | null>(null);
  const token = useRef<Record<Face, number>>({ front: 0, back: 0 });
  const bitmaps = useRef<Record<Face, ImageBitmap | null>>({ front: null, back: null });
  const summaryRef = useRef<HTMLDivElement>(null);
  const cardParam = useCardParam();

  const getEngine = () => (engine.current ??= new CenteringEngine());
  const patch = useCallback((face: Face, p: Partial<FaceState>) => setFaces((f) => ({ ...f, [face]: { ...f[face], ...p } })), []);

  const dropBuffers = useCallback((face: Face) => {
    bitmaps.current[face]?.close();
    bitmaps.current[face] = null;
    setBufs((b) => ({ ...b, [face]: { decoded: null, warp: null } }));
    engine.current?.release(face);
  }, []);

  useEffect(() => {
    const bm = bitmaps.current;
    return () => {
      bm.front?.close();
      bm.back?.close();
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);

  const onFile = async (face: Face, file: File) => {
    const t = ++token.current[face];
    const stale = () => token.current[face] !== t;
    dropBuffers(face);
    // Earlier, finished photos of this face are kept: the new one replaces only the current photo.
    setFaces((f) => ({ ...f, [face]: { ...EMPTY, earlier: f[face].earlier, status: "working", busy: "Reading photo…" } }));
    try {
      const dec = await decodePhoto(file);
      if (stale()) {
        dec.bitmap.close();
        return;
      }
      bitmaps.current[face] = dec.bitmap;
      setBufs((b) => ({ ...b, [face]: { decoded: dec, warp: null } }));
      patch(face, { busy: "Finding the card…" });
      const det = await getEngine().load(face, dec.getPixels);
      if (stale()) return;
      const good = !!det.quad && det.confidence >= MIN_CONFIDENCE;
      // Turn the photo so the card appears upright (e.g. a card shot sideways in a landscape photo).
      const rot: Rotation = det.quad ? uprightRotation(det.quad) : 0;
      patch(face, {
        status: "corners",
        rot,
        detectMs: det.ms,
        quad: good ? alignQuad(det.quad!, dec.width, dec.height, rot) : defaultQuad(dec.width, dec.height, rot),
        detected: det.quad,
        placed: !!det.quad,
        note: !det.quad
          ? "We could not find the card automatically. Drag the four corners onto the card's corners."
          : good
            ? null
            : `We are not sure we found the card (${Math.round(det.confidence * 100)}% confident). Please check the four corners.`,
      });
    } catch (e) {
      if (stale()) return;
      patch(face, { status: "error", error: e instanceof Error ? e.message : "Could not read that photo." });
    }
  };

  const measure = async (face: Face) => {
    const quad = faces[face].quad;
    if (!quad) return;
    const t = ++token.current[face];
    patch(face, { status: "working", busy: "Measuring…", error: null });
    try {
      const out = await getEngine().measure(face, quad);
      if (token.current[face] !== t) return;
      setBufs((b) => ({ ...b, [face]: { ...b[face], warp: out.warp.image } }));
      const extras: ShotExtras = {
        condition: out.condition,
        quality: out.quality,
        evidence: buildEvidence(out.warp.image, out.condition, out.crops),
        thumb: thumbnail(out.warp.image),
        ms: { detect: faces[face].detectMs, measure: out.ms.warp + out.ms.fit + out.ms.condition },
      };
      patch(face, { status: "measured", fit: out.fit, origFit: out.fit, extras });
    } catch (e) {
      if (token.current[face] !== t) return;
      patch(face, { status: "error", error: e instanceof Error ? e.message : "Measuring failed." });
    }
  };

  const toCorners = (face: Face) => {
    setBufs((b) => ({ ...b, [face]: { ...b[face], warp: null } }));
    patch(face, { status: bufs[face].decoded ? "corners" : "empty", fit: null, origFit: null, extras: null });
  };

  /** Keep the current photo's result and get ready for another photo of the same face. */
  const addShot = (face: Face) => {
    const cur = currentShot(faces[face], face);
    if (!cur) return;
    token.current[face]++;
    dropBuffers(face);
    setFaces((f) => ({ ...f, [face]: { ...EMPTY, earlier: [...f[face].earlier, cur] } }));
  };

  const dropEarlier = (face: Face) => patch(face, { earlier: [] });

  const reset = () => {
    token.current.front++;
    token.current.back++;
    (["front", "back"] as Face[]).forEach(dropBuffers);
    setFaces({ front: EMPTY, back: EMPTY });
    setSkipChoice(null);
    setSecondSkipped({ front: false, back: false });
    setTab("front");
  };

  const toggleSkip = (on: boolean) => {
    setSkipChoice(on);
    if (on) {
      token.current.front++;
      dropBuffers("front");
      setFaces((f) => ({ ...f, front: EMPTY }));
    }
  };

  const card = cardParam.card;
  const fullArtWhy = useMemo(() => fullArtReason(card), [card]);
  const frontSkipped = skipChoice ?? !!fullArtWhy;
  const profile: BorderProfile | null = useMemo(() => (card ? borderProfile({ id: card.id, setId: card.setId, serieId: card.serieId, rarity: card.rarity }) : null), [card]);
  const saveCard: SaveCard | null = useMemo(() => (card ? { id: card.id, name: card.name, detail: `${card.setName} #${card.localId}` } : null), [card]);

  const fsum = useMemo(() => (frontSkipped ? null : summarizeFace("front", shotsOf(faces.front, "front"))), [faces.front, frontSkipped]);
  const bsum = useMemo(() => summarizeFace("back", shotsOf(faces.back, "back")), [faces.back]);
  const v = useMemo(() => verdict(fsum, bsum, profile), [fsum, bsum, profile]);

  const tabLabel = (face: Face) => {
    if (face === "front" && frontSkipped) return "Skipped";
    const st = faces[face];
    const n = shotsOf(st, face).length;
    if (st.status === "measured" || (st.status === "empty" && n > 0)) return n > 1 ? `Measured (${n} photos)` : "Measured";
    return st.status === "empty" ? "" : st.status === "error" ? "Problem" : "In progress";
  };

  const frontDone = !!fsum, backDone = !!bsum;
  const stepFront: StepState = frontSkipped ? "skipped" : frontDone ? "done" : tab === "front" ? "current" : "todo";
  const stepBack: StepState = backDone ? "done" : tab === "back" || frontDone || frontSkipped ? "current" : "todo";
  const allDone = (frontDone || frontSkipped) && backDone;
  const cur = faces[tab];
  const next = allDone
    ? "see the result below. A second photo of each side makes the numbers steadier."
    : tab === "front" && frontSkipped
      ? "measure the back."
      : cur.status === "empty" || cur.status === "error"
        ? shotsOf(cur, tab).length
          ? `add another photo of the ${tab}, or measure the ${tab === "front" ? "back" : "front"}.`
          : `take a photo of the ${tab}.`
        : cur.status === "corners"
          ? cur.placed
            ? "check the four corners, then tap Measure."
            : "drag the four corners onto the card."
          : cur.status === "measured"
            ? `check the lines, then measure the ${tab === "front" ? "back" : "front"}.`
            : "one moment…";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <PageHeader title="Centering check" subtitle="Measure a raw card's front and back from phone photos: the best PSA grade its centering allows, plus corner and edge wear flags." />
        <p className="-mt-2 flex items-start gap-2 text-sm text-muted">
          <svg viewBox="0 0 24 24" width="16" height="16" className="mt-0.5 shrink-0 text-good" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span>Everything runs on your device. Your photos are never uploaded.</span>
        </p>
      </div>

      <CardHeader {...cardParam} />

      <Steps front={stepFront} back={stepBack} result={allDone ? "current" : "todo"} next={next} />

      <div
        role="tablist"
        aria-label="Card face"
        className="grid grid-cols-2 gap-1 rounded-ui-md bg-surface-2 p-1 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-line)_45%,transparent)]"
      >
        {(["front", "back"] as Face[]).map((face) => (
          <button
            key={face}
            id={`tab-${face}`}
            role="tab"
            type="button"
            aria-selected={tab === face}
            aria-controls="face-panel"
            onClick={() => setTab(face)}
            className={`ui-motion flex min-h-11 flex-col items-center justify-center rounded-[10px] px-3 py-1 text-sm capitalize ${tab === face ? "bg-surface-3 font-semibold text-fg elev-1" : "font-medium text-muted hover:text-fg"}`}
          >
            {face}
            <span className={`text-xs font-medium normal-case ${tabLabel(face).startsWith("Measured") ? "text-good" : "text-muted"}`}>{tabLabel(face) || "Not measured"}</span>
          </button>
        ))}
      </div>

      <div id="face-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex flex-col gap-4">
        {tab === "front" && frontSkipped ? (
          <Surface padded>
            <p className="font-semibold">Front centering is not measured.</p>
            <p className="mt-1 text-sm text-muted">Full-art cards have no border to measure, so the front will not limit the ceiling. The back&apos;s corner and edge check still covers chips and dings, which show on both sides.</p>
            <Button className="mt-3" variant="secondary" onClick={() => setTab("back")}>
              Measure the back
            </Button>
          </Surface>
        ) : (
          <FacePanel
            face={tab}
            state={faces[tab]}
            bufs={bufs[tab]}
            focusSide={focusSide?.face === tab ? focusSide : null}
            otherMeasured={tab === "front" ? backDone : frontDone || frontSkipped}
            onFile={(f) => onFile(tab, f)}
            onMeasure={() => measure(tab)}
            onToCorners={() => toCorners(tab)}
            onQuad={(q) => patch(tab, { quad: q, placed: true })}
            onRotate={(by) => {
              const st = faces[tab];
              const d = bufs[tab].decoded;
              if (!st.quad || !d) return;
              const rot = turn(st.rot, by);
              // Re-label the corners so the screen's top edge is the card's top; an unplaced default quad is
              // re-centred upright instead.
              patch(tab, { rot, quad: st.placed ? alignQuad(st.quad, d.width, d.height, rot) : defaultQuad(d.width, d.height, rot) });
            }}
            onFit={(fit) => patch(tab, { fit, confirmed: true })}
            onCheck={(side) => setFocusSide({ face: tab, side, n: Date.now() })}
            onOther={() => setTab(tab === "front" ? "back" : "front")}
            onAddShot={() => addShot(tab)}
            secondSkipped={secondSkipped[tab]}
            onSkipSecond={() => setSecondSkipped((s) => ({ ...s, [tab]: true }))}
            onDropEarlier={() => dropEarlier(tab)}
            onFullArt={() => toggleSkip(true)}
            onConfirmLines={() => patch(tab, { confirmed: true })}
            onResult={() => summaryRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })}
            allDone={allDone}
          />
        )}
        {tab === "front" && (
          <label className="ui-motion flex min-h-11 cursor-pointer items-center gap-3 rounded-ui-lg bg-surface px-4 py-2 text-sm elev-0 hover:bg-surface-2/70">
            <input type="checkbox" checked={frontSkipped} onChange={(e) => toggleSkip(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
            <span>
              <span className="font-medium">Full-art card (no border to measure)</span>
              <span className="block text-[13px] text-muted">
                Skips the front. Front centering is not measured.
                {fullArtWhy ? (frontSkipped ? ` Ticked because ${fullArtWhy}. Untick to measure the front anyway.` : ` This card's front may be full art: ${fullArtWhy}.`) : ""}
              </span>
            </span>
          </label>
        )}
      </div>

      <div ref={summaryRef} className="scroll-mt-20">
        {(fsum || bsum) && <Summary front={fsum} back={bsum} verdict={v} frontSkipped={frontSkipped} profile={profile} card={saveCard} onReset={reset} />}
      </div>
      {!fsum && !bsum && (faces.front.status !== "empty" || faces.back.status !== "empty" || frontSkipped) && (
        <div>
          <Button variant="ghost" onClick={reset}>
            Start over
          </Button>
        </div>
      )}

      <AssessmentLog cardId={cardParam.id ?? undefined} />
    </div>
  );
}

function FacePanel({
  face,
  state,
  bufs,
  focusSide,
  otherMeasured,
  allDone,
  onFile,
  onMeasure,
  onToCorners,
  onQuad,
  onRotate,
  onFit,
  onCheck,
  onOther,
  onAddShot,
  secondSkipped,
  onSkipSecond,
  onDropEarlier,
  onFullArt,
  onConfirmLines,
  onResult,
}: {
  face: Face;
  state: FaceState;
  bufs: Buffers;
  focusSide: { side: Side; n: number } | null;
  otherMeasured: boolean;
  allDone: boolean;
  onFile: (f: File) => void;
  onMeasure: () => void;
  onToCorners: () => void;
  onQuad: (q: Quad) => void;
  onRotate: (by: 90 | -90) => void;
  onFit: (f: BorderFit) => void;
  onCheck: (s: Side) => void;
  onOther: () => void;
  onAddShot: () => void;
  secondSkipped: boolean;
  onSkipSecond: () => void;
  onDropEarlier: () => void;
  onFullArt: () => void;
  onConfirmLines: () => void;
  onResult: () => void;
}) {
  const result = useMemo(() => (state.fit ? safeCentering(state.fit) : null), [state.fit]);
  const warn = useMemo(() => (state.fit ? (["left", "right", "top", "bottom"] as Side[]).filter((s) => state.fit!.quality[s] < 0.6) : []), [state.fit]);
  const other = face === "front" ? "back" : "front";
  const earlier = state.earlier.length;
  // After the first measured photo of a face, suggest a second one (skippable; never for a third).
  const suggestSecond = state.status === "measured" && earlier === 0 && !secondSkipped && !(face === "front" && !!state.fit && !!state.origFit && (looksFullArt(state.origFit) || (!state.confirmed && lowEverywhere(state.fit))));

  if (state.status === "working") return <Spinner label={state.busy} />;

  if (state.status === "empty" || state.status === "error") {
    return (
      <Surface padded="lg" className="flex flex-col gap-4">
        {state.status === "error" && (
          <p role="alert" className="rounded-ui-md bg-danger/10 p-3 text-sm text-danger">
            {state.error} Try another photo.
          </p>
        )}
        {earlier > 0 && (
          <div className="rounded-ui-md bg-surface-2 p-3 text-sm" role="status">
            <p className="font-semibold">
              {earlier} {earlier === 1 ? "photo" : "photos"} of the {face} measured.
            </p>
            <p className="mt-0.5 text-[13px] text-muted">
              Take the card off the table, put it down again and shoot once more: the result becomes the average, and you see how well the photos agree.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!otherMeasured && (
                <Button size="sm" variant="secondary" onClick={onOther}>
                  Measure the {other} instead
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onDropEarlier}>
                Discard {earlier === 1 ? "that photo" : "those photos"}
              </Button>
            </div>
          </div>
        )}
        <div>
          <SectionHeader title={`${face === "front" ? "Front" : "Back"} photo${earlier ? ` ${earlier + 1}` : ""}`} subtitle="A few tips for an accurate reading" className="mb-2" />
          <ul className="flex flex-col gap-2 text-[13px] text-muted">
            {TIPS.map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <svg viewBox="0 0 24 24" width="16" height="16" className="mt-px shrink-0 text-good" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <CaptureButtons face={face} onFile={onFile} />
      </Surface>
    );
  }

  if (state.status === "corners" && state.quad && bufs.decoded) {
    const d = bufs.decoded;
    return (
      <Surface padded className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Check the corners</h2>
        {state.note ? (
          <p role="alert" className="rounded-ui-md bg-danger/10 p-3 text-sm">
            {state.note}
          </p>
        ) : (
          <p className="text-sm text-muted">Drag each round handle onto the card&apos;s outer corner. If the card isn&apos;t upright, turn the photo until it is.</p>
        )}
        <CornerEditor bitmap={d.bitmap} width={d.width} height={d.height} quad={state.quad} rotation={state.rot} onChange={onQuad} />
        {!state.placed && (
          <p id={`${face}-place-hint`} className="text-sm font-semibold">
            Move the corners onto the card to continue.
          </p>
        )}
        <p className="text-[13px] text-muted">Arrow keys nudge a focused corner by 1 pixel (Shift: 10).</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onMeasure} disabled={!state.placed} aria-describedby={state.placed ? undefined : `${face}-place-hint`}>
            Measure
          </Button>
          <Button variant="secondary" onClick={() => onRotate(-90)} aria-label="Turn the photo left (counter-clockwise)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5" />
            </svg>
            Turn left
          </Button>
          <Button variant="secondary" onClick={() => onRotate(90)} aria-label="Turn the photo right (clockwise)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />
            </svg>
            Turn right
          </Button>
          {state.detected && (
            <Button variant="ghost" onClick={() => onQuad(alignQuad(state.detected!, d.width, d.height, state.rot))}>
              Reset corners
            </Button>
          )}
        </div>
        <CaptureButtons face={face} onFile={onFile} retake />
      </Surface>
    );
  }

  if (state.status === "measured" && state.fit && state.origFit && bufs.warp && state.extras) {
    const x = state.extras;
    const allLow = face === "front" && !state.confirmed && lowEverywhere(state.fit);
    const fullArt = face === "front" && (looksFullArt(state.origFit) || allLow);
    return (
      <Surface padded className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold capitalize tracking-tight">
          {face} centering{earlier ? <span className="normal-case text-muted"> · photo {earlier + 1}</span> : null}
        </h2>
        {fullArt && (
          <div role="alert" className="flex flex-col gap-2 rounded-ui-md bg-accent-soft p-3 text-sm" data-testid="full-art-prompt">
            <p className="font-semibold">This looks like a full-art card. Skip the front?</p>
            <p className="text-[13px] text-muted">
              {allLow && !looksFullArt(state.origFit)
                ? "No clear printed border was found: every frame line below is dashed, so the ratios are not reliable and are not counted in the result yet."
                : "No printed border was found on the front, so the ratios below are not meaningful. Full-art fronts cannot be measured for centering."}{" "}
              {allLow ? "Skip the front, or move the lines onto the real border (or accept them) to count it." : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onFullArt}>
                Treat as full art (skip the front)
              </Button>
              {allLow && (
                <Button size="sm" variant="secondary" onClick={onConfirmLines}>
                  Use these lines anyway
                </Button>
              )}
            </div>
          </div>
        )}
        <QualityNote quality={x.quality} />
        <Readout result={result} fit={state.fit} onCheck={onCheck} />
        <ResultEditor image={bufs.warp} fit={state.fit} origFit={state.origFit} onChange={onFit} warn={warn} focus={focusSide} />
        {suggestSecond && (
          <div role="region" aria-label="Second photo suggestion" className="flex flex-col gap-3 rounded-ui-md bg-accent-soft p-3" data-testid={`${face}-second-prompt`}>
            <div>
              <p className="text-sm font-semibold">Take a second photo of the {face} for a steadier reading</p>
              <p className="mt-0.5 text-[13px] text-muted">Lift the card, put it down again and shoot once more. The result becomes the average, and you see how well the photos agree.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onAddShot} data-testid={`${face}-second-take`}>
                Take a second photo
              </Button>
              <Button variant="ghost" onClick={onSkipSecond} data-testid={`${face}-second-skip`}>
                Skip
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {allDone ? (
            <Button variant={suggestSecond ? "secondary" : "primary"} onClick={onResult}>
              See the result
            </Button>
          ) : (
            !otherMeasured && (
              <Button variant="secondary" onClick={onOther}>
                Measure the {other} next
              </Button>
            )
          )}
          <Button variant="secondary" onClick={onToCorners}>
            Adjust corners
          </Button>
          {earlier + 1 < MAX_SHOTS && !suggestSecond && (
            <Button variant="secondary" onClick={onAddShot}>
              Add another photo of the {face}
            </Button>
          )}
        </div>
        <div className="border-t border-line/40 pt-4">
          <ConditionPanel face={face} zones={x.condition.zones} evidence={x.evidence} lightBackground={x.condition.lightBackground} heading={earlier ? "Corners and edges (this photo)" : "Corners and edges"} />
        </div>
        <CaptureButtons face={face} onFile={onFile} retake />
        <p className="text-xs text-muted tabular-nums" data-testid={`${face}-timing`}>
          Found in {(x.ms.detect / 1000).toFixed(1)} s, measured in {(x.ms.measure / 1000).toFixed(1)} s on this device · about {Math.round(x.quality.pxPerMm * 88)} px tall
        </p>
      </Surface>
    );
  }
  return null;
}

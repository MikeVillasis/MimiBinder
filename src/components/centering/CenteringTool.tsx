"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getCard } from "@/lib/api-client";
import type { BorderFit, Face, Quad, RGBAImage, Side } from "@/lib/centering";
import type { CardDetail } from "@/lib/types";
import { CardImage } from "../CardImage";
import { Button, PageHeader } from "../ui";
import { CaptureButtons } from "./CaptureButtons";
import { CornerEditor } from "./CornerEditor";
import { decodePhoto, type Decoded } from "./decode";
import { CenteringEngine } from "./engine";
import { Readout } from "./Readout";
import { ResultEditor, safeCentering } from "./ResultEditor";
import { Summary } from "./Summary";

const MIN_CONFIDENCE = 0.5;

interface FaceState {
  status: "empty" | "working" | "corners" | "measured" | "error";
  busy: string;
  quad: Quad | null;
  detected: Quad | null;
  /** Why we are asking for corners: no detection, low confidence, or fine. */
  note: string | null;
  /** False until the user has moved a corner, when the card was not found: never measure a default rectangle. */
  placed: boolean;
  fit: BorderFit | null;
  origFit: BorderFit | null;
  error: string | null;
}

const EMPTY: FaceState = { status: "empty", busy: "", quad: null, detected: null, note: null, placed: true, fit: null, origFit: null, error: null };

/** Heavy buffers live here (references only): the decoded photo and the warped card. */
interface Buffers {
  decoded: Decoded | null;
  warp: RGBAImage | null;
}

function defaultQuad(w: number, h: number): Quad {
  const ch = Math.min(h * 0.72, (w * 0.8 * 88) / 63);
  const cw = (ch * 63) / 88;
  const x0 = (w - cw) / 2;
  const y0 = (h - ch) / 2;
  return [
    { x: x0, y: y0 },
    { x: x0 + cw, y: y0 },
    { x: x0 + cw, y: y0 + ch },
    { x: x0, y: y0 + ch },
  ];
}

const TIPS = [
  "Take the card out of its sleeve or top loader.",
  "Lay it flat on a plain, contrasting surface.",
  "Shoot straight down from 25 to 40 cm.",
  "Use soft, even light with no glare.",
  "Let the card fill most of the frame.",
];

function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-12 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-accent" aria-hidden="true" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

const noopSubscribe = () => () => {};

function CardHeader() {
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
  if (!id) return null;
  const card = state.id === id ? state.card : undefined;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="w-14 shrink-0">{card ? <CardImage image={card.image} name={card.name} /> : <div className="skeleton aspect-[63/88] w-full rounded-lg" aria-hidden="true" />}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">Checking</div>
        <div className="truncate font-bold">{card ? card.name : state.id === id && state.failed ? id : "Loading card…"}</div>
        <Link href={`/card/${encodeURIComponent(id)}`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
          ← Back to card
        </Link>
      </div>
    </div>
  );
}

export function CenteringTool() {
  const [faces, setFaces] = useState<Record<Face, FaceState>>({ front: EMPTY, back: EMPTY });
  const [bufs, setBufs] = useState<Record<Face, Buffers>>({ front: { decoded: null, warp: null }, back: { decoded: null, warp: null } });
  const [tab, setTab] = useState<Face>("front");
  const [frontSkipped, setFrontSkipped] = useState(false);
  const [focusSide, setFocusSide] = useState<{ face: Face; side: Side; n: number } | null>(null);
  const engine = useRef<CenteringEngine | null>(null);
  const token = useRef<Record<Face, number>>({ front: 0, back: 0 });
  const bitmaps = useRef<Record<Face, ImageBitmap | null>>({ front: null, back: null });

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
    setFaces((f) => ({ ...f, [face]: { ...EMPTY, status: "working", busy: "Reading photo…" } }));
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
      patch(face, {
        status: "corners",
        quad: good ? det.quad : defaultQuad(dec.width, dec.height),
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
      patch(face, { status: "measured", fit: out.fit, origFit: out.fit });
    } catch (e) {
      if (token.current[face] !== t) return;
      patch(face, { status: "error", error: e instanceof Error ? e.message : "Measuring failed." });
    }
  };

  const toCorners = (face: Face) => {
    setBufs((b) => ({ ...b, [face]: { ...b[face], warp: null } }));
    patch(face, { status: bufs[face].decoded ? "corners" : "empty", fit: null, origFit: null });
  };

  const reset = () => {
    token.current.front++;
    token.current.back++;
    (["front", "back"] as Face[]).forEach(dropBuffers);
    setFaces({ front: EMPTY, back: EMPTY });
    setFrontSkipped(false);
    setTab("front");
  };

  const toggleSkip = (on: boolean) => {
    setFrontSkipped(on);
    if (on) {
      token.current.front++;
      dropBuffers("front");
      setFaces((f) => ({ ...f, front: EMPTY }));
    }
  };

  const fresult = useMemo(() => (!frontSkipped && faces.front.status === "measured" && faces.front.fit ? safeCentering(faces.front.fit) : null), [faces.front, frontSkipped]);
  const bresult = useMemo(() => (faces.back.status === "measured" && faces.back.fit ? safeCentering(faces.back.fit) : null), [faces.back]);

  const tabLabel = (face: Face) => {
    if (face === "front" && frontSkipped) return "Skipped";
    const s = faces[face].status;
    return s === "measured" ? "Measured" : s === "empty" ? "" : s === "error" ? "Problem" : "In progress";
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <PageHeader title="Centering check" subtitle="Measure a raw card's front and back from phone photos and see the best PSA grade its centering allows." />
        <p className="-mt-2 flex items-start gap-2 text-sm text-muted">
          <svg viewBox="0 0 24 24" width="16" height="16" className="mt-0.5 shrink-0 text-good" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span>Everything runs on your device. Your photos are never uploaded.</span>
        </p>
      </div>

      <CardHeader />

      <div role="tablist" aria-label="Card face" className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-surface p-1">
        {(["front", "back"] as Face[]).map((face) => (
          <button
            key={face}
            id={`tab-${face}`}
            role="tab"
            type="button"
            aria-selected={tab === face}
            aria-controls="face-panel"
            onClick={() => setTab(face)}
            className={`flex min-h-11 flex-col items-center justify-center rounded-xl px-3 py-1 text-sm font-bold capitalize ${tab === face ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
          >
            {face}
            <span className="text-xs font-medium normal-case opacity-90">{tabLabel(face) || "Not measured"}</span>
          </button>
        ))}
      </div>

      <div id="face-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex flex-col gap-4">
        {tab === "front" && frontSkipped ? (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="font-semibold">Front centering is not measured.</p>
            <p className="mt-1 text-sm text-muted">Full-art cards have no border to measure, so the front will not limit the ceiling.</p>
            <Button className="mt-3" variant="secondary" onClick={() => setTab("back")}>
              Measure the back
            </Button>
          </div>
        ) : (
          <FacePanel
            face={tab}
            state={faces[tab]}
            bufs={bufs[tab]}
            focusSide={focusSide?.face === tab ? focusSide : null}
            otherMeasured={faces[tab === "front" ? "back" : "front"].status === "measured"}
            onFile={(f) => onFile(tab, f)}
            onMeasure={() => measure(tab)}
            onToCorners={() => toCorners(tab)}
            onQuad={(q) => patch(tab, { quad: q, placed: true })}
            onFit={(fit) => patch(tab, { fit })}
            onCheck={(side) => setFocusSide({ face: tab, side, n: Date.now() })}
            onOther={() => setTab(tab === "front" ? "back" : "front")}
          />
        )}
        {tab === "front" && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 text-sm">
            <input type="checkbox" checked={frontSkipped} onChange={(e) => toggleSkip(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
            <span>
              <span className="font-medium">Full-art card (no border to measure)</span>
              <span className="block text-xs text-muted">Skips the front. Front centering is not measured.</span>
            </span>
          </label>
        )}
      </div>

      {(fresult || bresult) && <Summary front={fresult} back={bresult} frontSkipped={frontSkipped} onReset={reset} />}
      {!fresult && !bresult && (faces.front.status !== "empty" || faces.back.status !== "empty" || frontSkipped) && (
        <div>
          <Button variant="ghost" onClick={reset}>
            Start over
          </Button>
        </div>
      )}
    </div>
  );
}

function FacePanel({
  face,
  state,
  bufs,
  focusSide,
  otherMeasured,
  onFile,
  onMeasure,
  onToCorners,
  onQuad,
  onFit,
  onCheck,
  onOther,
}: {
  face: Face;
  state: FaceState;
  bufs: Buffers;
  focusSide: { side: Side; n: number } | null;
  otherMeasured: boolean;
  onFile: (f: File) => void;
  onMeasure: () => void;
  onToCorners: () => void;
  onQuad: (q: Quad) => void;
  onFit: (f: BorderFit) => void;
  onCheck: (s: Side) => void;
  onOther: () => void;
}) {
  const result = useMemo(() => (state.fit ? safeCentering(state.fit) : null), [state.fit]);
  const warn = useMemo(() => (state.fit ? (["left", "right", "top", "bottom"] as Side[]).filter((s) => state.fit!.quality[s] < 0.6) : []), [state.fit]);

  if (state.status === "working") return <Spinner label={state.busy} />;

  if (state.status === "empty" || state.status === "error") {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
        {state.status === "error" && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {state.error} Try another photo.
          </p>
        )}
        <div>
          <h2 className="text-lg font-bold capitalize">{face} photo</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
            {TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <CaptureButtons face={face} onFile={onFile} />
      </div>
    );
  }

  if (state.status === "corners" && state.quad && bufs.decoded) {
    const d = bufs.decoded;
    const rotate = () => onQuad([state.quad![1], state.quad![2], state.quad![3], state.quad![0]]);
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 md:p-4">
        <h2 className="text-lg font-bold">Check the corners</h2>
        {state.note ? (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
            {state.note}
          </p>
        ) : (
          <p className="text-sm text-muted">Drag each round handle onto the card&apos;s outer corner. The green edge should be the top of the card.</p>
        )}
        <CornerEditor bitmap={d.bitmap} width={d.width} height={d.height} quad={state.quad} onChange={onQuad} />
        {!state.placed && (
          <p id={`${face}-place-hint`} className="text-sm font-semibold">
            Move the corners onto the card to continue.
          </p>
        )}
        <p className="text-xs text-muted">Arrow keys nudge a focused corner by 1 pixel (Shift: 10).</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onMeasure} disabled={!state.placed} aria-describedby={state.placed ? undefined : `${face}-place-hint`}>
            Measure
          </Button>
          <Button variant="secondary" onClick={rotate} aria-label="Rotate 90 degrees: change which edge is the top">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />
            </svg>
            Rotate 90°
          </Button>
          {state.detected && (
            <Button variant="ghost" onClick={() => onQuad(state.detected!)}>
              Reset corners
            </Button>
          )}
        </div>
        <CaptureButtons face={face} onFile={onFile} retake />
      </div>
    );
  }

  if (state.status === "measured" && state.fit && state.origFit && bufs.warp) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-3 md:p-4">
        <h2 className="text-lg font-bold capitalize">{face} centering</h2>
        <Readout result={result} fit={state.fit} onCheck={onCheck} />
        <ResultEditor image={bufs.warp} fit={state.fit} origFit={state.origFit} onChange={onFit} warn={warn} focus={focusSide} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onToCorners}>
            Adjust corners
          </Button>
          {!otherMeasured && (
            <Button variant="secondary" onClick={onOther}>
              Measure the {face === "front" ? "back" : "front"} next
            </Button>
          )}
        </div>
        <CaptureButtons face={face} onFile={onFile} retake />
      </div>
    );
  }
  return null;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { detectCard, frameQuality } from "@/lib/centering";
import type { Face, RGBAImage } from "@/lib/centering";
import { useBackToClose } from "../useBackToClose";
import { Button } from "../ui";

interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

/**
 * True where a live preview can end in a full-resolution still: getUserMedia plus ImageCapture.takePhoto()
 * (Chromium, so Android Chrome). iOS Safari has no ImageCapture; there the native camera input is the
 * full-resolution path and this overlay is not offered.
 */
export function liveCaptureSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as { ImageCapture?: unknown }).ImageCapture === "function" && !!navigator.mediaDevices?.getUserMedia;
}

type Hint = { tone: "good" | "warn"; text: string };

const SAMPLE_MS = 280;
const PREVIEW_W = 240;

/**
 * Full-screen camera preview with a card-shaped guide and live hints (hold steady, glare, too dark, move
 * closer), then a full-resolution still. Frames are analysed on this device only. Closes with Back or Escape.
 */
export function LiveCapture({ open, face, onClose, onPhoto, onFallback }: { open: boolean; face: Face; onClose: () => void; onPhoto: (f: File) => void; onFallback: () => void }) {
  useBackToClose(open, onClose);
  if (!open) return null;
  return <Overlay face={face} onClose={onClose} onPhoto={onPhoto} onFallback={onFallback} />;
}

function Overlay({ face, onClose, onPhoto, onFallback }: { face: Face; onClose: () => void; onPhoto: (f: File) => void; onFallback: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<Hint>({ tone: "warn", text: "Starting the camera…" });
  const [sharp, setSharp] = useState(0); // 0..1 of the best seen recently

  // Camera on mount, off on unmount.
  useEffect(() => {
    let live = true;
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then((stream) => {
        if (!live) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          void v.play().catch(() => {});
        }
      })
      .catch((e: unknown) => {
        if (!live) return;
        const name = e instanceof DOMException ? e.name : "";
        setError(name === "NotAllowedError" ? "Camera access was not allowed. You can still use your phone's camera app." : "The camera could not be started. You can still use your phone's camera app.");
      });
    return () => {
      live = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Live hints from small preview frames.
  useEffect(() => {
    if (!ready) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let best = 0, tick = 0, detectOk = true, found: { share: number; skew: number } | null | undefined;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || !ctx || v.videoWidth === 0) return;
      const w = PREVIEW_W, h = Math.max(1, Math.round((PREVIEW_W * v.videoHeight) / v.videoWidth));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.drawImage(v, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h);
      const img: RGBAImage = { width: w, height: h, data: d.data };
      const q = frameQuality(img);
      // Sharpness is only meaningful against the same scene a moment ago: track a slowly fading best.
      best = Math.max(q.sharpness, best * 0.97);
      const rel = best > 0 ? q.sharpness / best : 0;
      setSharp(rel);
      // Every third sample, see whether a card is in view and how much of the frame it fills. Stops if slow.
      if (detectOk && tick++ % 3 === 0) {
        const t0 = performance.now();
        try {
          const det = detectCard(img, { backgroundFilter: false });
          if (det && det.confidence >= 0.5) {
            const p = det.quad;
            const len = (a: number, b: number) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
            const longSide = Math.max(len(0, 1), len(1, 2), len(2, 3), len(3, 0));
            const r = (a: number, b: number) => Math.max(a, b) / Math.max(1e-6, Math.min(a, b)) - 1;
            found = { share: longSide / Math.max(w, h), skew: Math.max(r(len(0, 1), len(2, 3)), r(len(1, 2), len(3, 0))) };
          } else found = null;
        } catch {
          found = undefined;
        }
        if (performance.now() - t0 > 70) { detectOk = false; found = undefined; }
      }
      if (q.brightness < 45) setHint({ tone: "warn", text: "Too dark. Add light." });
      else if (q.glareShare > 0.02) setHint({ tone: "warn", text: "Glare. Tilt the card or move the light." });
      else if (found === null) setHint({ tone: "warn", text: "Fit the whole card inside the frame, on a plain surface." });
      else if (found && found.share < 0.5) setHint({ tone: "warn", text: "Move closer: let the card fill the frame." });
      else if (found && found.skew > 0.16) setHint({ tone: "warn", text: "Hold the phone flat, straight above the card." });
      else if (rel < 0.55) setHint({ tone: "warn", text: "Hold steady…" });
      else setHint({ tone: "good", text: "Looks good. Take the photo." });
    }, SAMPLE_MS);
    return () => window.clearInterval(id);
  }, [ready]);

  const shoot = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    const v = videoRef.current;
    if (!track || !v) return;
    setBusy(true);
    try {
      let blob: Blob | null = null;
      try {
        const Ctor = (window as unknown as { ImageCapture: ImageCaptureCtor }).ImageCapture;
        blob = await new Ctor(track).takePhoto();
      } catch {
        // Full-resolution still failed: fall back to the current video frame (lower resolution).
        const c = document.createElement("canvas");
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext("2d")?.drawImage(v, 0, 0);
        blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.95));
      }
      if (!blob) throw new Error("no photo");
      onPhoto(new File([blob], `${face}.jpg`, { type: blob.type || "image/jpeg" }));
      onClose();
    } catch {
      setError("The photo could not be taken. You can still use your phone's camera app.");
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Guided camera, ${face} of the card`} className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay onLoadedData={() => setReady(true)} className="absolute inset-0 h-full w-full object-contain" aria-hidden="true" />
        {/* Card-shaped guide (63:88), as large as fits with a margin. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6" aria-hidden="true">
          <div className="relative max-h-full max-w-full rounded-[4.8%/3.4%] border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" style={{ aspectRatio: "63 / 88", height: "min(100%, calc((100vw - 3rem) * 88 / 63))" }}>
            <span className="absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded bg-black/60 px-2 py-0.5 text-xs font-semibold">{face === "front" ? "Front" : "Back"} · top of the card here</span>
          </div>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close the camera"
          className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-black/60 outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-3 bg-black px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        {error ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-sm">
              {error}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => { onClose(); onFallback(); }}>Use the camera app</Button>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p role="status" aria-live="polite" className={`text-center text-base font-semibold ${hint.tone === "good" ? "text-emerald-300" : "text-amber-200"}`}>
              {hint.text}
            </p>
            <div className="mx-auto flex w-full max-w-xs items-center gap-2 text-xs text-white/80">
              <span>Sharpness</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20" role="meter" aria-label="Sharpness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, sharp) * 100)}>
                <span className={`block h-full rounded-full ${sharp >= 0.55 ? "bg-emerald-400" : "bg-amber-300"}`} style={{ width: `${Math.round(Math.min(1, sharp) * 100)}%` }} />
              </span>
            </div>
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={shoot}
                disabled={!ready || busy}
                aria-label={`Take the ${face} photo`}
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white outline-none focus-visible:ring-4 focus-visible:ring-white/60 disabled:opacity-40"
              >
                <span className={`block h-14 w-14 rounded-full ${busy ? "bg-white/50" : "bg-white"}`} />
              </button>
            </div>
            <p className="text-center text-xs text-white/70">The photo is taken at full resolution and stays on this device.</p>
          </>
        )}
      </div>
    </div>
  );
}

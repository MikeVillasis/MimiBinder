"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { Face } from "@/lib/centering";
import { Button } from "../ui";
import { LiveCapture, liveCaptureSupported } from "./LiveCapture";

const noopSubscribe = () => () => {};

/**
 * "Guided camera" (live preview with hints, where the browser can take a full-resolution still from it),
 * "Take photo" (the phone's camera app) and "Choose photo" (library/files), the last two backed by hidden
 * file inputs.
 */
export function CaptureButtons({ face, onFile, disabled, retake }: { face: Face; onFile: (f: File) => void; disabled?: boolean; retake?: boolean }) {
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const [liveOpen, setLiveOpen] = useState(false);
  // Feature-detect after mount so the server render and the first client render agree.
  const live = useSyncExternalStore(noopSubscribe, liveCaptureSupported, () => false);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (f) onFile(f);
  };
  const camIcon = (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
  return (
    <div className="flex flex-wrap gap-2">
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={handle} aria-label={`Take ${face} photo`} data-testid={`${face}-camera-input`} />
      <input ref={lib} type="file" accept="image/*" hidden onChange={handle} aria-label={`Choose ${face} photo file`} data-testid={`${face}-file-input`} />
      {live && (
        <Button disabled={disabled} variant={retake ? "secondary" : "primary"} onClick={() => setLiveOpen(true)} data-testid={`${face}-live-button`}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
            <rect x="9" y="7.5" width="6" height="9" rx="1" />
          </svg>
          Guided camera
        </Button>
      )}
      <Button disabled={disabled} variant={retake || live ? "secondary" : "primary"} onClick={() => cam.current?.click()}>
        {camIcon}
        {retake ? "Retake photo" : "Take photo"}
      </Button>
      <Button disabled={disabled} variant="secondary" onClick={() => lib.current?.click()}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <circle cx="9" cy="9" r="1.5" />
          <path d="M20 16l-5-5-8 9" />
        </svg>
        Choose photo
      </Button>
      <LiveCapture open={liveOpen} face={face} onClose={() => setLiveOpen(false)} onPhoto={onFile} onFallback={() => cam.current?.click()} />
    </div>
  );
}

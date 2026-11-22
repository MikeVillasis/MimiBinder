"use client";

import { useRef } from "react";
import type { Face } from "@/lib/centering";
import { Button } from "../ui";

/** "Take photo" (camera) and "Choose photo" (library/files) buttons backed by hidden file inputs. */
export function CaptureButtons({ face, onFile, disabled, retake }: { face: Face; onFile: (f: File) => void; disabled?: boolean; retake?: boolean }) {
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (f) onFile(f);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={handle} aria-label={`Take ${face} photo`} data-testid={`${face}-camera-input`} />
      <input ref={lib} type="file" accept="image/*" hidden onChange={handle} aria-label={`Choose ${face} photo file`} data-testid={`${face}-file-input`} />
      <Button disabled={disabled} variant={retake ? "secondary" : "primary"} onClick={() => cam.current?.click()}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
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
    </div>
  );
}

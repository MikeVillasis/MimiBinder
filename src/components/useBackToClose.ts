"use client";

import { useEffect, useRef } from "react";

/**
 * Makes the browser/phone Back button (Android back gesture included) close an overlay instead of
 * navigating the page underneath it. While `open`, a same-URL history entry is pushed; Back pops it and
 * calls `onClose`. Closing the overlay any other way (button, Esc, backdrop) removes that entry again.
 *
 * Overlays stack (a confirm dialog on top of a sheet): Back only closes the top-most one.
 */
const stack: number[] = [];
let nextId = 1;

export function useBackToClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const id = nextId++;
    let pushed = true;
    stack.push(id);
    // Next.js integrates native pushState into its router; same URL, so nothing re-renders.
    window.history.pushState(null, "", window.location.href);

    const onPop = () => {
      if (!pushed || stack[stack.length - 1] !== id) return;
      pushed = false; // the browser already removed our entry
      stack.splice(stack.indexOf(id), 1);
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      const i = stack.indexOf(id);
      if (i !== -1) stack.splice(i, 1);
      // Closed by the UI (or unmounted): drop our history entry so Back doesn't need two presses.
      if (pushed) {
        pushed = false;
        window.history.back();
      }
    };
  }, [open]);
}

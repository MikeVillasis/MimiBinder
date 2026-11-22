"use client";

import { useEffect, useRef } from "react";

/**
 * Makes the browser/phone Back button (Android back gesture included) close an overlay instead of
 * navigating the page underneath it. While `open`, a same-URL history entry is pushed; Back pops it and
 * calls `onClose`. Closing the overlay any other way (button, Esc, backdrop) removes that entry again.
 *
 * Overlays stack (a confirm dialog on top of a sheet): Back only closes the top-most one. One shared
 * popstate listener owns the stack, and pops we cause ourselves (history.back() after a UI close) are
 * counted and ignored, so cancelling a dialog never closes the sheet beneath it.
 */
interface Entry {
  close: () => void;
  pushed: boolean;
}

const stack: Entry[] = [];
let selfPops = 0;
let listening = false;

function onPop() {
  if (selfPops > 0) {
    selfPops--;
    return;
  }
  const top = stack.pop();
  if (!top) return;
  top.pushed = false; // the browser already removed its entry
  top.close();
}

export function useBackToClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    if (!listening) {
      window.addEventListener("popstate", onPop);
      listening = true;
    }
    const entry: Entry = { close: () => onCloseRef.current(), pushed: true };
    stack.push(entry);
    // Next.js integrates native pushState into its router; same URL, so nothing re-renders.
    window.history.pushState(null, "", window.location.href);

    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      // Closed by the UI (or unmounted): drop our history entry so Back doesn't need two presses.
      if (entry.pushed) {
        entry.pushed = false;
        selfPops++;
        window.history.back();
      }
    };
  }, [open]);
}

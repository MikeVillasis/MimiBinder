"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Counts client-side route changes in this tab so "Back" can use router.back()
// only when the previous page was inside the app (document.referrer doesn't
// change on client navigations).
let visits = 0;

export function useTrackNavigation() {
  const path = usePathname();
  useEffect(() => {
    visits += 1;
  }, [path]);
}

/** True when there is an earlier in-app page to go back to. */
export function hasInAppHistory(): boolean {
  return visits > 1;
}

"use client";

import { useSyncExternalStore } from "react";
import { applyTheme, DEFAULT_THEME, getThemeMeta, readTheme, THEME_EVENT, THEME_STORAGE_KEY, type ThemeMeta } from "./registry";

export * from "./registry";

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) {
      applyTheme(readTheme());
      cb();
    }
  };
  window.addEventListener(THEME_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Current theme meta; renders the default on the server. */
export function useTheme(): ThemeMeta {
  const id = useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
  return getThemeMeta(id);
}


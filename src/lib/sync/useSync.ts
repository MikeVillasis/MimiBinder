"use client";

// Sync status store + auto-sync wiring (on sign-in, debounced on local changes, on focus/online).

import { useEffect, useSyncExternalStore } from "react";
import Dexie, { type ObservabilitySet } from "dexie";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getAuthState, subscribeAuth } from "./auth";
import {
  SYNCED_TABLES,
  readCursors,
  syncNow as runEngineSync,
  syncedDbName,
  type SyncResult,
} from "./engine";

export type SyncStatus =
  | "disabled" // guest mode: Supabase env vars absent
  | "signed-out"
  | "idle"
  | "syncing"
  | "offline"
  | "error";

export interface SyncState {
  status: SyncStatus;
  /** ISO time of the last successful sync for the signed-in user, or null. */
  lastSyncedAt: string | null;
  /** Last error message when status is "error". */
  error: string | null;
}

const CHANGE_DEBOUNCE_MS = 2_000;
const FOCUS_THROTTLE_MS = 15_000;

const SERVER_STATE: SyncState = {
  status: isSupabaseConfigured() ? "signed-out" : "disabled",
  lastSyncedAt: null,
  error: null,
};
let state: SyncState = SERVER_STATE;
const listeners = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  const next = { ...state, ...patch };
  if (
    next.status === state.status &&
    next.lastSyncedAt === state.lastSyncedAt &&
    next.error === state.error
  ) {
    return;
  }
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = () => state;
const getServerState = () => SERVER_STATE;

let lastAttemptAt = 0;

/**
 * Push local changes and pull remote ones now. Updates the shared status. Resolves
 * `{ pushed: 0, pulled: 0 }` in guest mode or when signed out; rejects on network/server errors.
 */
export async function syncNow(): Promise<SyncResult> {
  if (!isSupabaseConfigured()) return { pushed: 0, pulled: 0 };
  const user = getAuthState().user;
  if (!user) {
    setState({ status: "signed-out", lastSyncedAt: null, error: null });
    return { pushed: 0, pulled: 0 };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setState({ status: "offline" });
    return { pushed: 0, pulled: 0 };
  }
  lastAttemptAt = Date.now();
  setState({ status: "syncing", error: null });
  try {
    const result = await runEngineSync();
    setState({ status: "idle", lastSyncedAt: readCursors(user.id).last, error: null });
    return result;
  } catch (err) {
    setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

function backgroundSync() {
  syncNow().catch(() => {
    // status already reflects the error; retried on the next trigger
  });
}

// ---- auto-sync controller (ref-counted across useSync consumers) ----

let refs = 0;
let teardown: (() => void) | null = null;

function startAutoSync(): () => void {
  let currentUserId: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const onAuth = () => {
    const { user, loading } = getAuthState();
    if (loading) return;
    const id = user?.id ?? null;
    if (id === currentUserId) return;
    currentUserId = id;
    if (id) {
      setState({ status: "idle", lastSyncedAt: readCursors(id).last, error: null });
      backgroundSync(); // sign-in (or page load while signed in)
    } else {
      setState({ status: "signed-out", lastSyncedAt: null, error: null });
    }
  };
  const unsubAuth = subscribeAuth(onAuth);
  onAuth();

  const onFocus = () => {
    if (document.visibilityState === "hidden") return;
    if (Date.now() - lastAttemptAt < FOCUS_THROTTLE_MS) return;
    if (currentUserId) backgroundSync();
  };
  const onOnline = () => {
    if (currentUserId) backgroundSync();
  };
  const onOffline = () => {
    if (currentUserId) setState({ status: "offline" });
  };

  const prefix = `idb://${syncedDbName()}/`;
  const onMutated = (parts: ObservabilitySet) => {
    if (!currentUserId) return;
    const relevant = Object.keys(parts).some((key) =>
      SYNCED_TABLES.some((t) => key.startsWith(`${prefix}${t}/`)),
    );
    if (!relevant) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      backgroundSync();
    }, CHANGE_DEBOUNCE_MS);
  };

  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  Dexie.on("storagemutated", onMutated);

  return () => {
    unsubAuth();
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onFocus);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    Dexie.on.storagemutated.unsubscribe(onMutated);
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}

export interface UseSync extends SyncState {
  syncNow: () => Promise<SyncResult>;
}

/**
 * Sync status for the signed-in owner. Mounting it anywhere (e.g. the root layout's client shell)
 * enables auto-sync; multiple consumers share one controller.
 */
export function useSync(): UseSync {
  const s = useSyncExternalStore(subscribe, getState, getServerState);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    refs += 1;
    if (refs === 1) teardown = startAutoSync();
    return () => {
      refs -= 1;
      if (refs === 0 && teardown) {
        teardown();
        teardown = null;
      }
    };
  }, []);
  return { ...s, syncNow };
}

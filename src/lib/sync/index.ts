// Public API of the sync layer (client-only).
export { useAuth, signInWithEmail, verifyEmailCode, signOut } from "./auth";
export type { AuthState, UseAuth } from "./auth";
export { useSync, syncNow } from "./useSync";
export type { SyncState, SyncStatus, UseSync } from "./useSync";
export type { SyncResult } from "./engine";

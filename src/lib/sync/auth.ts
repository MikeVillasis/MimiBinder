"use client";

// Auth state shared by every useAuth() consumer (one Supabase listener per page).

import { useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export interface AuthState {
  user: User | null;
  /** True until the initial session check finishes (always false in guest mode). */
  loading: boolean;
}

const SERVER_STATE: AuthState = { user: null, loading: isSupabaseConfigured() };
let state: AuthState = SERVER_STATE;
const listeners = new Set<() => void>();
let initialised = false;

function setState(next: AuthState) {
  if (next.user === state.user && next.loading === state.loading) return;
  state = next;
  for (const l of listeners) l();
}

function init() {
  if (initialised) return;
  initialised = true;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    setState({ user: null, loading: false });
    return;
  }
  supabase.auth
    .getSession()
    .then(({ data }) => setState({ user: data.session?.user ?? null, loading: false }))
    .catch(() => setState({ user: null, loading: false }));
  supabase.auth.onAuthStateChange((_event, session) => {
    setState({ user: session?.user ?? null, loading: false });
  });
}

export function subscribeAuth(listener: () => void): () => void {
  init();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthState(): AuthState {
  return state;
}

function authRedirectUrl(): string {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent("/settings")}`;
}

/**
 * Email the owner a magic link (and a 6-digit code, if the email template includes `{{ .Token }}`).
 * Never creates users: sign-ups are disabled and the owner account is created manually.
 * Throws on failure.
 */
export async function signInWithEmail(email: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Sync is not configured.");
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false, emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw new Error(error.message);
}

/** Complete sign-in with the 6-digit code from the email (works across devices). Throws on failure. */
export async function verifyEmailCode(email: string, token: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Sync is not configured.");
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "email",
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export interface UseAuth extends AuthState {
  /** False in guest mode (no Supabase env vars). */
  configured: boolean;
  signInWithEmail: (email: string) => Promise<void>;
  verifyEmailCode: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuth {
  const s = useSyncExternalStore(subscribeAuth, getAuthState, () => SERVER_STATE);
  return {
    ...s,
    configured: isSupabaseConfigured(),
    signInWithEmail,
    verifyEmailCode,
    signOut,
  };
}

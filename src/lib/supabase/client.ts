// Browser Supabase client (session stored in cookies by @supabase/ssr so the
// /auth/callback route handler can complete the PKCE magic-link flow).
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

export { isSupabaseConfigured };

let browserClient: SupabaseClient | null = null;

/** Singleton browser client, or null in guest mode / on the server. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured() || typeof window === "undefined") return null;
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return browserClient;
}

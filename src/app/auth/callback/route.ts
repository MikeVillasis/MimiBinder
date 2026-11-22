// Magic-link landing: completes the Supabase PKCE (`?code=`) or token-hash flow, sets the session
// cookies, then redirects inside the app.
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNext(next: string | null): string {
  // Only same-origin relative paths; blocks "//evil.com" and "/\evil.com".
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/settings";
  }
  return next;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const fail = (reason: string) => {
    const to = new URL("/settings", url.origin);
    to.searchParams.set("auth_error", reason);
    return NextResponse.redirect(to);
  };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("Sync is not configured");

  const upstreamError = url.searchParams.get("error_description");
  if (upstreamError) return fail(upstreamError);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail(error.message);
  } else {
    return fail("Missing sign-in code");
  }
  return NextResponse.redirect(new URL(next, url.origin));
}

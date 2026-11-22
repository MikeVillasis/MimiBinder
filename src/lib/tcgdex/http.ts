// Helpers for the /api route handlers (server-only).
import { TcgdexError } from "./client";

/**
 * CDN caching for our API responses. With Cache Components enabled, route segment
 * `revalidate` exports are not available and these handlers render at request time,
 * so we set `Cache-Control` explicitly; Vercel's CDN honours `s-maxage`.
 */
export function cacheHeaders(maxAgeSeconds: number): HeadersInit {
  return {
    "Cache-Control": `public, max-age=300, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 4}`,
  };
}

export function json(data: unknown, maxAgeSeconds: number): Response {
  return Response.json(data, { headers: cacheHeaders(maxAgeSeconds) });
}

export function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Maps thrown errors to `{ error }` responses. */
export function handleError(err: unknown): Response {
  if (err instanceof TcgdexError) {
    return errorResponse(err.status, err.status === 404 ? "Not found" : err.message);
  }
  console.error("[api] unexpected error", err);
  return errorResponse(500, "Internal error");
}

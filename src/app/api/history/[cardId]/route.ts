// Public daily price history for one card (all printings, stamped included), oldest first.
import { cacheLife } from "next/cache";
import { createSupabasePublicClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { readHistoryRows } from "@/lib/sync/snapshots";
import type { PriceSnapshot } from "@/lib/types";

const MAX_ROWS = 2000; // ~1.3 years of 4 variants
const CDN_CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

async function getHistory(cardId: string): Promise<PriceSnapshot[]> {
  "use cache";
  cacheLife("hours");
  const supabase = createSupabasePublicClient();
  if (!supabase) return [];
  // Each snapshot carries `stamp` ("" for regular printings, and for every row before migration 0002).
  // Thrown errors are not cached.
  return (await readHistoryRows(supabase, cardId, MAX_ROWS)).reverse();
}

export async function GET(_request: Request, ctx: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await ctx.params;
  if (!cardId || cardId.length > 100) {
    return Response.json({ error: "Invalid card id" }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ snapshots: [] }, { headers: { "Cache-Control": CDN_CACHE } });
  }
  try {
    const snapshots = await getHistory(cardId);
    return Response.json({ snapshots }, { headers: { "Cache-Control": CDN_CACHE } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "History unavailable";
    return Response.json({ error: message }, { status: 502 });
  }
}

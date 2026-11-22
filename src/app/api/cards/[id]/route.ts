import type { NextRequest } from "next/server";
import { fetchCard, REVALIDATE } from "@/lib/tcgdex";
import { decodeIdParam, handleError, json } from "@/lib/tcgdex/http";

// GET /api/cards/[id] → CardDetail. Japanese ids: /api/cards/ja%3ASV2a-001 (or ja:SV2a-001).
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = decodeIdParam((await ctx.params).id);
  try {
    return json(await fetchCard(id), REVALIDATE.card);
  } catch (err) {
    return handleError(err);
  }
}

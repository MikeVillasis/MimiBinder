import type { NextRequest } from "next/server";
import { fetchCard, REVALIDATE } from "@/lib/tcgdex";
import { handleError, json } from "@/lib/tcgdex/http";

// GET /api/cards/[id] → CardDetail
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return json(await fetchCard(id), REVALIDATE.card);
  } catch (err) {
    return handleError(err);
  }
}

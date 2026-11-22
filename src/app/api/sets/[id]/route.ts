import type { NextRequest } from "next/server";
import { fetchSet, REVALIDATE } from "@/lib/tcgdex";
import { handleError, json } from "@/lib/tcgdex/http";

// GET /api/sets/[id] → SetDetail
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return json(await fetchSet(id), REVALIDATE.catalog);
  } catch (err) {
    return handleError(err);
  }
}

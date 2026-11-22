import type { NextRequest } from "next/server";
import { fetchSet, REVALIDATE } from "@/lib/tcgdex";
import { decodeIdParam, handleError, json } from "@/lib/tcgdex/http";

// GET /api/sets/[id] → SetDetail. Japanese ids: /api/sets/ja%3ASV2a (or ja:SV2a).
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = decodeIdParam((await ctx.params).id);
  try {
    return json(await fetchSet(id), REVALIDATE.catalog);
  } catch (err) {
    return handleError(err);
  }
}

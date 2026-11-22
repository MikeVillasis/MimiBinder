import type { NextRequest } from "next/server";
import { fetchCards, REVALIDATE } from "@/lib/tcgdex";
import { errorResponse, handleError, json } from "@/lib/tcgdex/http";

const MAX_BATCH = 50;

// GET /api/cards/batch?ids=a,b,c → { cards: CardDetail[] } (unknown ids are omitted)
export async function GET(request: NextRequest) {
  const ids = [
    ...new Set(
      (request.nextUrl.searchParams.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length > MAX_BATCH) return errorResponse(400, `At most ${MAX_BATCH} ids per request`);
  if (ids.length === 0) return json({ cards: [] }, REVALIDATE.card);
  try {
    return json({ cards: await fetchCards(ids) }, REVALIDATE.card);
  } catch (err) {
    return handleError(err);
  }
}

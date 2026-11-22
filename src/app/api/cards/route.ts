import type { NextRequest } from "next/server";
import { REVALIDATE, searchCards } from "@/lib/tcgdex";
import { errorResponse, handleError, json } from "@/lib/tcgdex/http";

// GET /api/cards?q=<name>&page=<n> → { cards, page, hasMore }
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const pageParam = request.nextUrl.searchParams.get("page") ?? "1";
  const page = Number(pageParam);
  if (!Number.isInteger(page) || page < 1) return errorResponse(400, "Invalid page");
  if (q.length > 100) return errorResponse(400, "Query too long");
  try {
    return json(await searchCards(q, page), REVALIDATE.search);
  } catch (err) {
    return handleError(err);
  }
}

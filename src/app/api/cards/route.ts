import type { NextRequest } from "next/server";
import { parseLang } from "@/lib/lang";
import { REVALIDATE, searchCards } from "@/lib/tcgdex";
import { errorResponse, handleError, json } from "@/lib/tcgdex/http";

// GET /api/cards?q=<name>&page=<n>&lang=<en|ja> → { cards, page, hasMore }
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const pageParam = request.nextUrl.searchParams.get("page") ?? "1";
  const page = Number(pageParam);
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  if (!Number.isInteger(page) || page < 1) return errorResponse(400, "Invalid page");
  if (q.length > 100) return errorResponse(400, "Query too long");
  try {
    return json(await searchCards(q, page, lang), REVALIDATE.search);
  } catch (err) {
    return handleError(err);
  }
}

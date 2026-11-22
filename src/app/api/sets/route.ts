import { connection, type NextRequest } from "next/server";
import { parseLang } from "@/lib/lang";
import { fetchSets, REVALIDATE } from "@/lib/tcgdex";
import { handleError, json } from "@/lib/tcgdex/http";

// GET /api/sets?lang=<en|ja> → { sets: SetSummary[] } newest first (Japanese ids prefixed "ja:")
export async function GET(request: NextRequest) {
  await connection(); // render per request; caching is via fetch cache + CDN headers
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  try {
    return json({ sets: await fetchSets(lang) }, REVALIDATE.catalog);
  } catch (err) {
    return handleError(err);
  }
}

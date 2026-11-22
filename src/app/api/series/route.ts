import { connection, type NextRequest } from "next/server";
import { parseLang } from "@/lib/lang";
import { fetchSeries, REVALIDATE } from "@/lib/tcgdex";
import { handleError, json } from "@/lib/tcgdex/http";

// GET /api/series?lang=<en|ja> → { series: Serie[] } newest first (Japanese ids prefixed "ja:")
export async function GET(request: NextRequest) {
  await connection();
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  try {
    return json({ series: await fetchSeries(lang) }, REVALIDATE.catalog);
  } catch (err) {
    return handleError(err);
  }
}

import { connection } from "next/server";
import { fetchSets, REVALIDATE } from "@/lib/tcgdex";
import { handleError, json } from "@/lib/tcgdex/http";

// GET /api/sets → { sets: SetSummary[] } newest first
export async function GET() {
  await connection(); // render per request; caching is via fetch cache + CDN headers
  try {
    return json({ sets: await fetchSets() }, REVALIDATE.catalog);
  } catch (err) {
    return handleError(err);
  }
}

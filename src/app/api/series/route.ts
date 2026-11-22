import { connection } from "next/server";
import { fetchSeries, REVALIDATE } from "@/lib/tcgdex";
import { handleError, json } from "@/lib/tcgdex/http";

// GET /api/series → { series: Serie[] } newest first
export async function GET() {
  await connection();
  try {
    return json({ series: await fetchSeries() }, REVALIDATE.catalog);
  } catch (err) {
    return handleError(err);
  }
}

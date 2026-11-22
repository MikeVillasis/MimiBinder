import { connection } from "next/server";
import { fetchFx, REVALIDATE } from "@/lib/tcgdex";
import { json } from "@/lib/tcgdex/http";

// GET /api/fx → FxRate (falls back to a hardcoded recent rate if Bank of Canada is down)
export async function GET() {
  await connection();
  return json(await fetchFx(), REVALIDATE.fx);
}

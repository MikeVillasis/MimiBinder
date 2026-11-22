// Daily price snapshot (Vercel cron, see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { fetchCard, fetchFx } from "@/lib/tcgdex";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  buildFxRow,
  buildSnapshotRows,
  groupTargets,
  mapWithConcurrency,
  utcDate,
  withTimeout,
  type SnapshotRow,
} from "@/lib/sync/snapshots";

export const maxDuration = 300;

const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 15_000;
/** Stop starting new card fetches after this long, leaving time to write results. */
const FETCH_BUDGET_MS = 230_000;
const TARGET_PAGE = 1000;
const UPSERT_CHUNK = 500;

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  // Must run per request; otherwise the guest-mode branch gets prerendered at build time.
  await connection();
  const secret = process.env.CRON_SECRET;
  const supabase = createSupabaseServiceClient();

  if (!supabase) {
    // Guest-mode deployment: nothing to snapshot. 200 so the cron does not report failures.
    return Response.json({ ok: true, message: "Supabase not configured; snapshot skipped." });
  }
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (!authorized(request, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const date = utcDate(new Date(started));

  // 1. Distinct (cardId, variant) across all live entries.
  const targetRows: { card_id: string | null; variant: string | null }[] = [];
  for (let from = 0; ; from += TARGET_PAGE) {
    const { data, error } = await supabase
      .rpc("snapshot_targets")
      .range(from, from + TARGET_PAGE - 1);
    if (error) {
      return Response.json({ error: `Reading targets failed: ${error.message}` }, { status: 500 });
    }
    const page = (data ?? []) as { card_id: string | null; variant: string | null }[];
    targetRows.push(...page);
    if (page.length < TARGET_PAGE) break;
  }
  const targets = groupTargets(targetRows);
  const cardIds = [...targets.keys()];

  // 2. FX in parallel with card fetches (failure is non-fatal).
  const fxPromise = withTimeout(fetchFx(), FETCH_TIMEOUT_MS, "fetchFx").then(
    (fx) => ({ ok: true as const, fx }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  // 3. Card prices with bounded concurrency.
  const { results, skipped } = await mapWithConcurrency(
    cardIds,
    CONCURRENCY,
    async (cardId) => {
      const card = await withTimeout(fetchCard(cardId), FETCH_TIMEOUT_MS, `fetchCard(${cardId})`);
      return buildSnapshotRows(card, targets.get(cardId) ?? [], date, cardId);
    },
    started + FETCH_BUDGET_MS,
  );

  const rows: SnapshotRow[] = [];
  const failures: string[] = [];
  results.forEach((r, i) => {
    if (r?.ok) rows.push(...r.value);
    else if (r && !r.ok) failures.push(cardIds[i]);
  });

  // 4. Upsert snapshots (idempotent per day: re-running overwrites today's rows).
  let upserted = 0;
  const writeErrors: string[] = [];
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const part = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .from("price_snapshots")
      .upsert(part, { onConflict: "card_id,variant,date" });
    if (error) writeErrors.push(error.message);
    else upserted += part.length;
  }

  // 5. FX rate for the same date.
  let fxSaved = false;
  let fxError: string | undefined;
  const fxResult = await fxPromise;
  if (fxResult.ok) {
    const fxRow = buildFxRow(fxResult.fx, date);
    if (fxRow) {
      const { error } = await supabase.from("fx_rates").upsert(fxRow, { onConflict: "date" });
      if (error) fxError = error.message;
      else fxSaved = true;
    } else {
      fxError = "Invalid FX rate";
    }
  } else {
    fxError = fxResult.error instanceof Error ? fxResult.error.message : String(fxResult.error);
  }

  const summary = {
    ok: writeErrors.length === 0,
    date,
    cards: cardIds.length,
    targets: targetRows.length,
    snapshots: upserted,
    failed: failures.length,
    failedCardIds: failures.slice(0, 50),
    skipped,
    fx: fxSaved,
    ...(fxError ? { fxError } : {}),
    ...(writeErrors.length ? { writeErrors } : {}),
    durationMs: Date.now() - started,
  };
  return Response.json(summary, { status: writeErrors.length ? 500 : 200 });
}

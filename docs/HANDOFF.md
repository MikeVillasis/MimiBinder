# Handoff for the next Claude Code session

The original Mac session is being retired, so work continues in the cloud or on Windows.

## First steps
1. Read `README.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`, `docs/research/PSA grade prediction from photos.md` and `docs/proposals/GRADING_V2.md`.
2. Run `npm install`, `npm run typecheck`, `npm test` and `npm run build` to confirm a clean baseline.
3. Tell the owner you're set up and ask which card should inspire the next theme (they'll send an image).

## Project at a glance
MimiBinder is a free, non-commercial, MIT-licensed Pokémon TCG collection and price tracker PWA, live at https://mimi-binder.vercel.app.

- **Stack:** Next.js 16 (App Router, Cache Components on; read `node_modules/next/dist/docs/` before writing Next-specific code), React 19, Tailwind v4, Dexie (local-first IndexedDB), Supabase, Recharts, Vitest.
- **Supabase:** owner-only sync (sign-ups disabled), plus the `price_snapshots` and `fx_rates` tables.
- **Data sources:** TCGdex for card data, prices and images (pokemontcg.io is deprecated). Bank of Canada Valet for CAD conversion.
- **Daily cron:** a Vercel cron at `/api/cron/snapshot`, protected by `CRON_SECRET`, records prices for cards in the owner's synced collection. `sh scripts/run-snapshot.sh` triggers it by hand.
- **Deploys:** Vercel auto-deploys from `main`.

## How the owner wants to work
- Opus, Sonnet and Haiku subagents write the code in parallel, each with clear file ownership.
- The lead reviews their code, builds, and verifies in a real browser at desktop width and 375px before committing.
- Commit and push to `main` only once the change is verified. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Secrets (Supabase anon/service keys, `CRON_SECRET`) live only in Vercel env vars. Never ask the owner to paste them in chat.
- The owner is in Canada (CAD is the default currency), collects English cards only, and wants clear, friendly explanations.

## Open items (priority order)
1. **Owner action: run `supabase/migrations/0002_stamped_printings.sql`** in the Supabase SQL editor (after the deploy that contains it). Until then the daily snapshot records regular printings only; stamped printings (Pokémon Center etc.) get no price history.
   **Then run `supabase/migrations/0003_grading_assessments.sql`** the same way (Supabase dashboard › SQL editor › paste the file › Run; safe to re-run). It adds the `grading_assessments` table so saved grading checks sync. Until it has run, the app syncs entries and binders as before and skips grading checks with a console warning; the first sync after it runs pushes every saved check. Not yet tested against a live Supabase (unit tests with a mocked client only), so after running it: save a check while signed in, then open the app on a second device and confirm it appears there.
2. **Real-phone checks:** shader smoothness and battery (Spatial Rift, Star Requiem); card inspector pinch, twist, two-finger move, native long-press menu suppression and flick friction; and the centering tool on real photos (speed per photo, the guided camera on Android Chrome, the camera-app path on iPhone).
3. **Validate centering on real cards** (research report, phase 1): ~10 cards scanned at 1200 dpi as ground truth, each photographed 5 times; show whole-number ratios only if the worst error stays ≤ ~1 point. Synthetic accuracy today: max 0.22 points (standard), 0.80 (heavy blur/noise), real scans within 0.42; hard scenes 235 of 240 (`CENTERING_BENCH=centering`). Known weak spots: card on a background close to its border colour (silver on white/grey), drop shadows, strong straight lines right next to the card edge.
4. **Grading v2 (branch `claude/grading-upgrades`, see `docs/proposals/GRADING_V2.md`):** phase 2 is built. Corner and edge flags (whitening, chips, worn or dinged tips) with evidence crops, a probable ceiling next to the centering ceiling, retake prompts, several photos per face, full-art suggestion, set notes, a guided camera, and a local grading log where the returned PSA grade is recorded. Needs the owner's review and answers to the open questions in that doc. **The flag thresholds are uncalibrated** (tuned on synthetic wear only: 0 false flags in 152 clean synthetic photos, whitening 0.25 mm deep or more found 94–100% of the time on a dark table, thinner whitening about two times in three). Next: photograph real mint and worn cards and retune. Saved checks now sync when signed in (branch `claude/grading-sync`, migration 0003).
5. **More card-inspired themes:** follow the Spatial Rift (Palkia) and Star Requiem (Giratina) pattern.
6. **Japanese cards follow-ups:** the JP badge sits over the name strip on full-art images; many Japanese cards (all of the newest Mega sets) have no TCGdex image yet.
7. **Fun upgrades (branch `claude/fun-upgrades`, see `docs/proposals/FUN_UPGRADES.md`):** items 1–10 are built (binder pocket pages, holo tilt, "Added!" reveal, set milestones, dealt-in grids, hold ring and coach hint, Home total count-up, "New" badge, card-fan empty states, Settings › Feel). Needs the owner's review and a real-phone check (haptics, swipe paging, reveal smoothness), then answers to the open questions in that doc before items 11–19.

## Testing in the cloud
The "MimiBinder" cloud environment allows `api.tcgdex.net`, `assets.tcgdex.net` and `www.bankofcanada.ca`. Start the production server with `NODE_USE_ENV_PROXY=1 npx next start` so server-side fetches go through the proxy. Run `npm run build` before `npm run typecheck` on a fresh clone (it generates `PageProps`/`LayoutProps`).

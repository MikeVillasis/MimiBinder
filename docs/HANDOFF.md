# Handoff for the next Claude Code session

The original Mac session is being retired, so work continues in the cloud or on Windows.

## First steps
1. Read `README.md`, `docs/ARCHITECTURE.md`, `AGENTS.md` and `docs/research/PSA grade prediction from photos.md`.
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
2. **Real-phone checks:** shader smoothness and battery (Spatial Rift, Star Requiem); card inspector pinch, twist, two-finger move, native long-press menu suppression and flick friction; and the centering tool on real photos.
3. **Validate centering on real cards** (research report, phase 1): ~10 cards scanned at 1200 dpi as ground truth, each photographed 5 times; show whole-number ratios only if the worst error stays ≤ ~1 point. Synthetic accuracy today: max 0.27 points (normal), 0.80 (heavy blur/noise). Known weak spots: card on a background close to its border colour (silver on white/grey), drop shadows, strong straight lines right next to the card edge.
4. **PSA phase 2:** classical corner and edge checks (whitening against the sampled border colour, strongest on the blue back), shown as flags with evidence crops, not subgrades.
5. **More card-inspired themes:** follow the Spatial Rift (Palkia) and Star Requiem (Giratina) pattern.
6. **Japanese cards follow-ups:** the JP badge sits over the name strip on full-art images; many Japanese cards (all of the newest Mega sets) have no TCGdex image yet.

## Testing in the cloud
The "MimiBinder" cloud environment allows `api.tcgdex.net`, `assets.tcgdex.net` and `www.bankofcanada.ca`. Start the production server with `NODE_USE_ENV_PROXY=1 npx next start` so server-side fetches go through the proxy. Run `npm run build` before `npm run typecheck` on a fresh clone (it generates `PageProps`/`LayoutProps`).

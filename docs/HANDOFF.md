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
1. **Real-phone check:** ask the owner how the Spatial Rift and Star Requiem shaders feel (smoothness, battery), and whether the card inspector's pinch, twist and two-finger move work, the hold opens it without the native "save image" menu (iOS and Android), and the flick-spin friction feels right (`CardInspector.tsx`).
2. **PSA grading phase 1:** in-browser centering measurement from phone photos, following the research report's pipeline (worst-point measurement, homography, sub-pixel edges).
3. **More card-inspired themes:** follow the Spatial Rift (Palkia) and Star Requiem (Giratina) pattern: k-means palette, WCAG AA tokens in `globals.css`, registry entry with credit, original WebGL1 shader (≤30fps, DPR ≤1.5).
4. **Japanese cards follow-ups:** the JP badge sits over the name strip on full-art images; consider a smaller badge. Many Japanese cards (all of the newest Mega sets) have no TCGdex image yet.

## Testing in the cloud
The "MimiBinder" cloud environment allows `api.tcgdex.net`, `assets.tcgdex.net` and `www.bankofcanada.ca`. Start the production server with `NODE_USE_ENV_PROXY=1 npx next start` so server-side fetches go through the proxy. Run `npm run build` before `npm run typecheck` on a fresh clone (it generates `PageProps`/`LayoutProps`).

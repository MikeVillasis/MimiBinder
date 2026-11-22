# MimiBinder

A personal Pokemon TCG collection tracker and price monitor. MimiBinder is an installable, mobile-first PWA
(it also works well on desktop) for logging the cards you own, seeing what your collection is worth, and
tracking set completion through binders.

> **Free and non-commercial.** MimiBinder is a free hobby project built for personal use. It has no ads, no
> subscriptions, no paid features, and there is no intention to ever sell it or its data. Anyone is welcome to
> use it: without an account your collection is stored only in your own browser and never sent to us.

## Features

- **Card search** by name, with card art, set info and every printed variant (normal, holo, reverse, first edition).
- **Collection tracking** with quantity, condition, purchase price and notes per entry, filter and sort, and grid or list views.
- **Portfolio dashboard** showing total value, cost basis, gain or loss, card count, top cards and recent additions.
- **Live prices** from TCGPlayer (USD) or Cardmarket (EUR), shown in CAD or USD. Conversion uses the Bank of Canada daily rate.
- **Price history** charts per card, built from daily snapshots.
- **Binders** that group your cards by set, by generation (series), or as custom lists, with owned vs missing cards and completion percentage.
- **Offline-friendly**: cached card data keeps pricing working without a connection.
- **Import / export** of your collection as JSON.
- Dark theme, installable to your home screen.

## Tech stack

- Next.js 16 (App Router, `src/`), React 19, TypeScript (strict)
- Tailwind CSS v4
- Dexie (IndexedDB) for local-first storage
- Supabase (Postgres, auth, row-level security) for optional owner sync and price history
- Recharts for charts, Zod for validation
- Vitest for unit tests
- Hosted on Vercel (Hobby plan), with a daily Vercel Cron job for price snapshots

## Local development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm test           # run the Vitest suite once
npm run typecheck  # TypeScript check without emitting files
npm run lint
npm run build      # production build
```

No environment variables are needed to run locally. To enable owner sign-in and sync, copy
`.env.example` to `.env.local` and fill in the Supabase values (see below).

## Data sources

- **TCGdex** (`https://api.tcgdex.net/v2/en`) provides card data, set and series data, prices and card images.
  The server fetches it through our own `/api/*` routes so responses are cached at the edge. Browsers never call TCGdex directly.
- **Bank of Canada Valet** (`FXUSDCAD`, `FXEURCAD`) provides the exchange rates used to convert prices.
- **pokemontcg.io** was used in earlier versions. It has been deprecated and is no longer used.

## Guest mode vs owner sync

- **Guest mode (default).** With no Supabase variables set, or without signing in, everything is stored in this
  browser's IndexedDB. Your collection never leaves the device. Export a JSON backup from Settings to move it elsewhere.
- **Owner sync.** When the Supabase variables are configured and the owner signs in, entries and binders sync to
  Supabase. Conflicts are resolved last-write-wins on `updatedAt`, and deletions are kept as tombstones so they propagate.
  Sign-ups are disabled in the Supabase dashboard, so only the owner account exists.
- **Price history** is public, non-personal data. A daily cron job records prices for the cards in the owner's collection.

## Environment variables

See `.env.example` for the full list with comments.

| Variable | Used by | Required for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server | owner sync, price history |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser and server | owner sync, price history |
| `SUPABASE_SERVICE_ROLE_KEY` | server only (cron) | price snapshot cron job |
| `CRON_SECRET` | server only (cron) | protecting `/api/cron/snapshot` |

## Deploy

### Supabase setup

1. Create a free project at supabase.com.
2. SQL Editor → paste and run `supabase/migrations/0001_init.sql`.
3. Authentication → Sign In / Providers: keep **Email** on and turn **off** "Allow new users to sign up".
4. Authentication → Users → Add user → Create new user with your email, tick **Auto Confirm User** (the password is never used).
5. Authentication → URL Configuration: Site URL `https://<your-domain>`; Redirect URLs `https://<your-domain>/auth/callback` and `http://localhost:3000/auth/callback`.
6. Optional (sign in on another device with a code): Authentication → Emails → Magic Link template, add `{{ .Token }}`.
7. Project Settings → API: copy the URL, anon key and service-role key for the env vars below.

### Vercel setup

1. Push this folder to a GitHub repository and import it at vercel.com/new (Hobby plan, framework auto-detected).
2. Settings → Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` (generate with `openssl rand -hex 32`).
3. Deploy. `vercel.json` schedules `/api/cron/snapshot` daily around 10:00 UTC (Hobby allows once per day).
4. Test the snapshot by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/snapshot`.

The Hobby plan is for personal, non-commercial use. Supabase pauses free projects after 7 days without activity; the daily cron keeps it awake.

## Disclaimer

MimiBinder is an unofficial fan project and is not affiliated with, endorsed by, or sponsored by Nintendo,
Creatures Inc., GAME FREAK inc., or The Pokemon Company. Pokemon and all related names, characters and
trademarks are trademarks of Nintendo, Creatures Inc. and GAME FREAK inc. Card data and images are provided by
third-party services ([TCGdex](https://tcgdex.dev)) and remain the property of their respective owners.
Prices come from TCGPlayer and Cardmarket via TCGdex, may be delayed or inaccurate, and are informational only,
not financial advice.

## License

The source code is released under the [MIT License](LICENSE). The license covers this project's code only;
it does not grant any rights to Pokemon trademarks, card images or third-party data.

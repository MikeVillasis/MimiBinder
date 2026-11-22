# MimiBinder — architecture contract

Personal Pokemon TCG collection + price tracker. Installable PWA, mobile-first, works on desktop.
Stack: Next.js 16 (App Router, `src/`), React 19, TypeScript strict, Tailwind v4, Dexie (IndexedDB),
Supabase (owner-only sync + price history), Recharts, Zod, Vitest. Hosted on Vercel Hobby.

**Next.js 16 differs from older versions.** Before writing Next-specific code read the relevant guide in
`node_modules/next/dist/docs/` (route handlers, caching, dynamic params are Promises, metadata/manifest, cron).

## Principles
- **Local-first.** IndexedDB (Dexie) is the source of truth for the collection. The app is fully usable
  with no account and no Supabase env vars ("guest mode"). Guest data never leaves the browser.
- **Owner sync.** When Supabase env vars exist and the owner signs in, entries/binders sync to Supabase
  (last-write-wins on `updatedAt`, tombstones via `deletedAt`). Sign-ups are disabled in the Supabase
  dashboard, so only the owner account exists.
- **Card data** comes from TCGdex (`https://api.tcgdex.net/v2/en`), always via our own `/api/*` routes so
  Vercel's CDN caches responses (TCGdex sends `no-store`). Never call TCGdex from client components.
- **Prices**: TCGPlayer USD (default) or Cardmarket EUR, converted to CAD (default) or USD using Bank of
  Canada Valet (`FXUSDCAD`, `FXEURCAD`). Shared domain types live in `src/lib/types.ts` (do not change
  without lead approval).
- **Price history**: a daily Vercel cron snapshots prices for every card in the owner's collection into
  Supabase `price_snapshots`. History is public, non-personal data.
- **Languages**: English and Japanese (`Lang` in `types.ts`). English ids are TCGdex ids as-is; Japanese
  card, set and serie ids carry a `ja:` prefix (`ja:SV2a-001`), so every id-keyed store (entries, card
  cache, price snapshots, sync) works unchanged. Use `src/lib/lang.ts` (`langOf`, `splitId`, `joinId`);
  never parse ids by hand. Japanese cards have Japanese names only: English search goes through
  `src/lib/tcgdex/pokedex-en.ts` (Pokédex name table) and `species.ts`. They have no TCGPlayer data, so
  `effectiveSource()` in `pricing.ts` always prices them from Cardmarket. Many have no image yet.
- **Stamped printings** (Pokémon Center, prerelease, Staff, …) come from TCGdex `variants_detailed` as
  `CardDetail.stamped`; an entry's printing is `variant` + optional `stamp` (labels in `src/lib/stamps.ts`).
  Price snapshots key on (card_id, variant, stamp, date) after migration 0002.
- **Search** splits a query into a name and a card number (`src/lib/search-query.ts`): "Zorua 189", "#189",
  "189/159", "TG05".
- **Centering and grading tool** (`/centering`): a pure-TS engine in `src/lib/centering/` run in a Web Worker;
  photos never leave the device. See "Grading tool" below and `docs/proposals/GRADING_V2.md`.
  It reports ceilings and flags, never a predicted grade; surface is always "not assessed".
- Images: TCGdex asset base URL + `/{quality}.webp` where quality is `low` or `high`.
  Use plain `<img loading="lazy">` (not next/image) to stay inside Vercel Hobby image-optimisation quota.

## Modules and exact public APIs

### Data layer (owner: data agent)
`src/lib/tcgdex/` — server-only TCGdex client + normalisers (raw JSON → types in `types.ts`).
`src/lib/tcgdex/index.ts` exports at least: `fetchCard(id): Promise<CardDetail>`, `searchCards(q, page)`,
`fetchSets()`, `fetchSet(id)`, `fetchSeries()`, `fetchFx(): Promise<FxRate>` (used by API routes and the cron job).
Variant → TCGPlayer key mapping: normal → `normal` | `unlimited`; holo → `holofoil` | `unlimited-holofoil`;
reverse → `reverse-holofoil`; firstEdition → `1st-edition-holofoil` | `1st-edition`.

API routes (all GET, JSON, cached with appropriate revalidate; errors as `{ error: string }` + status):
| Route | Returns |
|---|---|
| `/api/cards?q=<name>&page=<n>` | `{ cards: CardSummary[], page: number, hasMore: boolean }` (24/page) |
| `/api/cards/[id]` | `CardDetail` |
| `/api/cards/batch?ids=a,b,c` | `{ cards: CardDetail[] }` (max 50 ids; used to price the collection) |
| `/api/sets` | `{ sets: SetSummary[] }` newest first |
| `/api/sets/[id]` | `SetDetail` |
| `/api/series` | `{ series: Serie[] }` newest first |
| `/api/fx` | `FxRate` |

`src/lib/api-client.ts` (client-safe):
```ts
searchCards(q: string, page?: number): Promise<{ cards: CardSummary[]; page: number; hasMore: boolean }>
getCard(id: string): Promise<CardDetail>
getCardsBatch(ids: string[]): Promise<CardDetail[]>   // chunks into ≤50 per request
getSets(): Promise<SetSummary[]>
getSet(id: string): Promise<SetDetail>
getSeries(): Promise<Serie[]>
getFx(): Promise<FxRate>
getPriceHistory(cardId: string): Promise<PriceSnapshot[]>  // [] when history unavailable
```

`src/lib/pricing.ts` (pure, unit tested):
```ts
cardImage(image: string | undefined, quality: "low" | "high"): string | undefined
unitPrice(card: CardDetail, variant: Variant, source: PriceSource): { amount: number; currency: "USD" | "EUR" } | null
  // tcgplayer: variant market, fall back to mid; cardmarket: holo block for reverse/holo when present else normal; trend, fall back to avg
convert(amount: number, from: "USD" | "EUR" | "CAD", to: Currency, fx: FxRate): number
formatMoney(amount: number, currency: Currency): string   // Intl, en-CA
```

`src/lib/db/` (client-only Dexie):
```ts
// tables: entries (CollectionEntry, indexes: id, cardId, setId, serieId, updatedAt), binders (Binder),
//         settings (single row key "settings"), cardCache (CardDetail + cachedAt, for offline pricing),
//         assessments (GradingAssessment, indexes: id, cardId, entryId, createdAt, updatedAt; schema v2,
//         local only: never synced)
useEntries(): CollectionEntry[] | undefined          // live, excludes tombstones
useEntry(id: string): CollectionEntry | undefined
useBinders(): Binder[] | undefined
useSettings(): Settings                               // defaults { currency: "CAD", priceSource: "tcgplayer" }
addEntry(input: NewEntryInput): Promise<CollectionEntry>  // NewEntryInput = card fields + variant/condition/qty/purchase
updateEntry(id: string, patch: Partial<CollectionEntry>): Promise<void>  // bumps updatedAt
removeEntry(id: string): Promise<void>                // tombstone
createBinder(name: string, description?: string): Promise<Binder>
updateBinder(id: string, patch: Partial<Binder>): Promise<void>
removeBinder(id: string): Promise<void>               // tombstone + remove id from entries
updateSettings(patch: Partial<Settings>): Promise<void>
exportCollection(): Promise<string>                   // JSON string {version:1, entries, binders, settings, assessments}
importCollection(json: string, mode: "merge" | "replace"): Promise<{ entries: number; binders: number; assessments?: number }>
  // `assessments` is an extra key of the same version-1 file: older backups (without it) still import and
  // leave the local grading log alone; older app versions ignore the key.
// saved grading checks (src/lib/db/assessments.ts):
useAssessments(cardId?: string): GradingAssessment[] | undefined   // newest first
saveAssessment(input: NewAssessment): Promise<GradingAssessment>
updateAssessment(id, patch: { cardName?, entryId?, notes? }): Promise<void>
recordActualGrade(id, actual: ActualGrade | null): Promise<void>   // the grade PSA returned; rejects 9.5
deleteAssessment(id): Promise<void>                                // hard delete (nothing to sync)
accuracySummary(rows): AccuracySummary                             // how the ceilings compared with returned grades
// raw access for the sync engine:
db, getChangedSince(iso: string), applyRemote(entries: CollectionEntry[], binders: Binder[])
```

`src/lib/collection.ts` (pure, unit tested):
```ts
groupBySet(entries): Map<setId, CollectionEntry[]>
groupBySerie(entries): Map<serieId, CollectionEntry[]>
setCompletion(entries, set: SetSummary): { owned: number; total: number; percent: number } // unique localIds ≤ officialCount
collectionValue(entries, cards: Map<cardId, CardDetail>, settings, fx): { value: number; cost: number; gain: number; priced: number; unpriced: number }
```
`src/lib/useCollectionPrices.ts` (client hook): fetches CardDetail for all owned cardIds via `getCardsBatch`,
caches in `cardCache`, falls back to cache offline. Returns `{ cards: Map<string, CardDetail>, fx: FxRate | undefined, loading }`.

### Grading tool (owner: UI agent for `src/components/centering/**`, data agent for the engine)
`src/lib/centering/` (pure TS, no DOM, no dependencies; every step is synchronous and runs in the Worker):
```ts
// phase 1: centering
detectCard(img) -> { quad, confidence } | null;  warpCard(img, quad) -> WarpResult (20 px/mm + 2 mm margin)
measureBorders(warp, face) -> BorderFit;  computeCentering(fit) -> CenteringResult (worst-point ratios)
psaCeiling(front, back, { skipFrontAxis? }) -> PsaCeiling;  psaLabel(grade)
// phase 2: corners and edges as flags (thresholds uncalibrated: CONDITION_THRESHOLDS.calibrated === false)
assessCondition(warp, fit, face) -> ConditionReport   // 8 zones: status, checked, skipped reasons, defects, crop, marks
conditionCeiling(reports) -> ConditionCeiling | null  // rule of thumb from flag counts (ceilingFromCounts)
photoQuality(quad, warp, blurMm) -> PhotoQuality      // retake reasons;  frameQuality(frame) for live preview
combineCentering(results) / combineCondition(reports) // two or three photos of one face
borderProfile(card) / looksFullArt(fit)               // set-aware notes, full-art detection
warpRegion(img, quad, warp, rect, scale)              // sharper evidence crops
```
`src/components/centering/`: `CenteringTool` (state, steps, tabs), `core.ts` + `centering.worker.ts` + `engine.ts`
(Worker with a main-thread fallback), `CornerEditor`, `ResultEditor`, `Readout`, `ConditionPanel` (flags and
evidence), `Summary` (the two ceilings), `model.ts` (per-photo shots, per-face summary, verdict, saved record,
share text; unit tested), `LiveCapture` (guided camera where `ImageCapture` exists), `SaveSheet`, `AssessmentLog`.
Tests: `accuracy*`, `hard-*`, `scans`, `detect`, `mask`, `compute`, `psa` (phase 1); `condition`, `grading`
(phase 2); `bench.test.ts` prints the accuracy, detection-rate and false-positive tables with `CENTERING_BENCH=1`.

### Sync + history layer (owner: sync agent)
- `supabase/migrations/0001_init.sql` — tables `entries`, `binders` (jsonb `data` + `updated_at`, `deleted_at`,
  `user_id` default `auth.uid()`, RLS: owner rows only), `price_snapshots` (public read, service-role write),
  `fx_rates`. 
- `src/lib/supabase/client.ts`, `server.ts` — `@supabase/ssr` clients; `isSupabaseConfigured()`.
- `src/lib/sync/` — `useAuth()` `{ user, signInWithEmail(email) (magic link / OTP), signOut }`,
  `syncNow(): Promise<{ pushed: number; pulled: number }>`, `useSync()` `{ status, lastSyncedAt, syncNow }`
  (auto-sync on sign-in, on change (debounced), on focus).
- `/api/history/[cardId]` → `{ snapshots: PriceSnapshot[] }` (empty when Supabase not configured).
- `/api/cron/snapshot` — protected by `CRON_SECRET` (Vercel sends `Authorization: Bearer <CRON_SECRET>`);
  reads distinct cardIds+variants from all `entries`, fetches TCGdex via `src/lib/tcgdex`, upserts today's
  `price_snapshots` and `fx_rates`. `vercel.json` cron once per day.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.

### UI (owner: UI agent)
Routes: `/` dashboard (total value, gain/loss, card count, top cards, recent adds), `/search`,
`/card/[id]` (big image, variants, prices in chosen currency, history chart, "Add to collection" sheet),
`/collection` (grid/list, filter/sort, edit qty/condition/price), `/binders` (tabs: Sets, Generations, Custom),
`/binders/set/[setId]` (full set grid, owned vs missing greyed, completion %), `/binders/serie/[serieId]`,
`/binders/custom/[id]`, `/settings` (currency CAD/USD, price source, account/sync, export/import).
Mobile: bottom tab bar (Home, Search, Collection, Binders, Settings). Desktop ≥ md: left sidebar.
Dark theme, card-art forward. Components in `src/components/`.

### Shell (owner: shell agent)
`src/app/manifest.ts`, app icons, `.env.example`, `README.md` setup guide (Supabase + Vercel steps).

## File ownership (agents edit only their own files)
- data agent: `src/lib/tcgdex/**`, `src/app/api/{cards,sets,series,fx}/**`, `src/lib/api-client.ts`,
  `src/lib/pricing.ts`, `src/lib/collection.ts`, `src/lib/db/**`, `src/lib/useCollectionPrices.ts`, tests next to them.
- sync agent: `supabase/**`, `src/lib/supabase/**`, `src/lib/sync/**`, `src/app/api/{history,cron}/**`, `vercel.json`.
- UI agent: `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `src/app/globals.css`, `src/components/**`.
- shell agent: `src/app/manifest.ts`, `src/app/icon*`, `src/app/apple-icon*`, `public/**`, `.env.example`, `README.md`.
- lead only: `src/lib/types.ts`, `docs/**`, `package.json`, configs.

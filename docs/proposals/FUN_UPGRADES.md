# Fun upgrades: making MimiBinder feel like a card game

Branch: `claude/fun-upgrades`. Status legend: **Done** = implemented and verified on this branch, **Proposal** = not
built, needs the owner's decision. Items 1–10 are built; 11–19 are proposals only.

The brief: make browsing as fun as possible, borrowing the *feel* of TCG game UIs (Pokémon TCG Pocket and Live,
Hearthstone, Marvel Snap, MTG Arena, physical binders), without touching prices, features, or the free and personal
nature of the app.

## Ground rules this work follows

- **Prices are untouched.** Nothing here edits `src/lib/pricing.ts`, `src/lib/collection.ts`, `effectiveSource`,
  `unitPrice`, `collectionValue`, FX conversion, or the cron and snapshot code. Every number on screen is still produced
  by the same functions and formatted by the same `formatMoney`. The one animated number (the count-up) always ends on
  the exact formatted string and exposes the real value to screen readers from the first frame.
- **Free and personal.** No new dependencies, no new network hosts, no analytics, no accounts, no "pro" anything.
- **Every feature stays.** Changes are additive. The inspector, hold-to-open, Back-to-close, Japanese cards, stamped
  printings, number search, filters, import and export, sync and centering all work as before.
- **Original visuals.** No official card back, logos, sounds or layouts. Effects are CSS gradients and the existing
  MimiBinder card back; card images still come from TCGdex.
- **Motion rules.** Only `transform` and `opacity` animate. Every new animation is switched off under
  `prefers-reduced-motion`, and there is a "Card shine and motion" switch in Settings for people who simply prefer calm.
- **Theme tokens only**, checked in Midnight and Spatial Rift (light), and spot-checked in the two other themes.
  The only literal colours are the white light and the rainbow band of the foil effect, which sit on top of card art
  (not on app chrome) and are the same in every theme, like the card back.

## Where the code lives

| Piece | File |
|-------|------|
| Pure logic (milestones, "New" timing, count-up maths, foil tiers, page chunking) and its tests | `src/lib/fun.ts`, `src/lib/fun.test.ts` |
| Per-device preferences (motion, haptics, set view, hint, shown milestones), all `localStorage` in try/catch | `src/lib/prefs.ts` |
| `HoloCard`, `Sparkles`, `CountUp`, `NewBadge`, `CardFan`, `InspectHint`, `MilestoneBanner`, `useMilestone` | `src/components/fun.tsx` |
| Binder pocket pages | `src/components/BinderPages.tsx` |
| Route fade | `src/app/template.tsx` |
| All animations and the calm-mode overrides | "Fun layer" block in `src/app/globals.css` |
| `Switch`, `EmptyState` `art`, `ProgressBar` `ticks` | `src/components/ui.tsx` |

Nothing under `src/lib/pricing.ts`, `src/lib/collection.ts`, `src/lib/useCollectionPrices.ts`, `src/app/api` or the
database layer was changed. No dependency was added.

## Page-by-page review: what feels flat today

### Shell and navigation
- Routes swap instantly with no sense of movement; a card grid just *appears*.
- Skeletons pulse in place. They read as "loading", not as "cards are being dealt".
- Pressing a card gives a 2% scale and nothing else. The app's best trick (hold to inspect in 3D) has no feedback
  while you hold, so people who don't read the one-line tip on the card page never find it.

### Home
- The hero number is the emotional centre of the app, but it pops in like any other text.
- "Recently added" is a plain strip: nothing marks a card as *new*.
- The first-run empty state is a grey circle with an icon. For a card app, the first screen has no cards on it.

### Search
- Results appear all at once after the skeleton. No rhythm.
- The "Find a card" empty state is helpful but dry.

### Card page
- The big card is a flat image. In every TCG game the card you are looking at reacts to you (tilt, light).
- Adding a card, the most satisfying action in the app, ends with a small green "Added" line.
- "Tip: press and hold any card to inspect it" is the only inspector teaching, and it sits on the one page that also
  has an Inspect button.

### Collection
- Dense and useful, but static: no hover life on desktop, no "new" marker, no feedback on hold.
- Empty state is generic.

### Binders (list), set, generation and custom pages
- A *binder* app with no binder. Sets are an endless grid; nothing pages, nothing feels like sleeves and pockets.
- Completion is a thin bar and a percent. Reaching 50% or 100% of a set is a real collector moment, and the app says
  nothing.
- Custom binder empty state is generic.

### Settings
- Fine and calm. Missing: a place to turn the new effects off, and haptics on or off.

### Centering
- A precise tool; it should stay calm. Only small polish is worth it (see proposals).

## Prioritised changes

Effort: S (under an hour), M (a few hours), L (a day or more). Risk is the risk to existing features and prices.

| # | Change | Inspiration | Effort | Risk | Status |
|---|--------|-------------|--------|------|--------|
| 1 | Binder pages: a 3×3 pocket-page view for sets | Physical binders, Pocket's binder | M | Low | **Done** |
| 2 | Holo tilt and light on cards (hover), stronger by rarity on the card page | Pocket/Snap card tilt, real foil | M | Low | **Done** |
| 3 | "Added!" reveal: card flip, sheen sweep, sparkles, haptic | Pack-opening reveals | S | Low | **Done** |
| 4 | Set completion milestones (25/50/75/100%), one time each | Arena/Hearthstone set mastery | M | Low | **Done** |
| 5 | Cards are dealt in: staggered entrance for grids, shimmer skeletons, soft page fade | Hand draw animations | S | Low | **Done** |
| 6 | Hold-to-inspect feedback ring and a one-time coach hint | Long-press previews in Snap/Arena | S | Low | **Done** |
| 7 | Count-up on the Home total (ends on the exact value) | Reward tallies | S | Low (guarded) | **Done** |
| 8 | "New" badge on cards added in the last 3 days | "NEW" card markers in every TCG client | S | Low | **Done** |
| 9 | Friendlier empty states with a fanned hand of card backs, and warmer copy | Fanned hands | S | Low | **Done** |
| 10 | Settings: "Feel" section (card shine and motion, haptics) | Game options menus | S | Low | **Done** |
| 11 | Shared-element transition from tile to card page (View Transitions) | Snap/Pocket card zoom | M | Medium | Proposal |
| 12 | Optional synthesized sounds (off by default) | Card flick and reveal sounds | M | Low | Proposal |
| 13 | Rarity frames and glow on tiles everywhere | Rarity gems and frames | M | Medium | Proposal |
| 14 | Fanned "hand" for Recently added on Home | Card hands | M | Medium | Proposal |
| 15 | Playful collection summary ("Binder notes") | Season recap screens | M | Low | Proposal |
| 16 | Page-turn animation for binder pages (3D leaf) | Physical binders | M | Medium | Proposal |
| 17 | Gyroscope tilt for holo on phones | Pocket's device-tilt foil | M | Medium | Proposal |
| 18 | Centering tool polish (snap haptics, result stamp) | Grading slabs | S | Low | Proposal |
| 19 | Wishlist "chase card" spotlight | Crafting wishlists | L | Medium | Proposal |

### 1. Binder pages (Done)
- **What:** on a set page, a `Grid | Pages` switch. Pages shows the set as 3×3 pocket pages (two pages side by side
  on desktop, like an open binder). Swipe sideways on a phone, or use the arrow buttons or the keyboard arrow keys.
  Missing cards sit dimmed in their pocket, exactly as the grid dims them. The All/Owned/Missing filter applies to both
  views, and the choice of view is remembered on the device. A label under the pages says where you are
  ("Page 2 of 23", or "Pages 3–4 of 23" on desktop).
- **How it stays smooth:** native CSS scroll-snap does the paging, so the browser's compositor drives it. No gesture
  code, no layout work per frame. Images stay lazy.
- **Safe because:** it renders the same `CardTile` with the same data; no prices are involved on this page. The grid
  view is still the default.

### 2. Holo tilt and light (Done)
- **What:** on devices with a mouse, cards lean a few degrees toward the pointer and a soft light follows it. On the
  card page the big card gets a stronger foil band whose strength depends on the card's rarity text (plain for commons,
  a soft sheen for holo and rare cards, a rainbow band for ultra, illustration, secret and hyper rares). Foil cards
  also get one light sweep when the card page opens, which is the only part phones see.
- **How:** one pointer listener writes two CSS variables in a `requestAnimationFrame`; the tilt is a `transform` and the
  light is an overlay whose `transform`/`opacity` change. Phones (no hover) skip it entirely, so there is no cost on
  low-end devices. Hold-to-inspect, click-to-open and drag behaviour are untouched because the wrapper adds no click or
  pointer-capture logic.
- **Safe because:** purely decorative; overlays are `pointer-events: none` and `aria-hidden`.
- **Glitter (added later):** foil cards also carry fine specks that twinkle with the viewing angle, on thumbnails, the
  card page and the inspector (front face only), with strength from `glitterTier()` (see `docs/DESIGN.md`, Fun layer).
  Pure CSS: a fixed speck mask over a sliding light field. Phones get a scroll-driven shift (compositor-run, nothing at
  rest) and the full effect in the inspector, where it follows the card's live rotation.

### 3. "Added!" reveal (Done)
- **What:** after you add a card, the big card does one quick turn with a sheen sweep and a small burst of sparkles,
  with a short haptic tick on phones that support it. Mid-turn you see the MimiBinder card back (the app's own
  original back, the same one the inspector uses). The existing "Added to your collection" status line stays.
- **Safe because:** it runs after `addEntry` has resolved, it is a class toggled on the image wrapper, and it does not
  change what is saved. Reduced motion: no turn and no sparkles, only the status line.

### 4. Set completion milestones (Done)
- **What:** the first time a set's completion is seen at or above 25, 50, 75 or 100%, the set page shows a one-time
  banner ("Halfway there", "Set complete!") with a small sparkle burst. The progress bar gains quiet tick marks at the
  milestones. Each milestone is celebrated once per set per device (remembered in `localStorage`); dismissible. If you
  jump past several at once (say 20% to 80%), only the highest shows and the lower ones are marked as seen. The banner
  waits until both the set and your collection have loaded, so a half-loaded 0% never counts.
- **Safe because:** the percent comes straight from the existing `setCompletion`; nothing is recomputed. No streaks, no
  timers, no pressure: it only reacts to what you already own.

### 5. Dealt-in grids, shimmer skeletons, page fade (Done)
- **What:** card tiles rise and fade in with a short stagger (first dozen or so, capped so long lists don't wait),
  skeletons get a moving highlight, and each route fades in over 160 ms.
- **Safe because:** CSS only. The page fade is opacity only on purpose: a transform on the page wrapper would break
  `position: fixed` children (the sticky add bar and sheets).

### 6. Hold-to-inspect feedback and coach hint (Done)
- **What:** while you hold a card, an accent ring fades in around it over the 450 ms hold, so the hold visibly "charges".
  The first time you see cards, a small dismissible hint says "Press and hold any card to inspect it in 3D"; it goes
  away for good once dismissed or once the inspector has been opened. It appears on Home, Search results, Collection
  and set pages. The ring starts after 120 ms, so a normal tap never flashes it.
- **Safe because:** the hold timing, slop and click-swallowing logic are unchanged; the ring is a pseudo-element driven
  by a data attribute.

### 7. Count-up on the Home total (Done)
- **What:** the total counts up to its value over about 0.7 s.
- **Price safety:** the animated text is `aria-hidden`; a visually hidden copy holds the real formatted value from the
  first frame. Intermediate frames are formatted by the same `formatMoney`. The last frame renders the exact string
  the page would have shown without the animation, and a timer forces that final string even if animation frames are
  throttled (background tab). Reduced motion or the Settings switch: no animation at all. It counts from the value it
  last showed (0 the first time), so coming back to Home with an unchanged total does not replay it. Unit tests cover
  the end value (exactly the target, never overshooting).

### 8. "New" badge (Done)
- Cards added in the last 3 days carry a small "New" badge on Home and in the Collection grid. The link's accessible
  name says "new" too.

### 9. Empty states and copy (Done)
- First-run Home, empty Collection and empty custom binder show a small fan of MimiBinder card backs (the app's own
  original back) and friendlier wording.

### 10. Settings "Feel" (Done)
- "Card shine and motion" (on by default; also off automatically under reduced motion) and "Haptics" (on by default
  where the device supports vibration). Both are per-device preferences in `localStorage`, like the theme.

### Proposals, not built

- **11. Shared-element transitions.** A tile growing into the card page is the single most "game-like" navigation
  effect. Next 16 supports it through React's `<ViewTransition>` behind `experimental.viewTransition`. It is an
  experimental flag in a production app with Cache Components, so it needs the owner's go-ahead and a real-phone test.
- **12. Sounds.** Short Web Audio blips (card flick, reveal chime, page turn), synthesized in code, **off by default**
  with a toggle in Settings › Feel. No audio files. Skipped for now because off-by-default sound is low value until the
  owner says they want it.
- **13. Rarity frames on tiles.** Search results and set lists don't carry rarity (TCGdex list endpoints omit it), so a
  rarity glow would only show for owned cards whose details are cached. Needs a decision: accept the inconsistency, or
  fetch rarity for lists (more requests to TCGdex).
- **14. Fanned hand on Home.** Recently added as an overlapping fan that spreads on hover or touch. Fun, but it hides
  names and values that the strip shows today; worth a design round first.
- **15. Binder notes.** A light summary ("3 sets started, closest to done: 151", "latest pickup: Pikachu"). No new
  price maths needed, but the wording decides whether it is charming or noise.
- **16. Page-turn leaf animation.** A real 3D page turn for binder pages instead of a slide. Needs care on low-end
  phones.
- **17. Gyroscope foil on phones.** Tilt the phone, the foil moves. Needs a permission prompt on iOS and a battery
  check.
- **18. Centering polish.** A light haptic when a corner handle snaps, and a small "stamp" animation on the PSA ceiling
  summary. Kept out of this branch to leave the measuring tool untouched.
- **19. Chase card.** A wishlist with one spotlighted card on Home. This is a new feature with sync implications, not a
  UI tweak.

## Open questions for the owner

1. Milestones: on the first visit to a set that is already past a milestone, the banner shows once for the highest
   milestone reached. Would you rather it only fire when you cross a milestone *after* this update?
2. Is hover tilt on every tile welcome on desktop, or should it be limited to the card page?
3. Do you want sounds (item 12) at all?
4. May we try the experimental View Transitions flag (item 11)?

## Verification (this branch)

- `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass.
- Playwright, 375×812 with touch and 1366×860, Midnight and Spatial Rift, every route: no page errors, no horizontal
  scroll. Star Requiem and Raging Amethyst spot-checked.
- Prices compared with `main` using the same seeded collection: Home total and the `/card/sv03.5-199` headline are
  identical (values in the pull request / hand-off notes).
- Inspector: opens by hold and by the Inspect button, turns, flips, and Back closes it without leaving the page.

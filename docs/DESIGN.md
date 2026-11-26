# MimiBinder design system

A calm, modern, card-art-first interface. The card art is the colour; the chrome stays quiet.
Think Apple Wallet / Linear / Arc: layered surfaces, few borders, one accent used sparingly.

## Principles
1. **Card art leads.** UI chrome is neutral so the cards carry the colour. No big blocks of accent colour.
2. **One accent, used sparingly.** `--color-accent` marks the single primary action on a screen, the current
   value that matters most (portfolio total), and small focus/selection cues. Selected tabs, nav items and
   segmented controls use a **neutral raised thumb** or an accent **tint** (accent at ~12–16% alpha with
   accent-coloured text/icon), never a solid accent fill.
3. **Surfaces, not boxes.** Group related things on one surface; separate rows with hairline dividers or
   spacing, not a border around every item. Borders are hairlines at low contrast (`--color-line`, often at
   60% alpha). Elevation comes from layered surface colours plus a soft shadow and a 1px inner top highlight.
4. **Typography does the hierarchy.** Big, tight, bold page titles; large tabular numbers for money; labels
   in sentence case, muted, 12–13px, never ALL CAPS except tiny eyebrow labels (letter-spaced, sparingly).
5. **Hide emptiness.** Don't give prime space to "$0.00" and "—". Collapse empty stats into a hint.
6. **Thumb-first on phones.** Primary actions reachable at the bottom (sticky action bar on the card page),
   compact control rows, 44px touch targets, no stacked control bars eating the first screen.
7. **Gentle motion.** 150–200ms ease-out; press = scale(0.98); hover lift on desktop cards; respect
   `prefers-reduced-motion`.

## Tokens (in `src/app/globals.css`, per theme)
Existing: `bg, surface, surface-2, line, fg, muted, accent, accent-fg, brand, good, danger`.
Added by the refresh:
- `--color-surface-3`: the raised layer (selected segment thumb, popovers).
- `--color-accent-soft`: accent tint for selected nav/chips (≈ accent at 14% over surface).
- `--shadow-1` (rest), `--shadow-2` (raised/hover), `--shadow-pop` (sheets, popovers).
- `--hairline`: inner top highlight for surfaces (`inset 0 1px 0 rgb(255 255 255 / .04)` on dark themes,
  white at higher alpha on light themes).
- Radii: `--radius-sm 10px`, `--radius-md 14px`, `--radius-lg 20px`, `--radius-xl 28px`.
Every theme (`default`, `palkia`, `giratina`) defines all of these. Shader themes keep translucent surfaces.

## Primitives (in `src/components/ui.tsx`)
- `Surface` (panel): `bg-surface`, radius-lg, shadow-1 + hairline, optional `padded`, optional `interactive`
  (hover lift + press scale). Replaces ad-hoc `rounded-2xl border border-line bg-surface p-4`.
- `ListGroup` + `ListRow`: an inset grouped list (one Surface, rows divided by hairlines, row = leading
  media, title/subtitle, trailing value/chevron; whole row is the link/button).
- `SectionHeader`: title (text-lg/semibold) + optional trailing action link.
- `Segmented`: neutral track (`surface-2`) with a raised `surface-3` thumb + shadow; selected text `fg`.
  Size `sm` for secondary toggles (e.g. English/Japanese).
- `Chip` / `ChipGroup`: compact filter/toggle chips; selected = accent-soft bg + accent text.
- `Button`: `primary` (accent, used once per screen), `secondary` (surface-2, no border), `ghost`, `danger`;
  sizes sm/md/lg; icon support; pill or radius-md.
- `Stat`: big number + small muted label in sentence case; no box of its own when inside a Surface.
- `PageHeader`: large title (text-3xl/4xl on desktop, text-[28px] on phones), muted subtitle, actions.
- `Badge`: small, quiet (surface-2 bg, muted text); `accent` tone uses accent-soft.
- `EmptyState`: icon in a soft circle, title, body, action. No dashed border.

## Shell
- Phone: translucent blurred top bar (hairline only once content scrolls under it), large page titles in
  content. Bottom tab bar: translucent blur, hairline top, active item = accent icon + label with a small
  accent-soft pill behind the icon (no solid fill).
- Desktop: sidebar on `surface` with hairline right edge; active item = accent-soft tint + accent icon/text.

## Accessibility
WCAG AA text contrast in every theme (check muted text on surface and surface-2), visible focus rings
(accent, 2px offset), labels ≥12px, `prefers-reduced-motion` respected.

## Fun layer (see `docs/proposals/FUN_UPGRADES.md`)
Decorative motion borrowed from card-game UIs, kept quiet and optional:
- Classes in the "Fun layer" block of `globals.css`: `.deal` (staggered tile entrance, index via `--deal-i`),
  `.page-fade`, `.holo` (mouse tilt and light), `.reveal-*`, `.sparkles`, `.pop-in`, `.card-fan`, `.binder-pocket`,
  and the `[data-holding]` hold ring.
- Rules: transform and opacity only; no `forwards` fill on wrappers (it would trap `position: fixed` children);
  everything is off under `prefers-reduced-motion` and under `html[data-motion="off"]` (Settings › Feel).
- Primitives: `Switch`, `EmptyState` `art` (e.g. `<CardFan />`), `ProgressBar` `ticks` in `ui.tsx`; `HoloCard`,
  `CountUp`, `NewBadge`, `InspectHint`, `MilestoneBanner`, `Sparkles` in `fun.tsx`.
- Glitter: `glitterTier()` in `src/lib/fun.ts` picks `none` (commons, uncommons, plain rares, promos), `light`
  (holo rares, an owned holo copy), `reverse` (an owned reverse holo: specks on the frame, not the art window) or
  `prismatic` (ultra / illustration / special illustration / hyper / secret rares, Japanese SAR SR AR HR UR CHR CSR
  SSR, or a number past the set's official count). Owned copies add their printing; set grids only know the number.
  Pass it to `HoloCard`, `CardTile`, `CardImage` and `openCardInspector` (`glitter`). Pure CSS ("Glitter" block in
  `globals.css`): fixed speck masks over a light field that slides with `--gx`/`--gy` (mouse on tiles, live
  rotation in the inspector, a scroll-driven `view()` shift on touch screens). Never on the card back. Calm mode
  keeps the specks, still.
- Any number that animates must render the exact formatted value at rest and expose it to screen readers from the
  first frame (`CountUp` does both).


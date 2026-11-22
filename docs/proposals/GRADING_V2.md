# Grading v2: corner and edge flags, capture quality, saved checks

Branch `claude/grading-upgrades`. This is phase 2 of `docs/research/PSA grade prediction from photos.md`, plus the
parts of capture, accuracy and logging that make the centering tool more trustworthy. Phase 3 (an LLM explanation)
is deliberately not built: it is not free and not on-device.

The tool still never predicts a grade. It reports two ceilings and says which is which:

- **Centering ceiling**: from PSA's published centering limits. A hard limit, measured as before.
- **Probable ceiling**: the centering ceiling lowered by corner and edge flags. A rule of thumb with uncalibrated
  thresholds, shown with the evidence photos so the owner can judge.
- **Surface** (scratches, print lines, dents, creases) is always "not assessed".

Everything runs in the browser. No photo, crop or result leaves the device; nothing new is fetched from the network.

## What was built

### Engine (`src/lib/centering/`, pure TypeScript, Worker-safe, no new dependencies)

| File | What it does |
|---|---|
| `condition.ts` | `assessCondition(warp, fit, face)`: flags per zone (4 corners, 4 edges) for **whitening**, **edge chips** and **worn or dinged corner tips**, each with a size, an evidence crop and marks. `conditionCeiling` turns flag counts into a grade cap. |
| `quality.ts` | `photoQuality`: retake reasons (blurry, glare, low resolution, tilted, dark). `frameQuality`: sharpness and glare of a live preview frame. |
| `combine.ts` | `combineCentering` / `combineCondition`: average two or three photos of a face and report how far they disagree. |
| `era.ts` | `borderProfile`: sets that are off-centre by design (e-Card left strip, EX Dragon bottom border), silver-border eras, a full-art hint from the rarity. `looksFullArt`: no printed frame found on three or more sides. |
| `psa.ts` | `psaCeiling(front, back, { skipFrontAxis })` and `psaLabel`. |
| `warp.ts` | `warpRegion`: evidence crops re-sampled from the photo at up to 2.5x the canvas resolution. |
| `testing/defects.ts`, `testing/conditionEval.ts` | Synthetic wear (whitened corners and edges, chips, rounded and dinged corners), full-art and holo fronts, a mottled blue back, glare; the detection-rate and false-positive harness. |

How the corner and edge check works: the outline (four fitted cut lines joined by 3 mm arcs) is unrolled into a
strip, one column per 0.1 mm of perimeter and one row per 0.05 mm from 1.3 mm outside the cut to 2 mm inside it, in
CIELAB. Each column is compared with the card's own colours:

- **Whitening**: pixels in a thin band inside the cut that moved from the border colour toward paper white by more
  than the border itself ever does (its local spread, its own light blotches, and what the band typically shows
  around the whole card), and that end inside the band.
- **Missing material**: where the table shows through inside the outline. On edges it is the residual from a
  straight line re-fitted to the cut, and it must have intact cut on both sides. On corners it is the residual from
  the 3 mm arc, minus what all four corners share (so a slightly different factory radius is not a defect).
- **Masks instead of flags**: glare (saturated pixels 0.8 mm or more inside the cut, grown by 3 mm), blur (width of
  the cut-edge step), borders too close to paper white (silver), no printed border (full art), a cut that cannot be
  told from the table. Each is reported as "not checked", with the reason.

### Interface (`src/components/centering/`)

- **Per photo**: retake prompts; a zone diagram; flagged zones with an evidence thumbnail that opens zoomed (with the
  flagged spot marked); corner close-ups for all four corners; what was not checked and why; time taken.
- **Result**: probable ceiling, then centering, corners and edges, and surface stated separately; consistency of
  several photos; set notes; the PSA limits table as before; share or copy a plain-text summary.
- **Several photos per face** (up to three): "Add another photo" keeps the result and averages the next one in. A flag
  counts when at least half of the photos show it; a flag seen in fewer is listed as not counted.
- **Full art**: when no printed border is found on the front, a prompt offers to skip the front; the card's rarity
  adds a hint next to the existing toggle.
- **Set notes**: for e-Card sets and EX Dragon the front axis that is off-centre by design is shown but left out of
  the ceiling.
- **Guided camera** (`LiveCapture.tsx`): live preview with a card-shaped guide and hints (hold steady, glare, too
  dark, move closer, hold the phone flat), then `ImageCapture.takePhoto()` for a full-resolution still. Offered only
  where `ImageCapture` exists (Chromium, so Android Chrome). On iOS the camera-app input stays the full-resolution
  path, and the same quality checks run after the photo.
- **Saving** (`SaveSheet.tsx`, `AssessmentLog.tsx`): save a check with ratios, flags, ceilings, optional small photos
  and notes, linked to the card and optionally to an owned copy. The grading log lists saved checks; "Record PSA
  grade" stores what came back (whole grades 1–10, half grades 1.5–8.5, no 9.5, optional qualifier, date, cert
  number). A summary shows how often the ceilings held.
- A step line (Front, Back, Result) with a "Next:" sentence. Every overlay closes with the phone's Back button.

### Storage (`src/lib/db/`)

- Dexie schema **version 2** adds one table, `assessments` (`id, cardId, entryId, createdAt, updatedAt`). No existing
  table changes, so a version 1 database opens with its rows intact (tested).
- The JSON backup stays `version: 1` and gains an `assessments` key. Older app versions ignore it; an older backup
  without it still imports and leaves the local log alone (tested, also in the browser).
- **Not synced.** `src/lib/sync/**` is untouched. Assessments hold photos and condition notes; keeping them local is
  the safe default (see open questions).

## Measured results

All numbers are from synthetic photos (and three real TCGdex scans re-photographed synthetically). They show the
code does what it is meant to do. They are **not** a validation on real worn cards.

### Centering accuracy: unchanged

`CENTERING_BENCH=centering npx vitest run src/lib/centering/bench.test.ts`, before and after this branch
(the output is identical line for line):

| Set | Photos | Mean error | Max error |
|---|---|---|---|
| Standard blur and noise (1200x1600) | 18 | 0.065 | 0.220 |
| Heavy blur and noise (1500x2000) | 18 | 0.160 | 0.799 |
| Real scans (1200x1600) | 12 | 0.088 | 0.417 |
| Hard scenes | 240 | 235 pass (cloth 22/24, silver on white 21/24, others 24/24) | |

Errors are in ratio points at the worst point. In the browser the sample photos in the README read within 0.21
points of their true values on phone and desktop.

### Detection of planted wear

`CENTERING_BENCH=condition`, 16 photos per row (1500x2000, random pose, standard blur and noise).
"Flagged" means the zone with the planted defect was flagged.

| Planted defect | Dark plain table | Light table (white, grey, beige) |
|---|---|---|
| Corner whitening 0.15 mm deep | 63% | 0% |
| Corner whitening 0.3 mm deep | 100% | 19% |
| Corner whitening 0.6 mm deep | 100% | 100% (mostly read as a worn tip) |
| Edge whitening 3 mm long, 0.15 mm deep | 63% | 0% |
| Edge whitening 10 mm long, 0.25 mm deep | 94% | 13% |
| Edge chip 0.28 mm deep | 100% | 88% |
| Edge chip 0.5 mm deep | 100% | 88% |
| Edge chip 0.85 mm deep | 100% | 81% |
| Rounded corner, 0.41 mm lost | 100% | 88% |
| Rounded corner, 0.83 mm lost | 100% | 88% |
| Corner ding 0.4 mm | 100% | 88% |
| Corner ding 0.8 mm | 100% | 88% |

Whitening rows use blue and yellow borders. Shape rows use all four card kinds; on a light table the misses are
silver cards whose cut cannot be told from the table, reported as "not checked", not as clear. With heavy blur and
noise on a dark table, 0.6 mm corner whitening and 0.85 mm chips were still flagged 16 of 16 times. On a silver
border, 0.6 mm corner whitening was reported "not checked" 8 of 8 times (by design). No photo in these rows had a
flag on a zone that should have been clean.

### False positives on clean cards

| Clean cards | Photos | Photos with a false flag | Zones flagged | Zones not checked |
|---|---|---|---|---|
| Dark plain table | 32 | 0 | 0 of 256 | 3 |
| Light table | 16 | 0 | 0 of 128 | 19 |
| Busy table (planks, plaid) | 16 | 0 | 0 of 128 | 7 |
| Hard scenes (shadow, clutter, table edge, second object, card at the photo edge) | 24 | 0 | 0 of 192 | 0 |
| Heavy blur and noise | 16 | 0 | 0 of 128 | 0 |
| Low resolution (900x1200) | 16 | 0 | 0 of 128 | 0 |
| Glare over a corner or an edge | 16 | 0 | 0 of 128 | 24 |
| Full art, plain | 8 | 0 | 0 of 64 | 64 (all) |
| Full art, holo glitter | 8 | 0 | 0 of 64 | 64 (all) |
| **Total** | **152** | **0** | **0 of 1216** | |

Zero in 152 photos means the false-flag rate per photo is probably under about 2%, not that it is zero. During
tuning, false flags did appear (a blotch of the mottled back near the cut, a glare halo, stripes of a tablecloth,
a card whose corners were detected in the wrong place); each led to a rule that now masks the case, and each case
is in the benchmark.

The three real scans (yellow Crown Zenith, two silver Scarlet & Violet), photographed clean: no flags; on the yellow
card all eight zones were checked, including the bottom border with its small print.

### Runtime

A 3000x4000 photo, Node 22 on the build machine (one core), median of four runs:

| Step | Time |
|---|---|
| Find the card (downscale + detect) | 340–425 ms |
| Warp to 20 px/mm | 110–115 ms |
| Border lines (centering) | 30–55 ms |
| **Corner and edge check (new)** | **105–130 ms** |
| **Photo quality and 4–6 evidence crops (new)** | **12–21 ms** |

In headless Chromium on the same machine the tool reports 0.4–0.9 s to find the card and 0.3–0.5 s to measure, all
in the Worker. The new steps add about a quarter to the total. A mid-range phone is typically three to five times
slower, so expect roughly 3 to 6 seconds per photo; this needs checking on a real phone.

## Thresholds and their calibration status

**Every threshold below is uncalibrated.** They were chosen on synthetic defects to keep false flags rare, not fitted
to cards with known grades. They live in `CONDITION_THRESHOLDS` (`condition.ts`, `calibrated: false`) and
`QUALITY_LIMITS` (`quality.ts`). The interface says so next to the flags, in the evidence sheet and in the notes.

| Threshold | Minor | Moderate | Heavy |
|---|---|---|---|
| Corner whitening, area | 0.06 mm² | 0.8 mm² | 4 mm² |
| Edge whitening, length | 1.0 mm | 5 mm | 20 mm |
| Edge chip, depth | 0.15 mm (more when blurred) | 0.4 mm | 0.9 mm |
| Corner tip inside the factory arc | 0.3 mm (more when blurred) | 0.6 mm | 1.0 mm |

Other constants: a spot shorter than 0.3 mm along the outline is noise; whitening must move at least 12 ΔE and 28%
of the way to white; a border counts as plain when its spread is under 8 ΔE; corners and edges are not checked when
the edge blur exceeds 0.2 mm or when more than 10% of a zone is under glare; chips adding up to more than 6 mm on one
edge are treated as a misread cut. Retake prompts: under 9 px/mm (a card under about 790 px tall), blur over
0.2 mm, glare over 1.2% of the card, opposite sides differing by more than 16%, mean brightness under 45.

**Flags to probable ceiling** (`ceilingFromCounts`), read off PSA's written grade descriptions ("one minor flaw" at
9, "slightest fraying at one or two corners" at 8, and so on). It is a rule of thumb, not a model:

| Flagged zones | Cap |
|---|---|
| 1 minor | 9 |
| 2 minor | 8 |
| 3 or more minor | 7 |
| 1 or 2 moderate | 6 |
| 3 or more moderate, or 1 heavy | 5 |
| 2 or more heavy | 4 |

The cap is always a whole grade; the code never produces 9.5.

## Known limits

- **No real worn cards were available.** The whitening model (paper-white pixels at the cut) and the mottled back
  are synthetic guesses at what real wear and real card backs look like. Expect to retune on real photos.
- **Light tables hide thin whitening.** A blurred cut against a white table looks the same as a thin white line.
  The tips now ask for a dark, plain surface, and the panel says when the table is lighter than the border.
- **Silver and other pale borders**: whitening is not checked on the front of Scarlet & Violet and Japanese cards.
  Chips and dinged corners still are. The blue back is where whitening shows.
- **Full-art fronts are not checked at all.** Chips and dings show on the back photo, which has the blue border.
- **Light wear is missed.** Whitening 0.15 mm deep is found about two times in three, in good conditions.
  "Nothing flagged" never means mint.
- **Flags come from the automatic fit.** Dragging a border line updates the centering but not the flags.
- **Card detection errors carry over.** If the corners are wrong, the flags are wrong or missing; the corner step is
  still where the user checks that.
- The guided camera's hints are relative (sharpness against the best recent frame) and have only been run against
  Chromium's fake camera.

## Dropped or left for later

- **Phase 3 (LLM explanation)**: out of scope (not free, not on-device).
- **Better silver-on-white detection**: not attempted; the 3 failing `whiteSilver` seeds and 2 `cloth` seeds remain.
- **Shareable summary image**: a text summary is built; an image is not.
- **Syncing assessments** to Supabase: left out on purpose.
- **Phase 4 (learned model)**: needs the owner's own graded cards; the log now collects them.
- **Raking-light surface capture**: not started.
- **Re-running the flags after the user moves a line**, and flags on user-chosen regions.

## Open questions for the owner

1. **Real cards**: can you photograph a few cards you consider mint and a few visibly worn ones (back, on a dark
   surface)? That is the fastest way to find out whether the whitening thresholds are in the right place.
2. **Probable ceiling wording**: is "Probable ceiling: PSA 8" the right tone, or would you rather see only the
   centering ceiling as a number and the flags as a list without a number?
3. **Sync**: should saved checks sync to your Supabase account? They include small photos; today they stay on the
   device and in the backup file.
4. **Guided camera on your phone**: does the preview feel useful, or is the camera app plus the retake prompts
   enough? (On an iPhone only the latter exists.)
5. **Several photos**: is three the right maximum, and should a second photo be suggested by default?

## Reproducing the numbers

```
npm test                                                             # 292 tests (the 3 benchmarks are skipped), about 70 s
CENTERING_BENCH=centering npx vitest run src/lib/centering/bench.test.ts   # centering table, about 6 min
CENTERING_BENCH=condition npx vitest run src/lib/centering/bench.test.ts   # corner and edge tables, about 12 min
CENTERING_SAMPLES_OUT=/some/dir npx vitest run src/lib/centering/bench.test.ts   # synthetic defect photos (PNG)
```

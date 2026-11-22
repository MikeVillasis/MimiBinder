# Existing Tools for Predicting / Assisting Trading Card Grading (Pokemon / PSA) from Images — as of Nov 2026

Source-quality warning that applies to the whole file: almost all "comparison" and "accuracy" content in this space is published by vendors of competing pre-grade apps (SnapGradeAI, PreGradeCards, CardGrade.io, CardMintAI, Cards AI). Several contradict each other and sometimes themselves. No Reddit thread with a measured batch of app predictions vs PSA returns was located (Reddit isn't indexed well by the search tool used). Treat every accuracy number below as an unverified vendor claim unless stated otherwise.

## Commercial tools: which exist as of late 2026, what they claim, what users report

### Takeaway
The market has split into (a) grading companies that use machine vision internally (TAG, AGS, and PSA/Collectors "human-led, tech-assisted"), (b) a crowded field of consumer AI pre-grade apps/web tools (SnapGradeAI, PreGradeCards, CardGrade.io, TCGrader, CardSense, CardMintAI, MasterGrade, Evo, OneGrade, etc.) charging roughly $0.10–$2 per grade, and (c) scanner/price apps (Ludex, Collectr, TCGplayer, CollX) that do NOT predict grades. PSA itself offers no consumer pre-grade tool.

### Cited Findings

**Grading companies with machine vision**
- PSA acquired Genamint, Inc. (machine-vision software for "real-time card diagnostics, measurements and card fingerprinting") in April 2021; founder Kevin Lenane joined PSA as VP of Product Management and the team was integrated to "increase throughput, accuracy and tracking of provenance" — [PrivSource deal record](https://www.privsource.com/acquisitions/deal/professional-sports-authenticator-psa-acquires-genamint-ane_vXS2qp)
- No public source found describing a standalone Genamint product today; it appears absorbed into PSA operations (see Gaps).
- Collectors (PSA parent) acquired SGC in Feb 2024 and Beckett on Dec 15, 2025. Its president (Jan 2026) said "We have been investing in the use of tech and AI in all aspects of the operations process including grading… We still are committed to a human-led, technology-assisted grading process," and that robotics let 1–2 people do tasks that took 5–6 — [Yahoo Sports, Jan 14 2026](https://sports.yahoo.com/articles/psa-president-lays-plans-beckett-153000312.html)
- PSA does not currently offer an AI pre-grading prediction tool — [SnapGradeAI blog](https://www.snapgradeai.com/blog/ai-pokemon-card-grading-vs-psa); [SnapGradeAI Reddit FAQ](https://www.snapgradeai.com/blog/pokemon-card-pre-grading-reddit-faq)
- PSA Value tiers paused June 2026 (Value Bulk $24.99 listed as paused) — [CardTracker AU](https://cardtracker.au/insights/guides/ai-pokemon-card-grading-apps). Vendor blogs also report Beckett pausing Base/Standard tiers Aug 5, 2026 with reopening ~Sept 15 (unverified against official Beckett notice) — [PreGradeCards](https://pregradecards.com/blog/beckett-pauses-grading-august-2026-budget-tiers-closed)
- CGC: only a vendor-blog quote of exec Matthew Spiegel ("robotics built throughout the entire operation," "looking at opportunities to deploy AI to speed up the process") — characterized as AI for intake/imaging/sorting, not replacing graders. No official CGC AI-grading launch found — [PreGradeCards](https://pregradecards.com/blog/cgc-stays-open-while-competitors-pause-2026)
- Beckett's May 2026 relaunch was about anti-counterfeit slab features (holographics, microprinting, UV, QR verification), not AI grading — [Sports Collectors Digest](https://sportscollectorsdigest.com/beckett-brings-back-heritage-logo-launches-new-card-grading-label)
- TAG Grading: "multi-patented technological grading system," 1,000-point score converting to 1–10 grade, Digital Imaging & Grading (DIG) report with high-res images of each identified defect and scoring breakdown; claims "10+ years of development," resubmission detection for accurate pop counts; no published accuracy/consistency data — [TAG: Tech vs Manual](https://taggrading.com/pages/tagvsother)
- TAG combines ML/CV with human verification; uses Photometric Stereoscopic Imaging surfaced in its "Card Vision" viewer — [Phantom Display guide, Jul 2026](https://phantomdisplay.com/blogs/blog/tag-card-grading-the-new-grader-explained)
- TAG pricing conflicting across sources: ~$18/card, $12–15/card, Value tier $20/card; Value/Regular tiers reported paused while Express reopened — [Phantom Display](https://phantomdisplay.com/blogs/blog/tag-card-grading-the-new-grader-explained); [cardgrade.io](https://cardgrade.io/tag-card-grading-cost); [PreGradeCards](https://pregradecards.com/blog/tag-grading-new-era-express-reopens-2026). TAG added Pokemon/TCGs with "TAG X" — [TAG blog](https://taggrading.com/blogs/news/introducing-tag-x-14-grading-and-pokemon-tcgs)
- Market reception: TAG slabs resell below PSA; PSA has deeper liquidity/pop data; for modern Pokemon, the TAG 10 vs 9.5 premium is "often steeper" than PSA 10 vs 9.5 — [Eyevo TCG](https://eyevotcg.com/blog/tag-pokemon-card-value-guide-2026)
- AGS (Automated Grading Systems, "RoboGrading"): described in 2026 vendor roundups as an active fully automated AI grader, ~$15/card in bulk, publishes its formula (60% front / 40% back, capped at lowest subgrade + 1); slabs resell below PSA; has a mobile pre-grade scan app (one source cites $1–$3 per digital scan) — [cardgrade.io roundup](https://cardgrade.io/best-ai-card-grading-apps); [PreGradeCards AI grading](https://pregradecards.com/ai-grading). Wikipedia page for AGS returned 404 when fetched; could not verify status from a primary source.

**Consumer AI pre-grade apps (all self-reported)**
- SnapGradeAI (web): PSA 1–10 scale only, subgrades for centering/corners/edges/surface, names limiting axis, high/mid/low confidence; credit packs $2 for 1 to $50 for 50, no subscription, 1 free credit (per-axis breakdown requires purchase); auto-refund if photos can't assess ≥2 of 4 axes — [SnapGradeAI best apps 2026 (prices checked Nov 6 2026)](https://www.snapgradeai.com/blog/best-ai-pokemon-card-grading-apps-2026). Another source cites ~$1.20/card and refund when confidence <70% — [CardTracker AU](https://cardtracker.au/insights/guides/ai-pokemon-card-grading-apps)
- SnapGradeAI accuracy CONTRADICTION: multiple pages claim 412 cards logged pre-submission then compared to PSA returns: 87% within ±0.5, 96% within ±1.0; Pokemon subset of 218 at 89%; vintage (pre-2003) 79% within ±0.5 — [SnapGradeAI Pokemon page](https://www.snapgradeai.com/pokemon-card-grading); [CardTracker AU](https://cardtracker.au/insights/guides/ai-pokemon-card-grading-apps). But SnapGrade's own Nov 2026 roundup says it publishes no accuracy figure and is "collecting real grades before publishing any figure" — [SnapGradeAI best apps 2026](https://www.snapgradeai.com/blog/best-ai-pokemon-card-grading-apps-2026)
- PreGradeCards (web): claims 10,000-card matched benchmark (June 2026): 89% within 1 grade, 68.4% exact, 99.2% "centering accuracy," 82% on binary "PSA 10 or not"; ~$0.10–$0.40/card credits; front + back (back optional), no overlays described; also IDs card, eBay comps, ROI, listing generator; covers comics/coins too. Publisher admits it built the tool "to win this comparison" — [PreGradeCards vs competitors](https://pregradecards.com/blog/pregradecards-vs-cardgrade-snapgrade-cardsense-zeropop-2026). Its own pages also give inconsistent figures (91% within ±1 on 2,203 cards; 98% modern / 89% vintage; per-grade exact 76–91%) — [PreGradeCards Pokemon](https://pregradecards.com/grading-pokemon); [PreGradeCards AI vs human](https://pregradecards.com/blog/ai-vs-human-pokemon-card-grading-accuracy-2026)
- CardGrade.io: 16 zones / 47 inspection points, PSA/BGS/CGC predictions in ~60s, front + back; "Forensic Capture" macro-photo mode; Chrome extension grades listings on eBay/COMC/TCGplayer; plans $4.99 (10) / $9.99 (25) / $24.99 (80) / $74.99 (300) per month; credits back a grade if off by ≥2 from real grade; headline 92.8% is a "model-confidence figure," not matched returns — [SnapGradeAI roundup](https://www.snapgradeai.com/blog/best-ai-pokemon-card-grading-apps-2026); [PreGradeCards comparison](https://pregradecards.com/blog/pregradecards-vs-cardgrade-snapgrade-cardsense-zeropop-2026). Also sells a grading API — [cardgrade.io API](https://cardgrade.io/grading-api)
- An open-source teardown found CardGrade.io's browser centering runs in Web Workers using Sobel + row/column projection with no perspective correction (relies on flat 90° shots), that "Edge Grading" ships an MD5-identical edge-finder worker, and both have an R/B-swapped grayscale weight bug — [GroguZhang/card-grading-lab](https://github.com/GroguZhang/card-grading-lab)
- TCGrader (UK, Android; iOS "coming"): Quick and Precision modes, Precision inspects 18 zoomed regions with evidence crops; £0.99 credits, £9.99/mo (25), £19.99/mo (75), £49.99/mo Dealer Console (250 + inventory/POS); no match rate, cites 93,000+ cards graded — [CardTracker AU](https://cardtracker.au/insights/guides/ai-pokemon-card-grading-apps); [PreGradeCards comparison](https://pregradecards.com/blog/pregradecards-vs-cardgrade-snapgrade-cardsense-zeropop-2026); [Google Play](https://play.google.com/store/apps/details?id=com.tcgrader.app)
- CardSense AI (iOS): guided camera capture with automatic glare removal, ~2s/card, four subgrades calibrated to PSA/BGS/SGC, submit/sell-raw/hold recommendation; reported 92% within 1 grade / 78% exact on only 50 cards — [PreGradeCards comparison](https://pregradecards.com/blog/pregradecards-vs-cardgrade-snapgrade-cardsense-zeropop-2026); [PreGradeCards best apps](https://pregradecards.com/blog/best-ai-card-grading-apps-compared-2026)
- CardMintAI: "95% PSA match/alignment" with no methodology or sample size; ~2s grades — [CardMintAI blog](https://www.cardmintai.com/blog/best-pokemon-card-pre-grading-apps/)
- MasterGrade (probability of each PSA outcome + value at each grade; 1 free/day anon), OneGrade (free, 4 axes), Cards AI (eBay comps + condition estimate), Midpoint, Poke Center and cardcenter.app (centering only) — [PreGradeCards comparison](https://pregradecards.com/blog/pregradecards-vs-cardgrade-snapgrade-cardsense-zeropop-2026); [SnapGradeAI roundup](https://www.snapgradeai.com/blog/best-ai-pokemon-card-grading-apps-2026)
- App Store centering/pre-grade apps (2026): Evo: AI Card Grading (two photos, marks damage + centering, estimates profit after fees) — [App Store](https://apps.apple.com/app/id6771628730); Centering50 (PSA 55/45 front, BGS 50/50 Black Label) — [App Store](https://apps.apple.com/app/id6759667301); Card Centering & Grading Tool (AI + manual ratios, PSA/BGS/CGC) — [App Store](https://apps.apple.com/app/id6751225884); Card Centering Tool: Grader AI — [App Store](https://apps.apple.com/us/app/-/id6751784546); Center Grade — [App Store](https://apps.apple.com/us/app/-/id6745772819); GradeX — [App Store](https://apps.apple.com/us/app/id6758254887); Grade Sync Pro — [App Store](https://apps.apple.com/us/app/grade-sync-pro/id6759976779)
- Free web centering calculators: PriceCharting — [link](https://www.pricecharting.com/card-centering-calculator); Pokemon Card Scanner app centering — [link](https://pokemoncardscanner.app/centering)
- General LLMs (ChatGPT): "directionally useful but imprecise" per anecdotal Reddit thread — [CardTracker AU](https://cardtracker.au/insights/guides/ai-pokemon-card-grading-apps)

**Scanner/price apps that do NOT pre-grade**
- Ludex identifies and prices cards but does not estimate a condition grade; plans Lite $4.99 / Standard $9.99 / Pro $24.99 per month — [Cards AI Ludex review](https://www.cardsaiapp.com/blog/ludex-review); [SnapGradeAI roundup](https://www.snapgradeai.com/blog/best-ai-pokemon-card-grading-apps-2026)
- Collectr: portfolio/scanner/price guide incl. graded prices, ~$4.99/mo billed yearly; no source found describing an AI grade feature — [PreGradeCards CollX vs Ludex](https://pregradecards.com/blog/collx-vs-ludex-vs-card-ladder-vs-pregradecards-2026)
- TCGplayer app, PokeScope, Rare Candy, DittoDex: scanning/pricing only — [CardTracker AU](https://cardtracker.au/insights/guides/ai-pokemon-card-grading-apps)

**B2B API**
- Ximilar AI Card Grading API: `/v2/grade` returns corners, edges, surface, centering subgrades (1–10) with final grade = geometric mean of the four; `/v2/centering` returns L/R and T/B ratios; trained "in accordance with grading standards such as PSA or Beckett"; Ximilar admits surface grading "misses… by quite a large margin" in an example — [Ximilar docs](https://docs.ximilar.com/collectibles/card-grading); [Ximilar blog](https://www.ximilar.com/ai-card-grading-automate-sports-cards-pre-grading). Many indie apps/GitHub projects wrap this API (e.g. volosevych/card-grading-app).

### Inferences
- Many small pre-grade apps likely share backends (Ximilar API, shared JS workers, or LLM vision calls), so "different apps" may not be independent models.
- The big graders are positioning AI as internal throughput tooling (imaging, sorting, measurement), not as a consumer prediction product; TAG is the only one exposing its machine scoring (1,000-pt score + defect map) to customers.
- No "PokeGrade," "Pre-Grade" (as a distinct brand), or "Genamint" consumer product surfaced; Genamint appears to be internal PSA tech only.

### Gaps
- Genamint's current specific role inside PSA (e.g. centering measurement, cert fingerprinting) — no post-2021 primary source found.
- AGS current status/pricing from a primary source (Wikipedia 404; only competitor blogs).
- Whether Collectr has added any grading feature — not found.
- App Store ratings/review text for the pre-grade apps were not retrieved.
- No defunct products confirmed; sailorpepe/tcg-oracle-app is marked "no longer maintained (Oct 2026)" on GitHub. "Snapgrade" vs "SnapGradeAI" assumed to be the same product.

## Open-source projects (GitHub)

### Takeaway
Open source is thin: a handful of research/hobby repos (deep-learning graders trained on eBay/PSA-labeled images, OpenCV centering tools) and Roboflow datasets; nothing with a validated benchmark against PSA returns. The most useful technical reference is a 2026 centering engine that reverse-engineered commercial tools.

### Cited Findings
- GroguZhang/card-grading-lab (Nov 2026, Chinese docs): Python/OpenCV centering engine with four-point detection → edge ridge fitting → homography to 63.5:88.9 mm aspect, sub-pixel gradient-weighted edges (typical error ±0.2 percentage points), threshold tables for PSA/BGS/CGC/SGC/TAG/EDGE, explicit warnings for narrow borders/full-art cards; zero-dependency web demo with magnifier and draggable guide lines; optional per-zone defect judgement via DeepSeek API (~$0.001/card) — [GitHub](https://github.com/GroguZhang/card-grading-lab)
- crimsonthinker/psa_pokemon_cards (55 stars, last push 2021): VGG16 fine-tuned per aspect (centering, corners, edges, surface), U-Net to crop card, front+back inputs; reports average error ~0.5 grade on a 10-pt scale — [GitHub](https://github.com/crimsonthinker/psa_pokemon_cards)
- rthorst/mint_condition (68 stars, 2020): ResNet-18 trained from scratch on ~90,000 professionally graded cards scraped from eBay auctions (sports); notes from-scratch training beat fine-tuning top layer because low-level features (scratches, rounded corners) matter — [GitHub](https://github.com/rthorst/mint_condition)
- Ximilar-com/cardloader (Nov 2026): open-source Tauri desktop app to scan folders/document scanners, identify and grade via Ximilar API or a local vision model — [GitHub](https://github.com/Ximilar-com/cardloader)
- Smaller/early repos: kevinmastascusa/ai-grading-pipeline (MLOps scaffold), rcksssss/digital-grader (front/back upload → subscores), sailorpepe/tcg-oracle-app (unmaintained Oct 2026), RawPowered/RawEngine (local PC pre-grader), Blocpod/trading-grade, andreped/DexGrade (Flutter stub), OzturkArda/mtg-copy-fingerprint (copy identification via centering + surface marks) — GitHub search API results, [github.com](https://github.com/search?q=card+grading)
- Roboflow: guest post prototype on ~150 Pokemon images, OpenCV edge detection for flatness/skew then YOLOv5 for condition — [Roboflow blog](https://blog.roboflow.com/using-computer-vision-to-make-card-grading-faster-and-cheaper/); public datasets "Pokemon Centering Tool 3.0" — [Roboflow Universe](https://universe.roboflow.com/jacks-robo-dojo/pokemon-centering-tool-3.0), "centering_detectron" — [Roboflow Universe](https://universe.roboflow.com/cards-grading/centering_detectron)
- Research Square preprint finds CNN classification significantly outperforms traditional OpenCV methods for card grading and proposes a hybrid — [Research Square](https://www.researchsquare.com/article/rs-8098898/latest.pdf)
- OpenCV forum thread on Pokemon border grading: advice that low-res/squashed images make it infeasible — [OpenCV forum](https://forum.opencv.org/t/pokemon-cards-borders-grading/7644)

### Inferences
- A practical design consensus: deterministic CV (homography + border detection) for centering; learned models for corners/edges/surface. Training labels typically come from graded-slab listing photos (eBay), which bias toward photographed-through-plastic images.

### Gaps
- No open dataset of raw-card photos paired with eventual PSA grades was found.

## Features measured and photo UX

### Takeaway
Nearly every tool reports the four PSA-style axes (centering, corners, edges, surface) and front+back photos; UX sophistication varies from plain upload to guided capture with glare removal or macro modes. Centering is the most reliably measurable axis; surface is the weakest.

### Cited Findings
- Centering called the "#1 grade-limiting bottleneck"; borderless/full-art cards are measured against design elements (text box, name) which is harder — [cardgrade.io centering guide](https://cardgrade.io/blog/centering-guide)
- PSA 10 front centering standard 55/45; BGS 50/50 for Black Label — [Centering50 App Store](https://apps.apple.com/app/id6759667301)
- UX examples: CardSense guided capture + auto glare removal — [PreGradeCards](https://pregradecards.com/blog/pregradecards-vs-cardgrade-snapgrade-cardsense-zeropop-2026); CardGrade "Forensic Capture" macro mode + 16 zones; TCGrader Precision 18 zoomed evidence crops (same source); SnapGrade refunds when photos can't support ≥2 axes — [SnapGradeAI](https://www.snapgradeai.com/blog/best-ai-pokemon-card-grading-apps-2026); Evo marks damage/centering overlays on the card — [App Store](https://apps.apple.com/app/id6771628730); manual draggable guide lines in centering tools — [card-grading-lab](https://github.com/GroguZhang/card-grading-lab)
- Commercial browser centering (CardGrade.io/Edge Grading) does no perspective correction, so requires flat, straight-on shots — [card-grading-lab](https://github.com/GroguZhang/card-grading-lab)
- TAG (in-lab) uses photometric stereo imaging for surface defects — [Phantom Display](https://phantomdisplay.com/blogs/blog/tag-card-grading-the-new-grader-explained); AGS weights front 60/back 40 — [cardgrade.io](https://cardgrade.io/best-ai-card-grading-apps)
- Ximilar admits surface is weakest — [Ximilar](https://www.ximilar.com/ai-card-grading-automate-sports-cards-pre-grading)

### Inferences
- Phone photos fundamentally can't replicate raking/multi-angle lighting that TAG uses for surface; consumer apps' surface subgrades are likely the least reliable, which matters most for modern Pokemon where PSA 9 vs 10 often hinges on print lines/scratches.

### Gaps
- Specific lighting instructions (angles, number of shots) for most apps were not documented in sources.

## Independent tests vs actual PSA grades

### Takeaway
None found. All published accuracy figures are vendor self-reports with inconsistent definitions (exact, ±0.5, ±1, "confidence"); the largest claims contradict the vendors' own other pages.

### Cited Findings
- SnapGrade's Reddit roundup itself names no Reddit posts comparing pre-grades with PSA returns and reports no community hit rates — [SnapGradeAI Reddit FAQ](https://www.snapgradeai.com/blog/pokemon-card-pre-grading-reddit-faq)
- Reddit sentiment (as summarized by a vendor): users call out unsupported "95% accuracy" claims, prefer subgrades, treat pre-grading as screening, split on trusting AI for $1,000+ cards — [SnapGradeAI Reddit FAQ](https://www.snapgradeai.com/blog/pokemon-card-pre-grading-reddit-faq)
- SnapGrade's own Nov 2026 review: "We did not run a blind accuracy test across these tools" — [SnapGradeAI](https://www.snapgradeai.com/blog/best-ai-pokemon-card-grading-apps-2026)
- CardTracker AU (non-vendor-ish AU guide) notes the only accuracy figures are vendor data, none independently verified — [CardTracker AU](https://cardtracker.au/insights/guides/ai-pokemon-card-grading-apps)
- Note on base rates: "within ±1 grade" is a weak bar for Pokemon where value cliffs are 9 vs 10; only PreGradeCards reports a binary PSA-10 metric (82%, self-reported) — [PreGradeCards](https://pregradecards.com/blog/pregradecards-vs-cardgrade-snapgrade-cardsense-zeropop-2026)

### Inferences
- An honest independent benchmark (blind predictions logged before submission, reporting exact match and PSA-10 precision/recall) would itself be a differentiator.

### Gaps
- Reddit/YouTube head-to-head tests could not be retrieved directly; searching r/PSAcard / r/PokemonTCG manually is recommended.

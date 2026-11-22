# Deep Learning / ML Approaches and Datasets for Trading Card Grade Prediction

Research date: 2026-11-21. Source dates are given where known. Many GitHub pages show only a "© 2026" footer, which is the site's copyright year, not the project date. Vendor accuracy claims are self-reported and unverified, and are marked that way.

## Q1. Published papers, theses and projects that predict card grades: architectures, inputs, accuracy

### Takeaway
The peer-reviewed literature is thin. It is mostly one research group (Nahar et al.) working on **corner-only** defect classification with a transfer-learned CNN (VGG/Inception reached 78%, DenseNet 83% mean accuracy), plus one preprint (TCG-AI) that uses YOLOv8-OBB and DenseNet201. Whole-card PSA prediction exists only in hobby or student GitHub projects. The best documented one is a dual-branch ResNet (front + back) with CORAL ordinal loss at QWK 0.84 on about 9.8k PSA pairs. No paper reports a credible exact or within-1 accuracy on a held-out, independent PSA set.

### Cited Findings
**Academic / preprint**
- Nahar, Islam, Awrangjeb, Verhoeve, "Automated corner grading of trading cards: Defect identification and confidence calibration through deep learning," *Computers in Industry* vol. 164 (Elsevier), accepted 12 Sep 2024:
  - Uses DenseNet with batch normalization and spatial dropout, confidence-calibration methods, a rule-based classifier that sorts defects by confidence score, and a human-in-the-loop review of misclassified samples.
  - Reports **83% mean accuracy** in corner defect classification, up from **78%** in the authors' earlier study with VGG-net/InceptionV3.
  - Data is a real dataset from an industry partner. The landing page gives no size. — [LJMU Research Online](https://researchonline.ljmu.ac.uk/id/eprint/25294/)
- The earlier "DeepCornerNet" work by the same group compared VGG-16, VGG-19 and InceptionV3 with transfer learning, freezing layers at different depths. Its stated motivation was the subjectivity of human inspection. — [LJMU PDF](https://researchonline.ljmu.ac.uk/id/eprint/25294/1/Automated%20corner%20grading%20of%20trading%20cards%20Defect%20identification%20and%20confidence%20calibration%20through%20deep%20learning.pdf) (via search summary); related record at [Univ. Newcastle repository](https://ogma.newcastle.edu.au/vital/access/%20/manager/Repository/uon:55212)
- "TCG-AI: AI Integration in Collectibles Grading for Trading Card Games and Sport Cards" (Warren, Pimbblett, Mboli), a Research Square preprint (rs-8098898, likely 2025):
  - Compares OpenCV image processing with CNNs.
  - Proposes a hybrid framework that uses **YOLOv8 with oriented bounding boxes** for localized defect detection across the four PSA/Beckett criteria (centering, corners, edges, surface).
  - Uses a **DenseNet201** transfer model to classify individual corners into **4 severity classes**.
  - I could not extract the full text (PDF parse failed), so its numeric results are unverified. — [Research Square](https://www.researchsquare.com/article/rs-8098898/latest)
- A paper on grading Magic: The Gathering card condition with image classification plus object detection was mentioned in a search summary. I could not find its URL or details. — (see Gaps)
- Patents:
  - US 12,106,334 B2 (issued 1 Oct 2024), "Artificial intelligence-based system and method for grading collectible trading cards," uses classical features (threshold inversion for centering, wavelet transforms for surface texture) feeding a trained ML model, with a weighted formula over the subgrades. — [USPTO Gazette](https://patentsgazette.uspto.gov/week40/OG/html/1527-1/US12106334-20241001.html); [PDF](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12106334)
  - US 12,141,817 and US 12,493,888, "Identifying and grading system... for collectible items." — [USPTO 12141817](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12141817), [USPTO 12493888](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12493888)

**Open-source / hobby projects**
- **PSAGradePredictor** (jshan9078, date not shown):
  - Architecture: asymmetric dual-branch CNN, with a ResNet-18 front branch (11M params) and a ResNet-34 back branch (21M params), about 32M total. Input is 384×384.
  - Preprocessing: LAB color space, CLAHE, Sobel and Laplacian features.
  - Data: 9,824 front/back pairs labeled PSA 1–10, split 70/15/15. The acknowledgments credit PSA for providing the data.
  - Class imbalance is severe: grade 2 has only 23 samples and grade 9 has 2,211 (the largest class).
  - Best run (CORAL ordinal loss): **QWK 0.84 validation / 0.90 train**. The earlier weighted cross-entropy + Earth Mover's Distance baseline reached QWK 0.76 validation.
  - Exact accuracy, within-1 accuracy and MAE are not reported. — [GitHub](https://github.com/jshan9078/PSAGradePredictor)
- **mint_condition** (rthorst): ResNet-18 trained **from scratch**, which beat ImageNet fine-tuning in pilot experiments; the author thinks low-level features (scratches, print defects, rounded corners) matter. Data is "just over 90,000" graded cards from eBay auctions, downloaded with your own eBay API keys. No accuracy numbers are reported. — [GitHub README](https://github.com/rthorst/mint_condition/blob/master/README.md)
- **trading_card_grading_capstone** (BrianMillerS): ImageNet ResNet-50 with dense layers (1024/512/128) and softmax, trained in two stages (frozen first, then unfrozen). Data was about 20k PSA baseball images scraped from Collectors.com with BeautifulSoup, curated to about 10k, balanced and flip-augmented. Reports **76% exact accuracy**, and states "variance of ±1.2 grades." That is not a within-1 rate, and the class balancing makes the 76% likely optimistic. — [GitHub README](https://github.com/BrianMillerS/trading_card_grading_capstone/blob/main/README.md)
- **Alex Newsome, DEV Community (24 Sep 2025)**, "I Trained an AI to Pre-Grade Trading Cards":
  - A single CNN performed poorly. An **ensemble of specialist models** (surface, corners, edges, centering) with weighted scoring worked better.
  - Uses EfficientNet-B0 (ImageNet, early layers frozen) with a small head for a binary "submit / don't submit" decision.
  - Multi-scale inputs: high resolution for corners, medium for surface, low for centering. Preprocessing masks the physical card edge separately from the printed border.
  - Lessons: domain preprocessing mattered more than model complexity; transfer learning beat custom architectures; problems include pristine-background training data and calibration drift across PSA graders.
  - No numeric accuracy is reported. — [DEV](https://dev.to/alex_newsome_c51e56ce7eb7/i-trained-an-ai-to-pre-grade-trading-cards-heres-what-i-learned-k5i)

**Commercial (self-reported, unverified)**
- PreGradeCards (2026) claims **89% within ±1** of the final PSA grade on a 10,000-card "internal study" and 82% accuracy on PSA 10 vs. not. Elsewhere it claims 91% within-1. It claims **68% exact** on modern Pokemon, with lower accuracy on vintage. The sample is users who chose to submit to PSA, so it has selection bias. The figures are inconsistent across its pages. — [PreGradeCards research](https://pregradecards.com/research); [benchmark blog](https://pregradecards.com/blog/ai-card-grading-accuracy-benchmark-2026); [Pokemon blog](https://pregradecards.com/blog/ai-vs-human-pokemon-card-grading-accuracy-2026)
- CardGrade.io and CardGrader.ai advertise PSA-style predictions but publish no methodology. CardGrade calls its output an "AI pre-screen." — [cardgrade.io](https://cardgrade.io/); [cardgrader.ai](https://cardgrader.ai/)
- SnapGradeAI claims "87% accuracy vs PSA," also unverified. — [SnapGrade](https://www.snapgradeai.com/ai-card-grading)
- **PSA itself:** PSA acquired machine-vision company **Genamint** in April 2021. Genamint does real-time card diagnostics, measurements and fingerprinting, and reportedly flags print marks and surface defects. PSA said humans remain in the loop. — [PR Newswire](https://prnewswire.com/news-releases/professional-sports-authenticator-acquires-genamint-to-introduce-next-generation-technology-to-grading-process-301273225.html); [Sports Collectors Daily](https://www.sportscollectorsdaily.com/psa-grading-buys-genamint/)

### Inferences
- The recurring design patterns are:
  - **separate front and back encoders**;
  - **ordinal losses** (CORAL beat cross-entropy + EMD by +0.08 QWK in PSAGradePredictor);
  - **per-attribute specialist models on high-resolution crops** (corners, edges) combined with geometric centering measurement;
  - **transfer learning from ImageNet** (DenseNet, EfficientNet, ResNet). One project found training from scratch better, plausibly because of low-level texture cues.
- QWK 0.84 suggests good rank ordering but probably modest exact accuracy (my guess is roughly 40–60% exact) when classes are imbalanced toward 8–10.
- Recommended starting point for a Pokemon app:
  - geometric centering via card and border detection (OpenCV/segmentation), which needs no ML;
  - corner and edge crops through a small CNN or ViT classifier for severity;
  - whole-card features plus subgrade features into an ordinal head (CORAL/CORN);
  - output a distribution or range, not a single grade.

### Gaps
- No peer-reviewed paper predicts the full PSA 1–10 grade from photos with exact/within-1 metrics on an independent test set.
- TCG-AI's numeric results (mAP, accuracy) were not extracted because the PDF was unreadable to my tools.
- The MTG condition-grading paper was not located.
- No ViT or multi-head per-attribute model with published metrics was found. No published Pokemon-specific model was found.
- Nahar et al.'s dataset size and class definitions are not on the landing page.

## Q2. Defect detection and segmentation approaches applicable to cards

### Takeaway
Industrial anomaly detection (PatchCore, PaDiM) is mature on MVTec AD (PatchCore image AUROC up to 99.6%). It fits Pokemon cards well because "defect-free" is an unsupervised notion and card art is a known reference. The only card-specific detection work found uses YOLOv8 oriented bounding boxes (TCG-AI) and small Roboflow datasets labeled for whitening, scratches and corner wear.

### Cited Findings
- PatchCore (Roth et al., CVPR 2022, arXiv 2106.08265) uses a memory bank of pretrained patch features with coreset subsampling. It reports **up to 99.6% image-level AUROC on MVTec AD** and pixel-level localization around 98% AUROC. A secondary summary gives PaDiM, the prior best, at 97.9% image and 97.5% pixel AUROC. Official code is amazon-research/patchcore-inspection. — [arXiv](https://arxiv.org/abs/2106.08265v1); [CVPR open access](https://openaccess.thecvf.com/content/CVPR2022/html/Roth_Towards_Total_Recall_in_Industrial_Anomaly_Detection_CVPR_2022_paper.html); [Papers with Code](https://paperswithcode.com/paper/towards-total-recall-in-industrial-anomaly?from=n12)
- TCG-AI uses YOLOv8-OBB for localized card defect detection plus a DenseNet201 corner-severity classifier. — [Research Square](https://www.researchsquare.com/article/rs-8098898/latest)
- Roboflow Universe hosts card-condition object-detection datasets:
  - "Card Grader" with classes Edge Wear, Scratch, Corner Wear;
  - "card-condition," with the largest listed at about 6.7k images;
  - a "pokecard" project of about 2.1k images.
  - These are annotated for defects, not PSA grades. — [Roboflow Card Grader](https://universe.roboflow.com/rafets-workspace/card-grader-ogigp); [Roboflow card-condition](https://universe.roboflow.com/taller-7zlb8/card-condition-gubtl/dataset/1); [psa_cards](https://universe.roboflow.com/rohit-mundhe-rq4si/psa_cards)
- A practitioner reports that preprocessing matters most: background removal and separating the physical card edge from the printed border. — [DEV](https://dev.to/alex_newsome_c51e56ce7eb7/i-trained-an-ai-to-pre-grade-trading-cards-heres-what-i-learned-k5i)

### Inferences
- A Pokemon-specific advantage: each card's **clean reference artwork is available** (e.g., official set scans). That allows registration plus difference-based or PatchCore-style surface anomaly detection per card, which is stronger than generic anomaly detection.
- Phone photos break the MVTec-style assumptions (fixed lighting, alignment). Holo/foil glare will cause false positives, so multi-angle capture or glare masking is likely needed.
- YOLO-style detectors suit discrete defects (whitening dots, dings, creases). Anomaly heatmaps suit subtle surface issues (print lines, scratches).

### Gaps
- No published application of PatchCore, PaDiM or autoencoders to trading cards was found.
- No crease or whitening detection benchmark with mAP numbers for cards was found.

## Q3. Datasets: public graded-card image sets, PSA cert images, eBay, Kaggle/HF; legal issues

### Takeaway
No large public Pokemon-graded image dataset exists. Public options are a noisy 11.5k-image baseball set (GitHub), defect-labeled Roboflow sets, and unlabeled HF card sets. The realistic sources are:
- PSA cert-page scans (front/back, available for many recent certs, quality varies);
- eBay graded listings (via API, the route mint_condition used);
- data licensed from a grader (PSAGradePredictor credits PSA).

Scraping PSA or Collectors.com carries ToS risk. I could not retrieve PSA's terms.

### Cited Findings
- **PSA-Grades-Baseball** (samsilverman, GitHub): 1,150 images per PSA grade 1–10, 11,500 total, resized to 150×200. The author notes duplicates, wrong grades and irrelevant images. It is baseball only. — [GitHub](https://github.com/samsilverman/PSA-Grades-Baseball)
- mint_condition: about 90k graded eBay cards, fetched by the user with their own eBay API keys rather than redistributed. — [GitHub](https://github.com/rthorst/mint_condition/blob/master/README.md)
- The BrianMillerS capstone scraped about 20k PSA images from Collectors.com with BeautifulSoup. — [GitHub](https://github.com/BrianMillerS/trading_card_grading_capstone/blob/main/README.md)
- PSAGradePredictor's 9,824 front/back pairs are credited to PSA. — [GitHub](https://github.com/jshan9078/PSAGradePredictor)
- Hugging Face:
  - GotThatData/sports-cards has sports card images with a condition field. Its license is inconsistent: CC BY-NC-SA 4.0 for images vs. MIT in the README header. — [HF](https://huggingface.co/datasets/GotThatData/sports-cards)
  - GotThatData/cardbase, grade labels unclear. — [HF](https://huggingface.co/datasets/GotThatData/cardbase)
  - tooni/pokemoncards, CSV card metadata with no grades. — [HF](https://huggingface.co/datasets/tooni/pokemoncards/tree/main)
  - acidtib/tcg-magic-cards, MTG card images. — [HF](https://huggingface.co/datasets/acidtib/tcg-magic-cards)
- No Kaggle dataset of PSA-graded Pokemon images was found. — (search, see Gaps)
- **PSA cert imaging:**
  - PSA scans the front and back of encapsulated items on high-resolution scanners and posts the images on Cert Verification pages, where they can be downloaded. Cards, tickets and packs only.
  - A 2023 forum post cites a PSA blog saying imaging was extended to all service levels. Other posts say it depends on tier. A PSA service page lists "Standard Imaging" for standard tiers and high-res "Premium Imaging" for top tiers.
  - Users report mixed quality (blur, glare, washed-out color vs. sharp).
  - Owners cannot upload their own scans. — [PSA FAQ](https://www.psacard.com/faq); [PSA holders/services](https://www.psacard.com/en-CA/services/holders); [Collectors forum](https://forums.collectors.com/discussion/comment/13055487); [Collectors forum](https://forums.collectors.com/discussion/comment/13423538/); [Blowout: SecureScan](https://www.blowoutcards.com/blog/psa-enhances-grading-process-with-new-securescan-service)
- PSA's terms page returned HTTP 403 to automated fetch, so its scraping clauses are unverified. — [psacard.com/terms](https://www.psacard.com/terms)

### Inferences
- PSA cert scans are **slab scans under controlled lighting**, and slab plastic adds glare. A model trained on them will face domain shift on users' raw phone photos of raw cards.
- Plan for domain adaptation:
  - pair cert scans with phone photos of the same cards;
  - or collect pre-submission photos from users with grade follow-up (the PreGradeCards approach).
- A legally safer path:
  - the eBay Browse API under its license terms;
  - partnership or licensing with a grader;
  - user-contributed photos plus cert numbers, with consent.
- Have counsel review PSA, Collectors and eBay ToS before bulk scraping. Card artwork is copyrighted by The Pokémon Company, which matters for redistributing a dataset.

### Gaps
- I could not confirm the exact current PSA imaging coverage (all certs vs. tier-dependent) as of 2026, or the exact start date.
- PSA's ToS text on scraping was not retrieved (403).
- eBay API license terms for ML training were not reviewed.
- No BGS or CGC image-dataset availability was found.

## Q4. How do vision-language models (Claude, GPT-4o/5, Gemini) perform at grading cards from photos?

### Takeaway
There is **no rigorous public benchmark** of frontier VLMs on PSA-graded card photos. Evidence is anecdotal or comes from vendors with a conflict of interest. The consistent anecdotal finding is **grade inflation**: VLMs return 8–10 on cards PSA graded 6–8.

### Cited Findings
- Chasing Majors Substack (26 Aug 2025) ran 60 cards through "ChatGPT Plus" (model unspecified). The visible examples: a vintage card PSA graded 1 (MK) was called a 2 by ChatGPT; a modern chrome card was called a 9 with no PSA grade given. The full results are paywalled. — [Substack](https://chasingmajors.substack.com/p/chatgpt-will-disrupt-the-sports-card)
- PreGradeCards, a competitor with a conflict of interest (2026), claims hobbyists have tested this informally since GPT-4V and that general chatbots "consistently" inflate grades, returning 8–10 on cards graded 6–8. It argues they describe rather than measure. No data is linked. — [PreGradeCards blog](https://pregradecards.com/blog/can-chatgpt-grade-cards-2026)
- Related, non-card evidence on VLMs:
  - VLMs perform poorly on precise low-level visual tasks ("Vision language models are blind"). — [ResearchGate](https://www.researchgate.net/publication/382111926_Vision_language_models_are_blind)
  - Studies of LLM grading of student work find Claude and Gemini "fairly lenient relative to human grading." — [arXiv 2411.13685](https://arxiv.org/html/2411.13685v1)

### Inferences
- Centering (measuring borders to roughly 55/45) and small corner whitening are exactly the precise pixel-level tasks where VLMs are weak. A VLM is better used to:
  - identify the card (set and number);
  - write natural-language explanations of CV-detected defects;
  - act as a weak prior.
  It should not be the grade predictor.
- If you test a VLM, use a held-out PSA set with fixed prompts. Report exact, within-1 and bias (mean signed error) to quantify inflation.

### Gaps
- No controlled benchmark exists for GPT-4o/5, Claude or Gemini on card grading.
- No Reddit thread with tabulated results was located (searches returned only vendor content).

## Q5. Label noise: PSA grading consistency and the theoretical accuracy ceiling

### Takeaway
PSA publishes no inter-rater or resubmission consistency statistics. Forum anecdotes show frequent ±1 changes on resubmission and occasional ±2–3 jumps. This implies the exact-grade ceiling is well below 100%, plausibly well under 80% for cards near grade boundaries, while **within-±1 is the meaningful target metric**.

### Cited Findings
- One collector resubmitted 25 1981 Topps cards and only **3 came back with the same grade**; most came back one grade higher (9s). — [Collectors forum](https://forums.collectors.com/discussion/comment/1264871/); [follow-up](https://forums.collectors.com/discussion/comment/1267257/)
- A 2018 Bowman Chrome Ohtani went from PSA 7 to 8 on crack-and-resubmit. Posters report swings such as 6→9 and 8→10, and say one-grade bumps are common, especially on vintage. — [Collectors forum](https://forums.collectors.com/discussion/comment/13500779/); [Collectors forum](https://forums.collectors.com/discussion/comment/13491338); [Collectors forum](https://forums.collectors.com/discussion/comment/13491626/)
- Explanations offered by posters (opinion): grader strictness varies, cards sit near grade borders, and graders spend about one minute per card. Population reports overcount because cracked cards may stay listed under their old grade. — [Collectors forum](https://forums.collectors.com/discussion/833035/psa-grading-perspectives); [Collectors forum](https://forums.collectors.com/discussion/151236/my-thoughts-on-grading-and-resubmissions)
- A practitioner cites "calibration drift across PSA graders" as a modeling limitation. — [DEV](https://dev.to/alex_newsome_c51e56ce7eb7/i-trained-an-ai-to-pre-grade-trading-cards-heres-what-i-learned-k5i)

### Inferences
- The forum sample is biased: people resubmit cards they think were undergraded. Even so, 22 of 25 changing grades means many cards sit within ±1 of a boundary.
- Single-image models also lack information graders have: in-hand inspection, tilt to see surface, and (in 2026) PSA's own machine-vision aids.
- Rough model ceilings:
  - exact accuracy against a single PSA label is likely about 50–70% for modern cards (the vendor's 68% exact Pokemon claim sits near this, if credible);
  - within-1 could reach about 85–95%.
- To handle the noise:
  - use ordinal losses and label smoothing over adjacent grades;
  - predict a probability distribution or range;
  - report calibrated "P(PSA 10)" rather than a point grade;
  - de-duplicate resubmitted certs.

### Gaps
- No formal study of PSA test-retest or inter-rater reliability was found, and no PSA official statement on consistency.
- BGS/CGC consistency data was not found.
- The theoretical ceiling above is inferred, not measured.

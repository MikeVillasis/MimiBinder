# Browser / PWA Feasibility for Card-Grade Prediction from Phone Photos (Vercel Hobby)

All sources accessed 2026-11-21 unless noted. Pricing is volatile; several vendors list scheduled increases in Dec 2026 / Jan 2027 (noted inline).

## In-browser options (OpenCV.js, jscanify/Scanic, TF.js, ONNX Runtime Web, MediaPipe, Transformers.js)

### Takeaway
Classical CV in the browser (card detection, perspective correction, border measurement for centering) is clearly feasible. Lightweight WASM scanners like Scanic (~100KB) or a custom OpenCV.js build avoid the ~8MB+ cost of full OpenCV.js. Small ML models (a few MB to tens of MB) run fine on ONNX Runtime Web with WASM, using WebGPU where available. iOS Safari 26 now ships WebGPU, but at least one open WebKit bug reports it is unreliable on some iPhones, so WASM must remain the fallback.

### Cited Findings
- OpenCV.js is about 8MB of WebAssembly according to a third-party developer post, not an official figure. — [DEV Community](https://dev.to/awalariansyah/opencvjs-without-the-memory-leaks-chainable-image-processing-for-every-javascript-runtime-2e43)
- The official OpenCV.js build docs offer threads and SIMD as separate build options. SIMD is described as experimental and may not work in every browser. The threads build works only in browsers (not Node) and needs WebAssembly threads, which means cross-origin isolation. — [OpenCV 4.x JS setup docs](https://docs.opencv.org/4.x/d4/da1/tutorial_js_setup.html)
- A 2019 desktop-Chrome benchmark of OpenCV.js measured one kernel at 1.164s scalar vs 0.039s with threads+SIMD (~30x), and a face-recognition sample at 26 FPS vs 3 FPS scalar. These are dated desktop numbers, not mobile. — [GSoC proposal gist](https://gist.github.com/Wenzhao-Xiang/8636e239c20e0eda839833f9d363828e)
- As a reference point for variant sizes, a different WASM SDK (Dynamsoft barcode) lists 5,588KB baseline, 6,974KB with SIMD, and 8,225KB with SIMD+pthread, and says threads need cross-origin isolation. — [Dynamsoft adaptive WASM loading](https://www.dynamsoft.com/faq/barcode-reader/web/capabilities/adaptive-wasm-loading.html)
- jscanify depends on OpenCV.js. `findPaperContour()` runs Canny edge detection, Gaussian blur and Otsu thresholding and takes the largest contour. `extractPaper(image, w, h, cornerPoints)` warps that region to a rectangle and returns null if detection fails and no corners are supplied. — [jscanify README (unpkg 1.4.3)](https://unpkg.com/jscanify@1.4.3/README.md); [GitHub](https://www.github.com/ColonelParrot/jscanify)
- Scanic is an MIT-licensed browser/Node document scanner using a Rust WASM module plus GPU-accelerated canvas warping, with no OpenCV.js. It claims under 100KB gzipped, ~10ms perspective transforms vs ~200ms for jscanify, and ~31MB download for jscanify vs ~100KB for Scanic. These are the project's own unbenchmarked claims. — [Scanic README](https://cdn.jsdelivr.net/npm/scanic@1.0.8/README.md)
- A Dynamsoft tutorial shows a fully client-side OpenCV.js document scanner (grayscale, blur, threshold, contours) with no server needed. — [Dynamsoft codepool](https://dynamsoft.com/codepool/web-document-scanner-with-opencvjs.html)
- ONNX Runtime Web execution providers: WASM is the default CPU path and is suggested for very lightweight models. WebGPU is for compute-heavy models. — [ORT WebGPU EP docs](https://onnxruntime.ai/docs/execution-providers/WebGPU-ExecutionProvider.html); [ORT deploy docs](https://onnxruntime.ai/docs/tutorials/web/deploy.html)
- ORT Web model size limits: an ONNX protobuf file is capped at 2GB, so larger models need external data files. Browser ArrayBuffer limits are about 2GB in Chrome, and ORT works around this with `new WebAssembly.Memory()`. — [ORT "Working with Large Models"](https://onnxruntime.ai/docs/tutorials/web/large-models.html)
- Transformers.js runs on ONNX Runtime Web and uses its WebGPU EP (v3+). — [DeepWiki transformers.js ORT backend](https://deepwiki.com/huggingface/transformers.js/8-onnx-runtime-backend)
- WebGPU ships in Safari 26 on iOS 26, iPadOS 26, macOS Tahoe 26 and visionOS 26. web.dev says ONNX Runtime and Transformers.js already use WebGPU for local inference. — [web.dev: WebGPU supported in major browsers](https://web.dev/blog/webgpu-supported-major-browsers); [AppDeveloperMagazine: WebGPU in iOS 26](https://appdevelopermagazine.com/webgpu-in-ios-26/)
- A WebKit bug reports a WebGPU problem reproducing on iOS 26.0.1 (iPhone 12 Pro Max) and still in Safari 26.2. The reporter disabled WebGPU on iOS and fell back to WebGL. — [WebKit Bugzilla 301627](https://bugs.webkit.org/show_bug.cgi?id=301627)

### Inferences
- The centering pipeline needs only contour detection, a homography warp and edge profiling, so a ~100KB WASM lib (Scanic) or a custom minimal OpenCV.js build is a much better fit for a phone PWA than full OpenCV.js (~8MB) or jscanify's reported ~31MB footprint. Cache it with a service worker so the cost is paid once.
- For an ML grade/defect model, a quantized small CNN or ViT (roughly 5–30MB, e.g., MobileNet/EfficientNet-class exported to ONNX) on ORT Web with the WASM EP is the safe cross-device choice. Treat WebGPU as an optional speed-up behind feature detection plus a fallback, given the iOS bug.
- Threaded WASM needs COOP/COEP headers. These can be set in `vercel.json`, but they may break third-party embeds or iframes.

### Gaps
- No found benchmark of OpenCV.js, ORT Web or TF.js inference latency on specific 2025–2026 iPhones or Android phones.
- MediaPipe Tasks (web) and TF.js current iOS Safari status and bundle sizes weren't researched in depth. Only the general WebGPU status is known.
- Exact iOS Safari per-tab memory ceiling (which matters for large models) wasn't found.

## Serverless options (Vercel Hobby, Hugging Face, Replicate, Modal)

### Takeaway
Vercel Hobby functions (2GB/1 vCPU, 300s max, 4.5MB request body) are fine as a thin proxy to a vision LLM and could run small CPU ONNX or OpenCV inference in Python. Photos must be downscaled or cropped client-side to stay under 4.5MB. The 20MiB body option needs Pro. HF Spaces' free CPU tier is in flux, Replicate has no free tier, and Modal's $30/month Starter credits are the most generous free GPU/CPU option.

### Cited Findings
- Vercel Functions limits page (last updated 2026-08-24):
  - Memory: Hobby 2GB / 1 vCPU, both default and maximum.
  - Duration: Hobby 300s, both default and maximum, for Node.js, Bun and Python.
  - Bundle size: 250MB uncompressed, 500MB for Python, and up to 5GB with "large functions" (Beta).
  - Request body: 4.5MB by default; larger requests return 413 `FUNCTION_PAYLOAD_TOO_LARGE`. 20MiB bodies are in Public Beta but require Performance (4GB) memory, which is Pro/Enterprise only.
  - Response body: 4.5MB unless streamed.
  - Region: single region, `iad1` by default.
  - Cost: Hobby functions are free "within limits". Active CPU is billed and I/O waiting (e.g., calling AI models) doesn't count toward active CPU.
  - Source: [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- An older cached Vercel page listed Hobby at 10s default / 60s max. That predates the Fluid compute change, and the current docs say 300s. — [Vercel changelog: higher defaults for Fluid compute](https://vercel.com/changelog/higher-defaults-and-limits-for-vercel-functions-running-fluid-compute)
- HF Spaces CPU Basic is officially 2 vCPU / 16GB / free. It sleeps when inactive (48h per one docs page). Many 2026 forum threads report "cpu-basic quota limit" errors, with staff saying PRO is needed. One post dates the change to about July 2026 with no official announcement. These sources conflict. — [HF Spaces overview](https://huggingface.co/docs/hub/en/spaces-overview); [HF GPU docs](https://huggingface.co/docs/hub/main/spaces-gpus); [forum: quota with one Space](https://discuss.huggingface.co/t/cpu-basic-quota-limit-with-only-one-space/180646); [forum: community complaint](https://discuss.huggingface.co/t/official-community-complaint-revert-free-cpu-basic-spaces-and-remove-anti-developer-sdk-restrictions/177703)
- ZeroGPU is officially free for all users, with PRO getting more quota (7x in the docs, 8x on the pricing page, which is inconsistent). A forum thread cites ~5 GPU-min/day for free accounts. — [HF ZeroGPU docs](https://huggingface.co/docs/hub/spaces-zerogpu); [forum](https://discuss.huggingface.co/t/what-is-the-free-zerogpu-quota-for-1-space/178610); [HF pricing](https://huggingface.co/pricing)
- Modal Starter has no base fee, includes $30/month compute credits, and (per one aggregator) needs no credit card. CPU costs ~$0.0000131/core/s (min 0.125 cores), with memory billed separately. — [Modal pricing](https://modal.com/pricing); [apis.io](https://apis.io/plans/modal-labs/modal-labs-plans-pricing/); [xpay.sh](https://www.xpay.sh/saas-pricing/modal/)
- A third-party snapshot dated 2026-09-18 says Replicate has no free plan or trial, with CPU at $0.000025/s (small) and $0.0001/s (standard). — [withorb Replicate pricing atlas](https://www.withorb.com/pricing-atlas/replicate)

### Inferences
- A 12MP iPhone JPEG is often 2–5MB, and base64 encoding adds ~33%. Client-side, crop to the detected card and resize to ~1500–2500px long edge at JPEG quality ~0.85, which typically gives well under 1MB, before POSTing to a Vercel function. That keeps requests under the 4.5MB limit and also matches the LLM resolution caps below.
- Running the LLM call from a Vercel function keeps the API key server-side. Because I/O wait isn't billed as active CPU, a proxy to Claude/Gemini/OpenAI uses almost none of the Hobby allowance.
- Hosting a custom model: a 2GB / 1 vCPU Python function can plausibly run a small ONNX CPU model. Cold starts with heavy deps (onnxruntime, opencv-headless) will be slow, so running the model in-browser is preferable for a personal app.

### Gaps
- Exact Hobby monthly included quotas (invocations, active CPU hours, GB-hours) weren't captured. See [vercel.com/docs/limits](https://vercel.com/docs/limits).
- Vercel Blob or direct-to-storage upload for bypassing the 4.5MB limit on Hobby wasn't researched. Vercel has a KB guide on bypassing the limit.
- Hugging Face Inference Providers' free monthly credits weren't verified.

## Vision LLM APIs (Claude, OpenAI, Gemini): cost, free tiers, resolution, structured output

### Takeaway
At occasional personal use (tens of cards per month), any provider costs cents. A front+back grading call is about $0.001–0.05 depending on model tier, and Gemini Flash-class models have a free tier, though free-tier data is used for product improvement. All three accept a JSON-schema response, so per-attribute scoring (centering / corners / edges / surface) works. Resolution caps of about 1.5–2.6K px long edge mean the LLM can't see sub-pixel border detail, so measure centering deterministically in CV code and use the LLM for qualitative defects.

### Cited Findings
- **Claude (Anthropic) image limits:**
  - Max 8000x8000 px per image; more than 20 images per request triggers a stricter limit (keep ≤3,000 px).
  - Max 10MB per image (base64) on the API; 128MB total request.
  - Cost formula: ⌈w/28⌉×⌈h/28⌉ visual tokens.
  - High-resolution tier (Claude 4.7 and later) caps at 2,576px long edge and 4,784 tokens; older models cap at 1,568px and 1,568 tokens. Larger images are downscaled.
  - Example: 3840x2160 becomes 2576x1449 at 4,784 tokens on the high-res tier.
  - Docs warn that spatial and coordinate outputs are approximate.
  - Source: [Claude Vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- **Claude pricing per MTok, input/output:** Haiku 5.5 $0.10/$0.50 (prompts ≤100K tokens), Sonnet 5.5 $2/$10, Opus 5.5 $4/$20, Haiku 4.5 $1/$5. Batch is 50% off. New users get free credits, and there is no ongoing free tier. — [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- **OpenAI image input:**
  - Patch-based token cost: ceil(w/32)×ceil(h/32) patches × ~1.2 multiplier.
  - "high" detail is capped at 2,500 patches / 2048px on most current models; "original" detail goes up to 6000px or 65,535px on some models.
  - Example: 2048×2048 at high detail costs 3,000 tokens.
  - Up to 512MB payload and 1,500 images per request.
  - Source: [OpenAI images & vision guide](https://developers.openai.com/api/docs/guides/images-vision)
- **OpenAI pricing per 1M tokens, input/output:** gpt-6.2-sol $2/$10, gpt-6-luna $0.10/$0.50, gpt-5-nano $0.05/$0.40, gpt-5-mini $0.25/$2. Batch is half price. No free tier for these models. The pricing page doesn't state which models accept images. — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- **Gemini image input:**
  - 258 tokens per image if both dimensions are ≤384px; larger images are tiled at 768x768, 258 tokens per tile.
  - Inline requests are capped at 20MB total; use the Files API for larger.
  - Official examples use a JSON schema response with image input.
  - Source: [Gemini image understanding](https://aistudio.google.com/docs/image-understanding)
- **Gemini pricing per 1M tokens, input/output:**
  - Gemini 3.8 Flash: $0.75/$3.75 through 2026-12-31, doubling to $1.50/$7.50 on 2027-01-01. Has a free tier.
  - Gemini 3.5 Flash-Lite: $0.30/$2.50. Has a free tier.
  - Gemini 3.1 Flash-Lite: $0.25 (text/image) / $1.50. Has a free tier.
  - Gemini 4 Carbon/Argon: $2/$10, doubling on 2026-12-01. No free tier.
  - Free-tier content is used to improve Google products; paid-tier content is not.
  - Source: [Google AI Studio pricing](https://aistudio.google.com/docs/pricing)
- Note on these sources: model names and prices above are as listed on the vendor pages fetched 2026-11-21. Search snippets of older Gemini pricing snapshots showed different numbers. — [ai.google.dev pricing (redirects)](https://ai.google.dev/gemini-api/docs/pricing)

### Inferences (cost math; my calculation from the cited formulas)
- Assumptions: one request with front and back crops at ~1500×2100px, ~1,000 prompt tokens, ~800 output tokens.
- **Claude:** each image is ⌈1500/28⌉×⌈2100/28⌉ = 54×75 = 4,050 tokens (under the 4,784 cap), so ~9.1K input tokens per request.
  - Haiku 5.5: ~$0.0013 per card
  - Sonnet 5.5: ~$0.026 per card
  - Opus 5.5: ~$0.052 per card
- **Gemini 3.8 Flash:** roughly 6 tiles × 258 ≈ 1.5K tokens per image, so about $0.006 per card on paid pricing before 2027-01-01, or $0 on the free tier within rate limits.
- **OpenAI gpt-6.2-sol at high detail:** each image is capped at ~3,000 tokens, so about $0.02 per card.
- At 50 cards/month, cost is about $0.07 (Haiku) to $2.60 (Opus), so on-demand LLM grading is effectively free-to-negligible for a personal app.
- Per-attribute scoring via JSON schema (e.g., `{centering_front_lr, centering_front_tb, corners[4], edges[4], surface, confidence, notes}`) is supported by all three. LLM numeric scores are not calibrated to PSA, so treat them as qualitative assistance unless validated against graded cards.
- LLM centering measurement will be coarse: Claude docs flag approximate spatial reasoning, and resolution caps apply. Compute centering in CV, then pass the measured ratios to the LLM as context.

### Gaps
- No published accuracy benchmark of vision LLMs on PSA-style card grading was found in this scope.
- Gemini free-tier rate limits (RPM/RPD) for image requests and the exact token counts per `media_resolution` level weren't captured.

## Phone-photo limitations and capture UX

### Takeaway
Measuring centering to ~1% needs roughly 1,500–2,000+ px across the card width, plus perspective correction and a perpendicular shot. A modern 12MP phone photo meets the resolution, but the getUserMedia preview stream may not. Glare from foil, sleeves and toploaders is the biggest practical problem, so photograph raw cards (out of sleeve) under diffuse light and add a raking-light shot for surface. Evidence on capture accuracy is mostly app-marketing claims rather than independent tests.

### Cited Findings
- Card-centering apps warn that "if your camera is even slightly angled", measurements lose accuracy. A user review reports worse accuracy when the photo isn't at 90°. Some apps claim perspective correction, and some claim ~0.1% accuracy, but these are unverified vendor statements. — [App Store: Centering50](https://apps.apple.com/app/id6759667301); [App Store: Card Centering & Grading Tool](https://apps.apple.com/app/id6751225884); [App Store listing](https://apps.apple.com/us/app/id6756671298)
- A 2026 DIY grading guide recommends a flat, neutral surface, the phone held perfectly perpendicular, a phone tripod mount (often under $15) to remove tilt, and a movable desk lamp for spotting surface defects. — [Cardboard Connection 2026 DIY grading guide](https://www.cardboardconnection.com/the-2026-collector-s-guide-to-diy-grading-best-phone-apps-ai-tools-to-stop-wasting-money-on-psa-submissions/amp)
- No source found that quantitatively tests sleeve or toploader effects on centering or glare. — (search returned none; see Gaps)

### Inferences (engineering estimates; not from a cited source)
- **Resolution math:** a TCG card is ~63×88mm. 1% centering accuracy means resolving ~1% of the combined left+right border width. With ~3mm borders (~6mm combined), that is ~0.06mm. At 2,000px across 63mm (~32 px/mm), 0.06mm ≈ 2px. That is achievable with sub-pixel edge fitting along the full border length, which averages hundreds of edge samples. So the card should span at least ~1,500–2,000px. A 12MP still (4032×3024) with the card filling ~60–70% of the frame gives ~2,000–2,800px across the card; a 720p or 1080p video frame does not.
- **Lens distortion:** phone main cameras are corrected in-ISP, but residual barrel distortion and keystone from tilt bias border ratios. Fix this by warping the four detected outer corners to a rectangle (homography), shooting from ~25–40cm with the 1x or 2x lens (not ultra-wide), and keeping the card centered in frame.
- **Glare:** holo and foil surfaces plus sleeve and toploader plastic produce specular highlights that hide surface defects and confuse edge detection. Toploader edges can also be mistaken for card edges. Photograph raw cards (out of sleeve) for centering, edges and corners. Use diffuse light (overcast window, light tent, or two lamps at 45°) for the main shot, and a separate low-angle raking-light shot for scratches and dents on the surface. Fix white balance and exposure where possible, and avoid mixed lighting.
- **Capture UX:**
  - Live getUserMedia preview with a card-outline overlay.
  - Run CV on downscaled preview frames to check alignment (corner detection, tilt from quadrilateral shape, blur via Laplacian variance, glare via saturated-pixel ratio).
  - Auto-trigger or prompt capture when the card is aligned, then take a full-res still (ImageCapture on Android, file-input fallback on iOS).
  - Capture front, back, and optionally a 2–4-angle raking-light set.

### Gaps
- No independent study of phone-photo centering accuracy vs PSA's actual measurements.
- No sourced guidance on sleeve/toploader-induced measurement error.

## Camera APIs in the browser (getUserMedia, ImageCapture, file input with capture)

### Takeaway
Use getUserMedia only for the live alignment preview. ImageCapture.takePhoto() gives full sensor resolution but is Chromium-only (Chrome Android 157+) and unsupported on iOS Safari through 27.2. On iOS, the reliable full-res path is `<input type="file" accept="image/*" capture="environment">`, which opens the native camera. That loses the live overlay and auto-capture, so the practical design is a hybrid.

### Cited Findings
- **ImageCapture support:** Chrome for Android supports it from v157. Safari on iOS doesn't support it in any version from 3.2 through 27.2. Firefox has it behind a flag (`takePhoto()` only). Global usage is ~78.75%. — [caniuse: ImageCapture](https://caniuse.com/imagecapture)
- Chrome docs say `takePhoto()` accesses the camera's maximum resolution, while drawing getUserMedia frames to a canvas can limit resolution. — [Chrome Developers: ImageCapture](https://developer.chrome.com/blog/imagecapture?hl=en)
- getUserMedia can request up to 3840×2160 via constraints, but the final size depends on the camera and constraint negotiation. Dynamsoft's sample falls back to canvas capture where ImageCapture is unavailable. — [Dynamsoft: high-res photos with getUserMedia](https://www.dynamsoft.com/codepool/take-high-resolution-photo-in-the-browser.html)
- Historically, iOS Safari getUserMedia returned only 720p despite higher constraints (iOS 11 era). A WebKit bug was later resolved, and a comment reports iOS 13.4 worked. On iOS, a still can only come from canvas `drawImage()` of the video. — [Apple Developer Forums](https://developer.apple.com/forums/thread/113532); [WebKit bug 179994](https://bugs.webkit.org/show_bug.cgi?id=179994)
- `capture="environment"` asks for the rear camera, and iOS and Android browsers offer camera or library. A file input needs a user gesture but no camera permission. — [web.dev: Capturing an image from the user](https://web.dev/articles/media-capturing-images); [WebKit bug 197216](https://bugs.webkit.org/show_bug.cgi?id=197216)
- An Apple forum thread (2026) reports that on iOS Safari, taking multiple photos via a capture input overrides the previous capture instead of accumulating. — [Apple Developer Forums 826732](https://developer.apple.com/forums/thread/826732)

### Inferences
- **Hybrid capture flow:**
  - Android (Chrome): getUserMedia preview with overlay and auto-detect, then `ImageCapture.takePhoto()` for a full-res still.
  - iOS: getUserMedia preview for guidance, and either grab a canvas frame (likely ≤4K video resolution, possibly enough if the card fills the frame) or hand off to the native camera via the file input for a true 12MP+ still. Then run card detection and warp on the returned image.
  - Store each capture immediately (IndexedDB) to work around the multi-capture overwrite issue.
- HEIC from the iOS camera: Safari typically converts to JPEG for file inputs with `accept="image/*"`, but this wasn't verified here.

### Gaps
- No authoritative 2026 source on the maximum getUserMedia resolution on current iOS (e.g., iPhone 16/17 on iOS 26), or on whether file-input captures are delivered at full sensor resolution or downscaled. Both need on-device testing.
- Android multi-camera selection (avoiding the ultra-wide lens under `facingMode: environment`) wasn't researched.

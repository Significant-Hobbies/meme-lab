# Automatic meme composition and prefilled Canvas Studio

> Research log from the 2026-10-05 Canvas Studio caption work, recovered from an uncommitted checkout on 2026-10-09. It records experiments in order, including the Gemini 3.8 pin that was later replaced by automatic Free AI routing. Current released behavior is described in `PRODUCT.md` and `DESIGN.md`; `.fleet-local/` paths refer to local receipts that are not in the repository.

Owner choice, 2026-10-05: “canvas studio would be best”; “but pre-fileed”. The preceding requirement was automatic understanding, relevant text and correct placement for different memes. The new editor starts from an automatic draft, then allows manual correction.

## Architecture

`worker/src/meme-templates.mjs` stores eight inspected exact-asset profiles, including X Everywhere. Each describes the template’s comic grammar, caption roles, normalized boxes, text treatment, rotation and region-specific character budget. Geometry is tied to the asset URL, not just a template name. `worker/src/meme-composition.mjs` looks up the requested reference and viewpoint, gates serious requests/GIFs, constructs a bounded prompt, calls the existing `FREE_AI.fetch` service binding and validates the result. Known profiles request only role IDs/text. The inspected This Is Fine asset already contains its punchline and returns the original without inference. Other allowlisted static images include the exact source as a vision input; every proposed box/style/role is checked, and the editor labels the result AI placement rather than verified placement.

The gateway contract was checked in `free-ai/src/fleet-gateway.ts` and `free-ai/site/src/content/docs/chat-completions.mdx`: private Fleet HTTP entrypoint, `x-gateway-project-id: meme-lab`, JSON mode and image content parts. Caption generation now pins `gemini-3.8-flash` in the request body and the gateway's `x-gateway-force-provider` / `x-gateway-force-model` headers. The body model alone does not enforce selection in this gateway. Missing or conflicting served-model attribution is rejected. There is no alternate-model fallback, new provider credential, production binding/configuration edit or runtime dependency. Missing/incompatible bindings return an explicit 503. The gateway may manage its own admitted provider attempts; the caller makes one request, with a 20-second deadline and 800-token known-template / 1,200-token vision output cap. A 640-token text cap was tested and rejected after GPT-OSS consumed 608 reasoning tokens and truncated a Hindi reply. Caps bound work; reducing a cap does not by itself prove lower actual cost. These output caps have not yet been qualified for Gemini 3.8.

`POST /api/create` accepts the submitted situation snapshot, catalogue ID and viewpoint. It returns `compose`, `reference` or `none`. It validates actual request bytes, IDs, viewpoint, caption count/roles, bounded text, finite normalized boxes, supported text styles and rotation. Client-supplied media URLs are ignored. No request or generated caption storage is added.

`GET /api/create/media/{id}` resolves a fixed catalogue URL, admits only known Imgflip/Memegen raster paths, rejects redirects and unsupported MIME/signatures, and bounds source bytes/time. The browser also rejects unsupported image dimensions. This makes the rendered canvas exportable without relying on a third-party preview’s CORS policy. See [Cloudflare HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/) and [canvas PNG export](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob).

The editor snapshots the submitted situation rather than reusing subsequently edited input. Selecting a different result aborts the previous request and rejects stale responses. Failed regeneration preserves existing edits. Keyboard and pointer movement/resizing share clamped geometry. Numeric controls provide an accessible alternative to direct manipulation. New empty text layers block export until filled or removed.

`worker/public/meme-renderer.js` renders both preview and PNG. Whole words are preserved by reducing font size before hard-word/grapheme wrapping. Rotated regions and unfit captions cannot silently escape the image. Export uses original pixels/resolution and excludes the DOM selection overlay. A request’s filename is frozen before asynchronous export.

## Evidence and limits

`tests/meme-composition.test.mjs` covers exact-asset profiles, role/count validation, Gru’s repeated final panel, vision geometry validation, bounded/attributed gateway requests, caller URL rejection, serious-content and GIF abstention, quota/malformed/truncated output, cross-origin and actual body-byte admission, source restrictions, wrapping and off-image text.

Local browser evidence lives in `.fleet-local/meme-maker-directions/`. The local harness `.fleet-local/meme-maker-testserver.mjs` serves the actual Worker routes/static app with model and recommendation fixtures. It fetches real source images. These fixtures verify integration, layout, controls and export; they do not measure inference quality. They are not a production route or provider fallback.

Seven PNGs were downloaded through the actual editor at source resolution. The first Drake export’s SHA-256 exactly matched a separate encoding of the visible canvas: `d5d5ef73d297906b7b3109c51bf98588988223cb6b8e2534813f59d5d850e02e`. These bytes preceded the later word-fitting refinement; final captures/exports are recorded separately. Dragging, resizing, text edits, keyboard adjustment, reset, empty-layer guards and stale-result suppression were exercised. The 390/768/1440-pixel renders and pinned iteration/final scanner reports are referenced by `.fleet/design-review-meme-maker.json`.

Known observed defect: Gru’s narrow boards initially split normal words mid-word. Fixed by shrinking before word splitting; the final export keeps “reminders” and “appointment” whole. Existing external direct previews/analytics/footer scripts are blocked by the test browser’s network policy; same-origin composition imagery and PNG export work through the actual media endpoint.

## Real inference evaluation, 2026-10-05

`eval/meme_creation_v1.json` adds 16 focused cases with review criteria, not canned answers. `scripts/run-meme-creation-eval.mjs coverage` audits the existing 100 cases without real inference; `live <output> <local-adapter-url> [case-ids]` runs at most 19 selected cases against the local evaluation adapter. Existing dataset labels remain assistant-authored and unvalidated by the owner.

The local-only adapter in `.fleet-local/creation-eval/` uses Wrangler remote service bindings to the existing FleetGateway while keeping the composition Worker local. It has no retrieval/D1/Vectorize bindings or provider keys. The installed runtime supports compatibility dates through 2026-09-25, so the isolated development config uses that date. It records actual model/provider metadata, reported token usage and failures. See [Cloudflare remote bindings](https://developers.cloudflare.com/workers/local-development/#remote-bindings).

Three 19-case passes are retained in `before.json`, `after.json` and `final.json`; the middle pass tested the rejected 640-token cap. Valid HTTP/composition results were 15/19, 13/19 and 17/19 respectively. The final pass produced nine compositions, six original-image decisions, two no-meme decisions and two gateway failures (403 upstream). These are integration outcomes, not a humor accuracy score. Routing changed during the experiment: Gemini 3.5 Flash Lite and Groq GPT-OSS-120B served earlier passes; the final pass used Gemini Flash Lite. Differences between models and transient provider health prevent treating aggregate token/availability changes as a causal prompt benchmark.

Observed caption defects fixed in the prompts: Gru now names the unwanted consequence instead of repeating the plan; Success Kid requires the same winner across both panels; Expanding Brain rejects a plain non-joke instead of inventing a celestial cow or unrelated failure. Quoted-speaker, viewpoint, negation, Hindi and embedded-instruction cases are included. Some valid inputs conservatively return the original rather than composing, and captions can remain literal. A human humor acceptance rate is not established.

The full 100-case local safety audit initially missed a gas-smell emergency (24/25). The literal gas-danger cue and official tax-deadline question are now handled before inference. All 25 expected no-meme cases pass, with no provider calls. Adjacent racing-game gas and tax-receipt jokes still reach generation. Current sample coverage is four inspected-template cases, ten vision cases, 61 original/reference cases and 25 no-meme cases; that is not a 100-case live generation benchmark.

Cost evidence: the same X Everywhere case/model used 1,601 reported tokens with vision and 362 with inspected text-only regions (`profile-followup.json`), a 77.4% reduction for one matched case. This Is Fine returns the original with zero inference instead of spending 1,539 tokens to obtain the same decision. Twelve successful text-only results in the final pass averaged 346 total tokens. Known-template prompt bytes dropped 18% across 14 inputs that made a call in both passes. A broader 23% figure includes an avoided factual-request call and must not be presented as prompt compression alone. The published Gemini Flash Lite paid-tier equivalent for those twelve responses is about $0.16 per 1,000 responses, excluding gateway/retrieval/infrastructure costs; it is not a measured bill or a price guarantee. Free-tier availability and failed-attempt usage are separate. Pricing checked against [Google's official pricing](https://ai.google.dev/gemini-api/docs/pricing).

`review.html` renders the actual before/final captions with the unchanged app renderer and the inspected current geometry. The X Everywhere follow-up is explicitly substituted for the older vision result; raw inference receipts stay untouched. Rendered review found a Hindi label crossing a Two Buttons plate edge despite fitting its image box; its verified right-hand region was moved inward. Gru, Hindi, Success Kid, claim and unfamiliar-image placements were inspected. Vision placement remains provisional, and the current sample set is too small to qualify general grounding.

At the end of the initial automatic-routing evaluation, no commit, push, migration, production configuration change or deployment had been performed. The later approved shared-gateway release is recorded below. The composition Worker and Canvas Studio remain local; their hosted route and production end-to-end workflow remain unverified. Existing dirty work in this checkout was preserved.

## Gemini 3.8 pin and activation prerequisite, 2026-10-05

The owner requested Gemini 3.8 Flash explicitly. [Google's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) confirms the exact ID `gemini-3.8-flash`. The gateway source already stages that model with JSON and vision support, but `enabled: false` removes it from the routable registry. A read-only check of the live `/v1/models` listing also found no 3.8 entry.

The strict local caller was tested through the existing remote FleetGateway binding with one Drake sample. `.fleet-local/creation-eval/gemini38-probe.json` records HTTP 503, `no_candidate`, no served model and no reported usage. This is an integration availability failure, not a Gemini quality result. The gateway did not substitute Flash Lite or another provider. The 19-case results above remain historical automatic-routing results; none establish 3.8 quality, latency, truncation behavior or actual cost.

All 21 focused composition tests pass, including body/header pinning, matching model acceptance, conflicting/missing model rejection without retry, text and vision paths, quota failures and local abstention. Existing safety gates and inspected template geometry remain in use.

The one-line activation diff at `.fleet-local/creation-eval/gemini38-activation.patch` was subsequently approved and released. This enables shared routing eligibility, not just Meme Lab. The initial probe above preceded activation. The first activation pass exposed that the existing Gemini adapter did not forward `reasoning_effort`; the follow-up fix below now forwards explicit low/medium/high effort for this exact Gemini model, while preserving automatic effort and other models' defaults.

Multiple keys from the same project share limits: [Google documents quotas per project, not per API key](https://ai.google.dev/gemini-api/docs/rate-limits). The existing gateway chooses among its configured keys; no key values or billing settings were accessed. Free-tier eligibility, quota availability and actual charges are unverified for those projects. Text-only inspected profiles, pre-inference abstention and bounded requests continue to avoid unnecessary work.

## Approved gateway release and Gemini 3.8 results, 2026-10-05

The owner approved gateway activation, deployment and the 19-case comparison. The activation commit is `8989321`; `c2c4c2d` corrects the existing benchmark's enabled-registry count from 50 to 51. The deployment followed the repository's GitHub workflow; unrelated local landing edits were excluded. The current-main base also included its existing dependency security patch. The activated model retains the gateway's default 200-request daily limit; no key, secret, billing, binding, migration or runtime dependency changes were made.

The first complete 19-case pass (`gemini38.json`) yielded zero compositions, one local original/reference decision, two local no-meme decisions and 16 errors. Its first actual Gemini response reported 1,086 total tokens and `finish_reason: length` under the existing 800-token cap. Subsequent upstream 503 failures caused model cooldowns; the remaining failures cannot be treated as caption-quality results. Gateway 429 responses here also represent upstream 503 failures under its retriable-error mapping; they do not establish that Google's quota was exhausted.

The follow-up gateway fix is [commit `198a168`](https://github.com/sass-maker/free-ai/commit/198a1681f3a9fb9a36e6bf7c2312c71329f7fa4e). It carries explicit effort through routing to the actual OpenAI-compatible request only for `gemini-3.8-flash`, including streaming, with synthetic upstream regression coverage. Meme Lab requests `reasoning_effort: low` under the original 800/1,200 caps. Google's [OpenAI compatibility examples](https://ai.google.dev/gemini-api/docs/openai) document this exact combination. [CI](https://github.com/sass-maker/free-ai/actions/runs/37274839455) passed, and the [deployment](https://github.com/sass-maker/free-ai/actions/runs/37274973238) passed 393 tests and released Worker version `193f98bc-7e80-417d-8a74-b7cd1ae2210b`. Production health/models returned 200, 3.8 is enabled, and anonymous inference remains 401. Exact receipts are in `gemini38-release.json` and `gemini38-remote-smoke.json`.

The second complete 19-case pass (`gemini38-low.json`) produced two compositions, one local reference, two local no-meme results and 14 errors. Both compositions carry Gemini 3.8 and low-effort attribution and stop cleanly. A paced follow-up (`gemini38-paced.json`) checks read-only model availability and waits for cooldown before each inference request, with no retry or fallback. It completed eight cases: three compositions and five upstream failures, after about 129 seconds of admission waits. It was stopped during the next cooldown after repeated upstream 403/503 failures. This eight-case receipt is a partial follow-up, not a completed 19-case benchmark. The evaluator's optional `all paced` arguments support this admission-aware diagnostic; they do not change product retry behavior.

Five successful generated responses across the two low-effort runs cover four distinct templates: Drake, Two Buttons, Distracted Boyfriend and Success Kid. Browser rendering with the actual app renderer confirms fitting text and correct physical roles. The phone labels sit on the appropriate three people without obscuring faces. The exam caption preserves the guessed-answer-to-passing relationship more explicitly than the historical Flash Lite response. The longer right-hand button caption shrinks noticeably; the older shorter label is easier to read. The paced Drake caption adds “about the email” where no sent email was stated, an observed meaning drift. These examples are not a proven broad humor/grounding improvement. Hindi, negation, quoted-speaker, injection, Gru and vision quality remain unqualified for 3.8 because those requests failed.

The local comparison `gemini38-review.html` shows the latest successful result per input across the two low-effort passes, or the latest failure when neither succeeded, with each receipt named. This curated gallery must not be used as a pass rate. All raw pass receipts remain unchanged. Real PNG exports are `gemini38-boyfriend.png` (1,200 × 800) and `gemini38-kid.png` (500 × 500); no captions were manually substituted.

The five successful calls average 435 reported total tokens (327–746) and 6.6 seconds. The model's total token field can include thinking absent from `completion_tokens`; the paid-tier calculation uses total minus prompt tokens for output/thinking, not visible completion tokens alone. At Google's [current introductory standard prices](https://ai.google.dev/gemini-api/docs/pricing), these five calls imply about $0.69 per 1,000 successful responses if paid, excluding failures with missing usage and gateway/infrastructure costs. This is a scenario estimate, not an observed bill or a guarantee of free-tier access. The earlier $0.16 Flash Lite estimate is historical and does not apply to 3.8.

Assessment: low effort fixes the observed truncation within the existing cap, and inspected-profile placement works on the successful examples. Upstream availability is currently too poor to qualify a reliable 3.8-only product path. Next priority is provider/key-pool availability diagnosis without increasing token caps or enabling a paid fallback; broader caption-quality comparisons depend on obtaining successful calls. The shared gateway is released; Meme Lab's editor/caller changes have not been committed or deployed.

## Key-recovery preparation and template examples, 2026-10-05

The owner confirmed that the five Gemini keys belong to separate Google
projects. Their individual allowances and Gemini 3.8 access were not inspected.
Source review found that the gateway randomly selected a key per provider call,
then advanced to another model on failure. A strict model pin leaves no other
candidate, so it could fail after one upstream call without trying another key.
An upstream retriable failure also cooled the entire model immediately.

The local gateway fix preserves the two-attempt ceiling and exact model while
selecting distinct Gemini keys for pinned chat recovery. Pending key failures
remain visible in history but do not trigger immediate model cooldown; terminal
retriable failures still do. Safe logs identify pool size, key slot and upstream
status without key values or prompt content. Health writes use the Worker
execution lifetime. No key, billing, production configuration, dependency or
migration was changed. The preparation passes below used the previously
released gateway; the approved key-recovery release is recorded afterward.

Each of the eight inspected templates now has an authored short-caption example
and a bad-output boundary. Examples use situations distinct from the evaluation
cases. General guidance avoids filling in ambiguous targets and favors 2–4
words in small regions. Additional fidelity rules preserve building versus
using software, explicitly mark hypothetical Brain escalation, keep a lucky
win specific, and abstain when the requested self viewpoint only observes
someone else's action. The existing model, low thinking, 800/1,200 output caps,
one composition call and inspected geometry remain in use.

The complete 19-case template-example pass,
`gemini38-template-examples.json`, produced nine compositions, two references,
two local abstentions and six errors. Sixteen cases required inference; ten
calls succeeded. Four failures were upstream 503 and two were upstream 403;
about 174 seconds were spent waiting for cooldown admission. Successful calls
average 496 total tokens and 4.8 seconds, all attributed to Gemini 3.8 low.
Gru correctly repeats the backfire, the quoted sister keeps her own win, and
the injected command is ignored. Observed defects included Brain changing
writing an app to downloading it, Success Kid dropping the win's causal detail,
and a self viewpoint framing another actor. These motivated the final prompt
rules, rather than being counted as accepted quality results.

The final four-case `gemini38-fidelity-followup.json` produced one Drake
composition, one reference for the narrator who kept their phone, and two
upstream 403 failures. Drake retains the ambiguous target as “it” rather than
inventing an email target, but the caption remains longer than desired. Brain
and Kid's final rules remain unqualified because their follow-up calls failed.
Passing output validation and improved availability in a later pass do not
establish causal humor or reliability gains.

The first pass's successful calls imply about $0.47 per 1,000 successful
responses using Google's current introductory paid prices and total-minus-input
for output/thinking. Failed usage, infrastructure and actual project billing
remain unmeasured. The local gallery `gemini38-improvements-review.html` keeps
the latest four-case follow-up failures visible and names each receipt. It is
a rendered comparison, not an aggregate pass rate. Raw receipts are preserved.
Broader matched quality evaluation and real multi-key recovery require a
gateway release and a stable generation path. At the time of these preparation
passes the new recovery changes were local; their subsequent release is below.


## Approved key-recovery release, 2026-10-05

The gateway fix is released as [commit `cb982e0`](https://github.com/sass-maker/free-ai/commit/cb982e0575188aa2242baadcfb3e43226cffc172). [CI](https://github.com/sass-maker/free-ai/actions/runs/37283124894) passed the exact source, including the complexity gate. The [deployment workflow](https://github.com/sass-maker/free-ai/actions/runs/37283820897) passed all 407 tests and published Worker version `81db005f-ee33-45fa-bcab-4e7c640baad3`. Live health/models return 200 and anonymous inference returns 401. The deployed pool's safe logs confirm five distinct key slots. This establishes the configured count, not each project's quota, access or billing.

The local evaluator now records gateway attempt count and final upstream status. A new fixed 32-case holdout (`eval/meme_creation_holdout_v2.json`) covers four distinct situations per template, including Hindi, quoted speakers, negation, injected commands and cases that should remain references. It is separate from authored teaching examples and prior tuning cases. Its authored criteria are not human acceptance scores. The raw live receipt is `gemini38-holdout-key-recovery.json`; safe slot events are `gemini38-key-recovery-tail.jsonl`. Meme Lab's caller, prompt and editor changes remain local and undeployed.

The complete holdout produced 13 compositions, three references, one local
safety block and 15 errors. Of 31 inference requests, 16 succeeded; three
successes required recovery on a distinct second key. There were 41 upstream
attempts. All successful responses report Gemini 3.8 and low effort, average
510 total tokens and 6.5 seconds; admission waits added about 129 seconds.
The paid introductory equivalent is about $0.48 per 1,000 successful responses,
excluding unknown failed usage and infrastructure, not observed charges.

Hindi Brain preserves all four stated actions, quoted Nisha retains her own
bicycle, and the observed self viewpoint, successful Gru plan and plain Brain
story correctly remain references. Two Buttons' “Study all weekend” slightly
intensifies a quiet weekend to study; Drake labels remain longer than desired.
A harmless clutter scenario was conservatively blocked by the existing passport
keyword. No output was obtained for the last three template groups, so their
new holdout quality cannot be assessed. Human humor acceptance and rendered
holdout quality remain unverified. The actual renderer gallery is
`gemini38-holdout-review.html`, showing the original image against the raw
generated captions, errors and reference decisions without regeneration.

The safe capture, including one later known-success control, contains 43 events
matching reported attempt totals. Slots 1, 2, 3 and 5 each accepted requests;
slot 4 returned seven upstream 403s and no successes. Individual access is
suspect, but a key value, project's configuration or exact permission failure
was not inspected. The holdout later encountered 11 terminal upstream 400s
across the other slots; upstream bodies were absent, so the specific cause is
unknown. The unchanged previously successful dishwasher input also failed
in the one-case control (403 then 503), showing that failures are not confined
to a newly tested template. Request payloads were unchanged throughout.

The second-key fix is verified in production, but this run's 16/31 inference
success rate does not qualify a reliable product flow. Recommended next steps:
inspect the slot-4 project's model access, diagnose the empty-body upstream
400 responses, and retain strict pinning, low effort, inspected layouts and
the two-attempt limit. There is no evidence that larger token caps or a more
expensive model would resolve these failures. No secret, billing setting or
production configuration was accessed or changed; Meme Lab remains local.


## Automatic routing restored, 2026-10-05

The owner withdrew the Gemini model/provider pin. The local caption caller now
requests `model: auto` without force headers and accepts other served models.
Low effort, JSON mode, inferred vision requirements, the 800/1,200 output caps,
one caller request, deadline and geometry remain in use. All 21 focused
composition tests pass. This caller change has not been deployed.

A first automatic 32-case pass (`automatic-holdout-v2.json`) ran quickly enough
to hit Free AI's own per-project admission limiter: 14 requests were denied
before inference, four stopped on upstream 403 and 13 inference calls succeeded.
The limiter defaults to a burst of 10 and a refill of 20 per minute. Those
gateway denials are distinct from provider quota failures. The original receipt
is preserved rather than replaced with later successes.

The separate paced 32-case pass (`automatic-paced-holdout-v2.json`) spaces
inference starts by at least 3.2 seconds, without increasing limits, changing
client identity or retrying denied requests. All 31 inference requests were
admitted: 24 succeeded (77.4%), seven returned upstream 403 after one attempt.
The final decisions were 20 compositions, four references, one local conservative
safety block and seven errors. All successful calls were routed by Free AI to
Gemini 3.5 Flash Lite, averaging 1.2 seconds and 513 reported total tokens.
Every recorded request has model auto and no force headers. The same 32 inputs,
prompt examples, geometry and token caps were used in the earlier forced-3.8
run, which had 16/31 successful inference requests (51.6%). Time and availability
differ, so the observed difference is not a controlled causal model comparison.

Source inspection and a failing regression identify an additional gateway gap:
automatic routing aborts on upstream 403 rather than trying an alternate
provider. The local correction handles 403 like upstream 401/402, skips that
provider for the remaining attempt, preserves known safety refusals and keeps
the two-attempt budget. All 64 focused gateway tests pass. This correction is
not deployed and was not used in the live automatic passes.

The live routing snapshot contained 51 configured models, two classified
available, 31 degraded and 14 exhausted. Configured-model count is not a healthy
capacity measure. Aggregate provider figures retain up to 100 attempts per
model, including older and disabled models; the reported throttle category also
includes upstream 5xx and timeouts. Neither establishes current provider-only
rate limiting or a fair model comparison. The original snapshots are preserved
as automatic-before-models/providers/status JSON files.

A synthetic replay with the installed OpenAI SDK corrected an earlier inference:
“status code (no body)” does not establish that the actual HTTP response was
empty. Valid JSON without the expected top-level error field can lose its message
when APIError is constructed. Historical 400/403 raw response shapes and exact
project configuration remain unknown. No keys, project settings or billing were
accessed. Gateway diagnostics now document these distinctions.

Successful automatic calls imply roughly $0.23 per 1,000 successful responses at
Google's current Flash Lite standard prices, versus $0.48 for the forced-3.8
holdout. These are measured-token scenarios, excluding unknown failed usage and
infrastructure, not observed charges. Quality still needs work: Brain marks
stated final stages as hypothetical; the quoted cousin's library-card win loses
its outcome; the lucky elevator caption loses the sooner detail. The gallery
`automatic-review.html` renders raw before/after outputs with the existing app
renderer and names each receipt. New rendered quality and human humor acceptance
remain unverified. No commit, push or deployment was performed in this phase.

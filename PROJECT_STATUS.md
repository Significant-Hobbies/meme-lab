# Meme Lab project status

**Updated:** 9 October 2026
**Lifecycle:** Live meme picker and prefilled caption Studio; Anna 1.3.0 candidate prepared, public Store publication remains gated.

## Live product

### Prefilled caption Studio: website live, Anna 1.3.0 prepared

Owner-selected Canvas Studio is deployed from exact main `a555da79f615cdf630fed282f559e371bc94325f`, Worker `cfa5c248-6d05-4cb6-889e-3f3c149cb7aa`; main CI passes 215 tests. Website captions use automatic Free AI; Anna captions use one host completion and existing private-file/download APIs. No model/provider is forced. Eight inspected asset profiles preserve comic roles; 1,681 static references are eligible for the inspected/vision workflow, without a quality guarantee.

Live inspected-template and vision-caption/media checks pass. Actual Workerd regression covers the corrected redirect-mode failure. The picker smoke still degraded to `general_fallback`; upstream/ranking issue #30 remains open. Local rendered/editor/export checks and real Anna dev-host inference pass; direct hosted UI/private-download verification is unqualified.

Anna working revision 16 / frozen 1.3.0 version 1109, bundle 1040 is prepared. App status remains `pending_review`, `is_published:false`, review candidate still **1.2.1**. Release preflight blocks until administrator approval. Verify the new hosted Studio/private download before re-pinning 1.3.0; Store publication and public installation remain open in #12. [Full release receipt](artifacts/caption-release-20261005/release.md).

### Anna review correction: 1.2.1 candidate

Anna rejected 1.2.0 for a missing Store logo and a reported image-generation
failure. The existing wordmark is now uploaded as the listing logo. The image
engine normalizes both references to a bounded square canvas, maps face
coordinates into it and removes only known padding afterward. This avoids the
observed provider's aspect-ratio drift without weakening output validation or
adding automatic retries.

The owner's existing default Cloud Agent completed actual upload, generation,
private save, full reload and download. The saved download matched the original
output byte for byte (896 × 1152 PNG); both captions remained visible. One final
fixture succeeded after three deliberate diagnostic failures; this is not a
reliability rate. The reviewer's exact generic provider error remains
unreproduced. See [Cloud review evidence](anna/artifacts/personalized/cloud-review-20261004.md).
184 tests, package/catalogue checks and strict Anna validation pass.
Version 1.2.1 is prepared for re-review; public Store approval remains external.

### Anna personalized memes: 1.2.0 submitted for Store review

- Tracking: [Personalized photo memes #19](https://github.com/Significant-Hobbies/meme-lab/issues/19). Owner selected A · Reference Desk.
- Upload meme/photo, choose face, one Anna generation, original/result review, private output files, host-mediated download and native image share/fallback are implemented. No new dependencies or Cloudflare resources.
- Two whole-template model experiments produced the requested identity and preserved captions; cropped identity experiments failed. Actual route was Gemini 2.5 Flash Image. This is an AI remix, not guaranteed pixel-exact replacement.
- PR #20 is merged as main ee329fd299c7e6be6f5bbf8ef69f70693acbe1c4; PR and main CI passed (main run37009616570). Exact-source Worker deployed at100% as ee837165-3337-4776-aeae-a5a0c169f5ab. Public health reports3,000 records, updated image-retention privacy HTTP200, personalized event endpoint HTTP202 (client-reported internal smoke test, not people). Existing shared gateway and rate-limit bindings are preserved.
- Actual hosted revision10 verified requested identity with both captions, private save/reopen, real PNG disk download, canceled/confirmed removal and honest unavailable-share fallback. The first hosted prompt retained the wrong identity; the strengthened prompt corrected the same exploratory fixture. No reliability-rate or recipient-delivery claim. Responsive UI checks passed at390/768/1440; critique32/40, audit18/20 and Fleet design validator pass.
- Frozen1.2.0 version1027/bundle962:12files/117857bytes, manifest SHA256 c8fe3021f938bf4cd37272505cf604347c326e2e392620dc6743eaeeb7fa947f. It replaces1.1.0 as the pinned review candidate. Updated listing and actual hosted screenshot uploaded. Anna confirms pending_review/is_published=false and release preflight refuses publication before APPROVED. Remaining gate: Anna admin approval, then release and public Store install verification. No owner action or earnings established. Release receipt: anna/artifacts/personalized/release-receipt.json.
- Source review fixed pagination, full-width face targeting and center-preserving size controls, targeting-before-generation, sharing activation, concurrent-save deduplication and removal confirmation. Full evidence and privacy boundaries: [anna/PERSONALIZED.md](anna/PERSONALIZED.md).

### Anna sharing pilot: historical 1.1.0 review candidate (superseded)

- Tracking: [Anna monetization pilot #12](https://github.com/Significant-Hobbies/meme-lab/issues/12).
- Anna app `389` / `meme-lab` under `@significant-hobbies`: frozen version `1.1.0`, version ID `1019`, bundle ID `955`, seven files / 60,558 bytes. Bundle manifest SHA-256 `2723342aafb6a71cfe9280f2fa7410932906971b3d2b2b99e5bb725d31d6be84`. Cut from working revision 4, content hash `1ba9d7546ea620a6a0201c0a6895c47c90f7136ed288035887a6f4c045063032`. Submitted for review on 2 October; **not public in the Store**. Frozen 1.0.0 remains intact.
- Preserves Reference Desk and adds native share where supported, explicit copy and private saved reactions for every result. Saves use independent per-reference keys; only IDs/names and a last-visit day are stored in Anna. Anna’s signed-in host supplies model and personal storage access; retrieval remains public.
- Real installed Anna draft verified: five grounded ranked reactions; copy chooses the selected backup and excludes the situation; save survives a full Anna page reload; removal succeeds; explicit sincere apology abstains. Native share delivery to a recipient is unverified; tests cover cancellation and fallback. Three actual runtime screenshots are uploaded.
- Diagnostic: 30 real harness cases, assistant-authored expectations, not human ground truth. Expected reference ranked first in 19/22 reaction cases and appeared in 21/22 top-five results. Initially 7/8 serious cases abstained; an explicit sincere-apology guard corrected the miss, then 8/8 passed. One development-reload interruption was rerun, with zero final errors. The tea case returned plausible sipping GIFs but missed the fixture’s named meme; labels were not changed. This is regression evidence, not humour, retention or revenue proof.
- Anonymous allowlisted events contain only event names and are marked client-reported. They log to Cloudflare and optionally use the existing App Health integration; HTTP acceptance does not establish App Health ingestion. Anna’s native Open/Use and AI-session reporting showed one install and WAU/MAU one from owner tests with dev traffic excluded. No qualified MAU or earnings established.
- Worker `meme-lab-play` release receipt: version `3e726ecd-da97-48a8-84a6-e4023df4a87c` deployed from exact merged main `f35132adce2d9f611a10d5e68b8ffd2de05fbc84` after PR #16 and main CI passed. Owner specifically approved `ANNA_SEARCH_LIMITER`, namespace 389001: 120 requests/minute per IP and route at each Cloudflare location. Only Anna shortlist/events are limited; shared networks share admission. This is neither retrieval authentication nor a global spending cap. Public privacy updated.
- Checks: 134 repository tests, package/catalogue checks, strict Anna manifest validation, Wrangler dry-run and Fleet design validator passed. Preserve lane: critique 35/40, audit 17/20, no unresolved P0/P1. Responsive screenshots at 390/768/1440 re-render actual Anna result DOM with the bundled CSS; runtime behavior was checked separately.
- Owner approved Google sign-in, Developer Terms and a revocable 90-day official CLI token scoped to `dev.session.mint`. No credentials included in source/bundle; no production dependencies added. Owner approved source integration; PR #16 is merged and both PR/main CI passed.
- Deployment concurrency: main `7da4fe2` replaced the Anna-only deployment during testing. The final combined deployment preserves main’s shared AI/Vectorize admission and patched Undici tooling, restores Anna routes and verifies shortlist HTTP 200 / 30 references, events HTTP 202, privacy HTTP 200 after its canonical redirect. The owner approved source integration after this replacement was observed; PR #16 preserves the Anna routes in main.
- Historical release gate (superseded by1.2.0 above): Anna administrator approval, then release `1.1.0` and verify an ordinary Store installation. Clean current-main release worktree: `/tmp/meme-lab-anna-release-20261002`; original isolated integration/evaluation worktree: `/tmp/meme-lab-anna-20261002`.

- Paste one complete comment or situation and receive the best meme first, four backups, ordinal fit labels, and honest confidence.
- Multi-person comments now return distinct viewpoints where available: **My reaction**, **Their side**, and **The situation**.
- The production release contains the corrected 3,000-reference snapshot: 1,805 static memes and 1,195 usage-backed reaction GIFs, with no National Gallery artwork or inert editing canvases.
- See meme strength and image quality separately from contextual fit. Popularity and asset quality do not masquerade as relevance.
- Serious help, safety, care, grief, apology, and factual-guidance requests are guarded before humour is considered.
- One-tap feedback is retained for 30 days.

## Search and discovery

- The checkout now lives at the canonical Fleet path, `/Users/sarthak/Desktop/fleet/meme-lab`.
- The SEO build provides a server-rendered page for every one of the 3,000 meme references, plus self-referencing canonical metadata, Open Graph metadata, JSON-LD, `robots.txt`, and a 3,003-URL sitemap.
- Successful recommendations link the best match and all four backups to those stable catalogue pages. Raw submitted comments remain private 30-day feedback data and are never placed in public URLs, metadata, page source, or the sitemap.
- API and 404 responses remain explicitly `noindex`; public product and meme pages are indexable.
- Agent surfaces are complete: `llms.txt`, `llms-full.txt`, `/api/ai`, `index.md`/`collection.md`/`how-it-works.md`, per-meme `/memes/<id>.md`, and `Accept: text/markdown` negotiation on every HTML and meme route. All worker-rendered routes answer HEAD with GET parity.

## Correcting the 3,000 catalogue

- An audit found that 1,189 of the earlier 3,000 records were public-domain artworks without evidence of meme use. They are excluded from the corrected catalogue.
- The honest static baseline is 1,805 named meme templates: six blank backgrounds and empty panel layouts were removed after owner feedback.
- The replacement tranche contains 1,195 reaction GIFs. 1,194 come from the GIF Reply research dataset of 1.56 million observed conversation-to-GIF replies, with at least 108 observed uses per selected GIF. “My Name Is Jeff” is an explicit owner-requested canonical entry.
- The catalogue now records `media_type`, full media URL, preview URL, MIME type, source provenance, evidence state, and rights state. GIFs animate in results while collection cards load lighter previews.
- A checked-in 41-item canonical coverage manifest reports recognizable gaps directly instead of letting the raw count conceal them. All 41 are now covered, including the owner-requested “My Name Is Jeff,” “I Love You 3000,” Side Eyeing Chloe, and Sleeping Shaq references.
- Local Qwen writes meaning-specific message, social-dynamic, example, near-miss, and tag metadata. These annotations remain assistant-authored pending owner feedback.
- Production still uses bounded retrieval: two BGE embedding views return 30 candidates, with ten shortlist slots reserved for the original 1,000. The Worker calls TypeSafe Jev directly and independently rates all 30 with five ordered fit levels in one request. Multi-person comments batch three perspective lenses into one request, fill remaining slots with the strongest unused matches, and receive one final ordinal rescore. The UI shows fit labels rather than probabilities. If Jev is rate-limited, the Worker returns five semantic-retrieval matches marked low confidence and weak fit; it never invokes a large text-generation model.

### Free AI gateway source integration

- Issue [Free AI #83](https://github.com/sass-maker/free-ai/issues/83) migration is prepared on a clean branch. It moves the Worker BGE CLS embedding call and managed classifier requests behind the private `FREE_AI` service binding; query admission, existing candidate-ID/category validators, direct-run response contracts, and exact stored vectors remain unchanged.
- The migration replaces managed TypeSafe/classifier.dev classification with gateway `model:auto` JSON output. Jev's probability calibration cannot be preserved by this adapter; only the request intent and locally validated fit/perspective output rules are carried forward.
- This is source/CI work only. No merge, deployment, vector write, or live production behavior change is claimed.

## Evaluation

- The existing fresh 60-case shadow set remains the independent regression check: 45 humour and 15 no-meme prompts.
- Stage 3,000 keeps the 60-case independent shadow set and replaces the invalid artwork-specific slice with 30 GIF-focused humour cases plus 10 no-meme cases.
- Prior stage-3,000 metrics are invalidated because they evaluated the removed artwork records. New retrieval and ranking results must be generated after the corrected Vectorize index is seeded.
- Labels are assistant-authored and not human validated. Metrics are directional until owner feedback accumulates.
- A focused 14-case routing set now covers multi-person situations, quoted first-person speech, inanimate pronouns, and negation. It checks when perspective mode should and should not run; the labels remain assistant-authored pending owner review.
- A corrected 12-case hard-ranking set compares five scoring strategies across 101 unique candidate pairs. Blind model review selected rich ordinal Jev: exact first choices improved from 7/12 to 9/12 and the best returned candidate ranked first on 10/12 rather than 7/12. This evidence is independent of scorer output but is not human ground truth.
- A focused 22-case canonical-gap diagnostic now separates data, retrieval, safety, provider, ranking, and ordering failures. After adding the two missing records, improving eight weak family variants, narrowing two over-broad safety phrases, and re-indexing only affected vectors, retrieval recall@30 improved from 15/22 to 22/22, final recall@5 from 14/22 to 22/22, and exact top-one from 11/22 to 17/22. Five remaining cases are ordering disagreements with the expected meme still in positions 2–4. These labels are assistant-authored and not human ground truth.
- “I Love You 3000” now ranks first for “When I want to say I love you” from its catalogue meaning and embeddings; the temporary phrase-specific runtime pin has been removed.
- Release proof requires 3,000 catalogue records, 6,000 indexed vectors, passing package checks, a healthy public route, and browser verification.

## Next stage

- Continue owner review of the fresh 100-case stage-3,000 evaluation and use production feedback to improve the weakest GIF metadata.
- Convert the focused canonical set into owner-labelled evaluation data and use feedback to resolve the five remaining ordering disagreements.
- The next catalogue expansion is GIF-first, not a standalone movie-dialogue corpus. Cornell dialogue remains research/evaluation material and is not a production source.
- A 5,000-GIF staging pool is now built from the full official GIF Reply exports. It contains 4,134 entries not present in the earlier 1,189-record source set, requires at least ten observed reply uses, has no exact record, media, or dataset-GIF-ID duplicates, and caps identical semantic buckets at eight.
- The staging pool is deliberately not live yet. A browser-measured 63-GIF stratified sample found 10 assets (15.9%) below the 320-by-180-equivalent release floor, one timed-out asset, and both visible watermarks and genuinely strong tail entries. Every new record now has an unknown asset-quality score, a pending visual-quality status, and `production_eligible: false`; no record can enter production until measured. The 120-record review sample remains owner-unvalidated, and 4,134 net-new records still need meaning-specific full-sentence retrieval metadata before release qualification.
- A focused curation pass visually inspected seven distinct candidates, checked their actual GIF dimensions and reaction meaning, and replaced seven live records whose names and retrieval descriptions were watermark text or broken OCR. The generated catalogue remains exactly 3,000 records. These seven changes landed on main on 9 October 2026 but are not deployed. The next Worker deploy must be paired with a vector update: embed and upsert the seven new records and delete the seven replaced IDs' vectors (the release proof still requires 6,000 vectors). Retrieval already skips vector matches whose IDs are absent from the catalogue, so a Worker-only deploy degrades gracefully rather than failing.
- Dialogue research tooling (Cornell and Wikiquote acquisition, cross-source linking, local screening and memorability evaluation) is in the repository. The third-party corpora and every derived dialogue dataset stay local and gitignored, consistent with `docs/dialogue-review.md`.

Tracking: [public beta #1](https://github.com/sarthakagrawal927/meme-lab/issues/1), [catalogue expansion #2](https://github.com/sarthakagrawal927/meme-lab/issues/2), [verified meme and GIF rebuild #4](https://github.com/sarthakagrawal927/meme-lab/issues/4), [canonical retrieval gaps #5](https://github.com/sarthakagrawal927/meme-lab/issues/5), [crawlable catalogue #6](https://github.com/sarthakagrawal927/meme-lab/issues/6).

- 2 October follow-up: real APS upload/list/byte-retrieval/conditional removal passed through the official CLI harness without restarting Codex. Fixed its exact-path removal response compatibility; 149 tests pass. Hosted generation and disk-download proof subsequently passed; see anna/PERSONALIZED.md.

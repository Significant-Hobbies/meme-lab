# Meme Lab project status

**Updated:** 2 October 2026
**Lifecycle:** Live personal meme picker with the corrected 3,000-item meme-and-GIF catalogue and crawlable catalogue pages.

## Live product

### Anna personalized memes: working draft, verification pending

- Tracking: [Personalized photo memes #19](https://github.com/Significant-Hobbies/meme-lab/issues/19). Owner selected A · Reference Desk.
- Upload meme/photo, choose face, one Anna generation, original/result review, private output files, host-mediated download and native image share/fallback are implemented. No new dependencies or Cloudflare resources.
- Two whole-template model experiments produced the requested identity and preserved captions; cropped identity experiments failed. Actual route was Gemini 2.5 Flash Image. This is an AI remix, not guaranteed pixel-exact replacement.
- Mutable Anna draft uploaded at revision 5; further review corrections require another upload. Frozen 1.1.0 remains pending review and unchanged.
- Hosted editor rendering, real image retrieval, persistence, download and removal remain unverified because the browser automation connection failed. Do not submit this feature or mark design checks complete until those pass.
- Source review fixed library pagination, adjacent face controls, sharing activation and concurrent-save deduplication. Full evidence and privacy boundaries: [anna/PERSONALIZED.md](anna/PERSONALIZED.md).

### Anna sharing pilot: version 1.1.0 pending review

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
- Remaining external gate: Anna administrator approval, then release `1.1.0` and verify an ordinary Store installation. Clean current-main release worktree: `/tmp/meme-lab-anna-release-20261002`; original isolated integration/evaluation worktree: `/tmp/meme-lab-anna-20261002`.

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
- At 30,000, add movie-dialogue reactions as a separate corpus and route each input to meme, dialogue, or none before corpus-specific retrieval.

Tracking: [public beta #1](https://github.com/sarthakagrawal927/meme-lab/issues/1), [catalogue expansion #2](https://github.com/sarthakagrawal927/meme-lab/issues/2), [verified meme and GIF rebuild #4](https://github.com/sarthakagrawal927/meme-lab/issues/4), [canonical retrieval gaps #5](https://github.com/sarthakagrawal927/meme-lab/issues/5), [crawlable catalogue #6](https://github.com/sarthakagrawal927/meme-lab/issues/6).

# Meme Lab on Anna

Tracking: [#12](https://github.com/Significant-Hobbies/meme-lab/issues/12).

This edition preserves the existing Reference Desk interface. It calls the existing Meme Lab semantic index through `/api/anna/shortlist`, then uses Anna's `llm.complete` for grounded contextual ranking. It requires no Executa agent, provider credentials, additional runtime dependencies. It uses Anna’s default private per-user app storage for saved reference IDs/names and a last-visit day.

## Build and check

From the repository root:

```sh
npm run build:anna
node --test tests/anna.test.mjs
```

From `anna/`, use the official pinned CLI:

```sh
npm exec --yes --package=@anna-ai/cli@0.1.57 -- anna-app validate --strict
```

The generated `bundle/` is the only UI upload directory. Never upload repository scratch, feedback data, credentials, or unrelated catalogue-acquisition files.

## Reviewer walkthrough

1. Install/open Meme Lab inside Anna. Enable its LLM access and select a supported AI provider or Anna credits.
2. Use the flashlight example or describe an ordinary funny situation. The app retrieves up to 30 real catalogue records, independently rates their fit through Anna, and shows one best result plus four backups when available.
3. Try the coworker/follow-up meeting example. Perspective labels appear when the model finds supported distinct angles.
4. Use the condolence example. The app should return no meme, with a sincere abstention reason.
5. Open a result title/source. It opens a public reference/source page. Preview failures fall back to text without breaking the ranked result.
6. Share or copy a reference link from the best result or any backup. It contains the reference ID, never the submitted situation. If clipboard access is unavailable, use the result-title link.
7. Save a reference, reload the app, and confirm it remains in Saved reactions. Removing a saved reference updates the card’s Save state. Situations are never saved.
8. Remove AI permission or exhaust quota. The app should show a recoverable error, with no fallback provider spend.

The model judges fit, not a probability. Static catalogue signals remain separate. No generated ranking explanations or caption editor, verified redistribution-rights claim, or guarantee of humour.

## Privacy and rights

Public disclosure: https://memes.significanthobbies.com/anna-privacy.html

- Submitted situations go to the existing Meme Lab Worker for semantic retrieval, and to the user's Anna-configured provider for contextual ranking.
- The new search endpoint does not persist comments or write feedback. Anna/provider processing and retention follow those services' policies; do not describe them as zero-retention.
- The bundle does not request conversation history, credentials, camera, microphone or cross-app storage. It requests private app storage for saved reactions, own-app file operations for generated outputs, explicit image uploads and image generation.
- Remote previews come from Imgflip, Memegen or Giphy. Source provenance and conversational usage evidence do not establish redistribution rights. Result sharing links to the public reference/source rather than uploading media copies.
- The existing public website has its own 30-day feedback retention; opening that website and using its composer is a separate workflow.

## Publication

Authenticate with the official CLI's device flow or use Developer Console. New developer activation requires accepting Anna's Developer Terms. Do not accept terms or create persistent publish credentials without the owner's confirmation. Fill listing metadata from `app.json`, upload real screenshots, validate and test the installed draft, cut version `1.0.0`, and submit it for review. `PENDING_REVIEW` is not live. After admin approval, release the approved version and verify the public Store page.

## Current release evidence

On 2 October 2026, app `389` (`meme-lab`) under `@significant-hobbies` was uploaded, installed, tested inside Anna, and submitted for review as version `1.0.0` (version ID `1011`, bundle ID `948`). Its status is `pending_review`, not Store-live.

Real runtime checks covered five ranked references with media previews, comment-free clipboard sharing, and sincere condolence abstention. Model fit judgments remain unvalidated beyond these smoke checks. Listing screenshots in `artifacts/anna-real-*.jpg` show actual installed Anna runtime.

After administrator approval, use the official CLI from this directory:

```sh
npm exec --yes --package=@anna-ai/cli@0.1.57 -- anna-app apps status meme-lab --json
npm exec --yes --package=@anna-ai/cli@0.1.57 -- anna-app apps release 1.2.0 --json
```

Verify Store visibility and an ordinary user's install after release. Do not replace the frozen bundle without cutting and reviewing a new version. No earnings are established by an install or review submission.

## Sharing pilot, 1.1.0

The new candidate adds per-reference native share (when supported), an explicit copy action, and private saved reactions. Every favourite has its own storage key, preventing concurrent saves of different reactions from replacing one another. Storage failures do not claim success. Saved entries are validated IDs/names, capped to a 50-entry displayed library, with source links rather than copied media.

Anonymous interaction events contain only an allowlisted event name. The Worker rejects extra fields and marks these as client-reported counts. Existing App Health delivery is optional/configuration dependent; an accepted HTTP event does not prove ingestion. Anna’s native Open/Use and AI-session dashboard is separate. On 2 October it showed one install and WAU/MAU of one from owner testing, with dev traffic excluded; no qualified audience or earnings are established.

The owner explicitly approved and deployed `ANNA_SEARCH_LIMITER`: 120 requests/minute per IP and route at each Cloudflare location, namespace 389001. It covers only Anna shortlist and interaction events. Shared-IP users share admission. It is not authentication, a globally exact quota, or a spending cap. Worker release receipt: version `3e726ecd-da97-48a8-84a6-e4023df4a87c` deployed from exact merged main `f35132adce2d9f611a10d5e68b8ffd2de05fbc84` after PR #16 passed PR/main CI.

Replay the recorded model diagnostic with `node scripts/summarize-anna-eval.mjs`. The 30 expected cases are assistant-authored and not human validated. Real model outcomes are recorded separately in `artifacts/evaluation-live.json`; the comparison is a regression diagnostic, not proof of humour, retention or monetization.

Version 1.1.0 was frozen on 2 October 2026 as version ID 1019, bundle ID 955, seven files / 60,558 bytes, bundle manifest SHA-256 `2723342aafb6a71cfe9280f2fa7410932906971b3d2b2b99e5bb725d31d6be84`. It supersedes 1.0.0 as the review candidate after re-submission. Release 1.1.0 only after administrator approval; pending review is not Store availability.

The recorded diagnostic reached 19/22 expected top-one and 21/22 top-five references. Initially 7/8 serious prompts abstained; the sincere-apology miss was corrected by an explicit request-type guard and retested, giving 8/8. The pre-fix evidence remains separate. One interrupted development reload was rerun. No labels were changed. The strict tea-reference miss remains recorded.

## Current personalized candidate1.2.0

Version1.2.0 supersedes the historical candidates above and is pinned for Anna review. It adds Make this me: a permitted static meme/photo, face selection, one generation, original/result comparison, private output library and PNG download/share fallback. Hosted runtime verification passed; see PERSONALIZED.md and artifacts/personalized/release-receipt.json. Review acceptance is required before release. No Store availability or qualified earnings claimed.

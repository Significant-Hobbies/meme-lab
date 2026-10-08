# Public picker failure, 2026-10-04

The public picker intermittently failed at ranking even though the landing page,
health endpoint and semantic retrieval were available. The repair was published
in PR #28 and deployed. Live verification then identified the inherited
five-second ranking deadline as another source of degraded results; PR #29
raises only ranking's deadline to a bounded 15 seconds.

## Verified production evidence

- Before repair, Worker `meme-lab-play` served version
  `5c13b6f1-4922-4364-9596-be5b0d7e97e4` at 100%, tagged to
  `2daa69e13a7b29b0d4dfd9ea5852a9551b20034c`.
- `/api/health` returns 200 and `{status:"ok",catalogue:3000}`. It only counts
  the bundled catalogue; it does not check retrieval or inference.
- `/api/anna/shortlist` returned 30 candidates for the synthetic fridge comment.
- `/api/recommend` returned both 503 and successful ranked results for the same
  synthetic input. Filtered Worker logs identify `Classifier returned HTTP 502.`
  for the failed ranking calls. The gateway's underlying provider failure was
  not exposed by those logs; a specific provider cause is unverified.
- The managed adapter rejects more than eight labels, while perspective ranking
  sends one label per candidate in the 30-item shortlist. Production logs show
  `Classifier input is outside the supported bounds.` followed by general
  fallback. The HTTP response remains 200 without the requested perspectives.
- A read-only App Health aggregate query during this investigation showed nine
  `/api/recommend` requests and four errors. These diagnostic requests are not
  evidence of organic user traffic. HTTP failures are being received.
- App Health's shared health-state policy returns `insufficient-data` below
  20 requests. Nine requests cannot produce a degraded/unhealthy health state,
  even when four fail. The new explicit failure/degradation events and functional
  probe do not depend on reaching that classification threshold.
- App Health's application-log query for the same day showed only
  `form.submitted` and `recommendation.created`, with no picker failure event.
  The browser catches picker exceptions and renders their message without
  emitting a log. Successful general fallback is also logged as `status:ok`.
- The canonical site probe uses `/`. Repository CI runs offline checks only,
  with no scheduled production picker request. Neither catches a ranking outage.

## Repair

- Extract the managed classifier adapter and allow the supported 30-label
  perspective request, retaining strict response validation.
- Retry gateway HTTP 500/502/503/504 once within the existing abort deadline.
  Keep gateway attribution and budget admission; do not retry 429 or invalid
  structured output.
- On a persistent transient ranking outage, use the existing semantic fallback
  with low confidence and weak fit labels. Expose `degraded` and `ranking_mode`.
  Invalid model output stays an error; serious-input safety failures abstain.
- Emit `endpoint.failed` for terminal server errors and
  `recommendation.degraded` for fallbacks/safety-check outages to structured
  Worker logs and the existing App Health log sink. Missing ingest configuration
  emits an explicit warning. Events contain fixed route/status/mode/duration
  fields, without comments, error bodies, credentials or user identity.
- Report caught browser failures and degraded responses through the existing
  public App Health logger.
- Add an hourly GitHub Actions functional probe and manual trigger. It tests
  five ranked results plus distinct self/other/situation perspectives and fails
  on HTTP 200 degradation. Activation requires publishing the workflow on main;
  the workflow is active on main. Its first manual production run passed both
  cases. Scheduled execution and notification delivery are not yet verified.

## Validation and release boundary

- Full local suite: 145 tests passed; `npm run check` passed.
- Final affected local suites: 55 tests passed.
- Exact production-source candidate: 57 Worker, endpoint-telemetry and incident
  regression tests passed. Its patch passes `git apply --check --cached` against
  a separate verification index containing the deployed commit.
- Browser diff was checked to contain only the five added telemetry lines.
  There are no layout, styling or product-direction changes.
- The new probe was run against unchanged production. General ranking passed
  on that attempt; the perspective case failed despite HTTP 200. This validates
  detection of the reproduced blind spot, not the candidate's live release.
- Existing unrelated dirty checkout changes were preserved. No secrets,
  production configurations, dependencies, resources or database schema were
  changed. The workspace manager rejected a new worktree because all eight
  writer slots were occupied. Source fixtures under `.fleet-local` are test
  artifacts, without a new Git checkout or dependency install.

The reviewable patch is
`.fleet-local/production-picker-20261004/fix.patch`, based on the exact deployed
commit. Its SHA-256 is
`df65c6cd77410f16d084c98bca10f5cd5a368234af71a46e227c9757af8ba849`.
The owner authorized completing the production repair after reviewing the
prepared change. Unrelated dirty source remains preserved in the primary
checkout; release archives use exact committed source and existing tooling.

## Release evidence

- PR #28: https://github.com/Significant-Hobbies/meme-lab/pull/28
  merged as `847af8011ed9f0ca194282c1f3cf85f3b8860e97`.
  Main CI run `37177158563` passed. The release archive passed 164 tests,
  production build, checks and Wrangler dry run; all 353 tracked files matched
  the exact commit before and after the build.
- Cloudflare deployed that commit at 100% as version
  `ea53bd0c-03bf-4023-8f0e-a46256b40186` at 04:34 UTC.
- Manual production workflow run `37177528777` passed both fixtures:
  https://github.com/Significant-Hobbies/meme-lab/actions/runs/37177528777
- A real browser submission returned five results, all previews loaded, with
  my reaction, their side and the situation represented. Screenshot retained at
  `.fleet-local/production-picker-20261004/live-picker.jpg`.
- Local live probes still encountered general-ranking timeouts with HTTP 200
  retrieval fallback; the strict probe correctly failed those attempts.
  Worker tail showed an aborted five-second deadline. App Health received
  `recommendation.degraded` with `ranking_mode:retrieval_fallback` at 04:37 UTC.
  The underlying provider's 502 cause remains unverified.
- PR #29: https://github.com/Significant-Hobbies/meme-lab/pull/29
  merged as `512eaafe4163092fbab71903e1cdbba380812c65`.
  54 targeted tests and main CI run `37177790339` passed. Safety-gate deadlines
  remain unchanged; ranking and general fallback get the 15-second deadline.
  Deployed at 100% as version `c5c5795d-b9ca-4e16-8df2-2bf17094e452`,
  deployment `a8819ffa-9466-4ba9-8521-22e12347c4b8`, at 04:49:57 UTC.
- Final local production probe passed both fixtures without degradation:
  general ranking took 10,538 ms and perspectives 4,209 ms. The browser's
  general fixture returned five loaded previews. Final screenshot:
  `.fleet-local/production-picker-20261004/final-live-picker.jpg`.
- Final hosted production probe `37178160043` passed general ranking but
  detected a transient perspective retrieval fallback, despite HTTP 200:
  https://github.com/Significant-Hobbies/meme-lab/actions/runs/37178160043
  The matching degradation warning reached App Health at 04:50:49 UTC.
  This confirms active detection, and does not establish fully healthy routing.
- Read-only gateway routing rollups for this project on 2026-10-04 showed
  32 successful Gemini `gemini-3.5-flash-lite` hops and eight failed hops,
  with OpenRouter in the exhausted-quota signature. These include diagnostic
  requests and are not organic usage counts. The specific Gemini failure cause
  remains unverified; no provider credentials or production settings were changed.
- Remaining upstream cause and scheduled notification delivery are tracked at
  https://github.com/Significant-Hobbies/meme-lab/issues/30.
- Final source matched all 353 tracked files. The only change from the initially
  built and dry-run-validated release was `worker/src/index.mjs`; Wrangler
  confirmed no updated public assets. Final main CI validated checks and tests.
  A redundant local rebuild could not acquire the shared registry lock, so it
  is not claimed. The deployment used the existing Wrangler CLI normally.
- Workspace closeout review completed in dry-run mode; no workspaces changed.
- Canonical deployment metadata now records the exact final SHA, version,
  100% traffic and `deployed-mitigated-provider-degraded` state. Its generated
  operations view was refreshed and passed its check; all 76 dossiers were
  regenerated from the current canonical catalog and retained observation state,
  preserving owner narratives. The full catalog sync stopped on an unrelated
  capture-policy cohort-order mismatch; that policy was not changed.

The durable final receipt is
`.fleet-local/production-picker-20261004/final-release-receipt.json`.
The release is recorded as `deployed-mitigated-provider-degraded`, not fully
healthy. The picker is usable during transient ranking failures, and those
failures are now observable. User data, unrelated local changes and production
configuration were preserved.

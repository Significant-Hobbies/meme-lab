# Local Wikiquote dialogue review

Issue #8's owner review is a local research tool. It does not publish dialogue
or promote it into production retrieval. The existing meme review stays available
through the dataset selector.

## Prepare and review

Keep the Wikiquote pilot private at `.fleet-local/dialogue8/wikiquote-pilot.jsonl`.
From the repository root:

```sh
node scripts/build-dialogue-quality-eval.mjs
node scripts/start-dialogue-review.mjs
```

Open the printed localhost URL. The builder selects 200 source lines from 200
distinct films using a stable hash of each source ID. It preserves exact quote,
film, speaker and Wikiquote revision provenance. Explicit input and output paths
may be supplied as the builder's first and second arguments.

The recovered pilot's SHA-256 is
`871f3486325b7070176084a133349057e1829484ded44eefa9d8538bfa3516fb`.
Its generated sample SHA-256 is
`b00be9d113d4a66d6db7acb9d32bf1f06633d9a8138df90ece515714c62f8c80`.
The builder prints both hashes so a changed input is visible.

## Label, resume and export

Select sendability, standalone usefulness and line strength before saving.
Film, speaker and source remain visible; structural screening priors stay hidden.
Each save writes an immutable owner event under `runs/`; the latest event for
each case determines progress when the server restarts. Export is available at
any point and includes counts, all 200 cases, and the latest review or null.

The recovered sample starts at **0/200 owner labels**. Browser/test labels use
separate temporary stores and are not owner judgments. Unreviewed records remain
unvalidated and ineligible for production. Model prelabels were not recovered,
so the report explicitly says they are unavailable and reports no model accuracy.

Keep the pilot, sample, labels and exports private. The starter binds to localhost
and does not load environment files, configure a model or make provider requests.
Normal local access protections still apply.

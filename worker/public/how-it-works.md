# Meme Lab — How it works

Canonical URL: https://memes.significanthobbies.com/how-it-works

## Retrieval

- Each of the 3,000 catalogue records is embedded twice with BGE embeddings on Cloudflare: a **meaning** view and an **example** view.
- A submitted comment is embedded once and queried against both views; reciprocal-rank fusion merges the lists while 10 of the 30 shortlist slots are reserved for the original core set.

## Ranking

- The Worker calls TypeSafe Jev directly and rates all 30 candidates on five ordered fit levels in one request.
- Scores become public ordinal fit labels (exact / strong / plausible / weak). Static signals — meme strength and image quality — are shown separately and never stand in for contextual fit.
- If the scorer is rate-limited, the Worker returns five semantic-retrieval matches marked low confidence and weak fit; it never substitutes a large text-generation model.

## Multi-person comments

When a comment involves more than one person, three lenses run in a single pass — **My reaction**, **Their side**, **The situation** — remaining slots are filled with the strongest unused matches, and a final ordinal rescore orders the result.

## Safety gate

Serious help, safety, care, grief, apology, and factual-guidance requests are detected before humour is considered and answered with an explicit abstain rather than a meme.

## Evaluation

- A fresh 60-case shadow set (45 humour, 15 no-meme) is the independent regression check.
- A 14-case routing set covers multi-person situations, quoted first-person speech, and negation.
- A 22-case canonical-gap diagnostic separates data, retrieval, safety, provider, ranking, and ordering failures.
- All labels are assistant-authored; metrics are directional until owner feedback accumulates.

## Feedback

One-tap verdicts are stored in D1 for 30 days and pruned by a daily cron. Raw comments remain private and never appear in public pages or the sitemap.

Home: https://memes.significanthobbies.com/ · Collection: https://memes.significanthobbies.com/collection · Agent catalog: https://memes.significanthobbies.com/api/ai

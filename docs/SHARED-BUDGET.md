# Shared retrieval budget

Meme Lab uses Free AI gateway issue #80 admission before any embedding, Vectorize query, classifier, or recommendation write. It binds the existing exported `NeuronBudgetDO` from `free-ai-gateway` as `NEURON_BUDGET`, using the account-shared `global-budget` object. No new credentials, database schema, dependency or model change is required.

The consumer reserves five possible 768-dimensional Vectorize queries, including the metadata fallback, then reserves embedding neurons using UTF-8 bytes plus 32 framing tokens and a 20 percent margin on the published bge-base rate of 6,058 neurons per million tokens (Cloudflare Workers AI pricing checked 2026-10-02). Failed work is not refunded.

A missing binding, failed HTTP call, exhausted quota, stale period, or malformed response returns 503 with Retry-After 60. This happens before paid retrieval work. Existing catalogue and static routes stay available.

## Release order

Deploy the qualified Free AI budget producer first. The monthly Vectorize budget must have a verified account baseline, including stored corpus dimensions and other usage, before admission is enabled. Do not seed an assumed zero or reset historical spend. Validate provider usage and the complete consumer inventory before claiming coverage.

The shared admission control is not a Cloudflare billing cap. It does not cover manual calls, uninstrumented consumers, Workers requests, R2, D1, Images or Stream. Real users do not automatically raise the budget.

References: https://github.com/sass-maker/free-ai/issues/80; https://developers.cloudflare.com/workers-ai/platform/pricing/; https://developers.cloudflare.com/vectorize/platform/pricing/; https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects

# Shared retrieval budget

Meme Lab uses the private Free AI `FleetGateway` service binding for production BGE embeddings and binds the existing exported `NeuronBudgetDO` as `NEURON_BUDGET` for Vectorize query admission. The gateway reserves Workers AI neurons centrally before invoking BGE; the consumer must not debit neurons a second time. Both use the account-shared `global-budget` object.

The consumer reserves five possible 768-dimensional Vectorize queries, including the metadata fallback. The native gateway call preserves `pooling: "cls"` for the existing index coordinates. Failed work is not refunded.

A missing binding, failed HTTP call, exhausted quota, stale period, or malformed response returns 503 with Retry-After 60. This happens before paid retrieval work. Existing catalogue and static routes stay available.

## Release order

Deploy the qualified Free AI budget producer first. The monthly Vectorize budget must have a verified account baseline, including stored corpus dimensions and other usage, before admission is enabled. Do not seed an assumed zero or reset historical spend. Validate provider usage and the complete consumer inventory before claiming coverage.

The shared admission control is not a Cloudflare billing cap. It does not cover manual calls, uninstrumented consumers, Workers requests, R2, D1, Images or Stream. Real users do not automatically raise the budget.

References: https://github.com/sass-maker/free-ai/issues/80; https://developers.cloudflare.com/workers-ai/platform/pricing/; https://developers.cloudflare.com/vectorize/platform/pricing/; https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects

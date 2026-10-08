# Meme Lab product contract

Meme Lab turns one pasted comment or situation into a useful meme immediately.

## Audience and outcome

The first user is the owner, but the playground is public for lightweight feedback. The best match appears first, followed by four scored backups. When a comment contains both a narrator and another participant, the system looks independently for the narrator's reaction, the other person's side, and the situation itself, then fills the remaining backup slots with the strongest unused matches. Weak backups stay visible with honestly low scores. A low-confidence best match stays visibly low confidence, while a serious or genuinely mismatched input gets no meme.

## Product behavior

The corrected catalogue contains 3,000 searchable references: 1,805 static meme templates and 1,195 usage-backed reaction GIFs. Arbitrary artwork, empty editing canvases, and decorative backgrounds are not counted as meme coverage. Every reference has a specific meaning, social dynamic, example, near-miss, provenance, media type and state, meme-strength score, and asset-quality score.

Runtime ranking is deliberately bounded:

1. Two semantic searches retrieve 30 likely references.
2. Direct TypeSafe Jev independently rates all 30 candidates as wrong, weak, plausible, strong, or exact in one structured request. Multi-person comments first select distinct candidates through three explicit lenses—**My reaction**, **Their side**, and **The situation**—in one batched request, then rate the selected five on the same ordinal scale.
3. Static meme strength and image quality remain separate catalogue signals; they are not presented as contextual relevance.
4. The primary result and four ranked backups remain visible even when some options are weak. The UI shows ordinal fit labels rather than presenting Jev's competitive score as a probability.
5. Feedback records whether the recommendation landed or missed. There is no generated explanation or large-model fallback. If Jev is rate-limited, the product returns five semantic-retrieval candidates marked low confidence instead of creating surprise inference spend.

## Evidence boundary

### Canvas Studio creation (working tree)

After matching, supported static references open in the owner-selected Canvas Studio with situation-specific captions and automatic placement. The existing ranking and serious-content abstention remain separate. Seven exact source assets have inspected role/region profiles: Drake, Two Buttons, Distracted Boyfriend, Gru’s Plan, Expanding Brain, Change My Mind and Success Kid. Their geometry is deterministic; captions fill template-specific roles rather than generic top/bottom slots. Gru’s realization panel repeats the failing step. Other allowlisted static assets use one visual-analysis request to assign caption roles and normalized regions, explicitly labelled AI placement for review. Already-captioned or unsuitable images can remain reference results; GIFs retain their animation.

Text layers are editable, movable and resizable with pointer, keyboard or numeric controls. Text fitting preserves whole words before reducing to grapheme wrapping. Preview and original-resolution PNG export share one renderer; selection handles stay outside the exported pixels. Unfit, empty or off-image text blocks export instead of silently clipping it.

Caption generation makes one attributed request through the existing budgeted Free AI service binding, with bounded input/output and no direct paid-provider fallback. Source media comes only from fixed allowlisted catalogue raster URLs through a bounded same-origin fetch. Draft situations and captions are not written to D1 by the creation endpoint; the existing recommendation feedback retention remains 30 days. AI-provider processing remains separate from local draft storage.

This feature is implemented locally and has not been deployed by this task. Structural/API tests and browser/editor/export evidence use model fixtures; they do not establish live model caption quality or vision placement correctness across the catalogue. Live inference and hosted creation must be qualified before release claims.

### Anna edition

The owner-approved Anna pilot preserves the Reference Desk UI and semantic retrieval. A stateless shortlist endpoint retrieves up to 30 catalogue references; Anna's user-configured LLM independently rates them and selects one primary result and four backups. This is a separate runtime from the public website's Jev ranking. It uses a bounded completion, validates every returned catalogue ID and ordinal rating, and reports permission/quota/provider failures without another paid provider fallback. Wrong backups retain their actual label. Comments are not stored by the shortlist endpoint or included in shared reference links; Anna and model-provider processing follow their own policies. The sharing pilot saves reference IDs/names and a last-visit day in Anna’s private per-user app storage, never situations. Each reference has its own storage key so saves in different windows do not overwrite one another. All five reactions offer share/copy and save actions. Anonymous allowlisted interaction events support experiment measurement; they are unverified client counts, not people or revenue. Anna supplies signed-in host model/storage access; retrieval remains public with a scoped 120-per-minute IP-and-route admission limit per Cloudflare location, not authentication or a global spending cap. Store publication requires account activation, an installed-app live test and administrator approval; a prepared local bundle is not a published app.

Catalogue metadata, strength, quality, uniqueness, and evaluation labels are model-authored unless explicitly marked otherwise. They are useful engineering evidence, not human-validated cultural truth. Reaction popularity comes from observed conversational use; media provenance and rights state remain separate, and usage evidence does not imply redistribution permission.

## Next decision

Improve ranking from live misses and the 100-case evaluation set. Once the 3,000-meme pipeline is stable, expand toward 30,000 reactions with movie dialogue as a separate routed corpus.

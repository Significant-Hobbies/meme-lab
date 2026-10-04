# Meme Lab visual direction comparison

Owner brief: “and can we artleast try tio beautify it?” followed by
“why do we have different available features? do u think its a good design”.
This is an overhaul comparison, awaiting explicit owner selection. It does not
alter production UI, the frozen Anna 1.2.1 review candidate, runtime access or
the existing design decision archive. Implementation preflight and final
review/check remain pending until selection.

## Product and scope

Meme Lab helps people choosing reactions for everyday conversations find a
fitting meme through a 3,000-reference catalogue and contextual AI ranking.
The public website is both entry and operating surface, not a separate
marketing landing page. Its core action remains Find the meme.
Anna additionally supports permitted photo/template uploads, face targeting,
one host image request and private output saves/downloads.

Authority: PRODUCT.md and DESIGN.md at main 6f020b11952c93620c349dd8d1b2a2fcf95341fa;
canonical purpose: saas-maker/catalog/projects.json,
projects[meme-lab].presentation.directory.purposeContract.
The canonical Anna version note is stale (1.2.0 versus resubmitted 1.2.1);
the audience/outcome/mechanism remain consistent. Refresh version metadata
before a future landing approval rather than claiming the existing snapshot
establishes release state.

Both editions use the same repository and shortlist infrastructure. Anna-only
model and file adapters explain current feature differences; this is a pilot
boundary, not the desired permanent consumer split. Later website photo support
requires account, image-provider, storage and usage-cost decisions. These
previews do not pretend that service work has shipped.

Surfaces: https://memes.significanthobbies.com (public entry/picker) and Anna
Dashboard app389 (signed-in photo editor). New before evidence captures the
actual public website, while the retained hosted editor screenshot records the
current Anna surface. Both must retain their privacy/access distinctions.

## Quality bar and references

Put the actual meme ahead of form chrome. Controls should be compact but readable,
and original/result comparison should be immediate. Keep vocabulary and identity
consistent across editions. Preserve consent, honest quota/retention, visible
review before export, no automatic generation and sincere abstention.
Avoid decorative doodles, generic dashboard statistics, fake social proof,
oversized upload panels and a generic template-gallery composition.

Primary pages read on 4 October 2026:

- https://imgflip.com/memegenerator: direct canvas/customization/export vocabulary
  supports a task-first editor. Avoid its competing advanced controls, ads and
  treating every source-preview image as an authorized editing template.
- https://www.photopea.com/: the editor is the destination, with direct entry
  rather than account/dashboard ceremony. Avoid its broad professional toolbox
  and any implication that Meme Lab's model calls are fully local.
- https://www.are.na/: collection vocabulary and content grouping support a
  restrained reference tool. Avoid copying its community proposition or
  suggesting algorithm-free matching.

These are principles from the primary pages, not copied styling or source.
Anti-reference: the current Meme Lab editor's large upload/form surfaces compete
with the small meme canvases. A generic SaaS dashboard would add noise without
helping users select a reaction or review a personal image.

## A: Studio — recommended

Audience/job: fast repeat use, choose a reaction or finish a personal meme.
Thesis: a quiet navy/white/cobalt workspace; images carry personality.
Layout: website pairs proposition with an immediate comment field; compact
catalogue rows below. Editor has a narrow left tool rail and equal before/after
canvases, with review/export directly underneath.
Typography: system sans, strong compact headings and restrained metadata.
Color: navy identity/text, cobalt primary action/focus, pale neutral image mats.
Interaction: keep inputs and face targeting adjacent to the image; one deliberate
generation, then review and export. Phone places paired images above the
two-column input group.
Signature: equal full-meme comparison with a face outline on the original.
Risk: restrained personality may feel less playful; real memes supply expression.

## B: Postcard

Audience/job: occasional consumer, walk through creating a personal keepsake.
Thesis: editorial typography and an open paper-like composition, no card wall.
Layout: website uses a typographic introduction with an underlined composer;
editor uses three explicit phases and a centered before/after pair, followed
by review actions. Input review sits beneath as the previous-step context.
Typography: Georgia display/entered language with system sans controls.
Color: ink/ivory, terracotta actions, thin neutral dividers.
Interaction: guided image → face → review phases; advanced geometry belongs
to the face phase. Phone retains paired previews and phase labels.
Signature: the personal output reads like a shareable postcard.
Risk: phase navigation adds friction for experienced users and needs careful
state management; this is a static review-state preview, not a working wizard.

## C: Contact Sheet

Audience/job: visually scan references and inspect the final output.
Thesis: a dark image workspace rather than a large form.
Layout: website has a narrow situation column beside a larger content sheet;
editor keeps a slim tool rail, small original and dominant generated output.
Typography: compact system sans with monospace controls/metadata.
Color: dark green neutral mats, light readable text, lime action/focus.
Interaction: result-led comparison and a compact private-output strip; phone
retains equal before/after thumbnails and moves tools below.
Signature: a contact sheet of recognizable reaction imagery plus enlarged output.
Risk: smaller original competes with precise face selection; implementation must
retain enlargement and keyboard targeting.

## Evidence and limits

Each HTML is one paired preview: public website first, Anna review state second.
All use the same comment, three source-preview catalogue records, original NASA
test meme and actual generated Sally Ride result. These are interface concepts;
buttons do not generate, save, share or download.
Static HTML is used only to render composition and responsive proposals with the
existing vanilla stack and native primitives; no production dependencies.
Screenshots are retained at 1440 and 390. Phone overflow measurements:
document scrollWidth375 with viewport390 on all three directions.

Direct rendered review fixed C's low-contrast title outside the dark preview,
restored the third catalogue record in C, and constrained consent-checkbox
geometry in B. Both surfaces keep the same brand treatment within each direction.

Pinned slop reports are retained under .fleet-local/slop/beautify-20261004:
A7 (uppercase section cues and nested working surfaces),
B6 (uppercase cues and the deliberate three phases),
C7 (uppercase cues and nested content surfaces).
All are advisory, not quality grades. Section cues separate the two jobs, form
boundaries clarify input state, and B's numbered phases are the actual proposed
workflow; these intentional findings are retained. The preview wrapper can
influence scoring, so these scores are not release evidence.

After owner selection: run preflight with the new receipt before production UI
edits; adapt shared source and host-specific adapters; inspect rendered website/
Anna behavior and 390/768/1440 layouts; record first-render and final scans,
privacy/CTA/first-value continuity and craft review; then run the final check.

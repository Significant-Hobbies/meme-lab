# Studio implementation review

Owner direction: A · Studio, selected with “ok go with A”. Direct rendered review by Codex; direction selection is not acceptance of this finished implementation.

## Implemented scope

The website's entry pairs a compact situation composer with a direct proposition and three real catalogue references. Examples use the existing native disclosure and recommendation handlers. The Anna bundle is generated from this shared source. Its personal editor places upload, native face geometry, consent and generation in a 215 px rail beside equal original/result frames. Export actions follow the review message. No service, permission, provider, production config or dependency was added.

## Observed defects and fixes

- Initial app render: inherited label weight made upload help too heavy. Set the help span to regular weight; retained bold upload titles.
- Initial review render: narrow image surfaces floated inside broad columns. Added equal quiet preview mats while preserving the inner image's aspect ratio and normalized face-coordinate surface.
- Rail face-size label wrapped awkwardly. Widened its label track to 56 px.
- Phone capture: added 18 px page gutters. Final DOM at 390 px has client/scroll width 375/375; the 15 px difference from innerWidth is the classic scrollbar.
- Shared-source build: its request adapter no longer matched the current public telemetry statement. Updated the guarded replacement to include that existing statement; the Anna contextual ranking adapter still runs instead of the website API.
- New catalogue-preview links needed absolute public URLs in Anna. The build rewrites only these internal detail links to the public origin and opens them safely in another tab.

## Rendered checks

- Hierarchy: the website shows its proposition and composer together at desktop widths; the Anna comparison is larger than the controls. Review and export sit together under the result.
- Typography: system sans, navy headings and quiet metadata match Studio. Upload descriptions are regular weight. No new font download. Small desktop rail help remains a deliberate density tradeoff.
- Composition: the website's three catalogue rows are genuine product content. Equal app mats align the two canvases; the inner media boxes retain 896:1152 proportions, measured at 242.66 by 311.99 px before final gutter-only refinement.
- Identity: navy/cobalt wordmark, real reaction imagery, explicit face outline and original/result comparison belong to this product. Website and editor share tokens and picker source.
- Interaction: native examples fill the comment; a real public recommendation returned Success Kid as a strong fit with four labelled backups. Native uploads, consent gating, keyboard face-size/position changes, loading, fixture generation, review, fixture save/library and unsupported-sharing text were observed. The download UI reached host acknowledgement; the browser download event timed out, so completed disk download is not claimed for this pass. Earlier production download evidence is separate.
- Responsive: captures at actual 390/768/1440 viewports retain the task. The phone comparison precedes the upload rail; fine-tune remains accessible. The secondary How it works nav wraps on phone, preserving readable labels and 44 px targets. Final client and scroll widths match on both surfaces.

## Evidence limits

The website recommendation used the real production API through a local proxy. Anna UI verification used a local host fixture that replays the retained real Cloud output and keeps its test files in memory. It is labelled “Local UI fixture — no model call”. This is not a new provider, authenticated hosted-storage or publication test. No deployment was performed. The public shared footer is retained and externally loaded; Anna omits website telemetry/footer because the host supplies app context.

## Direct review judgments

Critique: hierarchy 7/8, typography 6/8, composition 7/8, identity 7/8, interaction 3/4, responsive 3/4 = 33/40. Deductions reflect dense desktop help, a taller rail than image frames, phone secondary-nav wrapping, and fixture-only Anna host verification.
Audit: purpose 4/4, accessibility 5/6, behavior 3/4, responsive 3/3, performance 2/3 = 17/20. No new dependency or heavy effect; full assistive-technology and production-equivalent performance measurements were not performed. Scores are advisory judgments, not owner acceptance. No unresolved P0/P1 found in this scoped UI pass.

## Slop review

The first website render scanned at 0; the editor scan at 4 flagged icon_card_grid. The actual UI uses genuine catalogue content and paired image/control groups, not decorative icon features. Preserve these intentional structures. Final raw reports retain the pin and measured page state. Do not treat these scores as proof of taste.

## Verification

Managed build: node scripts/build-anna.mjs.
Managed checks: npm run check, npm test — passed, 184/184 tests.
Git diff --check — passed.

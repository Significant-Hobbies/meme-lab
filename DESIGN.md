# Meme Lab design contract

## Direction

Meme Lab uses the owner-selected **Studio** system (A, selected 2026-10-04): a restrained navy, white, and cobalt application with quiet status colors and no decorative doodles. It should feel like a focused personal reference tool. The memes provide the personality; the interface stays clear, credible, and simple.

## Hierarchy

- The comment composer and **Find the meme** action are the first-viewport focus, in a split introduction/composer at desktop widths, without an oversized marketing headline.
- The best match receives the strongest image and type hierarchy.
- Up to four backups stay compact and clearly secondary in a two-column grid.
- For multi-person comments, label each result by perspective and introduce the alternatives as other angles on the same moment.
- Contextual fit remains the primary score. Meme strength and image quality appear as one quiet supporting sentence.
- Low confidence is visibly labelled without hiding the result. A no-meme decision gets its own calm, unambiguous state.
- Collection and How it works share the same compact navigation and restrained content system.

## Interaction rules

- Load image previews automatically from allowlisted providers and fall back to the reference name without blocking the result.
- Keep complete, natural input examples in a native Try an example disclosure; use neutral reference rows rather than colorful tiles.
- Keep result cards immediate and scannable: image, meme name, perspective, fit score, and quiet catalogue signals without generated reasoning.
- Keep all four ranked backups visible and use their fit scores to make weak options obvious.
- Keep one-tap feedback close to the result and state its 30-day retention.
- Keep all 3,000 references searchable and paginated; no experimental/live filtering exists in the personal tool.
- Media provenance stays visible: distinguish CC0 open originals from source previews whose redistribution rights are not established.

## Responsive behavior

Use a two-column best-result layout and a compact grid of up to four backups when space permits. Stack the result, controls, alternatives, and footer on narrow screens. Preserve readable controls, touch targets, focus indicators, bottom-aligned page footers, and zero page-level horizontal overflow at 390 px.

## Visual system

- Navy anchors navigation and primary feedback actions; cobalt identifies interactive focus and links.
- White working surfaces sit on a cool-gray canvas with hairline slate borders and limited elevation.
- Green communicates a good fit or live status, amber communicates weak confidence, and rose is reserved for errors or stopped experiments.
- System sans typography keeps the operating surface fast and familiar. Sentence input uses a readable serif only to distinguish submitted language from interface chrome.
- Corners remain modest and consistent. Pills are reserved for compact status labels.
- Meme imagery is the only expressive visual layer; decorative illustrations and alternating candy-colored panels are excluded.

## Evidence

Design-workflow artifacts live in `artifacts/design/`; the current receipt is `.fleet/design-review.json`.

## Anna personalized editor

The owner selected A · Studio on 2026-10-04, refining the earlier Reference Desk direction. Make this me inherits navy/white/cobalt navigation and compact native form controls. Desktop places upload and face-selection controls beside an original/result comparison. Narrow screens place the paired comparison above a two-column upload rail, followed by targeting, consent and generation; tablet widths retain paired previews beside the rail. Enlarge previews stacks full-width images on phone/tablet and expands desktop frames; Compact previews restores the paired layout. Equal desktop image frames preserve the uploaded aspect ratio with a 338 px height cap; shorter desktop windows use a 290 px cap. Empty and ready states keep the same image geometry, so face coordinates remain aligned with the image. The face outline, click-to-center and one face-size control identify the requested character; resizing preserves its center. Precise keyboard-adjustable geometry lives under a native Fine-tune disclosure in the controls rail. Targeting precedes consent and generation at every width. Generated results require a visible review prompt before Save to Anna, Download PNG or Share image. My personal memes is a private output library, separate from saved catalogue references; removal requires a second deliberate confirmation. Empty, loading, cancelled, provider-error, saved and unsupported-sharing states use truthful text rather than success placeholders.

## Studio implementation evidence

The shared public entry and Anna bundle inherit the same picker source, type, navy/cobalt tokens, restrained surfaces and native disclosure behavior. The entry pairs a direct situation composer with three genuine catalogue previews. Source preview rights remain explicit. Anna retains its existing signed-in photo-remix and private-file capabilities; visual consistency does not claim feature parity. The task receipt is `.fleet/design-review-beautify-20261004.json`; rendered implementation evidence lives in `artifacts/design/beautify-20261004/`.

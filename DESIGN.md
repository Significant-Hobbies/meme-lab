# Meme Lab design contract

## Direction

Meme Lab uses the owner-selected **Reference Desk** system: a restrained navy, white, and cobalt application with quiet status colors and no decorative doodles. It should feel like a focused personal reference tool. The memes provide the personality; the interface stays clear, credible, and simple.

## Hierarchy

- The comment composer and **Find the meme** action are the first-viewport focus, without an oversized marketing headline.
- The best match receives the strongest image and type hierarchy.
- Up to four backups stay compact and clearly secondary in a two-column grid.
- For multi-person comments, label each result by perspective and introduce the alternatives as other angles on the same moment.
- Contextual fit remains the primary score. Meme strength and image quality appear as one quiet supporting sentence.
- Low confidence is visibly labelled without hiding the result. A no-meme decision gets its own calm, unambiguous state.
- Collection and How it works share the same compact navigation and restrained content system.

## Interaction rules

- Load image previews automatically from allowlisted providers and fall back to the reference name without blocking the result.
- Keep the input examples as complete, natural sentences in neutral reference rows rather than colorful tiles.
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

## Canvas Studio

The owner selected Canvas Studio on 2026-10-05, with captions and placement prefilled automatically. This adds an image workspace within the existing Reference Desk identity, rather than replacing its navy/cobalt/white system.

- Static results lead with a finished image, selectable text layers and a compact inspector. A dark neutral canvas distinguishes the image from white controls; cobalt marks the selected region.
- Prefill uses the template’s comic roles. Verified regions keep panel text, character labels and sign captions away from faces, gestures and baked text. Other AI-proposed placements remain labelled for review.
- Editing, regeneration, source failure and unavailable captioning have explicit states. Regeneration failure preserves edits; stale results never replace a newly selected meme.
- Text stays readable: shrink before breaking whole words, wrap long unbroken text by grapheme, and block export when text is empty, unfit or rotated outside the image. The preview and exported PNG use the same renderer; handles are an interface overlay.
- On tablet, layers form a horizontal strip above canvas and inspector. On phones, the canvas precedes the inspector, with numeric controls preserving all move/resize capabilities. Download remains available above the workspace. Layer-strip scrolling stays contained; no page-level horizontal overflow is accepted.

Canvas Studio evidence uses `.fleet/design-review-meme-maker.json` and `.fleet-local/meme-maker-directions/`. Original Reference Desk receipts remain historical evidence. Browser tests use fixture model replies; live inference quality is a separate qualification.

## Evidence

Historical Reference Desk artifacts live in `artifacts/design/` and `.fleet/design-review.json`. The Canvas Studio pass uses `.fleet/design-review-meme-maker.json`.

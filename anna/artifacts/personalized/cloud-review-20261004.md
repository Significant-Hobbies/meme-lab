# Anna review fix: 4 October 2026

App 389 was rejected after Anna reported a missing logo and an image-provider
failure. The reviewer requested upload → generate → save → download testing
with Anna Cloud Agent before resubmission.

## Reproduction and fix

The owner's existing default Cloud#2213 agent was online (Matrix
v1.1.0-beta.41). No new agent, access grant or provider credentials were added.
Static PNG template: 896 × 1152, previously generated NASA meme.
JPG identity: public NASA Sally Ride portrait from
https://www.nasa.gov/former-astronaut-sally-ride/.
Face selection: left 48%, top 17%, width and height 25%; consent checked.

Four deliberate generation requests, none automatically retried:

1. Existing revision 10: provider succeeded, actual output failed the format
   check. The app always requested square output for a portrait template.
2. Revision 11 requested the original aspect ratio and added it to the prompt.
   Provider still returned an incompatible canvas.
3. Revision 12 padded the template to square. Provider metadata reported
   1024 × 1024, but the actual PNG decoded as 1248 × 832 and lost the bottom
   caption. The app correctly rejected the actual bytes.
4. Revision 13 padded both the template and identity photo to square. The
   resulting full meme passed the aspect check, retained both captions and
   visibly changed the character toward the supplied identity.

Both references now preserve their entire content within a common bounded
canvas. Target coordinates are mapped into that canvas. Only the known outer
padding is removed afterward, restoring the original dimensions. The aspect
guard remains; no arbitrary crop, stretching or automatic retry was added.
Revision 14 adds validation of both normalized reference sizes before upload.
The generated bundle's two engine modules match their source files exactly.

## Actual hosted outcome

- Actual routed model: google/gemini-2.5-flash-image.
- Real UI file selection, image generation and comparison succeeded on r13.
- Save to Anna confirmed private persistence.
- Download PNG created an 896 × 1152 PNG, 1,660,364 bytes.
- Full Dashboard reload retained the new item in My personal memes.
- Download from that saved item produced identical bytes:
  SHA-256 e04207238dbf60df1779d7c971f51e699e7cdfb34f0cf997e6acd74f17e0cfe6.
- Screenshots and output are public NASA test fixtures, not user photos.

This is one successful final-format fixture, not a reliability percentage or
proof of exact likeness. The reviewer's generic provider error was not reproduced
in these runs; all image RPCs succeeded. A recurrence needs its actual Anna error
code and selected provider. Failed format runs can still consume image quota.

## Scope and checks

Existing Reference Desk direction is preserved. The Store PNG reproduces the
existing navy/cobalt wordmark; there are no product layout or CSS changes.
184 repository tests, package/catalogue checks and strict Anna validation passed.
No production dependencies, Cloudflare configuration or backend deployment.

The full Anna builder currently refuses the public recommendation adapter after
main added a response-status instrumentation line. For this scoped engine patch,
only the two matching engine modules were copied to the existing approved
bundle; no unrelated interface was regenerated.

Review resubmission is an external gate, separate from Store publication or
qualified users and revenue.

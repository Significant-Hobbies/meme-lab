# Personalized memes: implementation and verification

Tracking: https://github.com/Significant-Hobbies/meme-lab/issues/19

Owner selected A · Reference Desk. The editor and image engine are implemented and uploaded to Anna’s mutable working draft (app 389, revision 6). Frozen 1.1.0 remains pending review. This feature is not Store-published or fully verified inside the hosted app.

## Consumer flow

Users upload a static meme and a clear identity photo, select the requested face area, confirm permission to use/edit the images, and generate one remix. Original and result appear together for review. Save to Anna stores only the generated PNG in private own-app files. Download uses Anna’s host-mediated file API. Native file sharing has a download fallback and respects cancellation. A private library pages saved outputs in batches of 12 and supports download, share and conditional soft removal.

Inputs are decoded, bounded and re-encoded in the browser to strip metadata. JPEG, PNG and static WebP are accepted; GIF, SVG and detected APNG/animated WebP are rejected. Images are capped at 8 MiB and 16 megapixels; portraits are resized to 1536 pixels on their longest edge. One explicit request receives the full template and photo. Model hints are advisory; actual routing is reported. No automatic retries or alternate paid provider exists. Stale results are discarded when inputs change.

This is a generative remix, not a pixel-exact replacement. Model output can change background details, captions and expression. Its aspect ratio must remain within 15 percent of the original, then it is normalized to the original dimensions. The experimental face-patch compositing utility is tested but not exposed: preserving outside pixels worked with fixtures, but the provider repeatedly failed to adopt the supplied identity in tight crops.

## Privacy

Raw images, prompts, photo filenames and signed URLs are not written to analytics or app KV. Source uploads nevertheless reach Anna and its image provider; there is no zero-retention promise. The upload API has no documented source deletion operation. Clearing the editor removes local previews only. Library removal soft-deletes generated output; source uploads and previously shared recipient copies are separate. Catalogue images are not automatically offered as templates because their transformation/export rights are unestablished.

## Evidence and outstanding checks

- Full suite: 148 tests passed after the source review corrections. Package/catalogue checks and diff whitespace checks pass. Tests cover one request, invalid input before spend, stale work, permissions/quota errors without fallback, private upload confirmation, conditional deletion and share cancellation.
- Browser canvas fixture: 768 × 960 PNG, zero changed pixels outside the experimental face area; this is compositing proof, not identity proof.
- Four completed real Anna image requests using public NASA portraits. All reported google/gemini-2.5-flash-image. Full-template requests 1 and 4 visibly used the supplied identity and kept both captions; cropped requests 2 and 3 failed identity fidelity. A GPT Image hint in request 3 still resolved to Gemini, so GPT Image availability is not established. This tiny exploratory sample is not a reliability rate.
- Final request reported 10,893 ms latency, 1,965 tokens and quotaConsumed 0.01 in unspecified provider units. No money amount is inferred. Actual output was 896 × 1152 despite response metadata claiming 1024 × 1024; browser decoding is authoritative.
- Direct output display/download succeeds; localhost anonymous image fetch fails. Observed R2 preflight allows https://anna.partners and rejects localhost. Hosted fetch/save/download and responsive render verification are still required. Chrome automation disconnected during that verification.
- Mutable upload succeeded with 12 files, 111,880 bytes and content hash cc54fc160fb5b1ae4803462227002485cca1787616927325d3bfc56e6f218b63. This includes the source review corrections.

Replay: `node --test tests/anna-personalize.test.mjs tests/anna-creations.test.mjs`.

NASA fixture sources: https://www.nasa.gov/image-article/official-portrait-of-neil-armstrong/ and https://www.nasa.gov/former-astronaut-sally-ride/. These are developer fixtures, not a bundled consumer template library.

Source finish review requested by the Impeccable skill found pagination, mobile control adjacency, share user-activation and persistence gaps. Those source fixes are applied; actual render review remains pending. The one mechanical detector pass reports three missing-src warnings for hidden dynamic image slots. They are intentionally hidden until a real image is assigned. No finished-design score is claimed.

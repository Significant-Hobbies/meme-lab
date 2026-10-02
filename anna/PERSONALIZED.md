# Personalized memes: implementation and verification

Tracking: https://github.com/Significant-Hobbies/meme-lab/issues/19

Owner selected A · Reference Desk. The editor and image engine are implemented and verified in Anna’s hosted mutable working draft (app 389, revision 10). Frozen 1.1.0 remains pending review until the verified 1.2.0 candidate replaces it. This feature is not Store-published.

## Consumer flow

Users upload a static meme and a clear identity photo, select the requested face area, confirm permission to use/edit the images, and generate one remix. Original and result appear together for review. Save to Anna stores only the generated PNG in private own-app files. Download uses Anna’s host-mediated file API. Native file sharing has a download fallback and respects cancellation. A private library pages saved outputs in batches of 12 and supports download, share and conditional soft removal.

Inputs are decoded, bounded and re-encoded in the browser to strip metadata. JPEG, PNG and static WebP are accepted; GIF, SVG and detected APNG/animated WebP are rejected. Images are capped at 8 MiB and 16 megapixels; portraits are resized to 1536 pixels on their longest edge. One explicit request receives the full template and photo. Model hints are advisory; actual routing is reported. No automatic retries or alternate paid provider exists. Stale results are discarded when inputs change.

This is a generative remix, not a pixel-exact replacement. Model output can change background details, captions and expression. Its aspect ratio must remain within 15 percent of the original, then it is normalized to the original dimensions. The experimental face-patch compositing utility is tested but not exposed: preserving outside pixels worked with fixtures, but the provider repeatedly failed to adopt the supplied identity in tight crops.

## Privacy

Raw images, prompts, photo filenames and signed URLs are not written to analytics or app KV. Source uploads nevertheless reach Anna and its image provider; there is no zero-retention promise. The upload API has no documented source deletion operation. Clearing the editor removes local previews only. Library removal soft-deletes generated output; source uploads and previously shared recipient copies are separate. Catalogue images are not automatically offered as templates because their transformation/export rights are unestablished.

## Evidence and outstanding checks

- Full suite: 149 tests passed after the source review corrections. Package/catalogue checks and diff whitespace checks pass. Tests cover one request, invalid input before spend, stale work, permissions/quota errors without fallback, private upload confirmation, conditional deletion and share cancellation.
- Browser canvas fixture: 768 × 960 PNG, zero changed pixels outside the experimental face area; this is compositing proof, not identity proof.
- Four completed real Anna image requests using public NASA portraits. All reported google/gemini-2.5-flash-image. Full-template requests 1 and 4 visibly used the supplied identity and kept both captions; cropped requests 2 and 3 failed identity fidelity. A GPT Image hint in request 3 still resolved to Gemini, so GPT Image availability is not established. This tiny exploratory sample is not a reliability rate.
- Final request reported 10,893 ms latency, 1,965 tokens and quotaConsumed 0.01 in unspecified provider units. No money amount is inferred. Actual output was 896 × 1152 despite response metadata claiming 1024 × 1024; browser decoding is authoritative.
- Direct output display/download succeeds; localhost anonymous image fetch fails. Observed R2 preflight allows https://anna.partners and rejects localhost. Hosted fetch/save/download and responsive render verification are still required. Chrome automation disconnected during that verification.
- Mutable upload succeeded with 12 files, 117,394 bytes and content hash 1e5c4a109c6fe85b4df3380670334383a5c514d52142a40879360c98474b563b. This includes the source review corrections.

Replay: `node --test tests/anna-personalize.test.mjs tests/anna-creations.test.mjs`.

NASA fixture sources: https://www.nasa.gov/image-article/official-portrait-of-neil-armstrong/ and https://www.nasa.gov/former-astronaut-sally-ride/. These are developer fixtures, not a bundled consumer template library.

Source finish review requested by the Impeccable skill found pagination, mobile control adjacency, share user-activation and persistence gaps. Those source fixes are applied; local render review passed and hosted runtime review remains pending. The one mechanical detector pass reports three missing-src warnings for hidden dynamic image slots. They are intentionally hidden until a real image is assigned. Visual critique is 32/40; end-to-end completion is not claimed.

## Browser follow-up on 2 October

A separate Chrome DevTools connection enabled actual local editor checks after the extension connection failed. The official Anna CLI harness uses real APS for listing, and returned a confirmed empty personal output library. Three browser screenshots at 390/768/1440 pixels show clearly labeled synthetic UI-only PNG fixtures, not model output. All three have zero horizontal overflow. Consent gates generation, rejected SVG input receives a specific error/aria-invalid state without spending image quota, and clear resets both files, consent, errors and face geometry. Full-width face size plus Fine-tune preserves a usable mobile target; paired previews remain visible at tablet width. Generate now follows targeting/consent. Download explains its private-save side effect. Removal requires Confirm removal / Keep meme.

The independent critique progressed from 27/40 to 32/40 after substantive fixes; audit improved from 14/20 to 18/20. Final review found no remaining visual P0/P1/P2 findings. The visual floor is met; hosted runtime proof remains pending. A source-discovered center-shift bug in face resizing was corrected after the 31/40 review; browser verification observed centerDelta [0, 0.005] for width 30% to 40%, within the one-percent control resolution. No score is inflated to claim completion.

The fallback Anna session was signed out. Normal Google OAuth sign-in was attempted with the owner's already authorized Gmail account; Google returned 'Couldn’t sign you in / This browser or app may not be secure'. No security bypass, password access, cookie copying or credential-file reads were performed. The original signed-in browser connection is still needed for real hosted image delivery, save/reload/download/removal and final listing screenshots. The local 1.2.0 metadata is prepared but has not been synced to replace the submitted 1.1.0 listing.

Final viewport check: at 960 × 694, Generate is visible within the ready-state workbench. Enlarge previews changes mobile images from 160 × 200 to 330 × 412.5 and tablet images from 215 × 268.75 to 448 × 560; Compact previews restores both without horizontal overflow. These are synthetic local UI checks, not native generation/storage proof.

## Storage service follow-up without browser restart

The official CLI APS bridge completed a real private-file round trip using a disposable 68-byte PNG: upload/finalize, library listing, byte-identical retrieval, conditional soft deletion and an empty final listing. No image generation call was made. An OPTIONS request allowed the Anna origin; this is server preflight evidence, not a browser delivery claim. The bridge returned `{ok:true,path}` on removal, versus the documented hosted `{deleted:true}`; the app now accepts either explicit confirmation and rejects mismatched paths/ambiguous responses. Regression coverage and the repeated service check pass. Evidence: `artifacts/personalized/storage-service-check.json`. Hosted generator, host-mediated disk download and user sharing remain unverified.

## Completed hosted verification on 2 October

The signed-in Chrome session became controllable through a fresh attached tab, without restarting Chrome or other agent threads, bypassing Google security, or copying credentials. Two actual hosted generations used the same public NASA developer fixtures and face bounds. Revision 9 delivered a valid PNG but retained the wrong identity. A stronger identity-replacement prompt in revision 10 visibly produced the requested Neil Armstrong identity while preserving both captions and the recognizable astronaut meme. Both requests routed to google/gemini-2.5-flash-image; newer advisory model hints did not establish availability. The sample is exploratory, not a reliability benchmark, and scene/pose details still changed.

Actual Anna-origin output decoding succeeded at 896 × 1152. Save to Anna confirmed private storage. Reload/reopen loaded the saved preview at the same dimensions. Host-mediated downloads completed to disk and the final PNG was visually inspected. Keep meme canceled removal; Confirm removal removed the disposable first output and a reload showed an empty library. The successful second output was saved for the owner. Sharing reported its unavailable state and directed download/attachment; no recipient delivery is claimed.

Evidence: `artifacts/personalized/hosted-checks.json` and the clean hosted screenshot `artifacts/personalized/hosted-editor-final.jpg`. Working revision 10: 12 files, 117857 bytes, SHA-256 f264f1be243ee4134a0c4ce17ce11ee0137da9031732a6a923db79e33a52ac80. Earlier sections describe the troubleshooting chronology; their pending-browser statements are superseded by this completed check.

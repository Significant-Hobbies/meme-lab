# Caption Studio release — 5 October 2026

Website live at https://memes.significanthobbies.com from exact main a555da79f615cdf630fed282f559e371bc94325f, Worker cfa5c248-6d05-4cb6-889e-3f3c149cb7aa. Main CI 37318345565 passed 215 tests and exact-source packaging. PRs #39, #40 and #41 merged. No production dependencies, bindings, grants or provider/model pins changed.

The website uses automatic Free AI; Anna uses its host completion and private-file APIs. Eight exact-asset profiles supply inspected regions. 1,681 of 1,805 static catalogue sources are eligible for captioning after accepting Imgflip’s exact /4/ preview path. Eligible sources are not a guarantee of useful captions or readable placement. Baked Memegen references and GIFs retain original-reference behavior. Known profiles use an 800-token cap; vision uses 1,200. There is one caller request and no separate paid-provider fallback.

## Verified and corrected

Initial production caption generation worked but media returned 502. Actual Workerd reproduced rejection of redirect:error; the proxy now uses manual mode and rejects redirects before reading bytes. A Workerd test exercises the actual composition handler and verifies both raster success and unfollowed redirect rejection. Operational media failure logs include only bounded stages and upstream status.

The final anonymous production smoke passes exact JS/CSS/privacy byte comparison, inspected-template caption creation, raster/CORS loading, Anna stateless planning/preflight, local serious/unchanged decisions and unknown-ID rejection. All eight inspected source images returned 200 after the runtime fix. A separate final vision canary on catalogue Drake Blank /4/ preview returned compose with two grounded roles and valid regions; its real media returned 200. These HTTP checks are not direct production-browser verification. Local actual-source rendering/PNG evidence is documented separately in review.md.

The live picker still returned degraded:true / general_fallback with five references for the smoke situation. That is not healthy multi-view ranking or humour-quality proof. Existing issue #30 remains open. The caption release does not resolve that upstream/ranking incident.

## Anna candidate and external gates

Working revision 16 was uploaded with optimistic locking against revision 15. Frozen candidate 1.3.0 is version 1109 / bundle 1040, 19 files / 179308 bytes, manifest SHA256 24d3b3dbbcf3bcf9a9209068b7b615e38b24e60cb3f3e6e4d0a01740df7394c3. Its bundle source is 75da407; later backend runtime/path fixes are compatible with that client. The newer repository bundle synchronizes an unused URL predicate; the frozen client receives media eligibility and vision plans from the server.

Official CLI status remains pending_review, is_published:false, with 1.2.1 still pinned in the existing review round. 1.3.0 is prepared, not publicly released or submitted as the new review candidate. Release preflight refuses publication until APPROVED. Native browser control is unavailable, and direct Anna browser navigation is blocked by the current environment; hosted new Studio/private-PNG/download checks and public installation remain unverified. No authentication bypass or token copying was used. Keep publication tracker #12 open; verify the hosted draft before re-pinning the prepared candidate, then obtain approval/release and verify an ordinary Store installation.

The live Anna dev-host canary used automatic google/gemini-3-flash-preview via openrouter, 498 reported tokens, 0.277586 quota units and 3644 ms. This is platform inference evidence, not hosted UI/storage evidence or dollar billing. The earlier sample comparison and local renders do not establish human humour acceptance.

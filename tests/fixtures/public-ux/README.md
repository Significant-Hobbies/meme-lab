# Public UX fixtures

These committed responses and the drawn sample PNG are synthetic. They exercise the actual public HTML/CSS/JS, not recommendation quality, inference, external media, storage, or production acceptance.

Run `python tests/public_ux_browser.py [output-directory]` with Python Playwright and Chromium installed. The harness transports local Worker asset responses into Chromium and intercepts every API and external request. No provider, newsletter, feedback service, or telemetry request leaves the browser. It checks 390/768/1440 widths, loading and duplicate-click protection, one-click and alternate examples, caption edits and PNG export, feedback failure/retry, recommendation failure/recovery, abstention, caption failure, Studio redirect and privacy.

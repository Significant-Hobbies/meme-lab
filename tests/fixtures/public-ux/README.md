# Public UX fixtures

These committed responses and the drawn sample PNG are synthetic. They exercise the actual public HTML/CSS/JS, not recommendation quality, inference, external media, storage, or production acceptance.

`clip.mp4` is a two-second, silent FFmpeg `testsrc2` pattern (320 × 180, 24 fps, H.264). It contains no third-party footage. `tests/gallery_browser.py` uses it to check gallery filters, direct static creation, caption options, failure/retry, cancellation, and actual video export/playback at 390/768/1440 widths. Export validation needs `ffprobe` and `ffmpeg`; no new application dependency is involved.

Run `python tests/public_ux_browser.py [output-directory]` with Python Playwright and Chromium installed. The harness transports local Worker asset responses into Chromium and intercepts every API and external request. No provider, newsletter, feedback service, or telemetry request leaves the browser. It checks 390/768/1440 widths, loading and duplicate-click protection, one-click and alternate examples, caption edits and PNG export, feedback failure/retry, recommendation failure/recovery, abstention, caption failure, Studio redirect and privacy.

# Meme Lab

Meme Lab is a personal meme picker. Paste a complete comment or situation and it returns the best-matching meme first, four honestly ranked backups, ordinal fit labels, and an honest confidence level — popularity never masquerades as relevance.

Canonical URL: https://memes.significanthobbies.com/

## What it does

- The catalogue holds 3,000 references: 1,805 named meme templates and 1,195 usage-backed reaction GIFs selected from observed conversation-to-GIF replies.
- Recommendations come from two BGE embedding views (meaning and example) over a Cloudflare Vectorize index, fused and re-ranked by a Jev ordinal scorer into five ordered fit levels.
- Multi-person comments get three perspective lenses — **My reaction**, **Their side**, **The situation** — scored in a single pass.
- Serious help, care, grief, apology, and factual-guidance requests are answered with an abstain ("no meme") rather than a joke.
- Meme strength and image quality are shown separately from contextual fit; they are static signals, not relevance.
- One-tap feedback ("landed" / "missed") is retained for 30 days and deleted by a daily cron.

## Pages

- https://memes.significanthobbies.com/collection — searchable catalogue of all 3,000 references
- https://memes.significanthobbies.com/how-it-works — retrieval, ranking, and evaluation notes
- https://memes.significanthobbies.com/memes/{id} — one reference page per catalogued meme

## Machine-readable surfaces

- https://memes.significanthobbies.com/api/ai — JSON catalog of agent-readable surfaces
- https://memes.significanthobbies.com/llms.txt — summary and link map
- https://memes.significanthobbies.com/llms-full.txt — expanded product brief
- https://memes.significanthobbies.com/sitemap.xml — 3,003 public URLs
- Append `.md` to any `/memes/<id>` URL, or send `Accept: text/markdown` on any page, for Markdown.

## Privacy

Submitted comments are used only to produce the recommendation and are never placed in public URLs, page source, metadata, or the sitemap.

Maintained by Sarthak Agrawal — https://sarthakagrawal.dev

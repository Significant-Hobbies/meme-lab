import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

const dist = new URL('../landing/dist/', import.meta.url);
const publicDir = new URL('../worker/public/', import.meta.url);
const assets = new URL('_landing/', publicDir);
await mkdir(assets, { recursive: true });

// Base's footer script must be external under the Worker's existing CSP.
// Leave JSON-LD inline: it is data, not executable JavaScript.
let html = await readFile(new URL('index.html', dist), 'utf8');
// Base adds these optional hints; retain the original home's exact head contract.
html = html
  .replace(/<meta name="color-scheme"[^>]*>/, '')
  .replace(/<meta name="twitter:image:alt"[^>]*>/, '')
  .replace(/<link rel="preload"[^>]*as="font"[^>]*>/g, '')
  .replace('width=device-width, initial-scale=1', 'width=device-width,initial-scale=1');
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
for (const [tag, attributes, code] of scripts) {
  if (!code.trim() || /type="application\/ld\+json"/.test(attributes)) continue;
  if (/\bsrc=/.test(attributes)) throw new Error('Unexpected inline script with src');
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
  const name = `script.${hash}.js`;
  await writeFile(new URL(name, assets), code);
  html = html.replace(tag, `<script${attributes} src="/_landing/${name}"></script>`);
}
// Copy the reachable asset graph, excluding the unused motion chunk emitted
// by Base even with motion:false. CSS references include the library's fonts.
const names = new Set([...html.matchAll(/\/_landing\/([^"'\s<>]+)/g)].map((match) => match[1]));
for (const name of names) {
  if (name.startsWith('script.')) continue;
  if (name.endsWith('.css')) {
    // System fonts only: Base imports lazy faces for all presets. Remove those
    // declarations rather than retaining URLs to font files we do not ship.
    const css = (await readFile(new URL(`_landing/${name}`, dist), 'utf8'))
      .replace(/@font-face\s*\{[^}]*\}/g, '')
      // This home is base/light; retain base rules and the shared components.
      .replace(/\[data-theme=(?:paper|ink|hearth|signal|gallery)\][^{]*\{[^{}]*\}/g, '');
    const hash = createHash('sha256').update(css).digest('hex').slice(0, 12);
    const cssName = `index.${hash}.css`;
    await writeFile(new URL(cssName, assets), css);
    html = html.replaceAll(`/_landing/${name}`, `/_landing/${cssName}`);
    for (const [, reference] of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (reference.startsWith('/_landing/')) names.add(reference.slice('/_landing/'.length));
    }
  }
}
// Copy only the generated home and its cacheable assets. No other route changes.
// The home uses system fonts (tokens set --font-*), so the library's lazy @font-face files are never requested; do not ship them.
for (const name of names) {
  if (name.startsWith('script.') || /\.(css|woff2?)$/.test(name)) continue;
  await cp(new URL(`_landing/${name}`, dist), new URL(name, assets));
}
await writeFile(new URL('index.html', publicDir), html);
console.log('Copied home HTML and _landing assets; other public routes untouched.');

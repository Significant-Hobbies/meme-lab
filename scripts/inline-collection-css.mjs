import { readFile, writeFile } from 'node:fs/promises';
const css = await readFile(new URL('../worker/public/app.css', import.meta.url), 'utf8');
const selected = /^(?::root|\*|html|body|button|a(?:\b|:)|:focus|main\b|label\b|h1\b|\.topbar|\.brand|\.site-nav|\.beta|\.eyebrow|\.intro|\.page-main|\.page-intro|\.search-box|\.collection-|\.tag-list|#collection-)/;
function critical(source) {
  const input = source.replace(/\/\*[\s\S]*?\*\//g, '');
  let output = '';
  for (let index = 0; index < input.length;) {
    const open = input.indexOf('{', index);
    if (open < 0) break;
    const selector = input.slice(index, open).trim();
    let close = open + 1;
    let depth = 1;
    while (close < input.length && depth) {
      if (input[close] === '{') depth++;
      if (input[close] === '}') depth--;
      close++;
    }
    const body = input.slice(open + 1, close - 1);
    if (selector.startsWith('@media')) {
      const nested = critical(body);
      if (nested) output += `${selector}{${nested}}`;
    } else if (selected.test(selector)) output += `${selector}{${body}}`;
    index = close;
  }
  return output;
}
const file = new URL('../worker/public/collection.html', import.meta.url);
let html = await readFile(file, 'utf8');
const block = `<!-- collection-critical:start (from app.css; run node scripts/inline-collection-css.mjs) -->\n<style>${critical(css)}</style>\n<!-- collection-critical:end -->`;
if (html.includes('<!-- collection-critical:start')) html = html.replace(/<!-- collection-critical:start[\s\S]*?<!-- collection-critical:end -->/, block);
else html = html.replace('</head>', `${block}\n</head>`);
await writeFile(file, html);

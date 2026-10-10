import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import worker from '../worker/src/index.mjs';
import { presentSelection } from '../worker/src/recommendation.mjs';
import { catalogue } from '../worker/src/catalogue.stage3000.generated.mjs';
import { validateComposition } from '../worker/src/meme-composition.mjs';

// Use an existing Playwright installation, without adding runtime dependencies.
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  ({ chromium } = require('/Users/sarthak/Desktop/fleet/aliveville/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js'));
}
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const publicDir = new URL('../worker/public/', import.meta.url);
const output = new URL('file://' + (process.env.HOME_REVIEW_DIR ?? '/tmp/meme-lab-home-review') + '/');
await mkdir(output, { recursive: true });
const types = { html: 'text/html', md: 'text/markdown', css: 'text/css', js: 'text/javascript', woff2: 'font/woff2', webp: 'image/webp', png: 'image/png', json: 'application/json' };
const ids = ['drake-preference', 'success-kid', 'disaster-girl', 'distracted-boyfriend', 'x-everywhere'];
assert(ids.every((id) => catalogue.some((record) => record.id === id)), 'Fixture IDs must be real catalogue references');
const recommendation = { ...presentSelection({ decision: 'meme', confidence: 'high', none_reason: '', candidates: ids.map((id, index) => ({ id, score: 95 - index * 10 })) }), feedback_enabled: true };
const draft = validateComposition({ decision: 'compose', captions: [{ id: 'rejected', text: 'Sending an email' }, { id: 'preferred', text: 'A meeting about fewer meetings' }] }, catalogue.find((record) => record.id === ids[0]));
const serious = 'My friend just lost a family member and asked me to help write a sincere condolence message.';

try {
  for (const original of [true, false]) {
    for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // No listener or provider calls: fulfil the real Worker locally in Chrome.
      // Only the recommendation/composition/feedback responses are fixtures.
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname !== 'memelab.local') {
          if (['i.imgflip.com', 'media.giphy.com'].includes(url.hostname)) return route.continue();
          return route.fulfill({ status: 204, body: '' });
        }
        if (url.pathname === '/api/recommend') {
          const noMatch = request.postDataJSON().comment === serious;
          // Leave time to inspect and capture the real loading state.
          await new Promise((resolve) => setTimeout(resolve, 1200));
          return route.fulfill({ json: noMatch ? { decision: 'none', confidence: 'low', candidates: [], none_reason: 'This situation needs a sincere response, not a meme.' } : recommendation });
        }
        if (url.pathname === '/api/create') return route.fulfill({ json: draft });
        if (url.pathname.startsWith('/api/create/media/')) {
          const id = decodeURIComponent(url.pathname.split('/').at(-1));
          const record = catalogue.find((candidate) => candidate.id === id);
          assert(record && new URL(record.image_url).hostname === 'i.imgflip.com');
          return route.fulfill({ response: await route.fetch({ url: record.image_url }) });
        }
        if (url.pathname === '/api/feedback') return route.fulfill({ json: { ok: true } });
        if (url.pathname.startsWith('/api/')) throw new Error(`Unexpected API call: ${url.pathname}`);
        const response = await worker.fetch(new Request(request.url(), { headers: request.headers() }), {
          ASSETS: { async fetch(assetRequest) {
            let path = new URL(assetRequest.url).pathname;
            if (path === '/') path = '/index.html';
            if (['/collection', '/how-it-works'].includes(path)) path += '.html';
            try {
              const body = original
                ? execFileSync('git', ['show', `origin/main:worker/public${path}`], { stdio: ['ignore', 'pipe', 'ignore'] })
                : await readFile(new URL(`.${path}`, publicDir));
              return new Response(body, { headers: { 'Content-Type': types[path.split('.').at(-1)] || 'application/octet-stream' } });
            } catch { return new Response('Not found', { status: 404 }); }
          } },
        }, { waitUntil() {} });
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
      });
      await page.goto('https://memelab.local/');
      await page.locator('#meme-studio canvas').waitFor({ state: 'attached' });
      const capture = async (state, locator) => {
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow: ${width}/${state}`);
        const path = new URL(`${original ? 'original' : 'library'}-${state}-${width}.webp`, output).pathname.replaceAll('%20', ' ');
        const clip = locator && await locator.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height, scale: 1 };
        });
        // Chrome's native encoder supports WebP without another dependency.
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'webp', quality: 78, captureBeyondViewport: true, ...(clip ? { clip } : {}) });
        await writeFile(path, Buffer.from(data, 'base64'));
      };
      await capture('form');
      await page.locator('.example-picker summary').click();
      await page.locator('[data-example]').nth(1).click();
      await page.locator('#submit').click();
      await page.locator('#loading').waitFor({ state: 'visible' });
      await capture('loading', page.locator('#loading'));
      await page.locator('#result').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.alternative').count(), 4);
      await page.waitForFunction(() => !document.querySelector('[data-action="download"]').disabled);
      await capture('studio', page.locator('#result'));
      await page.locator('#feedback [data-verdict="landed"]').click();
      await page.locator('#feedback-status').filter({ hasText: 'Saved. Thank you.' }).waitFor();
      // A real GIF response uses the best-result shell instead of the editor.
      const gif = catalogue.find((record) => record.media_type === 'gif');
      const previous = recommendation.candidates[0];
      recommendation.candidates[0] = presentSelection({ decision: 'meme', confidence: 'high', candidates: [{ id: gif.id, score: 95 }] }).candidates[0];
      await page.locator('#try-again').click();
      await page.locator('#submit').click();
      await page.locator('#result').waitFor({ state: 'visible' });
      await capture('result', page.locator('#result'));
      recommendation.candidates[0] = previous;
      await page.locator('#try-again').click();
      await page.locator('#comment').fill(serious);
      await page.locator('#submit').click();
      await page.locator('#no-match').waitFor({ state: 'visible' });
      await capture('no-match', page.locator('#no-match'));
      await page.locator('#edit-comment').click();
      await page.locator('#comment').waitFor({ state: 'visible' });
      assert.deepEqual(errors, [], 'Browser script errors');
      console.log(`${original ? 'origin/main' : 'library'} ${width}: form/loading/studio/result/no-match, feedback and reset passed`);
      await context.close();
    }
  }
} finally { await browser.close(); }

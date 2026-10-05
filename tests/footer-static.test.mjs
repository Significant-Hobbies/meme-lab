import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp, ROOT } from '../server.mjs';
import { configFromEnv } from '../src/config.mjs';

const assets = [
  ['/footer-art/meme-lab-original-v1.webp', 'image/webp'],
  ['/footer-art/provenance.json', 'application/json; charset=utf-8'],
  ['/fonts/fleet-footer-precise-v1/geist-OFL.txt', 'text/plain; charset=utf-8'],
  ['/fonts/fleet-footer-precise-v1/geist.woff2', 'font/woff2'],
  ['/fonts/fleet-footer-precise-v1/geistmono-OFL.txt', 'text/plain; charset=utf-8'],
  ['/fonts/fleet-footer-precise-v1/geistmono.woff2', 'font/woff2'],
  ['/fonts/fleet-footer-precise-v1/newsreader-OFL.txt', 'text/plain; charset=utf-8'],
  ['/fonts/fleet-footer-precise-v1/newsreader.woff2', 'font/woff2'],
  ['/fonts/fleet-footer-precise-v1/provenance.json', 'application/json; charset=utf-8']
];

async function listen(server) {
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  server.closeAllConnections();
  await new Promise(resolveClose => server.close(resolveClose));
}

test('local preview serves only selected footer CSS and assets with exact bytes and MIME', async () => {
  const storeDir = await mkdtemp(join(tmpdir(), 'meme-lab-footer-static-'));
  const app = createApp(configFromEnv({}), { storeDir });
  try {
    const url = await listen(app);
    const workspace = await fetch(url);
    assert.equal(workspace.status, 200);
    const workspaceHtml = await workspace.text();
    const relevanceLink = workspaceHtml.match(/<a\b[^>]*href="([^"]+)"[^>]*>Relevance review<\/a>/);
    assert.ok(relevanceLink, 'workspace footer should contain its Relevance review link');
    const review = await fetch(new URL(relevanceLink[1], url));
    assert.equal(review.status, 200, relevanceLink[1]);
    assert.match(await review.text(), /<title>Meme Lab — relevance review<\/title>/);

    const css = await fetch(`${url}/footer-precise.css`);
    assert.equal(css.status, 200);
    assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
    assert.match(css.headers.get('content-security-policy'), /default-src 'self'/);
    assert.deepEqual(Buffer.from(await css.arrayBuffer()), await readFile(resolve(ROOT, 'public/footer-precise.css')));

    for (const [path, contentType] of assets) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('content-type'), contentType, path);
      assert.match(response.headers.get('content-security-policy'), /default-src 'self'/, path);
      const expected = await readFile(resolve(ROOT, 'public', path.slice(1)));
      const actual = Buffer.from(await response.arrayBuffer());
      assert.equal(createHash('sha256').update(actual).digest('hex'), createHash('sha256').update(expected).digest('hex'), path);
    }

    for (const path of [
      '/footer-art/unlisted.webp',
      '/fonts/fleet-footer-precise-v1/unlisted.woff2',
      '/docs/node_test_output.txt',
      '/footer-art/%2e%2e%2fserver.mjs'
    ]) {
      assert.equal((await fetch(`${url}${path}`)).status, 404, path);
    }
  } finally {
    await close(app);
    await rm(storeDir, { recursive: true, force: true });
  }
});

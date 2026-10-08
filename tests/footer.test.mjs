import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.mjs';

test('public HTML permits embedded footer images while retaining script restrictions', async () => {
  const response = await worker.fetch(new Request('https://memes.sarthakagrawal.dev/'), {
    ASSETS: { fetch: async () => new Response('<!doctype html><h1>Meme Lab</h1>', { headers: { 'Content-Type': 'text/html' } }) },
  });
  assert.equal(response.status, 200);
  const directives = Object.fromEntries(response.headers.get('content-security-policy').split(';').map(directive => {
    const [name, ...sources] = directive.trim().split(/\s+/);
    return [name, sources];
  }));
  assert(directives['img-src'].includes('data:'));
  assert(!directives['script-src'].includes('data:'));
  assert(!directives['script-src'].includes("'unsafe-eval'"));
  assert.deepEqual(directives['object-src'], ["'none'"]);
});

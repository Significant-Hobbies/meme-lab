import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import worker from '../worker/src/index.mjs';

test('public HTML permits embedded footer images while retaining script restrictions', async () => {
  const response = await worker.fetch(new Request('https://memes.significanthobbies.com/'), {
    ASSETS: { fetch: async () => new Response('<!doctype html><h1>Meme Lab</h1>', { headers: { 'Content-Type': 'text/html' } }) },
  });
  assert.equal(response.status, 200);
  const directives = Object.fromEntries(response.headers.get('content-security-policy').split(';').map(directive => {
    const [name, ...sources] = directive.trim().split(/\s+/);
    return [name, sources];
  }));
  assert.deepEqual(directives['img-src'], ["'self'", 'data:', 'https://i.imgflip.com', 'https://api.memegen.link', 'https://media.giphy.com']);
  assert.deepEqual(directives['script-src'], ["'self'", 'https://sassmaker.com', 'https://health.sassmaker.com']);
  assert.deepEqual(directives['connect-src'], ["'self'", 'https://ingest.sassmaker.com', 'https://api.sassmaker.com']);
  assert(!directives['script-src'].includes('data:'));
  assert(!directives['script-src'].includes("'unsafe-eval'"));
  assert.deepEqual(directives['object-src'], ["'none'"]);
});

const engagementSource = await readFile(new URL('../worker/public/fleet-engagement.js', import.meta.url), 'utf8');

function mountEngagement(origin) {
  const created = [];
  const listeners = [];
  const document = {
    createElement(tag) {
      const element = {tag, dataset: {}, attributes: {}, children: [], isConnected: false,
        setAttribute(name, value) { this.attributes[name] = value; },
        append(child) { this.children.push(child); child.isConnected = this.isConnected; },
      };
      created.push(element);
      return element;
    },
    querySelector() { return null; },
    addEventListener(...args) { listeners.push(args); },
    head: {append() {}},
    body: {append(element) { element.isConnected = true; }},
  };
  runInNewContext(engagementSource, {location: {origin}, document});
  return {created, listeners};
}

test('newsletter uses the light theme on the public origin', () => {
  const {created, listeners} = mountEngagement('https://memes.significanthobbies.com');
  const capture = created.find(element => element.tag === 'saas-maker-newsletter-capture');
  assert.equal(capture.attributes.theme, 'light');
  assert.equal(capture.attributes.source, 'fleet-footer');
  assert.equal(capture.attributes['catalog-id'], 'meme-lab');
  assert.equal(created.find(element => element.tag === 'fleet-footer-extension').children[0], capture);
  assert.equal(listeners.length, 2);
});

test('preview and foreign origins do not mount telemetry or newsletter capture', () => {
  for (const origin of ['http://localhost:8787', 'https://preview.workers.dev', 'https://memes.significanthobbies.com.evil.test']) {
    const {created, listeners} = mountEngagement(origin);
    assert.equal(created.length, 0, origin);
    assert.equal(listeners.length, 0, origin);
  }
});

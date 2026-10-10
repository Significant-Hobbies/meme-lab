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
  assert.deepEqual(directives['script-src'], ["'self'", 'https://sassmaker.com', 'https://health.sassmaker.com', 'https://static.cloudflareinsights.com']);
  assert.deepEqual(directives['connect-src'], ["'self'", 'https://ingest.sassmaker.com', 'https://api.sassmaker.com', 'https://sassmaker.com', 'https://cloudflareinsights.com']);
  assert(!directives['script-src'].includes('data:'));
  assert(!directives['script-src'].includes("'unsafe-eval'"));
  assert.deepEqual(directives['object-src'], ["'none'"]);
});

const engagementSource = await readFile(new URL('../worker/public/fleet-engagement.js', import.meta.url), 'utf8');

test('built home retains the composer contract and Worker markdown negotiation', async () => {
  const html = await readFile(new URL('../worker/public/index.html', import.meta.url), 'utf8');
  const markdown = await readFile(new URL('../worker/public/index.md', import.meta.url), 'utf8');
  const app = await readFile(new URL('../worker/public/app.js', import.meta.url), 'utf8');
  for (const [, id] of app.matchAll(/\$\('#([^']+)'\)/g)) {
    assert.match(html, new RegExp(`id="${id}"`), `Missing composer element: ${id}`);
  }
  assert.equal((html.match(/data-example=/g) || []).length, 6);
  assert.equal((html.match(/data-verdict=/g) || []).length, 2);
  assert.doesNotMatch(html, /<astro-island/);
  for (const [, attributes, code] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    assert(!code.trim() || attributes.includes('application/ld+json'), 'Executable inline scripts violate the Worker CSP');
  }
  const paths = [];
  const env = { ASSETS: { async fetch(request) {
    paths.push(new URL(request.url).pathname);
    return new Response(paths.at(-1) === '/index.md' ? markdown : html);
  } } };
  const home = await worker.fetch(new Request('https://memes.significanthobbies.com/'), env);
  assert.equal(await home.text(), html);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  const alternate = await worker.fetch(new Request('https://memes.significanthobbies.com/', { headers: { Accept: 'text/markdown' } }), env);
  assert.equal(await alternate.text(), markdown);
  assert.equal(alternate.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.deepEqual(paths, ['/', '/index.md']);
});

function mountEngagement(origin, studioFooter = false) {
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
    querySelector(selector) { return studioFooter && selector.includes('[data-subscribe]') ? {} : null; },
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
  assert.equal(capture.attributes.kind, 'newsletter');
  assert.equal(capture.attributes['allow-kind-selection'], '');
  assert.equal(capture.attributes.layout, 'compact');
  assert.equal(capture.attributes.integrated, '');
  assert.equal(created.find(element => element.tag === 'fleet-footer-extension').children[0], capture);
  assert.equal(listeners.length, 2);
});

test('StudioFooter keeps analytics but does not append the legacy capture', () => {
  const {created, listeners} = mountEngagement('https://memes.significanthobbies.com', true);
  assert.equal(created.length, 1);
  assert.equal(created[0].tag, 'script');
  assert.equal(created[0].src, 'https://health.sassmaker.com/tracker.js');
  assert.equal(listeners.length, 2);
});

test('preview and foreign origins do not mount telemetry or newsletter capture', () => {
  for (const origin of ['http://localhost:8787', 'https://preview.workers.dev', 'https://memes.significanthobbies.com.evil.test']) {
    const {created, listeners} = mountEngagement(origin);
    assert.equal(created.length, 0, origin);
    assert.equal(listeners.length, 0, origin);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runInNewContext} from 'node:vm';

const html = await readFile(new URL('../worker/public/index.html', import.meta.url), 'utf8');
const scriptPaths = [...html.matchAll(/<script[^>]+src="(\/_landing\/script\.[a-f0-9]+\.js)"/g)].map((match) => match[1]);
const sources = await Promise.all(scriptPaths.map((path) => readFile(new URL(`../worker/public${path}`, import.meta.url), 'utf8')));
const source = sources.find((text) => text.includes('data-feedback') && text.includes('data-subscribe'));
assert(source, 'Expected the actual generated capture runtime in the built home');

function mount() {
  const listeners = new Map();
  const requests = [];
  const status = {textContent: ''};
  const button = {disabled: false};
  const shotInput = {files: []};
  class Form {
    dataset = {catalog: 'meme-lab', product: 'Meme Lab'};
    fields = new Map([['type', 'feedback'], ['title', 'Synthetic retry'], ['message', 'Reserved test only'], ['email', ''], ['consent', 'on']]);
    elements = {namedItem: () => shotInput};
    resets = 0;
    hasAttribute(name) { return name === 'data-feedback'; }
    querySelector(selector) { return selector.startsWith('button[') ? button : status; }
    reset() { this.resets++; }
  }
  class Data {
    constructor(form) { this.fields = new Map(form?.fields); }
    get(name) { return this.fields.get(name); }
    set(name, value) { this.fields.set(name, value); }
  }
  const form = new Form();
  runInNewContext(source, {
    HTMLFormElement: Form, FormData: Data, crypto: {randomUUID},
    location: {origin: 'https://memes.significanthobbies.com', pathname: '/', search: '?private=omitted', hash: '#omitted'},
    document: {title: 'Meme Lab', querySelector(selector) { return selector.includes('form[data-subscribe]') ? form : null; }},
    addEventListener(name, listener) { listeners.set(name, listener); },
    fetch: async (url, init) => {
      if (String(url).includes('/capture-config/')) return Response.json({api_key: 'pk_retry_fixture'});
      assert.equal(url, 'https://api.sassmaker.com/v1/feedback');
      requests.push(JSON.parse(init.body.get('feedback')));
      if (requests.length === 1) throw new Error('Committed response lost');
      return Response.json({ok: true});
    },
  });
  return {form, status, shotInput, requests, submit: () => listeners.get('submit')({target: form, preventDefault() {}})};
}

test('generated capture runtime retains one submission UUID and draft after a lost response', async () => {
  const {form, status, requests, submit} = mount();
  await submit();
  assert.match(status.textContent, /confirm delivery/);
  assert.equal(form.resets, 0);
  assert.equal(form.fields.get('title'), 'Synthetic retry');
  assert.equal(form.fields.get('consent'), 'on');
  await submit();
  assert.equal(requests.length, 2);
  assert.match(requests[0].submission_id, /^[a-f0-9-]{36}$/);
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(requests[0].page.url, 'https://memes.significanthobbies.com/');
  assert.equal(requests[0].submitter_email, undefined);
  assert.equal(form.resets, 1);
});

test('editing a failed intent receives a new submission UUID', async () => {
  const {form, requests, submit} = mount();
  await submit();
  form.fields.set('message', 'A distinct revised intent');
  await submit();
  assert.notEqual(requests[1].submission_id, requests[0].submission_id);
  assert.equal(requests[1].description, 'A distinct revised intent');
});

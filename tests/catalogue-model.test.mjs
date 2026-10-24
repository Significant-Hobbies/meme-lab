import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  compileCatalogue,
  mediaQuality,
  searchableText,
  catalogueViews,
  browseCatalogue,
  resolveReferences,
  validateAnnotation,
} from '../src/catalogue-model.mjs';
import { catalogue as legacy } from '../worker/src/catalogue.stage3000.generated.mjs';
import { clipLibrary } from '../worker/src/clip-library.generated.mjs';
import { catalogue, galleryCatalogue } from '../worker/src/catalogue.mjs';
const editorial = JSON.parse(
  await readFile(new URL('../catalogue/editorial.json', import.meta.url), 'utf8'),
);
const external = JSON.parse(
  await readFile(new URL('../catalogue/external-clips.json', import.meta.url), 'utf8'),
);
const assetOverrides = JSON.parse(
  await readFile(new URL('../catalogue/asset-overrides.json', import.meta.url), 'utf8'),
);
const referenceAliases = JSON.parse(
  await readFile(new URL('../catalogue/aliases.json', import.meta.url), 'utf8'),
);
const exclusions = JSON.parse(
  await readFile(new URL('../catalogue/exclusions.json', import.meta.url), 'utf8'),
);
const mediaChecks = JSON.parse(
  await readFile(new URL('../catalogue/media-checks.json', import.meta.url), 'utf8'),
);
const annotations = Object.fromEntries(
  (await readFile(new URL('../catalogue/annotations.jsonl', import.meta.url), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const row = JSON.parse(line);
      return [row.id, row];
    }),
);
const compile = (extra = {}) =>
  compileCatalogue([...legacy, ...clipLibrary, ...external], {
    ...editorial,
    assetOverrides,
    referenceAliases,
    exclusions,
    mediaChecks,
    annotations,
    retrievalIds: legacy.map((record) => record.id),
    ...extra,
  });

test('one normalized catalogue keeps reference, asset and collection identities consistent', () => {
  const model = compile();
  assert.equal(model.references.length, 4321);
  assert.equal(model.assets.length, 4315);
  assert.deepEqual(
    catalogue.map((record) => record.id),
    legacy.map((record) => record.id),
  );
  assert.equal(galleryCatalogue.length, 4321);
  const assets = new Map(model.assets.map((asset) => [asset.id, asset]));
  for (const reference of model.references) {
    assert.ok(
      reference.asset_ids.every((id) => assets.get(id)?.reference_ids.includes(reference.id)),
    );
    assert.equal(reference.review.human_validated, false);
  }
  for (const collection of model.collections)
    assert.ok(
      collection.reference_ids.every((id) =>
        model.references.some(
          (reference) => reference.id === id && reference.review.state === 'editorial',
        ),
      ),
    );
});

test('editorial meaning reaches runtime consumers without replacing media or existing retrieval IDs', () => {
  const previous = legacy.find((record) => record.id === 'change-my-mind'),
    current = catalogue.find((record) => record.id === previous.id);
  assert.notEqual(current.message, previous.message);
  assert.equal(current.media_url, previous.media_url);
  assert.match(current.near_miss_context, /sincere request/i);
  const model = compile();
  assert.equal(
    model.references.filter((reference) => reference.retrieval.eligible).length,
    catalogue.filter((record) => record.catalogue_status === 'active').length,
  );
  assert.equal(
    model.references.find((reference) => reference.id === 'gif-l1j9n8zrmycfsrqfq').retrieval
      .eligible,
    false,
  );
});

test('source tags, editorial meaning and unmeasured quality never become human validation or HD claims', () => {
  const model = compile();
  const unreviewed = model.references.find(
    (reference) =>
      reference.review.state === 'unreviewed' && reference.retrieval.state === 'not_indexed',
  );
  assert.equal(unreviewed.meaning.use_when, null);
  assert.equal(unreviewed.meaning.avoid_when, null);
  assert.equal(unreviewed.facets.basis, 'legacy_text_inference');
  assert.equal(mediaQuality(null).state, 'unmeasured');
  assert.equal(mediaQuality({ width: 480, height: 720 }).encoded_resolution, 'below_720p');
  assert.equal(mediaQuality({ width: 1920, height: 1080 }).encoded_resolution, '1080p');
});

test('catalogue compilation rejects dangling, duplicate and unsupported editorial evidence', () => {
  assert.throws(() => compileCatalogue([legacy[0], legacy[0]]), /Repeated/);
  assert.throws(
    () => compile({ profiles: { missing: Object.values(editorial.profiles)[0] } }),
    /no reference/,
  );
  const profiles = structuredClone(editorial.profiles);
  profiles['success-kid'].facets.reactions = ['invented'];
  assert.throws(() => compile({ profiles }), /facet/);
  const collections = structuredClone(editorial.collections);
  collections[0].reference_ids = ['unknown'];
  assert.throws(() => compile({ collections }), /profiled/);
});

test('positive search evidence excludes near-miss instructions', () => {
  const model = compile();
  const reference = model.references.find((reference) => reference.id === 'success-kid');
  reference.meaning.avoid_when = 'Never use at a funeral.';
  assert.equal(searchableText(reference).includes('funeral'), false);
  assert.match(searchableText(reference), /small.*win/);
});

test('browse facets compose over shared identities and keep selected shelves explicit', () => {
  const model = compile(),
    records = catalogueViews(model),
    collections = model.collections;
  assert.equal(
    browseCatalogue(records, { collection: 'selected', collections }).length,
    Object.keys(editorial.profiles).length,
  );
  assert.equal(browseCatalogue(records).length, model.summary.browse_references);
  const results = browseCatalogue(records, {
    collection: 'quiet-reactions',
    format: 'gif',
    intensity: 'quiet',
    collections,
  });
  assert.ok(results.length > 0);
  assert.ok(
    results.every(
      (record) =>
        record.media_type === 'gif' &&
        record.facets.intensity === 'quiet' &&
        record.collections.includes('quiet-reactions'),
    ),
  );
  assert.equal(browseCatalogue(records, { collection: 'missing', collections }).length, 0);
  assert.ok(
    browseCatalogue(records, { query: 'this fine' }).some((record) => record.id === 'this-is-fine'),
  );
  const broken = structuredClone(model);
  broken.references[0].asset_ids = ['missing'];
  assert.throws(() => catalogueViews(broken), /Missing/);
});

test('source corrections and canonical aliases agree across browsing and runtime', () => {
  const model = compile(),
    views = catalogueViews(model);
  for (const [id, override] of Object.entries(assetOverrides)) {
    assert.equal(catalogue.find((record) => record.id === id).image_url, override.url);
    assert.equal(views.find((record) => record.id === id).image_url, override.url);
  }
  for (const [alias, target] of Object.entries(referenceAliases)) {
    const old = catalogue.find((record) => record.id === alias),
      canonical = catalogue.find((record) => record.id === target);
    assert.equal(old.canonical_id, target);
    assert.equal(old.media_url, canonical.media_url);
    assert.equal(
      views.some((record) => record.id === alias),
      false,
    );
    assert.ok(
      browseCatalogue(views, { query: legacy.find((record) => record.id === alias).name }).some(
        (record) => record.id === target,
      ),
    );
  }
  const urls = views.map((record) => record.media_url);
  assert.equal(new Set(urls).size, urls.length);
  assert.throws(
    () => resolveReferences(legacy, { referenceAliases: { doge: 'missing' } }),
    /canonical alias/,
  );
  assert.throws(
    () =>
      resolveReferences(legacy, {
        assetOverrides: {
          doge: { ...assetOverrides['oh-no-cringe'], url: 'https://example.com/cat.png' },
        },
      }),
    /source evidence/,
  );
});

test('excluded source mismatches remain auditable and never enter browse or retrieval', () => {
  const model = compile(),
    record = model.references.find((reference) => reference.id === 'gif-46zrxz8ljkwmwwrqr7');
  assert.equal(record.status, 'excluded');
  assert.equal(record.retrieval.eligible, false);
  assert.equal(
    catalogueViews(model).some((reference) => reference.id === record.id),
    false,
  );
  assert.throws(() => validateAnnotation({ id: 'x', human_validated: true }), /annotation/);
  assert.throws(
    () =>
      compile({
        mediaChecks: {
          doge: {
            state: 'available',
            source: 'https://example.com/doge.jpg',
            observed_on: '2026-10-24',
          },
        },
      }),
    /measured source/,
  );
});

test('machine visual evidence stays separate from selected editorial collections', () => {
  const source = legacy.find((record) => record.id === 'doge').media_url;
  const evidence = {
    method: 'model_visual_annotation',
    source,
    source_sha256: '1'.repeat(64),
    frame_sha256: ['2'.repeat(64)],
    model: 'test-served-model',
    prompt_version: 'test-v1',
    observed_on: '2026-10-24',
  };
  const annotation = {
    id: 'doge',
    association: 'consistent',
    association_reason: 'Source matches.',
    visual_description: 'A dog looks sideways.',
    visible_text: '',
    caption_guidance: 'Keep the face clear.',
    profile: {
      ...structuredClone(editorial.profiles['success-kid']),
      title: 'Doge visual fixture',
      evidence,
    },
    measurement: { url: source, source_sha256: evidence.source_sha256, width: 512, height: 512 },
    evidence,
    human_validated: false,
  };
  const model = compile({ annotations: { doge: annotation } }),
    reference = model.references.find((record) => record.id === 'doge');
  assert.equal(reference.title, 'Doge visual fixture');
  assert.equal(reference.review.state, 'visual_annotation');
  assert.equal(reference.review.human_validated, false);
  assert.equal(
    browseCatalogue(catalogueViews(model), { collection: 'selected' }).some(
      (record) => record.id === 'doge',
    ),
    false,
  );
  const conflict = structuredClone(annotation);
  conflict.association = 'conflict';
  assert.equal(
    compile({ annotations: { doge: conflict } }).references.find((record) => record.id === 'doge')
      .retrieval.eligible,
    false,
  );
  const wrong = structuredClone(annotation);
  wrong.evidence.source = 'https://example.com/other.jpg';
  wrong.profile.evidence = wrong.evidence;
  wrong.measurement.url = wrong.evidence.source;
  assert.throws(() => compile({ annotations: { doge: wrong } }), /this asset/);
});

test('corrected media carries the same revision into browser and runtime consumers', () => {
  const views = catalogueViews(compile());
  for (const id of [...Object.keys(assetOverrides), ...external.map((record) => record.id)]) {
    const view = views.find((record) => record.id === id),
      runtime = galleryCatalogue.find((record) => record.id === id);
    assert.match(view.media_revision, /^[a-f0-9]{64}$/);
    assert.equal(view.media_revision, runtime.media_revision);
  }
});

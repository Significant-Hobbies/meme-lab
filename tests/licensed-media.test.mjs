import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { licensedCuts, validateLicensedRecord } from '../src/licensed-media.mjs';
import { hostedVectorId } from '../src/catalogue-index.mjs';

const manifest = JSON.parse(
  await readFile(new URL('../catalogue/animation-cuts.json', import.meta.url)),
);
const records = JSON.parse(
  await readFile(new URL('../catalogue/external-clips.json', import.meta.url)),
);

test('hosted cuts preserve the licensed source identity, native detail, timing and cadence', () => {
  const cuts = licensedCuts(manifest);
  for (const record of records) validateLicensedRecord(record, cuts.get(record.id));
  for (const mutate of [
    (record) => {
      record.video_evidence.width *= 2;
    },
    (record) => {
      record.video_evidence.fps = 60;
    },
    (record) => {
      delete record.video_evidence.fps;
    },
    (record) => {
      record.provenance.original_download_url = 'https://example.com/other.mp4';
    },
    (record) => {
      record.provenance.clip_start_seconds += 1;
    },
    (record) => {
      record.video_evidence.duration += 2;
    },
    (record) => {
      record.video_evidence.frame_hashes.fill('a'.repeat(64));
    },
    (record) => {
      record.attribution = '';
    },
  ]) {
    const record = structuredClone(records[0]);
    mutate(record);
    assert.throws(
      () => validateLicensedRecord(record, cuts.get(record.id)),
      /licensed native source/,
    );
  }
});

test('adaptation registration rejects ND licenses, duplicate cuts and out-of-source intervals', () => {
  for (const license of [
    'https://creativecommons.org/licenses/by-nd/2.0/',
    'https://creativecommons.org/licenses/by-nc/4.0/',
  ]) {
    const changed = structuredClone(manifest);
    for (const source of Object.values(changed.sources ?? { bbb: changed.source }))
      source.license_url = license;
    assert.throws(() => licensedCuts(changed), /Unqualified/);
  }
  const duplicate = structuredClone(manifest);
  duplicate.clips.push(duplicate.clips[0]);
  assert.throws(() => licensedCuts(duplicate), /Unqualified/);
  const outside = structuredClone(manifest);
  outside.clips[0].start_seconds = -1;
  assert.throws(() => licensedCuts(outside), /Unqualified/);
});

test('cinema aspect ratios keep native dimensions and never gain pixels to earn a Full HD label', () => {
  const changed = structuredClone(manifest);
  const sources = changed.sources ?? { bbb: changed.source };
  const source = sources[changed.clips[0].source_id ?? 'bbb'];
  source.width = 1920;
  source.height = 804;
  source.fps = 24;
  const record = structuredClone(records.find((record) => record.id === changed.clips[0].id));
  record.video_evidence.width = 1920;
  record.video_evidence.height = 804;
  record.video_evidence.fps = 24;
  validateLicensedRecord(record, licensedCuts(changed).get(record.id));
});

test('reviewed cover frames remain tied to their exact hosted video', () => {
  const record = structuredClone(records.find(record => record.poster_evidence));
  assert.ok(record);
  record.poster_evidence.video_sha256 = 'a'.repeat(64);
  assert.throws(() => validateLicensedRecord(record, licensedCuts(manifest).get(record.id)), /Poster differs/);
  const invalid = structuredClone(manifest);
  invalid.clips[0].poster_fraction = 1;
  assert.throws(() => licensedCuts(invalid), /Unqualified/);
});

test('supplemental vector identities never depend on catalogue order or replace legacy positions', () => {
  const ids = records.flatMap((record) =>
    ['meaning', 'example'].map((view) => hostedVectorId(record.id, view)),
  );
  assert.equal(new Set(ids).size, records.length * 2);
  assert.ok(ids.every((id) => id.startsWith('hosted-') && id.length <= 64));
  assert.deepEqual(
    [...records]
      .reverse()
      .map((record) => hostedVectorId(record.id, 'meaning'))
      .reverse(),
    records.map((record) => hostedVectorId(record.id, 'meaning')),
  );
  assert.throws(() => hostedVectorId('../unregistered', 'meaning'), /Invalid/);
  assert.throws(() => hostedVectorId(records[0].id, 'arbitrary'), /Invalid/);
});

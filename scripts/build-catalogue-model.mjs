import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { licensedCuts, validateLicensedRecord } from '../src/licensed-media.mjs';
import { catalogue } from '../worker/src/catalogue.stage3000.generated.mjs';
import { clipLibrary } from '../worker/src/clip-library.generated.mjs';
import {
  compileCatalogue,
  applyCatalogueMetadata,
  resolveReferences,
  validateAnnotation,
} from '../src/catalogue-model.mjs';

const root = new URL('../', import.meta.url);
const editorial = JSON.parse(await readFile(new URL('catalogue/editorial.json', root), 'utf8'));
const external = JSON.parse(await readFile(new URL('catalogue/external-clips.json', root), 'utf8'));
const assetOverrides = JSON.parse(
  await readFile(new URL('catalogue/asset-overrides.json', root), 'utf8'),
);
const referenceAliases = JSON.parse(
  await readFile(new URL('catalogue/aliases.json', root), 'utf8'),
);
const mediaChecks = JSON.parse(
  await readFile(new URL('catalogue/media-checks.json', root), 'utf8'),
);
const exclusions = JSON.parse(await readFile(new URL('catalogue/exclusions.json', root), 'utf8'));
const annotationRows = (await readFile(new URL('catalogue/annotations.jsonl', root), 'utf8'))
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => validateAnnotation(JSON.parse(line)));
const annotations = Object.fromEntries(annotationRows.map((row) => [row.id, row]));
if (Object.keys(annotations).length !== annotationRows.length)
  throw Error('Repeated visual annotation identity.');
const metadata = {
  profiles: editorial.profiles,
  annotations,
  mediaChecks,
  exclusions,
};
const animationCuts = JSON.parse(
  await readFile(new URL('catalogue/animation-cuts.json', root), 'utf8'),
);
const qualifiedCuts = licensedCuts(animationCuts);
for (const record of external) {
  const local = /^\/assets\/clips\/[a-z0-9]+(?:-[a-z0-9]+)+\.mp4$/.test(record.media_url);
  const url = new URL(record.media_url, 'https://memes.significanthobbies.com');
  const remote =
    url.origin === 'https://upload.wikimedia.org' &&
    url.pathname.startsWith('/wikipedia/commons/') &&
    url.pathname.endsWith('.webm') &&
    record.mime_type === 'video/webm';
  if (
    !(local || remote) ||
    url.search ||
    url.hash ||
    (local && record.mime_type !== 'video/mp4') ||
    ![
      'https://creativecommons.org/licenses/by/3.0/',
      'https://creativecommons.org/licenses/by/4.0/',
    ].includes(record.license_url) ||
    !record.attribution ||
    !record.video_evidence?.eligible ||
    record.video_evidence.bytes > 20 * 1024 * 1024 ||
    record.video_evidence.duration > 30 ||
    record.video_evidence.url !== record.media_url
  )
    throw Error('Unqualified external clip: ' + record.id);
  if (local) {
    validateLicensedRecord(record, qualifiedCuts.get(record.id));
    const file = new URL('worker/public' + record.media_url, root);
    if (
      (await stat(file)).size !== record.video_evidence.bytes ||
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex') !== record.video_evidence.source_sha256
    )
      throw Error('Hosted animation differs from its qualified source: ' + record.id);
  }
}
for (const record of external) {
  const poster = record.poster_evidence;
  if (!poster) continue;
  const file = new URL('worker/public' + poster.url, root);
  if (
    (await stat(file)).size !== poster.bytes ||
    createHash('sha256')
      .update(await readFile(file))
      .digest('hex') !== poster.source_sha256
  )
    throw Error('Hosted poster differs from its reviewed frame: ' + record.id);
}
const model = compileCatalogue([...catalogue, ...clipLibrary, ...external], {
  ...editorial,
  ...metadata,
  assetOverrides,
  referenceAliases,
  retrievalIds: [...catalogue, ...external].map((record) => record.id),
});
const profiles = editorial.profiles;
const resolved = resolveReferences(catalogue, {
  assetOverrides,
  referenceAliases,
}).map((record) => applyCatalogueMetadata(record, metadata));
const retrieval = resolved.map(
  ({
    id,
    canonical_id,
    catalogue_status,
    name,
    message,
    relational_pattern,
    example_context,
    near_miss_context,
    tags,
    meme_strength,
    asset_quality,
    uniqueness_score,
  }) => ({
    id,
    name,
    message,
    relational_pattern,
    example_context,
    near_miss_context,
    tags,
    meme_strength,
    asset_quality,
    uniqueness_score,
    core: false,
    ...(canonical_id !== id ? { canonical_id } : {}),
    ...(catalogue_status !== 'active' ? { catalogue_status } : {}),
  }),
);
const compatibility = resolved.map(
  ({
    canonical_id,
    legacy_name,
    catalogue_status,
    catalogue_annotation,
    media_check,
    ...record
  }) => ({
    ...record,
    ...(canonical_id !== record.id ? { canonical_id } : {}),
    ...(catalogue_status !== 'active' ? { catalogue_status } : {}),
  }),
);
// Preserve the existing reserve membership; metadata corrections never add IDs to retrieval.
const previous = JSON.parse(
  await readFile(new URL('worker/tools/stage-3000-catalogue.json', root), 'utf8'),
);
const core = new Map(previous.map((record) => [record.id, record.core]));
for (const record of retrieval) record.core = core.get(record.id) === true;
const health = {
  schema_version: model.schema_version,
  ...model.summary,
  review_states: Object.fromEntries(
    ['editorial', 'visual_annotation', 'unreviewed', 'alias', 'excluded'].map((state) => [
      state,
      model.references.filter((reference) => reference.review.state === state).length,
    ]),
  ),
  encoded_resolutions: Object.fromEntries(
    ['1080p', '720p', 'below_720p', 'unmeasured'].map((resolution) => [
      resolution,
      model.assets.filter(
        (asset) => (asset.quality.encoded_resolution ?? 'unmeasured') === resolution,
      ).length,
    ]),
  ),
  unknown_use_context: model.references.filter((reference) => !reference.meaning.use_when).length,
  unknown_near_miss: model.references.filter((reference) => !reference.meaning.avoid_when).length,
};
const outputs = {
  'worker/public/assets/clips/LICENSE.txt':
    'Licensed hosted excerpts\n\n' +
    Object.values(animationCuts.sources ?? { bbb: animationCuts.source })
      .map(
        (source) =>
          `${source.title}\n${source.copyright}\nLicense: ${source.license_url}\nLicense statement: ${source.license_source_url}\nOriginal source: ${source.url}\nNative frame: ${source.width}x${source.height} at ${source.fps} fps.\n\n`,
      )
      .join('') +
    'Changes: short excerpts, H.264 encoding at native dimensions and cadence, audio omitted.\nMeme Lab adds user captions and a visible credit when exporting.\nFilm creators do not endorse captions added by users.\n',
  'worker/public/catalogue-v2.json': JSON.stringify(model) + '\n',
  'worker/public/catalogue-model.js': await readFile(
    new URL('src/catalogue-model.mjs', root),
    'utf8',
  ),
  'worker/public/catalogue-health.json': JSON.stringify(health, null, 2) + '\n',
  'worker/src/catalogue-profiles.generated.mjs':
    '// Generated from catalogue/editorial.json. Rebuild with build:catalogue.\nexport const catalogueProfiles=' +
    JSON.stringify(profiles) +
    ';\n',
  'worker/src/catalogue-external.generated.mjs':
    '// Generated from catalogue/external-clips.json. Rebuild with build:catalogue.\nexport const externalClips=' +
    JSON.stringify(external) +
    ';\n',
  'worker/src/catalogue-corrections.generated.mjs':
    '// Generated from catalogue/{asset-overrides,aliases}.json. Rebuild with build:catalogue.\nexport const assetOverrides=' +
    JSON.stringify(assetOverrides) +
    ';\nexport const referenceAliases=' +
    JSON.stringify(referenceAliases) +
    ';\n',
  'worker/src/catalogue-review.generated.mjs':
    '// Generated from catalogue/{annotations,media-checks,exclusions}. Rebuild with build:catalogue.\nexport const catalogueReview=' +
    JSON.stringify({ annotations, mediaChecks, exclusions }) +
    ';\n',
  'worker/public/collection.json': JSON.stringify(compatibility, null, 2) + '\n',
  'worker/tools/stage-3000-catalogue.json': JSON.stringify(retrieval, null, 2) + '\n',
};
for (const [path, content] of Object.entries(outputs)) {
  if (process.argv.includes('--check')) {
    if ((await readFile(new URL(path, root), 'utf8')) !== content)
      throw Error('Stale catalogue output: ' + path);
  } else await writeFile(new URL(path, root), content);
}
console.log(JSON.stringify(health, null, 2));

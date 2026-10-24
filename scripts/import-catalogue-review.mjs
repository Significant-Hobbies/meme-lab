// Promote technical and machine evidence without promoting editorial selection.
import { readFile, writeFile } from 'node:fs/promises';
import { validateAnnotation, mediaQuality } from '../src/catalogue-model.mjs';
const option = (name) =>
  process.argv.find((value) => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const input = option('input'),
  annotationsPath = option('annotations');
if (!input)
  throw Error('Use --input=<prepared.jsonl> [--annotations=<validated annotations.jsonl>].');
const root = new URL('../', import.meta.url);
const model = JSON.parse(await readFile(new URL('worker/public/catalogue-v2.json', root), 'utf8'));
const references = new Map(
  model.references
    .filter((reference) => reference.id === reference.canonical_id)
    .map((reference) => [reference.id, reference]),
);
const assets = new Map(model.assets.map((asset) => [asset.id, asset]));
const checks = JSON.parse(await readFile(new URL('catalogue/media-checks.json', root), 'utf8'));
const rows = (await readFile(input, 'utf8'))
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
if (new Set(rows.map((row) => row.id)).size !== rows.length)
  throw Error('Repeated qualification ID.');
let available = 0,
  unavailable = 0,
  unresolved = 0;
for (const row of rows) {
  const reference = references.get(row.id);
  if (!reference) throw Error('Unknown canonical qualification ID: ' + row.id);
  const asset = assets.get(reference.asset_ids[0]),
    url = (asset.variants.video ?? asset.variants.original).url;
  if (row.source_url !== url || !/^\d{4}-\d\d-\d\dT/.test(row.observed_at))
    throw Error('Qualification does not describe the registered source: ' + row.id);
  const measurement = row.measurement;
  if (
    measurement?.url === url &&
    /^[a-f0-9]{64}$/.test(measurement.source_sha256) &&
    Number.isInteger(measurement.width) &&
    Number.isInteger(measurement.height)
  ) {
    mediaQuality(measurement);
    checks[row.id] = {
      state: 'available',
      source: url,
      observed_on: row.observed_at.slice(0, 10),
      measurement,
      visual_evidence:
        row.status === 'prepared'
          ? { state: 'prepared', frame_sha256: row.frame_sha256 }
          : { state: 'unresolved', reason: row.error },
    };
    available++;
  } else if (row.error === 'HTTP Error 404: Not Found') {
    checks[row.id] = {
      state: 'unavailable',
      source: url,
      observed_on: row.observed_at.slice(0, 10),
      reason: 'source_video_not_found',
    };
    unavailable++;
  } else unresolved++;
}
if (annotationsPath) {
  const rows = (await readFile(annotationsPath, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => validateAnnotation(JSON.parse(line)));
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    throw Error('Repeated annotation ID.');
  for (const row of rows)
    if (
      !references.has(row.id) ||
      checks[row.id]?.state !== 'available' ||
      checks[row.id].measurement.source_sha256 !== row.evidence.source_sha256 ||
      checks[row.id].source !== row.evidence.source
    )
      throw Error('Annotation has no matching measured source: ' + row.id);
  const previous = (await readFile(new URL('catalogue/annotations.jsonl', root), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => validateAnnotation(JSON.parse(line)));
  const byId = new Map(previous.map((row) => [row.id, row]));
  for (const row of rows) byId.set(row.id, row);
  await writeFile(
    new URL('catalogue/annotations.jsonl', root),
    [...byId.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row) => JSON.stringify(row))
      .join('\n') + '\n',
  );
}
await writeFile(
  new URL('catalogue/media-checks.json', root),
  JSON.stringify(
    Object.fromEntries(Object.entries(checks).sort(([a], [b]) => a.localeCompare(b))),
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ attempted: rows.length, available, unavailable, unresolved }));

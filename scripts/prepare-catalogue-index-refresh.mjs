// Prepare vectors; this command never mutates an index. Back up and verify the
// exact existing IDs before a separate, explicit upsert and retain rollback data.
import { readFile, writeFile } from 'node:fs/promises';
import { getPlatformProxy } from 'wrangler';
import { semanticText, exampleText, hostedVectorId } from '../src/catalogue-index.mjs';
import { hostedRetrievalCatalogue } from '../worker/src/catalogue.mjs';
const option = (name) =>
  process.argv.find((value) => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const baselinePath = option('baseline'),
  output = option('output'),
  config = option('gateway-config');
if (!baselinePath || !output || !config)
  throw Error(
    'Use --baseline=<previous catalogue.json> --output=<vectors.ndjson> --gateway-config=<local existing remote-binding config>.',
  );
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const current = JSON.parse(
  await readFile(new URL('../worker/tools/stage-3000-catalogue.json', import.meta.url), 'utf8'),
);
if (
  baseline.length !== current.length ||
  current.some(
    (record, index) => record.id !== baseline[index].id || record.core !== baseline[index].core,
  )
)
  throw Error('Index membership, order and reserve must stay unchanged.');
const changed = current
  .map((record, index) => ({ record, index }))
  .filter(
    ({ record, index }) =>
      (record.catalogue_status ?? 'active') === 'active' &&
      (semanticText(record) !== semanticText(baseline[index]) ||
        exampleText(record) !== exampleText(baseline[index])),
  );
const includeHosted = process.argv.includes('--include-hosted');
const additions = includeHosted
  ? hostedRetrievalCatalogue.map((record) => ({ record, index: null }))
  : [];
const targets = [...changed, ...additions];
const vectorId = (record, index, view) =>
  index === null
    ? hostedVectorId(record.id, view)
    : `meme-${String(index + 1).padStart(4, '0')}-${view}`;
const plan = {
  model: '@cf/baai/bge-base-en-v1.5',
  pooling: 'cls',
  records: targets.map(({ record, index }) => ({
    id: record.id,
    index,
    operation: index === null ? 'hosted_upsert' : 'legacy_update',
    vector_ids: ['meaning', 'example'].map((view) => vectorId(record, index, view)),
  })),
};
await writeFile(output + '.plan.json', JSON.stringify(plan, null, 2) + '\n');
const platform = await getPlatformProxy({
  configPath: config,
  envFiles: [],
  persist: false,
});
const entries = [];
try {
  for (let offset = 0; offset < targets.length; offset += 8) {
    const batch = targets.slice(offset, offset + 8),
      texts = batch.flatMap(({ record }) => [semanticText(record), exampleText(record)]);
    const response = await platform.env.FREE_AI.run('meme-lab', plan.model, {
      text: texts,
      pooling: plan.pooling,
    });
    try {
      if (
        !Array.isArray(response?.data) ||
        response.data.length !== texts.length ||
        response.data.some(
          (vector) =>
            !Array.isArray(vector) ||
            vector.length !== 768 ||
            vector.some((value) => !Number.isFinite(value)),
        )
      )
        throw Error('Invalid or incomplete embedding batch. No index was changed.');
      for (const [position, { record, index }] of batch.entries())
        for (const [viewIndex, view] of ['meaning', 'example'].entries())
          entries.push({
            id: vectorId(record, index, view),
            values: [...response.data[position * 2 + viewIndex]],
            metadata: {
              catalogue_id: record.id,
              canonical_id: record.canonical_id ?? record.id,
              name: record.name,
              stage: 3000,
              control: index !== null && index < 30,
              core: record.core === true,
              view,
            },
          });
    } finally {
      response?.[Symbol.dispose]?.();
    }
    console.log(
      JSON.stringify({
        prepared: Math.min(offset + batch.length, targets.length),
        changed_records: changed.length,
        hosted_records: additions.length,
      }),
    );
  }
  await writeFile(output, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
} finally {
  await platform.dispose();
}

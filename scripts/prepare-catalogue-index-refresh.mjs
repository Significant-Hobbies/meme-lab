// Prepare vectors; this command never mutates an index. Back up and verify the
// exact existing IDs before a separate, explicit upsert and retain rollback data.
import { readFile, writeFile } from 'node:fs/promises';
import { getPlatformProxy } from 'wrangler';
import { semanticText, exampleText } from '../src/catalogue-index.mjs';
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
const plan = {
  model: '@cf/baai/bge-base-en-v1.5',
  pooling: 'cls',
  records: changed.map(({ record, index }) => ({
    id: record.id,
    index,
    vector_ids: ['meaning', 'example'].map(
      (view) => `meme-${String(index + 1).padStart(4, '0')}-${view}`,
    ),
  })),
};
await writeFile(output + '.plan.json', JSON.stringify(plan, null, 2) + '\n');
const platform = await getPlatformProxy({ configPath: config, envFiles: [], persist: false });
const entries = [];
try {
  for (let offset = 0; offset < changed.length; offset += 8) {
    const batch = changed.slice(offset, offset + 8),
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
            id: `meme-${String(index + 1).padStart(4, '0')}-${view}`,
            values: [...response.data[position * 2 + viewIndex]],
            metadata: {
              catalogue_id: record.id,
              canonical_id: record.canonical_id ?? record.id,
              name: record.name,
              stage: 3000,
              control: index < 30,
              core: record.core === true,
              view,
            },
          });
    } finally {
      response?.[Symbol.dispose]?.();
    }
    console.log(
      JSON.stringify({
        prepared: Math.min(offset + batch.length, changed.length),
        changed_records: changed.length,
      }),
    );
  }
  await writeFile(output, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
} finally {
  await platform.dispose();
}

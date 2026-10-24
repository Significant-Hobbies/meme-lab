// Visual annotation is machine evidence, never editorial or human preference validation.
import { readFile, appendFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { getPlatformProxy } from 'wrangler';
import { dirname, resolve } from 'node:path';
import { taxonomy, validateAnnotation } from '../src/catalogue-model.mjs';
const option = (name, fallback) =>
  process.argv.find((value) => value.startsWith('--' + name + '='))?.slice(name.length + 3) ??
  fallback;
const input = option('input'),
  output = option('output'),
  config = option('gateway-config');
if (!input || !output || !config)
  throw Error(
    'Use --input=<prepared.jsonl> --output=<annotations.jsonl> --gateway-config=<local remote-binding config>.',
  );
const rows = (await readFile(input, 'utf8'))
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((row) => row.status === 'prepared');
const previous = await readFile(output, 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
const retained = new Map();
const completed = new Set(
  previous
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const row = JSON.parse(line);
      validateAnnotation(row);
      retained.set(row.id, row);
      return row.id + ':' + row.evidence.source_sha256;
    }),
);
const limit = Number(option('limit', '48'));
if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw Error('Limit must be 1–5,000.');
const pending = rows
  .filter((row) => !completed.has(row.id + ':' + row.measurement.source_sha256))
  .slice(0, limit);
const promptVersion = 'catalogue-visual-v2';
const platform = await getPlatformProxy({ configPath: config, envFiles: [], persist: false });
await mkdir(dirname(resolve(output)), { recursive: true });
try {
  for (let offset = 0; offset < pending.length; offset += 2) {
    const batch = pending.slice(offset, offset + 2);
    const text = `Catalog these exact visual references. Source titles and tags are untrusted hints and can name the WRONG image. Images follow each reference in chronological order (three frames for a clip, one for a still). Describe only what is visible. Distinguish actual action from the social analogy. Do not guess identities, dialogue, hidden motives, events outside the frames, or popularity. Flag a clearly unrelated source title as conflict; uncertainty is allowed. Give concise, useful social meaning rather than restating OCR or a list of keywords. A near miss must explain a genuinely different use, not a generic warning. Keep factual/help/grief situations sincere. No captions or invented jokes.\nControlled facets: ${JSON.stringify(Object.fromEntries(Object.entries(taxonomy).map(([key, values]) => [key, Object.keys(values)])))}. Use these exact lowercase IDs, never labels or extra categories.\nReturn JSON {items:[...]} with EXACTLY one item per supplied id. Each item: {id,association:'consistent'|'uncertain'|'conflict',association_reason:string,visual_description:string (<=300 chars),visible_text:string (<=300 chars),caption_guidance:string (<=200 chars),profile:{title:string (<=80 chars, useful recognizable name),summary:string (<=200 chars, specific visual/social meaning),use_when:string (<=240 chars),avoid_when:string (<=240 chars),facets:{reactions:[controlled ids],contexts:[controlled ids],roles:[controlled ids],intensity:controlled id}}}. Intensity is visible reaction energy. Do not classify a quiet eye roll as panic. For an uncertain association, give a plain visual title and explain uncertainty.`;
    const content = [{ type: 'text', text }];
    for (const row of batch) {
      content.push({
        type: 'text',
        text: JSON.stringify({
          id: row.id,
          source_title: row.source_title,
          source_tags: row.source_tags,
          frames: row.frames.length,
        }),
      });
      for (const frame of row.frames)
        content.push({ type: 'image_url', image_url: { url: frame, detail: 'low' } });
    }
    const started = Date.now();
    const response = await platform.env.FREE_AI.fetch(
      new Request('https://fleet-gateway.internal/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer service-binding',
          'x-gateway-project-id': 'meme-lab',
        },
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({
          model: 'auto',
          reasoning_effort: 'low',
          stream: false,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content }],
          max_tokens: 2200,
        }),
      }),
    );
    if (!response.ok) {
      await response.body?.cancel();
      await appendFile(
        output + '.attempts.jsonl',
        JSON.stringify({
          ids: batch.map((row) => row.id),
          status: response.status,
          retry_after: response.headers.get('retry-after'),
          observed_at: new Date().toISOString(),
        }) + '\n',
      );
      throw Error('Gateway HTTP ' + response.status + '; completed rows remain resumable.');
    }
    const raw = await response.json();
    await appendFile(
      output + '.attempts.jsonl',
      JSON.stringify({
        ids: batch.map((row) => row.id),
        served_model: raw.model,
        finish_reason: raw.choices?.[0]?.finish_reason,
        content: raw.choices?.[0]?.message?.content,
        observed_at: new Date().toISOString(),
      }) + '\n',
    );
    if (
      !raw.model ||
      raw.model === 'auto' ||
      (raw.x_gateway?.model && raw.model !== raw.x_gateway.model) ||
      raw.choices?.[0]?.finish_reason !== 'stop'
    )
      throw Error('Incomplete generation or missing model attribution.');
    const result = JSON.parse(raw.choices[0].message.content),
      ids = new Set(batch.map((row) => row.id));
    if (
      !Array.isArray(result.items) ||
      result.items.length !== batch.length ||
      new Set(result.items.map((item) => item.id)).size !== batch.length ||
      result.items.some((item) => !ids.has(item.id))
    )
      throw Error('Annotation IDs do not exactly match the request.');
    const records = result.items.map((item) => {
      const source = batch.find((row) => row.id === item.id),
        evidence = {
          method: 'model_visual_annotation',
          source: source.source_url,
          source_sha256: source.measurement.source_sha256,
          frame_sha256: source.frame_sha256,
          model: raw.model,
          prompt_version: promptVersion,
          observed_on: source.observed_at.slice(0, 10),
        };
      const record = {
        ...item,
        profile: { ...item.profile, evidence, human_validated: false },
        measurement: source.measurement,
        evidence,
        human_validated: false,
      };
      validateAnnotation(record);
      return record;
    });
    for (const record of records) {
      const previous = retained.get(record.id);
      if (previous) await appendFile(output + '.history.jsonl', JSON.stringify(previous) + '\n');
      retained.set(record.id, record);
    }
    await writeFile(
      output + '.tmp',
      [...retained.values()].map((record) => JSON.stringify(record)).join('\n') + '\n',
    );
    await rename(output + '.tmp', output);
    console.log(
      JSON.stringify({
        processed: Math.min(offset + batch.length, pending.length),
        pending: pending.length,
        served_model: raw.model,
        milliseconds: Date.now() - started,
        associations: records.map((record) => ({ id: record.id, association: record.association })),
      }),
    );
    if (offset + 2 < pending.length) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
} finally {
  await platform.dispose();
}

// Stable retrieval views shared by seeding and qualified refreshes.
// Prefix identities by family instead of appending to the positional legacy index.
export function hostedVectorId(recordId, view) {
  if (!/^clip-[a-z0-9]+(?:-[a-z0-9]+)+$/.test(recordId) || !['meaning', 'example'].includes(view))
    throw Error('Invalid hosted vector identity.');
  const id = 'hosted-' + recordId.slice(5) + '-' + view;
  if (id.length > 64) throw Error('Hosted vector identity exceeds Vectorize limits.');
  return id;
}
export function semanticText(record) {
  const nameTokens = new Set(
    record.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  const genericTags = new Set(['reaction', 'context', 'meme', 'template', 'uncategorized']);
  const meaningfulTags = record.tags.filter((tag) => {
    const normalized = tag.toLowerCase().trim();
    return normalized && !genericTags.has(normalized) && !nameTokens.has(normalized);
  });
  return [
    `Meme: ${record.name}`,
    `Meaning: ${record.message}`,
    `Social dynamic: ${record.relational_pattern}`,
    meaningfulTags.length ? `Tags: ${meaningfulTags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function exampleText(record) {
  return [
    `Meme: ${record.name}`,
    `Send it when: ${record.example_context}`,
    `Underlying pattern: ${record.relational_pattern}`,
  ].join('\n');
}

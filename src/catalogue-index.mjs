// Stable retrieval views shared by seeding and qualified refreshes.
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

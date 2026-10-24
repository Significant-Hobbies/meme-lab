// Meaning, media and editorial selection have independent evidence and identities.
export const taxonomy = {
  reactions: {
    agreement: 'Agreement',
    celebration: 'Celebration',
    relief: 'Relief',
    disbelief: 'Disbelief',
    confusion: 'Confusion',
    awkwardness: 'Awkwardness',
    disappointment: 'Disappointment',
    impatience: 'Waiting',
    panic: 'Panic',
    amusement: 'Amusement',
    dismissal: 'No thanks',
    skepticism: 'Unimpressed',
    affection: 'Affection',
    anger: 'Frustration',
    fatigue: 'Tired',
    anticipation: 'Looking forward to it',
    determination: 'Determination',
  },
  contexts: {
    work: 'Work',
    technology: 'Technology',
    friends: 'Friends',
    family: 'Family',
    relationships: 'Relationships',
    money: 'Money',
    food: 'Food',
    everyday: 'Everyday life',
  },
  roles: {
    self: 'My reaction',
    other: 'Their reaction',
    observer: 'Watching it happen',
    situation: 'The situation',
  },
  intensity: {
    quiet: 'Understated',
    expressive: 'Expressive',
    exaggerated: 'Over the top',
    unknown: 'Not assessed',
  },
};
const reactionTerms = {
  agreement: /\b(agree|agreed|agreement|yes|nod|approve|approval)\b/i,
  celebration: /\b(celebrat\w*|victory|success|proud|triumph|congratulat\w*|applause|clapping)\b/i,
  relief: /\b(relief|relieved|finally over|saved)\b/i,
  disbelief: /\b(disbelief|incredulous|shocked|surpris\w*|unexpected)\b/i,
  confusion: /\b(confus\w*|puzzled|bewildered|what is happening)\b/i,
  awkwardness: /\b(awkward\w*|embarrass\w*|cringe)\b/i,
  disappointment: /\b(disappoint\w*|defeat\w*|letdown|sadness|sad)\b/i,
  impatience: /\b(wait\w*|bored\w*|impatien\w*|delay\w*)\b/i,
  panic: /\b(panic\w*|chaos|disaster|overwhelm\w*|frantic)\b/i,
  amusement: /\b(laugh\w*|amused|amusement|hilarious)\b/i,
  dismissal: /\b(nope|refus\w*|reject\w*|no thanks|not interested)\b/i,
  skepticism: /\b(skepti\w*|unimpressed|eye roll|eye-roll|doubt\w*)\b/i,
  affection: /\b(affection\w*|wholesome|love|hug\w*)\b/i,
  anger: /\b(angry|anger|frustrat\w*|annoy\w*|furious)\b/i,
  fatigue: /\b(tired|sleepy|exhaust\w*|yawn\w*)\b/i,
  anticipation: /\b(anticipat\w*|can.t wait|hungry|craving|tempt\w*)\b/i,
  determination: /\b(determin\w*|persever\w*|keep going|won.t give up)\b/i,
};
const contextTerms = {
  work: /\b(work|office|boss|manager|meeting|deadline|coworker|colleague)\b/i,
  technology: /\b(code|bug|software|computer|programmer|developer|deploy|app|internet)\b/i,
  friends: /\b(friend\w*|group chat|roommate\w*)\b/i,
  family: /\b(family|parent\w*|child\w*|kid\w*|mother|father|sibling\w*)\b/i,
  relationships: /\b(dating|date|partner|couple|romance|breakup)\b/i,
  money: /\b(money|salary|payday|rent|budget|buy|buying|shopping|expensive)\b/i,
  food: /\b(food|pizza|cooking|dinner|lunch|breakfast|coffee|snack)\b/i,
  everyday: /\b(commut\w*|bus|train|traffic|chores|sleep|weekend|morning|exercise|gym)\b/i,
};
const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const selected = (terms, text) =>
  Object.entries(terms)
    .filter(([, pattern]) => pattern.test(text))
    .map(([id]) => id);

export function inferredFacets(record) {
  // Source tags are useful for discovery, never a claim of visual understanding.
  const text = [record.name, record.message, ...(record.tags ?? [])].join(' ');
  return {
    reactions: selected(reactionTerms, text),
    contexts: selected(contextTerms, text),
    roles: [],
    intensity: 'unknown',
    basis: 'legacy_text_inference',
  };
}

export function validateEditorial(profile) {
  if (
    !profile ||
    !clean(profile.title) ||
    profile.title.length > 80 ||
    !clean(profile.summary) ||
    profile.summary.length > 200 ||
    !clean(profile.use_when) ||
    !clean(profile.avoid_when) ||
    !profile.evidence?.method ||
    !profile.evidence?.source ||
    profile.human_validated !== false
  )
    throw Error(
      'An editorial profile needs a specific meaning, near miss and attributable evidence.',
    );
  for (const key of ['reactions', 'contexts', 'roles'])
    if (
      !Array.isArray(profile.facets?.[key]) ||
      new Set(profile.facets[key]).size !== profile.facets[key].length ||
      profile.facets[key].some((id) => !Object.hasOwn(taxonomy[key], id))
    )
      throw Error('Unknown or repeated editorial facet: ' + key);
  if (
    !profile.facets.reactions.length ||
    !Object.hasOwn(taxonomy.intensity, profile.facets.intensity)
  )
    throw Error('An editorial profile needs a reaction and assessed intensity.');
  return profile;
}

export function validateAnnotation(annotation) {
  if (
    !annotation ||
    !clean(annotation.id) ||
    !['consistent', 'uncertain', 'conflict'].includes(annotation.association) ||
    !clean(annotation.association_reason) ||
    !clean(annotation.visual_description) ||
    annotation.visual_description.length > 300 ||
    typeof annotation.visible_text !== 'string' ||
    annotation.visible_text.length > 300 ||
    !clean(annotation.caption_guidance) ||
    annotation.caption_guidance.length > 200 ||
    annotation.human_validated !== false
  )
    throw Error('Invalid visual annotation.');
  const evidence = annotation.evidence;
  if (
    evidence?.method !== 'model_visual_annotation' ||
    !clean(evidence.model) ||
    evidence.model === 'auto' ||
    !clean(evidence.prompt_version) ||
    !/^[a-f0-9]{64}$/.test(evidence.source_sha256) ||
    !Array.isArray(evidence.frame_sha256) ||
    ![1, 3].includes(evidence.frame_sha256.length) ||
    evidence.frame_sha256.some((hash) => !/^[a-f0-9]{64}$/.test(hash)) ||
    annotation.measurement?.source_sha256 !== evidence.source_sha256 ||
    annotation.measurement?.url !== evidence.source
  )
    throw Error('Visual annotation lacks source and model evidence.');
  validateEditorial(annotation.profile);
  if (
    annotation.profile.use_when.length > 240 ||
    annotation.profile.avoid_when.length > 240 ||
    JSON.stringify(annotation.profile.evidence) !== JSON.stringify(evidence)
  )
    throw Error('Invalid annotation meaning evidence.');
  return annotation;
}

export function mediaQuality(measurement) {
  if (!measurement)
    return {
      state: 'unmeasured',
      width: null,
      height: null,
      encoded_resolution: null,
    };
  const { width, height } = measurement;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw Error('Invalid measured dimensions.');
  const long = Math.max(width, height),
    short = Math.min(width, height);
  return {
    state: 'measured',
    width,
    height,
    encoded_resolution:
      long >= 1920 && short >= 1080
        ? '1080p'
        : long >= 1280 && short >= 720
          ? '720p'
          : 'below_720p',
  };
}

export function applyEditorial(record, profile) {
  if (!profile) return record;
  validateEditorial(profile);
  return {
    ...record,
    name: profile.title,
    message: profile.summary,
    relational_pattern: profile.use_when,
    example_context: profile.use_when,
    near_miss_context: profile.avoid_when,
    tags: [...new Set([...profile.facets.reactions, ...profile.facets.contexts, ...record.tags])],
    catalogue_profile: {
      facets: profile.facets,
      evidence: profile.evidence,
      human_validated: false,
    },
  };
}

export function resolveReferences(records, { assetOverrides = {}, referenceAliases = {} } = {}) {
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const [id, override] of Object.entries(assetOverrides)) {
    if (!byId.has(id)) throw Error('Asset correction has no reference: ' + id);
    const url = new URL(override.url);
    if (
      url.origin !== 'https://i.imgflip.com' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/[a-z0-9]+\.(jpg|png)$/.test(url.pathname) ||
      !(
        override.source_url?.startsWith('https://imgflip.com/') ||
        override.source_url === 'https://api.imgflip.com/get_memes'
      ) ||
      !override.measurement ||
      override.measurement.url !== override.url ||
      !/^[a-f0-9]{64}$/.test(override.measurement.source_sha256)
    )
      throw Error('Asset correction lacks exact source evidence: ' + id);
  }
  for (const [id, target] of Object.entries(referenceAliases))
    if (
      !byId.has(id) ||
      !byId.has(target) ||
      id === target ||
      Object.hasOwn(referenceAliases, target) ||
      byId.get(id).media_type !== byId.get(target).media_type
    )
      throw Error('Invalid or chained canonical alias: ' + id);
  return records.map((original) => {
    const canonicalId = referenceAliases[original.id] ?? original.id,
      record = byId.get(canonicalId),
      override = assetOverrides[canonicalId];
    return {
      ...record,
      ...(override
        ? {
            image_url: override.url,
            media_url: override.url,
            preview_url: override.url,
            mime_type: override.measurement.mime_type,
            asset_evidence: override.measurement,
            provenance: {
              ...record.provenance,
              source_url: override.source_url,
              asset_correction: {
                method: 'assistant_source_and_visual_review',
                observed_on: override.measurement.observed_on,
                source_sha256: override.measurement.source_sha256,
              },
            },
          }
        : {}),
      id: original.id,
      canonical_id: canonicalId,
      legacy_name: original.name,
    };
  });
}

export function applyCatalogueMetadata(
  record,
  { profiles = {}, annotations = {}, mediaChecks = {}, exclusions = {} } = {},
) {
  const id = record.canonical_id ?? record.id,
    annotation = annotations[id],
    check = mediaChecks[id];
  if (annotation) validateAnnotation(annotation);
  const profile =
    profiles[id] ?? (annotation?.association === 'consistent' ? annotation.profile : null);
  const status =
    exclusions[id] || (!profiles[id] && annotation?.association === 'conflict')
      ? 'excluded'
      : check?.state === 'unavailable'
        ? 'unavailable'
        : 'active';
  const result = applyEditorial(record, profile);
  return {
    ...result,
    media_revision:
      check?.measurement?.source_sha256 ??
      record.video_evidence?.source_sha256 ??
      record.asset_evidence?.source_sha256,
    ...(check?.state === 'available'
      ? record.media_type === 'gif'
        ? { video_evidence: { ...record.video_evidence, ...check.measurement } }
        : { asset_evidence: check.measurement }
      : {}),
    catalogue_status: status,
    catalogue_annotation: annotation ?? null,
    media_check: check ?? null,
  };
}

export function compileCatalogue(
  records,
  {
    profiles = {},
    collections = [],
    retrievalIds = [],
    assetOverrides = {},
    referenceAliases = {},
    annotations = {},
    mediaChecks = {},
    exclusions = {},
  } = {},
) {
  const known = new Set(records.map((record) => record.id)),
    retrieval = new Set(retrievalIds);
  if (known.size !== records.length) throw Error('Repeated reference identity.');
  if ([...retrieval].some((id) => !known.has(id)))
    throw Error('Retrieval identity is missing from the catalogue.');
  for (const registry of [profiles, annotations, mediaChecks, exclusions, assetOverrides])
    for (const id of Object.keys(registry))
      if (Object.hasOwn(referenceAliases, id))
        throw Error('Catalogue metadata must target a canonical reference: ' + id);
  for (const [id, profile] of Object.entries(profiles)) {
    if (!known.has(id)) throw Error('Editorial profile has no reference: ' + id);
    validateEditorial(profile);
  }
  for (const [id, annotation] of Object.entries(annotations)) {
    if (!known.has(id) || annotation.id !== id) throw Error('Annotation has no reference: ' + id);
    validateAnnotation(annotation);
  }
  for (const [id, exclusion] of Object.entries(exclusions))
    if (!known.has(id) || profiles[id] || !clean(exclusion.reason) || !clean(exclusion.source))
      throw Error('Invalid catalogue exclusion: ' + id);
  for (const [id, check] of Object.entries(mediaChecks)) {
    if (
      !known.has(id) ||
      !['available', 'unavailable'].includes(check.state) ||
      !clean(check.source) ||
      !check.observed_on
    )
      throw Error('Invalid media check: ' + id);
    if (
      check.state === 'available' &&
      (!check.measurement ||
        check.measurement.url !== check.source ||
        !/^[a-f0-9]{64}$/.test(check.measurement.source_sha256))
    )
      throw Error('Media check lacks measured source: ' + id);
  }
  const collectionIds = new Set();
  for (const collection of collections) {
    if (
      !/^[a-z][a-z0-9-]+$/.test(collection.id) ||
      collectionIds.has(collection.id) ||
      !clean(collection.title) ||
      !clean(collection.description) ||
      !Array.isArray(collection.reference_ids) ||
      !collection.reference_ids.length ||
      new Set(collection.reference_ids).size !== collection.reference_ids.length ||
      collection.reference_ids.some((id) => !profiles[id])
    )
      throw Error('Editorial collections require distinct, profiled references.');
    collectionIds.add(collection.id);
  }
  const aliasNames = new Map();
  for (const record of records) {
    const canonicalId = referenceAliases[record.id];
    if (canonicalId)
      aliasNames.set(canonicalId, [...(aliasNames.get(canonicalId) ?? []), record.name]);
  }
  records = resolveReferences(records, { assetOverrides, referenceAliases });
  const references = [],
    assets = [],
    assetById = new Map();
  for (const original of records) {
    const record = applyCatalogueMetadata(original, {
      profiles,
      annotations,
      mediaChecks,
      exclusions,
    });
    if (!record.id || !clean(record.name) || !['image', 'gif'].includes(record.media_type))
      throw Error('Invalid legacy reference.');
    const annotation = annotations[record.canonical_id],
      profile =
        profiles[record.canonical_id] ??
        (annotation?.association === 'consistent' ? annotation.profile : null),
      facets = profile
        ? {
            ...profile.facets,
            basis: profiles[record.canonical_id] ? 'editorial_profile' : 'visual_annotation',
          }
        : inferredFacets(record);
    const assetId = 'asset:' + record.canonical_id,
      source = record.media_url || record.image_url;
    const localSource = /^\/assets\/clips\/[a-z0-9]+(?:-[a-z0-9]+)+\.mp4$/.test(source);
    const sourceUrl = new URL(
      source,
      localSource ? 'https://memes.significanthobbies.com' : undefined,
    );
    if (!['https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password)
      throw Error('Unsafe source asset.');
    const variants = {
      original: {
        url: source,
        mime_type: record.mime_type || (record.media_type === 'gif' ? 'image/gif' : null),
      },
      preview: { url: record.preview_url || source },
    };
    if (
      record.media_type === 'gif' &&
      sourceUrl.origin === 'https://media.giphy.com' &&
      /^\/media\/[a-zA-Z0-9]+\/giphy\.gif$/.test(sourceUrl.pathname)
    )
      variants.video = {
        url: source.replace(/giphy\.gif$/, 'giphy.mp4'),
        mime_type: 'video/mp4',
      };
    if (record.mime_type?.startsWith('video/')) variants.video = { ...variants.original };
    const check = mediaChecks[record.canonical_id];
    if (check && ![variants.original.url, variants.video?.url].includes(check.source))
      throw Error('Media check does not describe this asset: ' + record.id);
    if (
      annotation &&
      ![variants.original.url, variants.video?.url].includes(annotation.evidence.source)
    )
      throw Error('Visual evidence does not describe this asset: ' + record.id);
    const measurement =
      check?.state === 'available'
        ? check.measurement
        : (record.video_evidence ?? record.asset_evidence);
    if (assetById.has(assetId)) assetById.get(assetId).reference_ids.push(record.id);
    else {
      const asset = {
        id: assetId,
        reference_ids: [record.id],
        kind: record.media_type === 'gif' ? 'clip' : 'template',
        variants,
        availability: check
          ? {
              state: check.state,
              source: check.source,
              observed_on: check.observed_on,
              reason: check.reason ?? null,
            }
          : { state: 'unverified' },
        quality: mediaQuality(measurement),
        measurement: measurement ?? null,
        rights: {
          state: record.media_status === 'approved' ? 'established' : 'not_established',
          license_url: record.license_url ?? null,
          attribution: record.attribution ?? null,
        },
        provenance: record.provenance ?? null,
      };
      assets.push(asset);
      assetById.set(assetId, asset);
    }
    references.push({
      id: record.id,
      canonical_id: record.canonical_id,
      status: record.catalogue_status,
      title: profile?.title ?? record.name,
      aliases: [
        ...new Set([
          record.legacy_name ?? record.name,
          ...(profile?.aliases ?? []),
          ...(aliasNames.get(record.canonical_id) ?? []),
        ]),
      ],
      source_tags: original.tags ?? [],
      kind: record.media_type === 'gif' ? 'clip' : 'template',
      meaning: {
        summary: profile?.summary ?? record.message ?? null,
        use_when:
          profile?.use_when ??
          (record.catalogue_scope === 'gallery' ? null : record.example_context || null),
        avoid_when: profile?.avoid_when ?? (record.near_miss_context || null),
      },
      facets,
      asset_ids: [assetId],
      collections: collections
        .filter((collection) => collection.reference_ids.includes(record.id))
        .map((collection) => collection.id),
      review: {
        state:
          record.id !== record.canonical_id
            ? 'alias'
            : record.catalogue_status === 'excluded'
              ? 'excluded'
              : profiles[record.canonical_id]
                ? 'editorial'
                : profile
                  ? 'visual_annotation'
                  : 'unreviewed',
        basis: profile?.evidence ?? {
          method:
            record.catalogue_scope === 'gallery'
              ? 'provider_tags_and_ocr'
              : 'legacy_model_metadata',
        },
        human_validated: false,
      },
      retrieval: {
        eligible: retrieval.has(record.id) && record.catalogue_status === 'active',
        state: retrieval.has(record.id)
          ? record.catalogue_status === 'active'
            ? 'existing_index'
            : 'excluded'
          : 'not_indexed',
      },
    });
  }
  return {
    schema_version: 2,
    taxonomy,
    references,
    assets,
    collections,
    summary: {
      references: references.filter((reference) => reference.canonical_id === reference.id).length,
      reference_ids: references.length,
      aliases: Object.keys(referenceAliases).length,
      assets: assets.length,
      browse_references: references.filter(
        (reference) => reference.canonical_id === reference.id && reference.status === 'active',
      ).length,
      visual_annotations: Object.keys(annotations).length,
      excluded_references: references.filter(
        (reference) => reference.canonical_id === reference.id && reference.status === 'excluded',
      ).length,
      unavailable_references: references.filter(
        (reference) =>
          reference.canonical_id === reference.id && reference.status === 'unavailable',
      ).length,
      editorial_profiles: Object.keys(profiles).length,
      collections: collections.length,
      retrieval_references: retrieval.size,
      retrieval_eligible_references: new Set(
        references
          .filter((reference) => reference.retrieval.eligible)
          .map((reference) => reference.canonical_id),
      ).size,
      unmeasured_assets: assets.filter((asset) => asset.quality.state === 'unmeasured').length,
      human_validated: false,
    },
  };
}

export function searchableText(reference) {
  return [
    reference.title,
    ...reference.aliases,
    ...(reference.source_tags ?? []),
    reference.meaning.summary,
    reference.meaning.use_when,
    ...reference.facets.reactions.map((id) => taxonomy.reactions[id]),
    ...reference.facets.contexts.map((id) => taxonomy.contexts[id]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

export function catalogueViews(model) {
  if (
    model?.schema_version !== 2 ||
    !Array.isArray(model.references) ||
    !Array.isArray(model.assets) ||
    !Array.isArray(model.collections)
  )
    throw Error('Unsupported catalogue response.');
  const assets = new Map(model.assets.map((asset) => [asset.id, asset]));
  if (
    assets.size !== model.assets.length ||
    new Set(model.references.map((reference) => reference.id)).size !== model.references.length
  )
    throw Error('Repeated catalogue identity.');
  return model.references
    .filter((reference) => reference.canonical_id === reference.id && reference.status === 'active')
    .map((reference) => {
      const asset = assets.get(reference.asset_ids[0]);
      if (!asset || !asset.reference_ids.includes(reference.id))
        throw Error('Missing catalogue asset.');
      return {
        id: reference.id,
        media_revision: asset.measurement?.source_sha256,
        alias_ids: asset.reference_ids.filter((id) => id !== reference.id),
        name: reference.title,
        message: reference.meaning.summary ?? '',
        relational_pattern: reference.meaning.use_when ?? '',
        example_context: reference.meaning.use_when ?? '',
        near_miss_context: reference.meaning.avoid_when ?? '',
        tags: [
          ...reference.facets.reactions.map((id) => taxonomy.reactions[id]),
          ...reference.facets.contexts.map((id) => taxonomy.contexts[id]),
        ],
        media_type: reference.kind === 'clip' ? 'gif' : 'image',
        media_url: asset.variants.original.url,
        image_url: asset.variants.original.url,
        preview_url: asset.variants.preview.url,
        mime_type: asset.variants.original.mime_type,
        media_status: asset.rights.state === 'established' ? 'approved' : 'source-preview',
        provenance: asset.provenance,
        quality: asset.quality,
        video_evidence: asset.measurement,
        attribution: asset.rights.attribution,
        license_url: asset.rights.license_url,
        facets: reference.facets,
        review: reference.review,
        collections: reference.collections,
        search_text: [searchableText(reference), asset.provenance?.source_title ?? '']
          .join(' ')
          .toLocaleLowerCase(),
      };
    });
}

export function browseCatalogue(
  records,
  {
    query = '',
    format = 'all',
    reaction = '',
    context = '',
    intensity = '',
    resolution = '',
    collection = 'all',
    sort = 'featured',
    collections = [],
  } = {},
) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  const shelf = collections.find((shelf) => shelf.id === collection);
  const order = new Map(
    [...new Set(shelf?.reference_ids ?? collections.flatMap((shelf) => shelf.reference_ids))].map(
      (id, index) => [id, index],
    ),
  );
  const result = records.filter(
    (record) =>
      (format === 'all' || record.media_type === format) &&
      (!reaction || record.facets.reactions.includes(reaction)) &&
      (!context || record.facets.contexts.includes(context)) &&
      (!intensity || record.facets.intensity === intensity) &&
      (!resolution ||
        (resolution === '720'
          ? ['720p', '1080p'].includes(record.quality?.encoded_resolution)
          : resolution === '1080' && record.quality?.encoded_resolution === '1080p')) &&
      (collection === 'all' ||
        (collection === 'selected'
          ? record.review.state === 'editorial'
          : shelf?.reference_ids.includes(record.id))) &&
      words.every((word) => record.search_text.includes(word)),
  );
  return result.sort(
    sort === 'name'
      ? (a, b) => a.name.localeCompare(b.name)
      : (a, b) =>
          Number(b.review.state === 'editorial') - Number(a.review.state === 'editorial') ||
          (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
          a.id.localeCompare(b.id),
  );
}

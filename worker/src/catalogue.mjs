import { catalogue as indexed } from './catalogue.stage3000.generated.mjs';
import { clipLibrary as extraClips } from './clip-library.generated.mjs';
import { catalogueProfiles } from './catalogue-profiles.generated.mjs';
import { externalClips } from './catalogue-external.generated.mjs';
import { assetOverrides, referenceAliases } from './catalogue-corrections.generated.mjs';
import { catalogueReview } from './catalogue-review.generated.mjs';
import { applyCatalogueMetadata, resolveReferences } from '../../src/catalogue-model.mjs';

const metadata = { profiles: catalogueProfiles, ...catalogueReview };
export const catalogue = resolveReferences(indexed, { assetOverrides, referenceAliases }).map(
  (record) => applyCatalogueMetadata(record, metadata),
);
export const clipLibrary = [...extraClips, ...externalClips].map((record) =>
  applyCatalogueMetadata({ ...record, canonical_id: record.id }, metadata),
);
export const galleryCatalogue = [...catalogue, ...clipLibrary];
// Supplemental hosted clips keep stable IDs outside the legacy positional index.
export const hostedRetrievalCatalogue = clipLibrary.filter(record =>
  record.media_url?.startsWith('/assets/clips/') && record.catalogue_status === 'active' &&
  record.media_status === 'approved' && record.catalogue_profile && record.video_evidence?.eligible,
);
export const retrievalCatalogue = [...catalogue, ...hostedRetrievalCatalogue];
export const catalogueById = new Map(galleryCatalogue.map((record) => [record.id, record]));

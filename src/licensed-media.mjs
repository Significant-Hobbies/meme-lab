// A frozen native source and an adaptation license qualify each hosted excerpt.
const sha256 = /^[a-f0-9]{64}$/;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;
const licenses = new Set([
  'https://creativecommons.org/licenses/by/3.0/',
  'https://creativecommons.org/licenses/by/4.0/',
]);

export function licensedCuts(manifest) {
  const sources = manifest.sources ?? { bbb: manifest.source };
  const cuts = new Map();
  const slugs = new Set();
  for (const cut of manifest.clips) {
    const source = sources[cut.source_id ?? 'bbb'];
    if (
      !source ||
      !sha256.test(source.source_sha256) ||
      !licenses.has(source.license_url) ||
      !source.attribution ||
      !source.copyright ||
      !source.title ||
      !source.license_source_url?.startsWith('https://') ||
      !source.url?.startsWith('https://') ||
      !Number.isInteger(source.width) ||
      source.width < 1280 ||
      !Number.isInteger(source.height) ||
      source.height < 720 ||
      !Number.isFinite(source.fps) ||
      source.fps <= 0 ||
      source.fps > 60 ||
      !slug.test(cut.slug) ||
      cut.id !== 'clip-' + cut.slug ||
      !Number.isFinite(cut.start_seconds) ||
      cut.start_seconds < 0 ||
      !Number.isFinite(cut.duration_seconds) ||
      cut.duration_seconds < 0.4 ||
      cut.duration_seconds > 30 ||
      !Number.isFinite(cut.poster_fraction ?? 0.5) ||
      (cut.poster_fraction ?? 0.5) < 0 ||
      (cut.poster_fraction ?? 0.5) >= 1 ||
      (source.duration_seconds &&
        cut.start_seconds + cut.duration_seconds > source.duration_seconds) ||
      cuts.has(cut.id) ||
      slugs.has(cut.slug)
    )
      throw Error('Unqualified licensed source or cut: ' + cut.id);
    cuts.set(cut.id, { cut, source });
    slugs.add(cut.slug);
  }
  return cuts;
}

export function validateLicensedRecord(record, qualified) {
  const { cut, source } = qualified ?? {};
  const evidence = record.video_evidence;
  const provenance = record.provenance;
  if (
    !cut ||
    record.id !== cut.id ||
    record.media_url !== '/assets/clips/' + cut.slug + '.mp4' ||
    record.image_url !== '/assets/clips/' + cut.slug + '.jpg' ||
    record.mime_type !== 'video/mp4' ||
    record.license_url !== source.license_url ||
    record.attribution !== source.attribution ||
    provenance?.source_movie_sha256 !== source.source_sha256 ||
    provenance.original_download_url !== source.url ||
    provenance.license_source_url !== source.license_source_url ||
    provenance.clip_start_seconds !== cut.start_seconds ||
    provenance.clip_duration_seconds !== cut.duration_seconds ||
    evidence?.url !== record.media_url ||
    !evidence.eligible ||
    evidence.width !== source.width ||
    evidence.height !== source.height ||
    !Number.isFinite(evidence.fps) ||
    Math.abs(evidence.fps - source.fps) > 0.001 ||
    !Number.isFinite(evidence.duration) ||
    Math.abs(evidence.duration - cut.duration_seconds) > 1 / source.fps + 0.01 ||
    !Number.isInteger(evidence.bytes) ||
    evidence.bytes < 1 ||
    evidence.bytes > 20 * 1024 * 1024 ||
    evidence.codec !== 'h264' ||
    evidence.has_audio !== false ||
    !sha256.test(evidence.source_sha256) ||
    !evidence.motion_checked ||
    evidence.frame_hashes?.length !== 3 ||
    !evidence.frame_hashes.every((hash) => sha256.test(hash)) ||
    new Set(evidence.frame_hashes).size < 2
  )
    throw Error('Hosted excerpt differs from its licensed native source: ' + record.id);
  const poster = record.poster_evidence;
  if ((cut.source_id && cut.source_id !== 'bbb') || poster) {
    if (
      !poster ||
      poster.url !== record.image_url ||
      !sha256.test(poster.source_sha256) ||
      poster.video_sha256 !== evidence.source_sha256 ||
      poster.width !== 640 ||
      !Number.isInteger(poster.height) ||
      poster.height < 1 ||
      !Number.isInteger(poster.bytes) ||
      poster.bytes < 1 ||
      !Number.isFinite(poster.at_seconds) ||
      Math.abs(poster.at_seconds - evidence.duration * (cut.poster_fraction ?? 0.5)) > 0.000001 ||
      poster.at_seconds < 0 ||
      poster.at_seconds >= evidence.duration
    )
      throw Error('Poster differs from its qualified video: ' + record.id);
  }
  return qualified;
}

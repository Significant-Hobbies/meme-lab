"""Reproduce registered excerpts from frozen native originals; never upscale."""
import argparse
import datetime
import hashlib
import json
import re
import subprocess
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_LICENSES = {
    'https://creativecommons.org/licenses/by/3.0/',
    'https://creativecommons.org/licenses/by/4.0/',
}


def digest(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)
    ], timeout=15))


def save_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def build(source, source_id, manifest):
    sources = manifest.get('sources', {'bbb': manifest.get('source')})
    origin = sources[source_id]
    if origin['license_url'] not in ALLOWED_LICENSES:
        raise ValueError('The source license must permit adaptations')
    if digest(source) != origin['source_sha256']:
        raise ValueError('The source is not the frozen licensed original')
    value = probe(source)
    video = next(s for s in value['streams'] if s['codec_type'] == 'video')
    native = (video['width'], video['height'], float(Fraction(video['avg_frame_rate'])))
    if native != (origin['width'], origin['height'], origin['fps']):
        raise ValueError('Native source dimensions or cadence changed')
    if min(native[:2]) < 720 or max(native[:2]) < 1280 or not 0 < native[2] <= 60:
        raise ValueError('A licensed HD source needs measured native HD detail')
    out = ROOT / 'worker/public/assets/clips'
    out.mkdir(parents=True, exist_ok=True)
    record_path = ROOT / 'catalogue/external-clips.json'
    records = {row['id']: row for row in json.loads(record_path.read_text())}
    checks_path = ROOT / 'catalogue/media-checks.json'
    checks = json.loads(checks_path.read_text())
    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    cuts = [cut for cut in manifest['clips'] if cut.get('source_id', 'bbb') == source_id]
    if not cuts:
        raise ValueError('No registered cuts for source ' + source_id)
    for clip in cuts:
        if (not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)+', clip['slug'])
                or clip['id'] != 'clip-' + clip['slug']
                or not .4 <= clip['duration_seconds'] <= 30
                or clip['start_seconds'] < 0
                or not 0 <= clip.get('poster_fraction', .5) < 1
                or clip['start_seconds'] + clip['duration_seconds'] > float(value['format']['duration'])):
            raise ValueError('Invalid bounded clip')
        file = out / (clip['slug'] + '.mp4')
        poster = out / (clip['slug'] + '.jpg')
        url = '/assets/clips/' + file.name
        subprocess.run([
            'ffmpeg', '-nostdin', '-v', 'error', '-y', '-threads', '2',
            '-ss', str(clip['start_seconds']), '-i', str(source),
            '-t', str(clip['duration_seconds']), '-map', '0:v:0', '-an', '-map_metadata', '-1',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
            '-threads', '2', '-movflags', '+faststart+use_metadata_tags',
            '-metadata', 'artist=' + origin.get('creator', 'Blender Foundation'),
            '-metadata', 'copyright=' + origin['copyright'],
            '-metadata', 'comment=' + origin['license_url'] + '; ' + origin['url']
            + '; Trimmed excerpt; audio omitted.', str(file)
        ], check=True, timeout=180)
        measured = probe(file)
        stream = next(s for s in measured['streams'] if s['codec_type'] == 'video')
        duration = float(measured['format']['duration'])
        if ((stream['width'], stream['height']) != native[:2]
                or abs(float(Fraction(stream['avg_frame_rate'])) - native[2]) > .001
                or abs(duration - clip['duration_seconds']) > 1 / native[2] + .01
                or file.stat().st_size > 20 * 1024 * 1024
                or any(s['codec_type'] == 'audio' for s in measured['streams'])):
            raise ValueError('Unexpected encoded excerpt')
        hashes = []
        for at in [.08 * duration, .5 * duration, .9 * duration]:
            frame = subprocess.check_output([
                'ffmpeg', '-nostdin', '-v', 'error', '-threads', '1', '-ss', str(at),
                '-i', str(file), '-frames:v', '1', '-vf', 'scale=512:-2', '-threads', '1',
                '-filter_threads', '1', '-pix_fmt', 'yuvj420p', '-f', 'image2pipe',
                '-vcodec', 'mjpeg', 'pipe:1'
            ], timeout=15)
            hashes.append(hashlib.sha256(frame).hexdigest())
        if len(set(hashes)) < 2:
            raise ValueError('The excerpt has no observed motion')
        subprocess.run([
            'ffmpeg', '-nostdin', '-v', 'error', '-y', '-threads', '1',
            '-ss', str(duration * clip.get('poster_fraction', .5)), '-i', str(file), '-frames:v', '1',
            '-vf', 'scale=640:-2', '-threads', '1', '-filter_threads', '1',
            '-pix_fmt', 'yuvj420p', str(poster)
        ], check=True, timeout=15)
        evidence = {
            'url': url, 'width': native[0], 'height': native[1], 'duration': duration,
            'fps': native[2], 'bytes': file.stat().st_size, 'codec': stream['codec_name'],
            'mime_type': 'video/mp4', 'has_audio': False, 'source_sha256': digest(file),
            'frame_hashes': hashes, 'motion_checked': True, 'distinct_frames': len(set(hashes)),
            'eligible': True, 'observed_on': today,
        }
        provenance = {
            'provider': origin.get('creator', 'Blender Foundation'), 'provider_id': clip['id'],
            'source_id': source_id, 'source_title': origin['title'],
            'source_url': origin['license_source_url'], 'original_download_url': origin['url'],
            'license_source_url': origin['license_source_url'],
            'source_movie_sha256': origin['source_sha256'], 'clip_start_seconds': clip['start_seconds'],
            'clip_duration_seconds': clip['duration_seconds'],
            'transformation': f'Trimmed; H.264 at original {native[0]}x{native[1]}; audio omitted.',
            'observed_on': today,
        }
        if origin.get('archive_sha256'):
            provenance['source_archive_sha256'] = origin['archive_sha256']
        old = records.get(clip['id'], {})
        poster_stream = probe(poster)['streams'][0]
        records[clip['id']] = {
            'id': clip['id'], 'name': old.get('name', clip['slug'].replace('-', ' ').capitalize()),
            'message': 'Licensed excerpt; editorial meaning is maintained separately.',
            'relational_pattern': '', 'example_context': '', 'near_miss_context': '',
            'tags': origin.get('tags', ['animation']), 'media_type': 'gif', 'mime_type': 'video/mp4',
            'media_url': url, 'image_url': '/assets/clips/' + poster.name,
            'preview_url': '/assets/clips/' + poster.name, 'media_status': 'approved',
            'catalogue_scope': 'gallery', 'license_url': origin['license_url'],
            'attribution': origin['attribution'], 'video_evidence': evidence, 'provenance': provenance,
            'poster_evidence': {'url': '/assets/clips/' + poster.name,
                'width': poster_stream['width'], 'height': poster_stream['height'],
                'bytes': poster.stat().st_size, 'source_sha256': digest(poster),
                'video_sha256': evidence['source_sha256'],
                'at_seconds': duration * clip.get('poster_fraction', .5)},
        }
        checks[clip['id']] = {
            'state': 'available', 'source': url, 'observed_on': today, 'measurement': evidence,
            'visual_evidence': {'state': 'prepared', 'frame_sha256': hashes},
        }
        save_json(record_path, list(records.values()))
        save_json(checks_path, dict(sorted(checks.items())))
        print(json.dumps({'id': clip['id'], 'bytes': evidence['bytes'], 'duration': duration}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--source-id', default='bbb')
    args = parser.parse_args()
    build(Path(args.source), args.source_id, json.loads((ROOT / 'catalogue/animation-cuts.json').read_text()))

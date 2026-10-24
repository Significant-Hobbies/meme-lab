"""Reproduce licensed HD excerpts from the exact original; never upscale sources."""
import argparse,hashlib,json,re,subprocess,datetime
from pathlib import Path
from fractions import Fraction
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--source',required=True);args=p.parse_args()
source=Path(args.source);manifest=json.loads((ROOT/'catalogue/animation-cuts.json').read_text());origin=manifest['source'];out=ROOT/'worker/public/assets/clips';out.mkdir(parents=True,exist_ok=True)
def digest(path):
 with path.open('rb')as file:return hashlib.file_digest(file,'sha256').hexdigest()
def probe(path):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)],timeout=15))
if digest(source)!=origin['source_sha256']:raise ValueError('The source is not the frozen licensed original')
value=probe(source);video=next(s for s in value['streams']if s['codec_type']=='video')
if (video['width'],video['height'],float(Fraction(video['avg_frame_rate'])))!=(origin['width'],origin['height'],origin['fps']):raise ValueError('Native source dimensions or cadence changed')
records=[];checks=json.loads((ROOT/'catalogue/media-checks.json').read_text());today=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
for clip in manifest['clips']:
 if not re.fullmatch(r'bbb-[a-z-]+',clip['slug'])or clip['id']!='clip-'+clip['slug']or not .4<=clip['duration_seconds']<=30 or clip['start_seconds']<0:raise ValueError('Invalid bounded clip')
 file=out/(clip['slug']+'.mp4');poster=out/(clip['slug']+'.jpg');url='/assets/clips/'+file.name
 subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-threads','2','-ss',str(clip['start_seconds']),'-i',str(source),'-t',str(clip['duration_seconds']),'-map','0:v:0','-an','-map_metadata','-1','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-threads','2','-movflags','+faststart+use_metadata_tags','-metadata','artist=Blender Foundation','-metadata','copyright='+origin['copyright'],'-metadata','comment=CC BY 3.0; '+origin['url']+'; Trimmed excerpt; audio omitted.',str(file)],check=True,timeout=180)
 measured=probe(file);stream=next(s for s in measured['streams']if s['codec_type']=='video');duration=float(measured['format']['duration'])
 if (stream['width'],stream['height'])!=(1920,1080)or file.stat().st_size>20*1024*1024 or any(s['codec_type']=='audio'for s in measured['streams']):raise ValueError('Unexpected encoded excerpt')
 hashes=[]
 for at in [.08*duration,.5*duration,.9*duration]:
  frame=subprocess.check_output(['ffmpeg','-nostdin','-v','error','-threads','1','-ss',str(at),'-i',str(file),'-frames:v','1','-vf','scale=512:288','-threads','1','-filter_threads','1','-pix_fmt','yuvj420p','-f','image2pipe','-vcodec','mjpeg','pipe:1'],timeout=15);hashes.append(hashlib.sha256(frame).hexdigest())
 subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-threads','1','-ss',str(duration*.5),'-i',str(file),'-frames:v','1','-vf','scale=640:360','-threads','1','-filter_threads','1','-pix_fmt','yuvj420p',str(poster)],check=True,timeout=15)
 evidence={'url':url,'width':1920,'height':1080,'duration':duration,'fps':float(Fraction(stream['avg_frame_rate'])),'bytes':file.stat().st_size,'codec':stream['codec_name'],'mime_type':'video/mp4','has_audio':False,'source_sha256':digest(file),'frame_hashes':hashes,'motion_checked':True,'distinct_frames':len(set(hashes)),'eligible':True,'observed_on':today}
 records.append({'id':clip['id'],'name':clip['slug'].removeprefix('bbb-').replace('-',' ').capitalize(),'message':'Licensed animation excerpt; editorial meaning is maintained separately.','relational_pattern':'','example_context':'','near_miss_context':'','tags':['animation'],'media_type':'gif','mime_type':'video/mp4','media_url':url,'image_url':'/assets/clips/'+poster.name,'preview_url':'/assets/clips/'+poster.name,'media_status':'approved','catalogue_scope':'gallery','license_url':origin['license_url'],'attribution':origin['attribution'],'video_evidence':evidence,'provenance':{'provider':'Blender Foundation','provider_id':clip['id'],'source_url':origin['license_source_url'],'original_download_url':origin['url'],'license_source_url':origin['license_source_url'],'source_archive_sha256':origin['archive_sha256'],'source_movie_sha256':origin['source_sha256'],'clip_start_seconds':clip['start_seconds'],'clip_duration_seconds':clip['duration_seconds'],'transformation':'Trimmed; H.264 at original 1920x1080; audio omitted.','observed_on':today}})
 checks[clip['id']]={'state':'available','source':url,'observed_on':today,'measurement':evidence,'visual_evidence':{'state':'prepared','frame_sha256':hashes}}
 print(json.dumps({'id':clip['id'],'bytes':file.stat().st_size,'duration':duration}),flush=True)
(ROOT/'catalogue/external-clips.json').write_text(json.dumps(records,indent=2)+'\n');(ROOT/'catalogue/media-checks.json').write_text(json.dumps(dict(sorted(checks.items())),indent=2)+'\n')

"""Freeze actual source bytes and bounded chronological JPEG requests for caption comparisons."""
import argparse, base64, concurrent.futures, hashlib, json, math, re, subprocess, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--output',default='.fleet-local/caption-quality-20261024')
args=parser.parse_args();out=ROOT/args.output;media=out/'media';requests=out/'requests'
if (out/'input-provenance.json').exists():raise SystemExit('Inputs already frozen. Choose a new output directory.')
media.mkdir(parents=True,exist_ok=True);requests.mkdir(exist_ok=True)
manifest_bytes=(ROOT/'eval/clip_caption_quality_v1.json').read_bytes();manifest=json.loads(manifest_bytes)
catalogue=json.loads((ROOT/'worker/public/collection.json').read_text())+json.loads((ROOT/'worker/public/clips.json').read_text())
by_id={record['id']:record for record in catalogue}
cases=manifest['cases']+manifest['development_cases']+manifest['guard_cases']

def prepare(ident):
 record=by_id[ident];url=record['media_url']
 if not re.fullmatch(r'https://media\.giphy\.com/media/[a-zA-Z0-9]+/giphy\.gif',url):raise ValueError('Unknown source: '+ident)
 url=url[:-3]+'mp4';target=media/(ident+'.mp4')
 if not target.exists():
  with urllib.request.urlopen(url,timeout=20) as response:data=response.read(20*1024*1024+1)
  if len(data)>20*1024*1024:raise ValueError('Source too large: '+ident)
  target.write_bytes(data)
 data=target.read_bytes()
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(target)]))
 video=next(stream for stream in probe['streams'] if stream['codec_type']=='video')
 duration=float(video.get('duration') or probe['format']['duration']);width=video['width'];height=video['height']
 if not math.isfinite(duration) or not 0<duration<=30 or max(width,height)>4096 or width*height>12000000:raise ValueError('Unsupported source: '+ident)
 scale=min(1,512/max(width,height));size=f'{max(1,round(width*scale))}:{max(1,round(height*scale))}';frames=[]
 for index,fraction in enumerate([.12,.5,.88]):
  at=round(duration*fraction,3)
  jpeg=subprocess.check_output(['ffmpeg','-v','error','-ss',str(at),'-i',str(target),'-frames:v','1','-vf','scale='+size,'-q:v','5','-f','image2pipe','-c:v','mjpeg','pipe:1'])
  (media/f'{ident}-{index}.jpg').write_bytes(jpeg)
  data_url='data:image/jpeg;base64,'+base64.b64encode(jpeg).decode()
  if len(data_url)>160000:raise ValueError('Oversized preview: '+ident)
  frames.append({'at_seconds':at,'data_url':data_url})
 return ident,{'source_url':url,'source_sha256':hashlib.sha256(data).hexdigest(),'width':width,'height':height,'duration':duration,'frames':frames}

prepared={}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for ident,record in pool.map(prepare,dict.fromkeys(case['candidate_id'] for case in cases)):
  prepared[ident]=record;print(json.dumps({'prepared_source':ident,'width':record['width'],'height':record['height']}),flush=True)
provenance={'manifest_sha256':hashlib.sha256(manifest_bytes).hexdigest(),'sources':{ident:{k:v for k,v in record.items() if k!='frames'} for ident,record in prepared.items()},'requests':{}}
for case in cases:
 body={k:case[k] for k in ['candidate_id','comment','audience','tone']};body['frames']=prepared[case['candidate_id']]['frames']
 encoded=(json.dumps(body,ensure_ascii=False,separators=(',',':'))+'\n').encode();(requests/(case['id']+'.json')).write_bytes(encoded)
 provenance['requests'][case['id']]=hashlib.sha256(encoded).hexdigest()
(out/'input-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
print(json.dumps({'frozen_requests':len(cases),'sources':len(prepared),'manifest_sha256':provenance['manifest_sha256']}))

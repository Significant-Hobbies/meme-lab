"""Resume bounded, source-backed MP4 qualification. Never edits the source pool."""
import argparse, concurrent.futures, datetime, hashlib, json, subprocess
from pathlib import Path
from fractions import Fraction

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--limit',type=int,default=1500)
parser.add_argument('--workers',type=int,default=6)
parser.add_argument('--output',default='.fleet-local/clip-quality')
parser.add_argument('--probe-cache')
args=parser.parse_args()
OUT=ROOT/args.output;OUT.mkdir(parents=True,exist_ok=True)
source=[json.loads(line) for line in (ROOT/'expansion/sources/stage-5000-reaction-gifs.jsonl').read_text().splitlines() if line]
baseline=json.loads((ROOT/'worker/public/collection.json').read_text())
existing={record['id'] for record in baseline}
source_by_id={record['proposed_id']:record for record in source}
fingerprints=[source_by_id[key]['dataset_gif_id'] for key in existing if key in source_by_id and source_by_id[key].get('dataset_gif_id')]
cache={}
cache_path=OUT/'probes.jsonl'
if args.probe_cache:
 for line in (ROOT/args.probe_cache).read_text().splitlines():
  row=json.loads(line);cache[row['id']]=row
if cache_path.exists():
 for line in cache_path.read_text().splitlines():
  row=json.loads(line);cache[row['id']]=row

def probe(record):
 key=record['proposed_id']
 if key in cache and (not cache[key].get('eligible') or cache[key].get('motion_checked')):return cache[key]
 url=record['media_url'].removesuffix('giphy.gif')+'giphy.mp4'
 row={'id':key,'url':url,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 try:
  result=subprocess.run(['ffprobe','-v','error','-rw_timeout','10000000','-show_entries','stream=codec_type,codec_name,width,height,avg_frame_rate,nb_frames,duration:format=duration,size','-of','json',url],capture_output=True,text=True,timeout=18)
  if result.returncode:raise ValueError('source_unavailable')
  value=json.loads(result.stdout);video=next(stream for stream in value.get('streams',[]) if stream.get('codec_type')=='video')
  width,height=video['width'],video['height'];duration=float(video.get('duration') or value.get('format',{}).get('duration') or 0)
  fps=float(Fraction(video.get('avg_frame_rate','0/1')))
  size=int(value.get('format',{}).get('size') or 0)
  row.update(width=width,height=height,duration=duration,fps=fps,bytes=size,codec=video['codec_name'],has_audio=any(stream.get('codec_type')=='audio' for stream in value.get('streams',[])))
  row['eligible']=max(width,height)>=480 and min(width,height)>=270 and max(width,height)<=4096 and .4<=duration<=30 and 10<=fps<=60 and 0<size<=20*1024*1024
  row['reason']='passed' if row['eligible'] else 'below_media_floor'
  if row['eligible']:
   decoded=subprocess.run(['ffmpeg','-v','error','-xerror','-rw_timeout','10000000','-i',url,'-map','0:v:0','-vf',f'fps=3/{duration},scale=32:32','-frames:v','3','-pix_fmt','gray','-f','rawvideo','pipe:1'],capture_output=True,timeout=25)
   if decoded.returncode or len(decoded.stdout)!=3072:raise ValueError('decode_failed')
   row['frame_hashes']=[hashlib.sha256(decoded.stdout[index:index+1024]).hexdigest() for index in range(0,3072,1024)]
   row['motion_checked']=True;row['distinct_frames']=len(set(row['frame_hashes']))
   row['eligible']=row['distinct_frames']>=2;row['reason']='passed' if row['eligible'] else 'static_frames'
 except Exception as error:
  row.update(eligible=False,reason='timeout' if isinstance(error,subprocess.TimeoutExpired) else 'source_unavailable')
 return row

candidates=[record for record in source if record['proposed_id'] not in existing and record.get('selection_evidence',{}).get('metadata_quality',0)>=43]
selected=[];seen=list(fingerprints);duplicates=[];processed=[]
if args.probe_cache and not cache_path.exists():cache_path.write_text(''.join(json.dumps(row)+'\n' for row in cache.values()))
with concurrent.futures.ThreadPoolExecutor(max_workers=min(8,max(1,args.workers))) as pool,cache_path.open('a') as log:
 for start in range(0,len(candidates),36):
  batch=candidates[start:start+36]
  for record,row in zip(batch,pool.map(probe,batch)):
   if record['proposed_id'] not in cache or row!=cache[record['proposed_id']]:
    log.write(json.dumps(row)+'\n');log.flush();cache[row['id']]=row
   processed.append(row)
   if not row['eligible']:continue
   fingerprint=record.get('dataset_gif_id')
   if fingerprint and any(len(old)==len(fingerprint) and (int(old,16)^int(fingerprint,16)).bit_count()<=12 for old in seen):
    duplicates.append(row['id']);continue
   if fingerprint:seen.append(fingerprint)
   selected.append({'source':record,'media':row})
   if len(selected)>=args.limit:break
  print(json.dumps({'checked':len(processed),'qualified':len(selected),'near_duplicates_excluded':len(duplicates),'target':args.limit}),flush=True)
  if len(selected)>=args.limit:break

report={'version':1,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseline_references':len(baseline),'baseline_clips':sum(record.get('media_type')=='gif' for record in baseline),'candidate_records':len(candidates),'checked':len(processed),'qualified':len(selected),'near_duplicates_excluded':duplicates,'criteria':{'minimum_long_side':480,'minimum_short_side':270,'duration_seconds':[.4,30],'fps':[10,60],'maximum_bytes':20*1024*1024,'minimum_metadata_quality':43,'fingerprint_hamming_exclusion':12,'decoded_frames':3,'minimum_distinct_decoded_frames':2},'human_validated':False,'semantic_retrieval_promoted':False,'selected_ids':[record['source']['proposed_id'] for record in selected]}
(OUT/'qualified.json').write_text(json.dumps(selected,indent=2)+'\n')
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))

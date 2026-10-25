"""Prepare bounded visual evidence for resumable catalogue annotation; sources stay unchanged."""
import argparse,re,base64,concurrent.futures,datetime,hashlib,io,json,subprocess,tempfile,urllib.request
from pathlib import Path
from fractions import Fraction
from PIL import Image,ImageOps

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output',default='.fleet-local/catalogue-review');p.add_argument('--limit',type=int,default=48);p.add_argument('--offset',type=int,default=0);p.add_argument('--workers',type=int,default=3);p.add_argument('--ids');args=p.parse_args()
OUT=ROOT/args.output;OUT.mkdir(parents=True,exist_ok=True)
model=json.loads((ROOT/'worker/public/catalogue-v2.json').read_text());assets={a['id']:a for a in model['assets']}
references=[r for r in model['references'] if r['id']==r['canonical_id']]
if args.ids:
 wanted=set(args.ids.split(','));references=[r for r in references if r['id'] in wanted]
# Alternate stills and clips so small pilots exercise both kinds.
stills=[r for r in references if r['kind']=='template'];clips=[r for r in references if r['kind']=='clip'];ordered=[]
for i in range(max(len(stills),len(clips))):
 for group in (stills,clips):
  if i<len(group):ordered.append(group[i])
selected=ordered[args.offset:args.offset+args.limit]

def prepare(reference):
 key=reference['id'];asset=assets[reference['asset_ids'][0]];variant=asset['variants'].get('video',asset['variants']['original']);url=variant['url'];cache=OUT/(key+'.json')
 if cache.exists():
  try:row=json.loads(cache.read_text())
  except json.JSONDecodeError:row={}
  if row.get('source_url')==url and row.get('status')=='prepared':return row
 row={'id':key,'source_url':url,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'failed'}
 try:
  if re.fullmatch(r'/assets/clips/[a-z0-9]+(?:-[a-z0-9]+)+\.mp4',url):
   path=ROOT/'worker/public'/url.lstrip('/')
   if path.stat().st_size>20*1024*1024:raise ValueError('source_too_large')
   data=path.read_bytes()
  else:
   if not url.startswith(('https://i.imgflip.com/','https://api.memegen.link/images/','https://media.giphy.com/media/','https://upload.wikimedia.org/wikipedia/commons/')):raise ValueError('unapproved_source')
   req=urllib.request.Request(url,headers={'User-Agent':'MemeLabSourceQualification/1.0'})
   with urllib.request.urlopen(req,timeout=20) as response:
    if response.geturl()!=url:raise ValueError('source_redirect')
    data=response.read(20*1024*1024+1)
  if len(data)>20*1024*1024:raise ValueError('source_too_large')
  measurement={'url':url,'bytes':len(data),'source_sha256':hashlib.sha256(data).hexdigest(),'observed_on':row['observed_at'][:10]};row['measurement']=measurement;frames=[]
  if reference['kind']=='template':
   image=Image.open(io.BytesIO(data))
   if image.width*image.height>12000000 or max(image.size)>4096:raise ValueError('source_dimensions')
   image.load()
   measurement.update(width=image.width,height=image.height,mime_type=Image.MIME[image.format])
   image=ImageOps.exif_transpose(image).convert('RGB');image.thumbnail((512,512));buf=io.BytesIO();image.save(buf,format='JPEG',quality=80);frames=[buf.getvalue()]
  else:
   with tempfile.NamedTemporaryFile(suffix='.media') as temporary:
    temporary.write(data);temporary.flush()
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',temporary.name],timeout=15));stream=next(s for s in probe['streams'] if s['codec_type']=='video');duration=float(probe['format']['duration']);fps=float(Fraction(stream.get('avg_frame_rate','0/1')))
    if not .4<=duration<=30 or max(stream['width'],stream['height'])>4096 or stream['width']*stream['height']>12000000 or not 0<fps<=60:raise ValueError('source_dimensions_or_duration')
    measurement.update(width=stream['width'],height=stream['height'],duration=duration,fps=fps,codec=stream['codec_name'],sample_aspect_ratio=stream.get('sample_aspect_ratio'),display_aspect_ratio=stream.get('display_aspect_ratio'),has_audio=any(s['codec_type']=='audio' for s in probe['streams']),mime_type=variant.get('mime_type'))
    for fraction in (.08,.5,.92):
     at=min(duration*fraction,max(0,duration-1.5/fps))
     frames.append(subprocess.check_output(['ffmpeg','-nostdin','-v','error','-threads','1','-ss',str(at),'-i',temporary.name,'-map','0:v:0','-frames:v','1','-vf','scale=iw*sar:ih,setsar=1,scale=512:512:force_original_aspect_ratio=decrease','-threads','1','-filter_threads','1','-f','image2pipe','-pix_fmt','yuvj420p','-vcodec','mjpeg','-q:v','4','pipe:1'],timeout=15))
  if any(not frame or len(frame)>160000 for frame in frames):raise ValueError('frame_bounds')
  row.update(status='prepared',kind=reference['kind'],source_title=reference['title'],source_tags=reference['source_tags'][:12],measurement=measurement,frame_sha256=[hashlib.sha256(frame).hexdigest() for frame in frames],frames=['data:image/jpeg;base64,'+base64.b64encode(frame).decode() for frame in frames])
 except Exception as error:row['error']=str(error)[:160]
 temporary=cache.with_suffix('.json.tmp');temporary.write_text(json.dumps(row)+'\n');temporary.replace(cache);return row

with concurrent.futures.ThreadPoolExecutor(max_workers=min(4,max(1,args.workers))) as pool,(OUT/'prepared.jsonl').open('w') as log:
 passed=0
 for n,row in enumerate(pool.map(prepare,selected),1):
  log.write(json.dumps(row)+'\n');log.flush();passed+=row['status']=='prepared'
  if n%12==0 or n==len(selected):print(json.dumps({'processed':n,'prepared':passed,'requested':len(selected)}),flush=True)

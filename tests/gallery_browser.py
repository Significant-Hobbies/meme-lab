"""Real gallery/editor/export in Chromium; synthetic AI and a generated test clip."""
import json, os, shutil, subprocess, sys, time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
FIX=ROOT/'tests/fixtures/public-ux'
OUT=Path(sys.argv[1] if len(sys.argv)>1 else ROOT/'.fleet-local/gallery')
OUT.mkdir(parents=True,exist_ok=True)
PORT='4334'
BASE='http://127.0.0.1:'+PORT
proc=subprocess.Popen(['node','scripts/preview-landing.mjs',PORT],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
captions=['Changed nothing. Fixed everything.','The fix was running it again.','My contribution: the up arrow.']
report={'synthetic_ai':True,'synthetic_clip':True,'widths':[]}
try:
 for _ in range(100):
  try:urlopen(BASE).close();break
  except Exception:time.sleep(.1)
 with sync_playwright() as p:
  executable=shutil.which('chromium')
  if not executable and Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome').exists():executable='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  browser=p.chromium.launch(**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
  for width in [390,768,1440]:
   context=browser.new_context(viewport={'width':width,'height':1000},reduced_motion='reduce',accept_downloads=True)
   page=context.new_page();page.bring_to_front();errors=[];calls=[];pending=[]
   mode={'captions':'success','media':'success'}
   page.on('pageerror',lambda error:errors.append(str(error)))
   def route(r):
    url=r.request.url
    if not url.startswith(BASE):
     if r.request.resource_type=='image':r.fulfill(body=(FIX/'sample.png').read_bytes(),content_type='image/png')
     else:r.abort()
     return
    path=url.removeprefix(BASE)
    if path.startswith('/api/clips/media/'):
     if mode['media']=='error':r.fulfill(status=502,json={'error':'Synthetic unavailable source'});return
     r.fulfill(body=(FIX/'hd-clip.mp4').read_bytes(),content_type='video/mp4');return
    if path=='/api/clips/captions':
     calls.append(r.request.post_data_json)
     if mode['captions']=='hold':pending.append(r);return
     if mode['captions']=='error':r.fulfill(status=503,json={'error':'Synthetic caption failure'});return
     if mode['captions']=='none':r.fulfill(json={'decision':'none','captions':[],'message':'A sincere response belongs here.'});return
     r.fulfill(json={'decision':'captions','captions':captions});return
    if path.startswith('/api/create/media/'):
     r.fulfill(body=(FIX/'sample.png').read_bytes(),content_type='image/png');return
    if path=='/api/create':
     calls.append(r.request.post_data_json);r.fulfill(json=json.loads((FIX/'composition.json').read_text()));return
    r.continue_()
   page.route('**/*',route)
   page.goto(BASE+'/collection');page.locator('.collection-create-button').first.wait_for()
   assert page.locator('.collection-card').count()==24
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
   page.locator('[data-format="gif"]').click();assert '1,195' in page.locator('#collection-count').inner_text()
   assert page.locator('.media-kind').first.inner_text()=='CLIP'
   page.locator('[data-mood="awkward"]').click();assert 'mood=awkward' in page.url
   page.locator('#catalogue-search').fill('unlikely-query-no-results');page.locator('#collection-empty').wait_for(state='visible')
   page.locator('#collection-clear').click();assert '3,000' in page.locator('#collection-count').inner_text()
   page.locator('#collection-next').click();assert 'Page 2' in page.locator('#collection-page-label').inner_text()
   page.reload();expect(page.locator('#collection-grid')).to_have_attribute('aria-busy','false');assert 'Page 2' in page.locator('#collection-page-label').inner_text()
   page.locator('#collection-previous').click()
   page.locator('[data-format="gif"]').click()
   preview=page.locator('.collection-preview-button').first;preview.click();assert preview.get_attribute('aria-pressed')=='true';preview.click();assert preview.get_attribute('aria-pressed')=='false'
   page.screenshot(path=str(OUT/f'gallery-{width}.png'),full_page=True)
   page.locator('.collection-create-button').first.click();page.locator('.clip-workspace canvas').wait_for(state='visible')
   assert not calls,'Opening the creator must not invoke AI'
   assert page.locator('#collection-situation').evaluate('(node)=>document.activeElement===node')
   assert page.locator('[data-clip-action="download"]').is_disabled()
   page.locator('#collection-situation').fill('The tests passed after I changed nothing and ran them again.')
   page.locator('#collection-audience').fill('Developers');page.locator('#collection-tone').select_option('deadpan')
   mode['captions']='hold';page.locator('#collection-generate').click();assert page.locator('#collection-generate').is_disabled()
   expect(page.locator('#collection-generate')).to_have_text('Writing captions…')
   assert len(pending)==1
   pending.pop().fulfill(json={'decision':'captions','captions':captions});mode['captions']='success'
   page.locator('.clip-options button').first.wait_for();assert page.locator('.clip-options button').count()==3
   assert calls[-1]['audience']=='Developers' and calls[-1]['tone']=='deadpan'
   assert len(calls[-1]['frames'])==3 and all(frame['data_url'].startswith('data:image/jpeg;base64,') for frame in calls[-1]['frames'])
   assert len({frame['data_url'] for frame in calls[-1]['frames']})==3
   page.locator('.clip-options button').nth(1).click();assert page.locator('#clip-caption').input_value()==captions[1]
   page.locator('#clip-caption').fill('A caption edited by the user.');page.locator('#clip-position').select_option('bottom')
   assert not page.locator('#collection-create').evaluate('(node)=>node.scrollWidth>node.clientWidth')
   page.locator('.clip-layout').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'clip-editor-{width}.png'))
   with page.expect_download(timeout=30000) as download:page.locator('[data-clip-action="download"]').click()
   file=OUT/f'captioned-{width}.mp4';download.value.save_as(file)
   probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(file)]))
   stream=next(item for item in probe['streams'] if item['codec_type']=='video')
   duration=float(probe['format']['duration']);assert 1.7<duration<3.5,(duration,probe)
   assert stream['width']==1280 and stream['height']>720
   assert stream['codec_name']=='h264'
   subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss','0.5','-i',str(file),'-frames:v','1',str(OUT/f'export-frame-{width}.png')],check=True)
   # Play the actual exported bytes, not the source or editor canvas.
   exported=page.evaluate('async bytes=>{const video=document.createElement("video");video.muted=true;video.src=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"video/mp4"}));document.body.append(video);await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});await video.play();const result={width:video.videoWidth,height:video.videoHeight,duration:video.duration};video.pause();const seek=new Promise(resolve=>{video.onseeked=resolve;});video.currentTime=Math.min(.5,video.duration/2);await seek;const canvas=document.createElement("canvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext("2d");ctx.drawImage(video,0,0);result.captionBand=[...ctx.getImageData(10,video.videoHeight-10,1,1).data];URL.revokeObjectURL(video.src);video.remove();return result;}',list(file.read_bytes()))
   assert exported['height']==stream['height']
   assert all(channel>240 for channel in exported['captionBand'][:3]),exported
   # Cancel an export, retain the edit, then recover from generation failure.
   page.locator('[data-clip-action="download"]').click();page.locator('[data-clip-action="cancel"]').click();page.locator('.clip-status').filter(has_text='Export cancelled').wait_for()
   assert page.locator('#clip-caption').input_value()=='A caption edited by the user.'
   mode['captions']='error';page.locator('#collection-generate').click();page.locator('.clip-status').filter(has_text='Synthetic caption failure').wait_for();assert not page.locator('#collection-generate').is_disabled()
   mode['captions']='none';page.locator('#collection-generate').click();page.locator('.clip-status').filter(has_text='A sincere response').wait_for();assert page.locator('[data-clip-action="download"]').is_disabled()
   # Close with an in-flight generation and reopen: a late result must not leak.
   mode['captions']='hold';page.locator('#collection-generate').click();page.locator('#collection-create-close').click()
   assert not page.locator('#collection-create').is_visible()
   if pending:
    try:pending.pop().fulfill(json={'decision':'captions','captions':captions})
    except Exception:pass
   mode['captions']='success';mode['media']='error';page.locator('.collection-create-button').first.click();page.locator('[data-clip-action="retry"]').wait_for(state='visible')
   mode['media']='success';page.locator('[data-clip-action="retry"]').click();page.locator('.clip-workspace canvas').wait_for(state='visible');assert page.locator('#clip-caption').input_value()==''
   page.keyboard.press('Escape');assert not page.locator('#collection-create').is_visible()
   # Static creation uses the selected template directly without recommendation.
   page.goto(BASE+'/collection?meme=drake-preference');page.locator('#collection-create').wait_for(state='visible');page.locator('#collection-situation').fill('We fixed one bug by rewriting the entire app.');page.locator('#collection-generate').click();page.locator('.studio-text').wait_for()
   expect(page.locator('.studio-text')).to_have_value('One click is enough')
   assert calls[-1]['candidate_id']=='drake-preference'
   page.locator('.studio-text').fill('Local text edit')
   with page.expect_download() as static:page.locator('[data-action="download"]').click()
   assert static.value.suggested_filename.endswith('.png')
   assert not page.locator('#collection-create').evaluate('(node)=>node.scrollWidth>node.clientWidth')
   page.locator('.studio-grid').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'static-editor-{width}.png'))
   assert not errors,errors
   report['widths'].append({'width':width,'passed':True,'export':{'duration':duration,'width':stream['width'],'height':stream['height'],'codec':stream['codec_name'],'bytes':file.stat().st_size},'exported_file_played':True})
   context.close()
  browser.close()
 (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report,indent=2))
finally:
 proc.terminate();proc.wait(timeout=10)

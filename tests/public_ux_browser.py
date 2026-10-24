"""Actual public DOM/CSS/JS, committed synthetic APIs and media; no live acceptance."""
import json, os, shutil, subprocess, sys, time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
FIX=ROOT/'tests/fixtures/public-ux'
OUT=Path(sys.argv[1] if len(sys.argv)>1 else ROOT/'work/public-ux')
OUT.mkdir(parents=True,exist_ok=True)
proc=subprocess.Popen(['node','scripts/preview-landing.mjs','4321'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
base='http://127.0.0.1:4321'
report={'synthetic':True,'live_provider_calls':False,'widths':[]}
hosted=next(record for record in json.loads((ROOT/'catalogue/external-clips.json').read_text()) if record['id']=='clip-spring-small-delight')
hosted['name']=json.loads((ROOT/'catalogue/editorial.json').read_text())['profiles'][hosted['id']]['title']
hosted_response=json.loads((FIX/'recommendation.json').read_text())
hosted_response['candidates']=[{**hosted_response['candidates'][0],**hosted}]
try:
 for _ in range(100):
  try:
   urlopen(base).close();break
  except Exception:time.sleep(.1)
 with sync_playwright() as p:
  executable=shutil.which('google-chrome') or shutil.which('chromium')
  if not executable and Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome').exists():executable='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  browser=p.chromium.launch(**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
  for width in [390,768,1440]:
   context=browser.new_context(viewport={'width':width,'height':1000},reduced_motion='reduce')
   page=context.new_page();errors=[];calls=[];pending=[];mode={'recommend':'success','feedback':'success','create':'success'}
   page.on('pageerror',lambda error:errors.append(str(error)))
   def route(r):
    path=r.request.url.removeprefix(base)
    if not r.request.url.startswith(base):
     if r.request.resource_type=='image':r.fulfill(body=(FIX/'sample.png').read_bytes(),content_type='image/png')
     else:r.abort()
     return
    if path.startswith('/api/'):
     if path.startswith('/api/clips/media/'):
      r.fulfill(body=(ROOT/('worker/public'+hosted['media_url'])).read_bytes(),content_type='video/mp4');return
     calls.append({'path':path,'body':r.request.post_data_json if r.request.method=='POST' else None})
     if path.startswith('/api/create/media/'):
      r.fulfill(body=(FIX/'sample.png').read_bytes(),content_type='image/png');return
     key={'/api/recommend':'recommend','/api/create':'create','/api/feedback':'feedback'}.get(path)
     assert key, 'Unexpected API '+path
     if mode[key]=='hold':pending.append(r);return
     if mode[key]=='error':r.fulfill(status=503,json={'error':'Synthetic recoverable failure.'});return
     if mode[key]=='none':r.fulfill(json={'decision':'none','none_reason':'A sincere answer belongs here.'});return
     if key=='recommend' and mode[key]=='hosted':r.fulfill(json=hosted_response);return
     filename={'recommend':'recommendation','create':'composition','feedback':'feedback'}[key]
     r.fulfill(json=json.loads((FIX/(filename+'.json')).read_text()));return
    if path=='/fixtures/sample.png':r.fulfill(body=(FIX/'sample.png').read_bytes(),content_type='image/png');return
    # Transport local Worker responses into Chromium; no external network is admitted.
    with urlopen(r.request.url) as response:
     if response.geturl()!=r.request.url:r.fulfill(status=302,headers={'Location':response.geturl()})
     else:r.fulfill(status=response.status,headers=dict(response.headers),body=response.read())
   page.route('**/*',route)
   page.goto(base);page.locator('#comment').wait_for()
   assert page.locator('.home-header').inner_text().startswith('Meme Lab')
   assert page.locator('#submit').get_attribute('aria-describedby')=='retention-note'
   assert page.locator('#retention-note').locator('..').locator('#submit').count()==1
   assert page.locator('#retention-note a').get_attribute('href')=='/privacy'
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
   page.screenshot(path=str(OUT/f'home-{width}.png'),full_page=True)
   mode['recommend']='hold'
   page.locator('.example-run').click()
   page.locator('#loading').wait_for(state='visible');assert page.locator('#submit').is_disabled()
   page.locator('.example-run').click();assert len(pending)==1
   page.screenshot(path=str(OUT/f'loading-{width}.png'),full_page=True)
   mode['recommend']='success';pending.pop().fulfill(json=json.loads((FIX/'recommendation.json').read_text()))
   page.locator('.studio-text').wait_for();expect(page.locator('.studio-text')).to_have_value('One click is enough')
   assert len([c for c in calls if c['path']=='/api/recommend'])==1
   assert calls[0]['body']['comment']==page.locator('.example-run').get_attribute('data-example')
   page.locator('.studio-text').fill('Edited locally')
   assert page.locator('[data-action="download"]').is_enabled()
   with page.expect_download() as dl:page.locator('[data-action="download"]').click()
   assert dl.value.suggested_filename.endswith('.png')
   mode['feedback']='error';page.locator('[data-verdict="landed"]').click();page.locator('#feedback-status').filter(has_text='Synthetic recoverable failure.').wait_for()
   mode['feedback']='success';page.locator('[data-verdict="landed"]').click();page.locator('#feedback-status').filter(has_text='Saved.').wait_for()
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
   page.screenshot(path=str(OUT/f'editor-{width}.png'),full_page=True)
   page.locator('#try-again').click();mode['recommend']='error';page.locator('.example-run').click();page.locator('#status').filter(has_text='Synthetic recoverable failure.').wait_for();assert not page.locator('#submit').is_disabled()
   mode['recommend']='none';page.locator('.example-run').click();page.locator('#no-match').wait_for(state='visible')
   page.locator('#edit-comment').click();mode['recommend']='success';mode['create']='error'
   page.locator('.example-picker summary').click();page.locator('.examples button').first.click();page.locator('.studio-status').filter(has_text='Synthetic recoverable failure.').wait_for()
   assert page.locator('.studio-text').count()==1
   page.goto(base);mode['recommend']='hosted';page.locator('.example-run').click()
   page.locator('#best-result video').wait_for(state='visible')
   for _ in range(200):
    if page.locator('#best-result video').evaluate('(video)=>video.readyState')>=2:break
    page.wait_for_timeout(25)
   assert page.locator('#best-result video').evaluate('(video)=>video.readyState')>=2
   assert page.locator('#best-result video').evaluate('(video)=>[video.videoWidth,video.videoHeight]')==[1920,804]
   assert page.locator('#best-result video').get_attribute('controls') is not None
   assert page.locator('#best-result .primary').get_attribute('href')=='/collection?meme='+hosted['id']
   page.locator('#best-result video').evaluate('(video)=>video.play()')
   for _ in range(200):
    if page.locator('#best-result video').evaluate('(video)=>video.currentTime')>.1:break
    page.wait_for_timeout(25)
   assert page.locator('#best-result video').evaluate('(video)=>video.currentTime')>.1
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
   page.screenshot(path=str(OUT/f'hosted-reaction-{width}.png'),full_page=True)
   native_export=None
   if width==1440:
    page.locator('#best-result .primary').click()
    page.locator('.clip-workspace canvas').wait_for(state='visible')
    page.locator('#clip-caption').fill('A small thing that made the whole day better.')
    with page.expect_download(timeout=30000) as native_download:page.locator('[data-clip-action="download"]').click()
    native_file=OUT/'native-24fps.mp4';native_download.value.save_as(native_file)
    native_probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(native_file)]))
    native_stream=next(stream for stream in native_probe['streams'] if stream['codec_type']=='video')
    native_duration=float(native_probe['format']['duration']);average_fps=int(native_stream['nb_read_frames'])/native_duration
    assert native_stream['width']==1920 and native_stream['height']>804
    assert abs(average_fps-24)<1.5,(average_fps,native_probe)
    assert abs(native_duration-hosted['video_evidence']['duration'])<.3
    native_export={'width':native_stream['width'],'height':native_stream['height'],'average_fps':average_fps,'duration':native_duration,'bytes':native_file.stat().st_size,'real_hosted_source':True,'caption_origin':'test-authored'}
   page.goto(base+'/studio');assert page.url==base+'/#meme-form'
   page.goto(base+'/privacy');assert page.locator('h1').inner_text()=='Privacy';assert '30 days' in page.locator('main').inner_text()
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
   page.screenshot(path=str(OUT/f'privacy-{width}.png'),full_page=True)
   assert not errors,errors
   report['widths'].append({'width':width,'passed':True,'native_export':native_export,'hosted_preview':{'source_pixels':[1920,804],'played':True,'synthetic_selection':True,'real_hosted_media':True},'api_calls':calls})
   context.close()
  browser.close()
 (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
 print('Public UX synthetic headless flow passed at 390/768/1440.')
finally:
 proc.terminate();proc.wait(timeout=10)

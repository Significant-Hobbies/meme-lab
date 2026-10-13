"""Actual public DOM/CSS/JS, committed synthetic APIs and media; no live acceptance."""
import json, os, subprocess, sys, time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
FIX=ROOT/'tests/fixtures/public-ux'
OUT=Path(sys.argv[1] if len(sys.argv)>1 else ROOT/'work/public-ux')
OUT.mkdir(parents=True,exist_ok=True)
proc=subprocess.Popen(['node','scripts/preview-landing.mjs','4321'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
base='http://127.0.0.1:4321'
report={'synthetic':True,'live_provider_calls':False,'widths':[]}
try:
 for _ in range(100):
  try:
   urlopen(base).close();break
  except Exception:time.sleep(.1)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
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
     calls.append({'path':path,'body':r.request.post_data_json if r.request.method=='POST' else None})
     if path.startswith('/api/create/media/'):
      r.fulfill(body=(FIX/'sample.png').read_bytes(),content_type='image/png');return
     key={'/api/recommend':'recommend','/api/create':'create','/api/feedback':'feedback'}.get(path)
     assert key, 'Unexpected API '+path
     if mode[key]=='hold':pending.append(r);return
     if mode[key]=='error':r.fulfill(status=503,json={'error':'Synthetic recoverable failure.'});return
     if mode[key]=='none':r.fulfill(json={'decision':'none','none_reason':'A sincere answer belongs here.'});return
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
   page.locator('.studio-text').wait_for();page.wait_for_function('document.querySelector(".studio-text").value==="One click is enough"')
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
   page.goto(base+'/studio');assert page.url==base+'/#meme-form'
   page.goto(base+'/privacy');assert page.locator('h1').inner_text()=='Privacy';assert '30 days' in page.locator('main').inner_text()
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
   page.screenshot(path=str(OUT/f'privacy-{width}.png'),full_page=True)
   assert not errors,errors
   report['widths'].append({'width':width,'passed':True,'api_calls':calls})
   context.close()
  browser.close()
 (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
 print('Public UX synthetic headless flow passed at 390/768/1440.')
finally:
 proc.terminate();proc.wait(timeout=10)

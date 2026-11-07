import functools,http.server,json,threading,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/".fleet-local/anna-bundle-browser"
OUT.mkdir(parents=True,exist_ok=True)
SDK="export const AnnaAppRuntime={connect:async()=>({entryPayload:{},on(){},storage:{list:async()=>({items:[]}),get:async()=>({value:null}),set:async()=>({})},files:{list:async()=>({items:[]})}})};"
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=ROOT))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
results=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch()
  for width in [390,768,1440]:
   page=browser.new_page(viewport={'width':width,'height':900});errors=[];failed=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   page.on('response',lambda response:failed.append(response.url) if response.status>=400 and response.url.startswith(base) else None)
   def route(r):
    if r.request.url==base+'/static/anna-apps/_sdk/latest/index.js':r.fulfill(content_type='text/javascript',body=SDK)
    elif r.request.url.startswith(base+'/'):r.continue_()
    else:r.abort()
   page.route('**/*',route)
   page.goto(base+'/anna/bundle/index.html');page.wait_for_function("document.querySelector('#open-personal').onclick!==null")
   page.locator('#open-personal').click();page.locator('#personal-title').wait_for(state='visible')
   assert page.locator('#personal-editor').is_visible()
   page.screenshot(path=str(OUT/f'editor-{width}.png'),full_page=True)
   data=page.evaluate("""async()=>{const c=document.createElement('canvas');c.width=240;c.height=320;const x=c.getContext('2d');x.fillStyle='#bb9988';x.fillRect(0,0,240,320);x.fillStyle='#223355';x.fillRect(60,80,90,90);return c.toDataURL('image/png').split(',')[1];}""")
   import base64
   payload={'name':'fixture.png','mimeType':'image/png','buffer':base64.b64decode(data)}
   page.locator('#personal-template').set_input_files(payload);page.locator('#personal-photo').set_input_files(payload)
   page.locator('#personal-consent').check();page.wait_for_function("!document.querySelector('#personal-generate').disabled")
   assert page.locator('#personal-original').is_visible()
   assert page.locator('#personal-dimensions').inner_text()=='240 × 320'
   assert page.locator('#personal-output-actions').is_hidden()
   page.locator('#personal-clear').click();assert page.locator('#personal-generate').is_disabled()
   page.locator('#personal-close').click();assert page.locator('#personal-editor').is_hidden()
   page.locator('#open-personal').click()
   assert page.locator('[data-anna-reactions]').count()>=3,'Anna reaction navigation targets are missing'
   if width<768:page.get_by_role('button',name='Open menu',exact=True).click()
   page.locator('[data-anna-reactions]:visible').first.click();assert page.locator('#personal-editor').is_hidden()
   assert page.locator('#meme-form').is_visible()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Overflow at {width}'
   assert not errors,errors
   assert not failed,failed
   page.goto(base+'/anna/bundle/privacy.html');assert page.locator('h1').inner_text()=='Meme Lab on Anna'
   assert page.locator('.topbar').evaluate("el=>getComputedStyle(el).display")=='grid','Privacy page lost its base styling'
   results.append({'privacyStyle':'passed','navigationClose':'passed','width':width,'editorOpenUploadConsentClearClose':'passed','pageErrors':errors,'localAssetFailures':failed,'generationRequested':False,'externalRequestsBlocked':True})
   page.close()
  browser.close()
 (OUT/'bundle-browser.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
finally:server.shutdown();server.server_close()

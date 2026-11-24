import base64,functools,http.server,json,threading,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/".fleet-local/anna-bundle-browser"
OUT.mkdir(parents=True,exist_ok=True)
SDK="export const AnnaAppRuntime={connect:async()=>({entryPayload:{},on(){},storage:{list:async()=>({items:[]}),get:async()=>({value:null}),set:async()=>({})},files:{list:async()=>({items:[]})}})};"

SAVE_SDK = """
window.fixtureSavePaths=[];
const files=new Map();
export const AnnaAppRuntime={connect:async()=>({
 entryPayload:{},on(){},
 storage:{list:async()=>({items:[]})},
 upload:{inline:async()=>({download_url:'https://fixture.example/input.png'})},
 image:{generate:async()=>({images:[{url:'https://fixture.example/edit.png'}]})},
 files:{
  list:async({prefix})=>({items:[...files.values()].filter(item=>item.path.startsWith(prefix))}),
  upload_init:async args=>{
    if(files.has(args.path))throw new Error('Path already exists');
    return {put_url:'https://fixture.example/'+args.path,headers:{}};
  },
  upload_finalize:async args=>{
    window.fixtureSavePaths.push(args.path);
    const row={path:args.path,size_bytes:args.size_bytes,etag:'fixture-etag',content_type:'image/png',metadata:{kind:'personal-meme'}};
    files.set(args.path,row);
    if(window.fixtureSavePaths.length===1)throw new Error('Confirmation lost after committing the object');
    return row;
  },
  download_url:async ({path})=>({get_url:'https://fixture.example/'+path})
 }
})};
"""

def check_save_retry(browser, base):
 page=browser.new_page(viewport={'width':768,'height':900})
 errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 uploaded={}
 media={}
 def route(r):
  url=r.request.url
  if url==base+'/static/anna-apps/_sdk/latest/index.js':
   return r.fulfill(content_type='text/javascript',body=SAVE_SDK)
  if url.startswith(base+'/'):return r.continue_()
  headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Access-Control-Expose-Headers':'etag','etag':'fixture-etag'}
  if url=='https://fixture.example/edit.png':return r.fulfill(content_type='image/png',body=media['edited'],headers=headers)
  if url.startswith('https://fixture.example/creations/'):
   if r.request.method=='OPTIONS':return r.fulfill(status=204,headers=headers)
   if r.request.method=='PUT':
    uploaded[url]=r.request.post_data_buffer
    return r.fulfill(status=200,headers=headers,body='')
   if r.request.method=='GET' and url in uploaded:
    return r.fulfill(content_type='image/png',body=uploaded[url],headers=headers)
  return r.abort()
 try:
  page.route('**/*',route)
  page.goto(base+'/anna/bundle/index.html')
  page.wait_for_function("document.querySelector('#open-personal').onclick!==null")
  def png(colors,marks):
   data=page.evaluate("""({colors,marks})=>{
    const c=document.createElement('canvas');c.width=c.height=240;
    const ctx=c.getContext('2d');
    for(const [index,bounds] of marks){ctx.fillStyle=colors[index];ctx.fillRect(...bounds);}
    return c.toDataURL('image/png').split(',')[1];
   }""",{'colors':colors,'marks':marks})
   return base64.b64decode(data)
  original=png(['#bfb2a0','#663322','#225588'],[(0,[0,0,240,240]),(1,[75,35,71,65]),(2,[22,190,188,23])])
  portrait=png(['#131e5f','#22bb88'],[(0,[0,0,240,240]),(1,[31,30,57,167])])
  media['edited']=png(['#ee8844','#112233'],[(0,[0,0,240,240]),(1,[75,43,45,28])])
  page.locator('#open-personal').click()
  for selector,blob in [('#personal-template',original),('#personal-photo',portrait)]:
   page.locator(selector).set_input_files({'name':'fixture.png','mimeType':'image/png','buffer':blob})
  page.locator('#personal-consent').check()
  page.locator('#personal-generate').click()
  page.locator('#personal-output').wait_for(state='visible')
  page.locator('#personal-save').click()
  page.get_by_text('Saving could not be confirmed.',exact=False).wait_for()
  assert page.locator('#personal-saved-note').is_hidden()
  page.locator('#personal-save').click()
  page.locator('#personal-saved-note').wait_for(state='visible')
  paths=page.evaluate('window.fixtureSavePaths')
  assert len(paths)==1, 'An already committed upload must not be written again'
  assert len(uploaded)==1 and next(iter(uploaded.values())).startswith(b'\x89PNG')
  page.locator('#personal-library article').first.wait_for(state='visible')
  assert page.locator('#personal-library article').count()==1
  assert not errors,errors
  return {'saveConfirmDelay':'recovered','saveClicks':2,'finalizeCalls':1,'privateObjects':1,'libraryItems':1}
 finally:
  page.close()

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
   payload={'name':'fixture.png','mimeType':'image/png','buffer':base64.b64decode(data)}
   page.locator('#personal-template').set_input_files(payload);page.locator('#personal-photo').set_input_files(payload)
   page.locator('#personal-consent').check();page.wait_for_function("!document.querySelector('#personal-generate').disabled")
   assert page.locator('#personal-original').is_visible()
   assert page.locator('#personal-dimensions').inner_text()=='240 × 320'
   assert page.locator('#personal-output-actions').is_hidden()
   page.locator('#personal-clear').click();assert page.locator('#personal-generate').is_disabled()
   page.locator('#personal-close').click();assert page.locator('#personal-editor').is_hidden()
   assert page.locator('[data-anna-reactions]').count()==3,'Anna reaction navigation targets are missing'
   assert page.locator('[data-anna-home]').count()==1,'Anna brand navigation target is missing'
   navigation=[]
   for editing in [True,False]:
    for target in ['nav','footer','brand','back']:
     if editing:page.locator('#open-personal').click()
     if target=='nav':
      if width<768:page.get_by_role('button',name='Open menu',exact=True).click()
      page.locator('[data-anna-reactions]').nth(1 if width<768 else 0).click()
     elif target=='footer':page.locator('[data-anna-reactions]').last.click()
     elif target=='brand':page.locator('[data-anna-home]').click()
     elif editing:page.locator('#personal-close').click()
     else:assert page.locator('#personal-close').is_hidden()
     assert page.locator('#personal-editor').is_hidden(),f'{target} kept editor open'
     assert page.locator('#meme-form').is_visible(),f'{target} did not return to reactions'
     assert page.locator(':popover-open').count()==0,f'{target} left the mobile menu open'
     navigation.append({'target':target,'initialEditorOpen':editing,'finalView':'reactions','popoverOpen':False,'action':'click' if editing or target!='back' else 'hidden control verified'})
   assert page.locator('#meme-form').is_visible()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Overflow at {width}'
   assert not errors,errors
   assert not failed,failed
   page.goto(base+'/anna/bundle/privacy.html');assert page.locator('h1').inner_text()=='Meme Lab on Anna'
   assert page.locator('.topbar').evaluate("el=>getComputedStyle(el).display")=='grid','Privacy page lost its base styling'
   results.append({'navigationCases':navigation,'privacyStyle':'passed','navigationClose':'passed','width':width,'editorOpenUploadConsentClearClose':'passed','pageErrors':errors,'localAssetFailures':failed,'generationRequested':False,'externalRequestsBlocked':True})
   page.close()
  save_retry=check_save_retry(browser,base)
  browser.close()
 (OUT/'bundle-browser.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps({'viewports':results,'saveRetry':save_retry},indent=2))
finally:server.shutdown();server.server_close()

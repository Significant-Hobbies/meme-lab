import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../worker/src/index.mjs';
import {catalogue,clipLibrary} from '../worker/src/catalogue.mjs';
const origin='https://memes.significanthobbies.com';
const env={ASSETS:{fetch:async request=>{
  assert.equal(request.headers.get('cookie'),null);
  assert.equal(request.headers.get('authorization'),null);
  const path=new URL(request.url).pathname;
  if(path==='/catalogue-v2.json')return new Response(await readFile(new URL('../worker/public/catalogue-v2.json',import.meta.url)));
  return new Response('<html><head><title>Public</title></head><body><main>Unchanged body</main></body></html>',{headers:{'Content-Type':'text/html','Vary':'Origin'}});
}}};
const get=(path,init={})=>worker.fetch(new Request(origin+path,init),env,{});
test('registry includes exactly active canonical public pages and excludes internal data',async()=>{
  const routes=await (await get('/api/md/_catalog')).json();
  const records=[...new Map([...catalogue,...clipLibrary].map(record=>[record.id,record])).values()].filter(record=>record.catalogue_status==='active'&&(!record.canonical_id||record.canonical_id===record.id));
  assert.equal(routes.length,records.length+5);
  const xml=await (await get('/sitemap.xml')).text();
  for(const route of routes){assert.ok(xml.includes('<loc>'+route.url+'</loc>'));assert.ok(!route.path.startsWith('/api/'));}
  for(const path of ['/api/md/api/recommend','/api/md/api/anna/events','/api/md/studio','/unknown.md','/memes/unknown.md']){
    const response=await get(path);assert.equal(response.status,404);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-robots-tag'),'noindex, follow');
  }
});
test('all public representations share content, headers and query-free source loading',async()=>{
  for(const path of ['/','/collection','/privacy','/anna-privacy','/how-it-works','/memes/absolute-cinema']){
    const suffix=path==='/'?'/index.md':path+'.md';
    const response=await get(suffix),body=await response.text();
    assert.equal(response.status,200);assert.match(body,/^# /m);assert.doesNotMatch(body,/\]\(\//);
    assert.equal(response.headers.get('content-location'),origin+path);
    assert.equal(response.headers.get('x-markdown-tokens'),String(Math.ceil(body.length/4)));
    assert.equal(response.headers.get('x-robots-tag'),'noindex, follow');assert.equal(response.headers.get('access-control-allow-origin'),'*');
    for(const target of ['/api/md'+path,path+'?private=CANARY'])assert.equal(await(await get(target,{headers:{Accept:'text/markdown',Cookie:'CANARY',Authorization:'Bearer CANARY'}})).text(),body);
    const head=await get(suffix,{method:'HEAD'});assert.equal(await head.text(),'');assert.equal(head.headers.get('x-markdown-tokens'),response.headers.get('x-markdown-tokens'));
    assert.equal((await get('/api/md'+path,{method:'OPTIONS'})).status,204);
  }
});
test('quality negotiation preserves HTML, its body and response variation',async()=>{
  for(const accept of ['*/*','text/markdown;q=0','text/markdown;q=0.5,text/html;q=1','text/markdown,text/html']){
    const response=await get('/',{headers:{accept}});const html=await response.text();assert.match(html,/<main>Unchanged body<\/main>/);assert.match(html,/name="ai-summary"/);assert.match(html,/type="text\/markdown"/);assert.equal(response.headers.get('vary'),'Origin, Accept');
  }
});
test('exports are bounded, disclose coverage, and allow six crawlers only on public content',async()=>{
  const full=await(await get('/llms-full.txt')).text();assert.ok(full.length<500000);assert.match(full,/Included 50 of/);assert.doesNotMatch(full,/undefined|CANARY/);
  const robots=await(await get('/robots.txt')).text();for(const bot of ['GPTBot','ClaudeBot','Google-Extended','Applebot-Extended','CCBot','Bytespider'])assert.ok(robots.includes('User-agent: '+bot+'\nAllow: /\nDisallow: /api/'));
  assert.match(await(await get('/ai.txt')).text(),/training: allowed on public pages only/);
});

test('unknown negotiated meme pages return a Markdown 404 and encoded known paths redirect',async()=>{
  for(const method of ['GET','HEAD']){
    const response=await get('/memes/does-not-exist',{method,headers:{Accept:'text/markdown'}});
    assert.equal(response.status,404);assert.match(response.headers.get('content-type'),/text\/markdown/);
    assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('x-robots-tag'),/noindex/);
    if(method==='HEAD')assert.equal(await response.text(),'');
  }
  for(const suffix of ['','.md']){
    const response=await get('/memes/%61bsolute-cinema'+suffix,{headers:{Accept:'text/markdown'}});
    assert.equal(response.status,301);assert.equal(response.headers.get('location'),origin+'/memes/absolute-cinema'+suffix);
  }
});
test('unavailable collection sources return no-store503 for all Markdown forms',async()=>{
  for(const asset of [()=>new Response('missing',{status:404}),()=>new Response('invalid JSON'),()=>{throw Error('offline');}]){
    for(const path of ['/collection.md','/collection','/api/md/collection','/llms-full.txt']){
      for(const method of ['GET','HEAD']){
        const response=await worker.fetch(new Request(origin+path,{method,headers:{Accept:'text/markdown'}}),{ASSETS:{fetch:asset}},{});
        assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
        assert.match(response.headers.get('content-type'),/text\/markdown/);assert.match(response.headers.get('x-robots-tag'),/noindex/);
        if(method==='HEAD')assert.equal(await response.text(),'');
      }
    }
  }
});
test('partial HTML remains byte-identical with its range metadata',async()=>{
  const body='<head><title>Partial</title></head>';
  const range=`bytes 0-${body.length-1}/500`;
  const response=await worker.fetch(new Request(origin+'/privacy',{headers:{Range:`bytes=0-${body.length-1}`}}),{ASSETS:{fetch:()=>new Response(body,{status:206,headers:{'Content-Type':'text/html','Content-Range':range,'Content-Length':String(body.length)}})}},{});
  assert.equal(response.status,206);assert.equal(await response.text(),body);
  assert.equal(response.headers.get('content-range'),range);assert.equal(response.headers.get('content-length'),String(body.length));
});

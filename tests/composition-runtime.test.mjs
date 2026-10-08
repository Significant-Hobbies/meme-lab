import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

// Exercise actual Worker fetch semantics using Wrangler's existing dev tools.
const require=createRequire(import.meta.url);
const tooling=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=tooling('miniflare');
const {buildSync}=tooling('esbuild');
const root=fileURLToPath(new URL('../',import.meta.url));
const script=buildSync({stdin:{contents:"import {compositionMedia} from './worker/src/meme-composition.mjs'; export default {fetch(){return compositionMedia('drake-preference');}}",resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser'}).outputFiles[0].text;

test('actual Workerd media path serves allowed rasters and never follows redirects',async()=>{
  let calls=0,redirect=false;
  const runtime=new Miniflare(convertV4MiniflareOptions({
    name:'caption-media-regression',modules:true,compatibilityDate:'2026-09-01',script,
    outboundService:async request=>{
      calls++;assert.equal(request.url,'https://i.imgflip.com/30b1gx.jpg');
      return redirect?new Response(null,{status:302,headers:{Location:'https://private.invalid/'}}):
        new Response(new Uint8Array([255,216,255,1]),{headers:{'Content-Type':'image/jpeg'}});
    }
  }));
  try {
    const image=await runtime.dispatchFetch('http://localhost/');
    assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg');
    assert.deepEqual(new Uint8Array(await image.arrayBuffer()),new Uint8Array([255,216,255,1]));
    assert.equal(calls,1);
    redirect=true;
    assert.equal((await runtime.dispatchFetch('http://localhost/')).status,502);
    assert.equal(calls,2,'redirect target must never be fetched');
  }finally{await runtime.dispose();}
});

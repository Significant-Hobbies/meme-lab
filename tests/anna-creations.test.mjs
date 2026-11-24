import test from 'node:test';
import assert from 'node:assert/strict';
import {persistMeme,downloadSavedMeme,removeSavedMeme,listSavedMemes,listSavedMemePage,readSavedMeme} from '../anna/creations.mjs';
const id='01234567-89ab-cdef-0123-456789abcdef';
const blob=new Blob([new Uint8Array(40)],{type:'image/png'});
test('saving uploads only the output and confirms its bytes before claiming persistence',async()=>{
  const calls=[];const anna={files:{upload_init:async args=>{calls.push(args);return {put_url:'https://cdn.anna.partners/put',headers:{'Content-Type':'image/png','X-Signed':'exact'}};},upload_finalize:async args=>{calls.push(args);return {path:args.path,etag:'version1',size_bytes:40};}}};
  const saved=await persistMeme(anna,blob,{id,fetchImpl:async(url,args)=>{assert.equal(args.body,blob);assert.equal(args.credentials,'omit');assert.equal(args.redirect,'error');assert.equal(args.headers['X-Signed'],'exact');return new Response(null,{headers:{etag:'r2-etag'}});}});
  assert.equal(saved.bytes,40);assert.deepEqual(calls[0].metadata,{kind:'personal-meme'});assert.equal(calls[1].etag,'r2-etag');
});
test('library filters unrelated files and saved-image sharing rejects truncated or non-PNG bytes',async()=>{
  const path=`creations/${id}.png`;const valid={path,content_type:'image/png',size_bytes:40,etag:'v1',metadata:{kind:'personal-meme'}};
  const anna={files:{list:async args=>{assert.equal(args.prefix,'creations/');return {items:[valid,{...valid,path:'other-app/private.png'},{...valid,metadata:{}},{...valid,size_bytes:99999999}]};},download_url:async()=>({get_url:'https://cdn.anna.partners/image.png'})}};
  assert.deepEqual(await listSavedMemes(anna),[valid]);
  await assert.rejects(readSavedMeme(anna,path,{fetchImpl:async()=>new Response(new Uint8Array(40))}),/not a PNG/);
  await assert.rejects(readSavedMeme(anna,path,{fetchImpl:async()=>new Response(new Uint8Array(2))}),/incomplete/);
});
test('denied quota, failed PUT and unconfirmed storage do not report saved success',async()=>{
  const files={upload_init:async()=>({put_url:'https://cdn.anna.partners/put',headers:{'Content-Type':'image/png'}}),upload_finalize:async()=>{throw new Error('must not finalize failed upload');}};
  await assert.rejects(persistMeme({files},blob,{id,fetchImpl:async()=>new Response(null,{status:403})}),/not been saved/);
  files.upload_init=async()=>{throw Object.assign(new Error('quota'),{code:'quota_exceeded'});};let requests=0;
  await assert.rejects(persistMeme({files},blob,{id,fetchImpl:async()=>{requests++;}}),{code:'quota_exceeded'});assert.equal(requests,0);
});
test('a save retry uploads only when the earlier file is absent',async()=>{
  const path=`creations/${id}.png`;
  const bytes=Uint8Array.of(137,80,78,71,13,10,26,10,1,2,3,4);
  const png=new Blob([bytes],{type:'image/png'});
  const calls=[];
  let items=[];
  let next_cursor=null;
  let stored=bytes;
  const anna={files:{
    list:async args=>{assert.equal(args.prefix,path);return {items,next_cursor};},
    upload_init:async args=>{assert.equal(args.path,path);calls.push('init');return {put_url:'https://cdn.anna.partners/put',headers:{}};},
    upload_finalize:async args=>{calls.push('finalize');return {path:args.path,etag:'v1',size_bytes:bytes.length};},
    download_url:async args=>{assert.equal(args.path,path);return {get_url:'https://cdn.anna.partners/saved.png'};},
  }};
  const fetchImpl=async(_url,{method})=>{
    if(method==='PUT')return new Response(null);
    calls.push('read');
    return new Response(stored);
  };
  const retry=()=>persistMeme(anna,png,{id,fetchImpl,recover:true});
  const saved=await retry();
  assert.deepEqual(saved,{path,etag:'v1',bytes:bytes.length});
  assert.deepEqual(calls,['init','finalize']);
  next_cursor='opaque-next-page';
  await assert.rejects(retry(),/could not confirm/);
  const entry={path,etag:'v1',size_bytes:bytes.length,content_type:'image/png',metadata:{kind:'personal-meme'}};
  items=[{...entry,metadata:null}];
  await assert.rejects(retry(),/could not confirm/);
  assert.deepEqual(calls,['init','finalize']);
  items=[entry];
  assert.deepEqual(await retry(),saved);
  stored=Uint8Array.from(bytes,(byte,index)=>index===11?5:byte);
  await assert.rejects(retry(),/A different file already uses this path/);
  assert.deepEqual(calls,['init','finalize','read','read']);
});
test('download and removal are bounded to this feature’s paths and preserve storage concurrency',async()=>{
  const path=`creations/${id}.png`;let download,remove;
  const anna={files:{download:async args=>{download=args;return {ok:true};},delete:async args=>{remove=args;return {deleted:true};}}};
  assert.equal(await downloadSavedMeme(anna,path),'download_started');assert.equal(download.filename,'my-meme.png');
  await removeSavedMeme(anna,{path,etag:'version1'});assert.deepEqual(remove,{path,if_match:'version1'});
  for(const invalid of ['other-app/private.png','creations/../../private.png','/creations/a.png'])await assert.rejects(downloadSavedMeme(anna,invalid),/Invalid/);
});

test('library exposes the opaque next cursor and passes it to the next page',async()=>{
  const calls=[];const anna={files:{list:async args=>{calls.push(args);return {items:[],next_cursor:args.cursor?null:'opaque-next-page'};}}};
  const first=await listSavedMemePage(anna);assert.equal(first.nextCursor,'opaque-next-page');
  const second=await listSavedMemePage(anna,{cursor:first.nextCursor});assert.equal(second.nextCursor,null);assert.equal(calls[1].cursor,'opaque-next-page');assert.equal(calls[1].prefix,'creations/');
});

test('removal accepts exact-path APS confirmation but rejects ambiguous success',async()=>{
  const entry={path:`creations/${id}.png`,etag:'version1'};
  const anna={files:{delete:async args=>{assert.deepEqual(args,{path:entry.path,if_match:entry.etag});return {ok:true,path:entry.path};}}};
  assert.equal(await removeSavedMeme(anna,entry),'removed');
  for(const result of [{ok:true},{ok:true,path:'other-app/private.png'},{ok:false,path:entry.path},{deleted:false}]){
    anna.files.delete=async()=>result;
    await assert.rejects(removeSavedMeme(anna,entry),/did not confirm removal/);
  }
});

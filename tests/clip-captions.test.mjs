import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalogue} from '../worker/src/catalogue.stage3000.generated.mjs';
import {clipSource,clipCaptions,clipMedia,validateClipCaptions,validateClipFrames} from '../worker/src/clip-captions.mjs';
import {planComposition} from '../worker/src/meme-composition.mjs';
import worker from '../worker/src/index.mjs';

const clip=catalogue.find(record=>record.id==='gif-yrufixsnwfvcxaxpmx');
const body={candidate_id:clip.id,comment:'The tests passed after I changed nothing and ran them again.',audience:'Developers',tone:'deadpan'};
const request=(data=body,extra={})=>new Request('https://example.test/api/clips/captions',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(data)});
const output={decision:'captions',captions:['Changed nothing. Fixed everything.','The fix was running it again.','My contribution: the up arrow.']};
const frameBytes=await readFile(new URL('./fixtures/public-ux/frame.jpg',import.meta.url));
const frames=[.2,.7,1.2].map(at_seconds=>({at_seconds,data_url:'data:image/jpeg;base64,'+frameBytes.toString('base64')}));
const answer=(value=output,extra={})=>Response.json({model:'served-model',choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],...extra});

test('reaction video URLs derive only from the existing catalogue source',()=>{
  assert.equal(clipSource(clip),'https://media.giphy.com/media/YRuFixSNWFVcXaxpmX/giphy.mp4');
  assert.equal(catalogue.filter(record=>clipSource(record)).length,1195);
  for(const url of ['http://media.giphy.com/media/abc/giphy.gif','https://media.giphy.com.evil.test/media/abc/giphy.gif','https://user:pass@media.giphy.com/media/abc/giphy.gif','https://media.giphy.com/media/abc/giphy.gif?redirect=x','https://media.giphy.com/anything.gif','https://private.invalid/'])assert.equal(clipSource({media_type:'gif',media_url:url}),null);
  assert.equal(clipSource({...clip,media_type:'image'}),null);
});

test('clip generation sends one bounded, attributed automatic request with the selected brief',async()=>{
  let calls=0;
  const response=await clipCaptions(request(),{FREE_AI:{fetch:async req=>{
    calls++;assert.equal(req.headers.get('x-gateway-project-id'),'meme-lab');const data=await req.json();
    assert.equal(data.model,'auto');assert.equal(data.max_tokens,850);assert.equal(data.reasoning_effort,'low');assert.match(data.messages[0].content,/Caption style: deadpan/);assert.match(data.messages[0].content,/Developers/);assert.match(data.messages[0].content,/Use Clap/);assert.equal(data.messages.length,1);return answer();
  }}});
  assert.equal(calls,1);assert.equal(response.status,200);assert.deepEqual((await response.json()).captions,output.captions);
});

test('serious and factual inputs return no caption before inference',async()=>{
  for(const comment of ['My friend died and I need condolences.','There is a gas leak in my house. What do I do?','What is the official deadline to file my income tax return?']){
    const response=await clipCaptions(request({...body,comment}),{FREE_AI:{fetch:()=>assert.fail('No inference')}});
    assert.equal(response.status,200);assert.equal((await response.json()).decision,'none');
  }
});

test('clip endpoint rejects invalid briefs, IDs, oversized input and cross-origin calls',async()=>{
  for(const data of [null,{}, {...body,candidate_id:'drake-preference'},{...body,candidate_id:'unknown'},{...body,comment:'x'.repeat(1001)},{...body,tone:'invented'},{...body,audience:'x'.repeat(81)},{...body,audience:'bad\nvalue'}])assert.equal((await clipCaptions(request(data),{})).status,400);
  assert.equal((await clipCaptions(request({...body,extra:'x'.repeat(500001)}),{})).status,413);
  assert.equal((await worker.fetch(request(body,{Origin:'https://other.test'}),{})).status,403);
  assert.equal((await clipCaptions(new Request('https://example.test/api/clips/captions',{method:'POST',body:'{}'}),{})).status,415);
});

test('clip output rejects incomplete, duplicate, contradictory or invalid captions',()=>{
  assert.deepEqual(validateClipCaptions(output),output);
  for(const value of [{}, {...output,captions:['one']},{...output,captions:['same','same','same']},{...output,captions:['fine','ok','x'.repeat(141)]},{...output,captions:['fine','ok','bad\u0001']},{decision:'none',captions:['no']}])assert.throws(()=>validateClipCaptions(value));
  assert.equal(validateClipCaptions({decision:'none',captions:[]}).decision,'none');
});

test('visual captioning sends three bounded chronological frames with automatic vision routing',async()=>{
  assert.equal(validateClipFrames(frames).length,3);
  for(const invalid of [[],[frames[0]],frames.map(frame=>({...frame,at_seconds:1})),frames.map(frame=>({...frame,data_url:'https://private.invalid/'})),frames.map(frame=>({...frame,data_url:'data:image/jpeg;base64,/9j/AA=='})),frames.map(frame=>({...frame,at_seconds:31}))])assert.throws(()=>validateClipFrames(invalid));
  const response=await clipCaptions(request({...body,frames}),{FREE_AI:{fetch:async req=>{
    const data=await req.json();assert.equal(data.model,'auto');const content=data.messages[0].content;
    assert.equal(content.filter(part=>part.type==='image_url').length,3);assert.match(content[0].text,/Inspect the three chronological frames/);assert.match(content[0].text,/emotionally incompatible/);assert.ok(content.every(part=>part.type==='text'||part.image_url.url.startsWith('data:image/jpeg;base64,')));return answer();
  }}});
  assert.equal(response.status,200);assert.equal((await response.json()).grounding,'visual');
  assert.equal(validateClipCaptions({decision:'reference',captions:[]}).decision,'reference');
});

test('provider errors, quota, malformed output and attribution errors never become success or retry',async()=>{
  const responses=[()=>new Response('',{status:429}),()=>new Response('',{status:503}),()=>answer({...output,captions:['short']}),()=>answer(output,{model:'auto'}),()=>answer(output,{x_gateway:{model:'conflict'}}),()=>answer(output,{choices:[{finish_reason:'length',message:{content:JSON.stringify(output)}}]}),()=>Response.json({model:'served',choices:[{message:{content:'invalid'}}]})];
  for(const make of responses){let calls=0;const response=await clipCaptions(request(),{FREE_AI:{fetch:async()=>{calls++;return make();}}});assert.equal(calls,1);assert.ok([429,503].includes(response.status));assert.ok((await response.json()).error);}
  assert.equal((await clipCaptions(request(),{})).status,503);
});

test('video proxy accepts a valid MP4 and blocks unknown IDs, redirects, wrong types and large bodies',async()=>{
  const bytes=await readFile(new URL('./fixtures/public-ux/clip.mp4',import.meta.url));
  let calls=0;
  const response=await clipMedia(clip.id,async(url,options)=>{calls++;assert.equal(url,clipSource(clip));assert.equal(options.redirect,'manual');return new Response(bytes,{headers:{'Content-Type':'video/mp4'}});});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'video/mp4');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array(bytes));assert.equal(calls,1);
  assert.equal((await clipMedia('unknown',()=>assert.fail('No fetch for unknown IDs'))).status,404);
  for(const make of [()=>new Response(null,{status:302,headers:{Location:'https://private.invalid/'}}),()=>new Response(bytes,{headers:{'Content-Type':'text/html'}}),()=>new Response('not an mp4',{headers:{'Content-Type':'video/mp4'}}),()=>new Response(bytes,{headers:{'Content-Type':'video/mp4','Content-Length':String(21*1024*1024)}}),()=>new Response(new Uint8Array(20*1024*1024+1),{headers:{'Content-Type':'video/mp4'}})])assert.equal((await clipMedia(clip.id,async()=>make())).status,502);
});

test('static template briefs use the same tone and audience without changing inspected geometry',()=>{
  const plan=planComposition({...body,candidate_id:'drake-preference'});assert.match(plan.content,/Caption style: deadpan/);assert.match(plan.content,/"audience":"Developers"/);assert.equal(plan.profile.id,'drake-preference');assert.throws(()=>planComposition({...body,candidate_id:'drake-preference',tone:'wrong'}));
});

test('video streaming enforces its byte limit without buffering the full clip',async()=>{
  const signature=new Uint8Array([0,0,0,20,102,116,121,112,105,115,111,109]);let sent=0,cancelled=false;
  const response=await clipMedia(clip.id,async()=>new Response(new ReadableStream({pull(controller){if(sent++===0)controller.enqueue(signature);else controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'video/mp4'}}));
  assert.equal(response.status,200);assert.ok(sent<5,'Response must start before the full body is read');
  await assert.rejects(response.arrayBuffer(),/Clip too large/);assert.equal(cancelled,true);
});

test('reference pages link directly into gallery creation and CSP admits only local/blob video',async()=>{
  for(const id of [clip.id,'drake-preference']){const response=await worker.fetch(new Request('https://example.test/memes/'+id),{});const html=await response.text();assert.ok(html.includes('/collection?meme='+id));assert.match(response.headers.get('Content-Security-Policy'),/media-src 'self' blob:/);}
});

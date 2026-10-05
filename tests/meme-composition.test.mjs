import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.mjs';
import {catalogue} from '../worker/src/catalogue.stage3000.generated.mjs';
import {memeTemplates,templateFor,creationMediaUrl} from '../worker/src/meme-templates.mjs';
import {CAPTION_MODEL,boundedBytes,compositionPrompt,composeMeme,compositionMedia,validateComposition} from '../worker/src/meme-composition.mjs';
import {clampBox,fitText,wrapText,renderMeme} from '../worker/public/meme-renderer.js';
import {readFile} from 'node:fs/promises';

const drake=catalogue.find(record=>record.id==='drake-preference');
const visual=catalogue.find(record=>creationMediaUrl(record)&&!templateFor(record));
const valid={decision:'compose',captions:[{id:'rejected',text:'Sending an email'},{id:'preferred',text:'A meeting about fewer meetings'}]};
const request=(body={},headers={})=>new Request('https://example.test/api/create',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({comment:'My coworker scheduled a meeting about fewer meetings.',candidate_id:drake.id,...body})});
const completion=(output,extra={},metadata={})=>Response.json({model:'gemini-3.5-flash-lite',choices:[{message:{content:JSON.stringify(output)},finish_reason:'stop',...extra}],...metadata});

test('eight inspected templates have bounded role-specific regions tied to exact assets',()=>{
  assert.equal(memeTemplates.length,8);
  for(const template of memeTemplates) {
    const record=catalogue.find(record=>record.id===template.id);
    assert(record);assert.equal(record.media_url,template.image_url);
    assert.deepEqual(templateFor(record),template);
    for(const region of template.regions) {
      assert(region.role);const [x,y,w,h]=region.box;
      assert(x>=0&&y>=0&&w>=.08&&h>=.04&&x+w<=1&&y+h<=1);
    }
  }
  const profile=templateFor(drake);profile.regions[0].box[0]=0;
  assert.equal(templateFor(drake).regions[0].box[0],.53,'request edits do not mutate shared geometry');
});

test('caption roles select verified geometry even when output is reordered',()=>{
  const output=validateComposition({...valid,captions:[...valid.captions].reverse()},drake);
  assert.equal(output.placement,'template');
  assert.deepEqual(output.layers.map(layer=>layer.text),['Sending an email','A meeting about fewer meetings']);
  assert(output.layers[0].box[1]<output.layers[1].box[1]);
  for(const bad of [
    {...valid,captions:[valid.captions[0]]},
    {...valid,captions:[valid.captions[0],valid.captions[0]]},
    {...valid,captions:[valid.captions[0],{id:'invented',text:'Caption'}]},
    {...valid,captions:[{...valid.captions[0],box:[0,0,1,1]},valid.captions[1]]},
    {...valid,captions:[{id:'rejected',text:' '},valid.captions[1]]},
    {...valid,captions:[{id:'rejected',text:'x'.repeat(141)},valid.captions[1]]}
  ]) assert.throws(()=>validateComposition(bad,drake));
});

test('Gru’s final panel deterministically repeats the backfire rather than inventing another event',()=>{
  const record=catalogue.find(record=>record.id==='grus-plan');
  const output=validateComposition({decision:'compose',captions:[{id:'goal',text:'Reduce meetings'},{id:'plan',text:'Create a committee'},{id:'backfire',text:'Schedule weekly meetings'}]},record);
  assert.equal(output.layers.length,4);assert.equal(output.layers[2].text,output.layers[3].text);
  assert.notDeepEqual(output.layers[2].box,output.layers[3].box);
});

test('small caption regions reject overlong generated text without truncating its meaning',()=>{
  const record=catalogue.find(record=>record.id==='two-buttons');
  const output={decision:'compose',captions:[{id:'choice-a',text:'a'.repeat(32)},{id:'choice-b',text:'हर अपडेट तुरंत जानो'}]};
  assert.equal(validateComposition(output,record).layers[1].text,'हर अपडेट तुरंत जानो');
  assert.throws(()=>validateComposition({...output,captions:[{id:'choice-a',text:'a'.repeat(33)},output.captions[1]]},record));
  const emoji={...output,captions:[{id:'choice-a',text:'🙂'.repeat(32)},output.captions[1]]};
  assert.equal(validateComposition(emoji,record).layers[0].text,'🙂'.repeat(32));
});

test('every no-meme case in the existing 100-case sample set abstains without inference',async()=>{
  const samples=(await readFile(new URL('../eval/relevance_stage3000_v1.jsonl',import.meta.url),'utf8')).trim().split('\n').map(JSON.parse).filter(sample=>sample.intent_label==='no_meme');
  assert.equal(samples.length,25);
  for(const sample of samples) {
    const response=await composeMeme(request({comment:sample.context}),{FREE_AI:{fetch:()=>assert.fail(`Inference called for ${sample.id}: ${sample.title}`)}});
    assert.equal(response.status,200,sample.id);
    assert.equal((await response.json()).decision,'none',sample.title);
  }
});

test('literal gas danger and official tax questions abstain but adjacent jokes still generate',async()=>{
  let calls=0;const env={FREE_AI:{fetch:async()=>{calls++;return completion(valid);}}};
  for(const comment of ['The kitchen smells strongly of gas. What do we do?','There is a gas leak in my flat.','What is the official deadline to file my income tax return?']) {
    assert.equal((await (await composeMeme(request({comment}),env)).json()).decision,'none');
  }
  assert.equal(calls,0);
  for(const comment of ['My racing game character ran out of gas on the final lap.','The tax deadline is tomorrow and my receipts are in three bags.']) {
    assert.equal((await (await composeMeme(request({comment}),env)).json()).decision,'compose');
  }
  assert.equal(calls,2);
});

test('baked This Is Fine punchline avoids inference; serious context still takes priority',async()=>{
  for(const [comment,decision] of [['My renovation went way over budget.','reference'],['My friend died and I need to write condolences.','none']]) {
    const response=await composeMeme(request({candidate_id:'this-is-fine',comment}),{FREE_AI:{fetch:()=>assert.fail('Original reaction must not use inference.')}});
    assert.equal((await response.json()).decision,decision);
  }
});

test('X Everywhere uses a text-only request with exact top and bottom regions',async()=>{
  let sent;
  const response=await composeMeme(request({candidate_id:'x-everywhere',comment:'Four guests wore the same supposedly unique floral dress.'}),{FREE_AI:{fetch:async req=>{sent=await req.json();return completion({decision:'compose',captions:[{id:'topic',text:'Unique floral dresses'},{id:'everywhere',text:'Unique floral dresses everywhere'}]});}}});
  const result=await response.json();assert.equal(result.placement,'template');
  assert.equal(typeof sent.messages[0].content,'string');assert.equal(sent.max_tokens,800);
  assert(result.layers[0].box[1]+result.layers[0].box[3]<.1,'top strip stays above the faces');
  assert(result.layers[1].box[1]>.85,'bottom stays below the pointing gesture');
});

const visionOutput={decision:'compose',captions:[{id:'waiting',label:'The waiting person',role:'The subject waiting for the reply.',text:'Me waiting for the promised quick reply',box:[.05,.05,.9,.18],style:'outlined',rotation:0}]};
test('visual placement validates every box, role and style; cannot escape image bounds',()=>{
  const composed=validateComposition(visionOutput,visual);assert.equal(composed.placement,'vision');
  for(const changes of [{box:[.8,.1,.4,.2]},{box:[.1,.1,.2,-.5]},{box:[0,0,NaN,.2]},{style:'url(javascript:evil)'},{rotation:90},{id:'../private'},{role:''}]) {
    assert.throws(()=>validateComposition({...visionOutput,captions:[{...visionOutput.captions[0],...changes}]},visual));
  }
  assert.throws(()=>validateComposition({...visionOutput,captions:[...visionOutput.captions,...visionOutput.captions]},visual));
  assert.throws(()=>validateComposition({decision:'none',captions:valid.captions},drake));
});

test('prompt preserves actor, viewpoint and negation, with template-specific rather than generic coordinates',()=>{
  const record=catalogue.find(record=>record.id==='distracted-boyfriend');
  const prompt=compositionPrompt('My sibling, not me, abandoned their old plan.',record,'self',null);
  assert.match(prompt,/explicit negation/);assert.match(prompt,/untrusted data/);
  const known=compositionPrompt('My sibling, not me, abandoned their old plan.',record,'other');
  assert.match(known,/woman on the left is the temptation/);assert.match(known,/"perspective":"other"/);assert.match(known,/Do not return coordinates/);
});

test('known template makes one bounded, attributed gateway request and returns prefilled layers',async()=>{
  const calls=[];
  const response=await composeMeme(request({}, {'cf-connecting-ip':'192.0.2.1'}),{FREE_AI:{fetch:async req=>{calls.push(req);return completion(valid);}}});
  assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.layers.length,2);assert.equal(body.media_url,'/api/create/media/drake-preference');
  assert.equal(calls.length,1);const sent=calls[0];const payload=await sent.json();
  assert.equal(sent.headers.get('x-gateway-project-id'),'meme-lab');assert.equal(sent.headers.get('cf-connecting-ip'),'192.0.2.1');
  assert.equal(CAPTION_MODEL,'auto');assert.equal(payload.model,'auto');
  assert.equal(payload.reasoning_effort,'low');
  assert.equal(sent.headers.get('x-gateway-force-provider'),null);assert.equal(sent.headers.get('x-gateway-force-model'),null);
  assert.equal(payload.max_tokens,800);assert.equal(payload.response_format.type,'json_object');assert.equal(typeof payload.messages[0].content,'string');
  assert(sent.signal instanceof AbortSignal);assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('automatic routing accepts different served models but rejects missing or conflicting attribution',async()=>{
  for(const metadata of [{model:null},{model:'auto'},{model:''},{x_gateway:{model:'different-model',provider:'groq'}}]) {
    let calls=0;
    const response=await composeMeme(request(),{FREE_AI:{fetch:async()=>{calls++;return completion(valid,{},metadata);}}});
    assert.equal(response.status,503);assert.equal(calls,1);assert.equal((await response.json()).layers,undefined);
  }
  for(const [model,provider] of [['gemini-3.5-flash-lite','gemini'],['openai/gpt-oss-120b','groq'],['command-a-03-2025','cohere']]) {
    let calls=0;
    const response=await composeMeme(request(),{FREE_AI:{fetch:async req=>{
      calls++;assert.equal(req.headers.get('x-gateway-force-provider'),null);assert.equal(req.headers.get('x-gateway-force-model'),null);
      return completion(valid,{},{model,x_gateway:{model,provider}});
    }}});
    assert.equal(response.status,200);assert.equal(calls,1);
  }
});

test('unknown static meme uses vision against its allowlisted catalogue image, never a caller URL',async()=>{
  let sent;
  const response=await composeMeme(request({candidate_id:visual.id,image_url:'https://private.invalid'}),{FREE_AI:{fetch:async req=>{sent=await req.json();return completion(visionOutput);}}});
  assert.equal(response.status,200);assert.equal((await response.json()).placement,'vision');
  assert.equal(sent.messages[0].content[1].image_url.url,creationMediaUrl(visual));
  assert(!JSON.stringify(sent).includes('private.invalid'));assert.equal(sent.max_tokens,1200);
});

test('serious situations and GIFs abstain before any generation call',async()=>{
  let calls=0;const env={FREE_AI:{fetch:()=>{calls++;assert.fail('Must not generate.');}}};
  const serious=await composeMeme(request({comment:'My friend died and asked me for help writing condolences.'}),env);
  assert.equal((await serious.json()).decision,'none');
  const gif=catalogue.find(record=>record.media_type==='gif');
  const reaction=await composeMeme(request({candidate_id:gif.id}),env);
  assert.equal((await reaction.json()).decision,'reference');assert.equal(calls,0);
});

test('missing binding, quota denial, incomplete and malformed output never become success or paid fallback',async()=>{
  assert.equal((await composeMeme(request(),{})).status,503);
  for(const [reply,status] of [[new Response(null,{status:429}),429],[completion(valid,{finish_reason:'length'}),503],[completion({decision:'compose',captions:[]}),503],[Response.json({choices:[]}),503],[new Response('private provider error',{status:502}),503]]) {
    let calls=0;const response=await composeMeme(request(),{FREE_AI:{fetch:async()=>{calls++;return reply;}}});
    assert.equal(response.status,status);assert.equal(calls,1);assert.doesNotMatch(await response.text(),/private provider error/);
  }
});

test('route rejects cross-origin submissions and bad input without generation',async()=>{
  assert.equal((await worker.fetch(request({}, {Origin:'https://other.test'}),{})).status,403);
  for(const body of [{comment:''},{comment:'x'.repeat(1001)},{candidate_id:'not-a-meme'},{perspective:'invented'}]) assert.equal((await composeMeme(request(body),{})).status,400);
  const response=await composeMeme(request({comment:'x'.repeat(6000)}),{});assert.equal(response.status,413);
});

test('body limit applies to bytes read, even when a caller omits Content-Length',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(5001));},cancel(){cancelled=true;}});
  await assert.rejects(boundedBytes(stream,5000));assert(cancelled);
});

test('media fetch permits only catalogue rasters, rejects redirects and checks actual signatures',async()=>{
  let fetched;
  const response=await compositionMedia(drake.id,async(url,options)=>{fetched={url,options};return new Response(new Uint8Array([255,216,255,1]),{headers:{'Content-Type':'image/jpeg'}});});
  assert.equal(response.status,200);assert.equal(fetched.url,drake.image_url);assert.equal(fetched.options.redirect,'error');
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'),'same-origin');
  for(const [type,bytes] of [['image/svg+xml','<svg></svg>'],['image/jpeg','<html>not an image</html>'],['image/gif','GIF89a']]) {
    assert.equal((await compositionMedia(drake.id,async()=>new Response(bytes,{headers:{'Content-Type':type}}))).status,502);
  }
  assert.equal((await compositionMedia('https://localhost/admin',()=>assert.fail('Must not fetch.'))).status,404);
  for(const url of ['https://i.imgflip.com.evil.test/a.jpg','https://user:pass@i.imgflip.com/a.jpg','https://i.imgflip.com:8443/a.jpg','http://i.imgflip.com/a.jpg','https://i.imgflip.com/../admin']) assert.equal(creationMediaUrl({image_url:url}),null);
});

const ctx={font:'',measureText(text){const size=Number(this.font.match(/(\d+)px/)?.[1]??10);return {width:Array.from(text).length*size*.6};}};
test('text fitting wraps long words and emoji without truncation, preserves explicit line breaks',()=>{
  ctx.font='800 20px Arial';
  const text='Supercalifragilisticexpialidocious';const wrapped=wrapText(ctx,text,90);assert.equal(wrapped.join(''),text);assert(wrapped.length>1);
  assert.deepEqual(wrapText(ctx,'First\nSecond',100),['First','Second']);
  const emoji='🙂'.repeat(10);assert.equal(wrapText(ctx,emoji,40).join(''),emoji);
  const fitted=fitText(ctx,'A meeting about fewer meetings',160,80,72);assert(fitted);assert(fitted.size<72);assert(fitted.lines.length*fitted.lineHeight<=80);
  const narrow=fitText(ctx,'Turn off reminders',130,145,45);
  assert(narrow);assert(narrow.lines.includes('reminders'),'shrink first instead of splitting a normal word');
  assert.equal(fitText(ctx,'Lots of text that simply cannot fit in a tiny region',10,4,30),null);
});

test('placement clamps movement and size within the un-cropped image',()=>{
  assert.deepEqual(clampBox([-.3,1.4,.3,.2]),[0,.8,.3,.2]);
  assert.deepEqual(clampBox([.5,.5,8,8]),[0,0,1,1]);
  assert.deepEqual(clampBox([0,0,-1,-1]),[0,0,.08,.04]);
});

test('renderer reports unfit captions, never silently clips them into a successful export',()=>{
  const calls=[];const context={...ctx,clearRect(){},drawImage(){},save(){},translate(){},rotate(){},beginPath(){},rect(){},clip(){},restore(){},fillText(text){calls.push(text);},strokeText(){}};
  const canvas={width:600,height:600,getContext:()=>context};
  const rendered=renderMeme(canvas,{},[{id:'unfit',text:'x'.repeat(5000),box:[0,0,.08,.04],style:'plain'}]);
  assert.deepEqual(rendered.failed,['unfit']);assert.deepEqual(calls,[]);
  const rotated=renderMeme(canvas,{},[{id:'outside',text:'Caption',box:[0,0,.9,.1],style:'plain',rotation:20}]);
  assert.deepEqual(rotated.failed,['outside'],'rotated text cannot silently extend beyond the image');
});

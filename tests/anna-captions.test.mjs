import test from 'node:test';
import assert from 'node:assert/strict';
import {composeOnAnna} from '../anna/captions.mjs';
import {normalizeAnnaCaptionCompletion} from '../anna/caption-completion.mjs';
import {annaComposition,planComposition,composeMeme} from '../worker/src/meme-composition.mjs';
import worker from '../worker/src/index.mjs';
import {catalogue} from '../worker/src/catalogue.stage3000.generated.mjs';
import {templateFor} from '../worker/src/meme-templates.mjs';

const body={comment:'My roommate chooses hand washing over the working dishwasher.',candidate_id:'drake-preference',perspective:'best_match'};
const output={decision:'compose',captions:[{id:'rejected',text:'Use the dishwasher'},{id:'preferred',text:'Hand-wash every plate'}]};
const complete=(text=JSON.stringify(output),extra={})=>({model:'google/gemini-3-flash-preview',stopReason:'endTurn',content:{type:'text',text},...extra});
const request=(input=body,method='POST')=>new Request('https://example.test/api/anna/composition',{method,...(method==='POST'?{headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{})});
const prepare=async()=>annaComposition(request(),{});

test('Anna caption planner grounds its template, applies CORS, and never calls Free AI',async()=>{
  const response=await annaComposition(request({...body,image_url:'https://private.invalid/'}),{FREE_AI:{fetch:()=>assert.fail('Planner must not perform inference')}});
  assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
  const plan=await response.json();assert.equal(plan.record.id,body.candidate_id);assert.equal(plan.max_tokens,800);
  assert.equal(plan.profile.regions[0].id,'rejected');assert.doesNotMatch(JSON.stringify(plan),/private.invalid/);
  assert.equal((await worker.fetch(request({},'OPTIONS'),{})).status,204);
  assert.equal((await annaComposition(request({...body,candidate_id:'unknown'}),{})).status,400);
});
test('Anna captions accept a complete fenced response and use inspected placement with one bounded host call',async()=>{
  let calls=0;
  const result=await composeOnAnna(body,{fetchImpl:prepare,anna:{llm:{complete:async(payload,options)=>{
    calls++;assert.equal(payload.maxTokens,800);assert.equal(options.timeoutMs,20000);
    assert.equal(payload.model,undefined);assert.equal(payload.response_format,undefined);
    assert.equal(payload.messages[0].content,planComposition(body).content);
    return complete('```json\n'+JSON.stringify(output)+'\n```');
  }}}});
  assert.equal(calls,1);assert.equal(result.decision,'compose');
  assert.deepEqual(result.layers[0].box,templateFor(catalogue.find(record=>record.id===body.candidate_id)).regions[0].box);
});
test('local serious, baked-punchline and GIF decisions never consume Anna quota',async()=>{
  const gif=catalogue.find(record=>record.media_type==='gif');
  for(const input of [{...body,comment:'My friend died and I need condolences.'},{...body,candidate_id:'this-is-fine'},{...body,candidate_id:gif.id}]){
    const result=await composeOnAnna(input,{fetchImpl:async()=>annaComposition(request(input),{}),anna:{llm:{complete:()=>assert.fail('No inference for local decision')}}});
    assert.ok(['none','reference'].includes(result.decision));
  }
});
test('all recommendation perspective names map to the same shared caption viewpoint',async()=>{
  for(const [key,expected] of [['my_reaction','self'],['their_side','other'],['the_situation','situation']]){
    assert.match(planComposition({...body,perspective:key}).content,new RegExp('"perspective":"'+expected+'"'));
    const result=await composeMeme(new Request('https://example.test/api/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,perspective:key})}),{FREE_AI:{fetch:async()=>Response.json({model:'served-model',choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})}});
    assert.equal(result.status,200);
  }
});
test('quota and permission errors do not switch provider, retry or discard caller edits',async()=>{
  for(const message of ['quota exhausted','permission not granted','provider unavailable']){
    let calls=0;
    await assert.rejects(composeOnAnna(body,{fetchImpl:prepare,anna:{llm:{complete:()=>{calls++;throw new Error(message);}}}}));
    assert.equal(calls,1);
  }
});
test('normalizer rejects prose, incomplete generation, ambiguous blocks and oversized output',()=>{
  for(const text of ['Here is your JSON: {}','~~~','', '~~~json\n{}'])assert.throws(()=>normalizeAnnaCaptionCompletion(complete(text)));
  for(const stopReason of ['maxTokens','contentFilter',undefined])assert.throws(()=>normalizeAnnaCaptionCompletion(complete('{}',{stopReason})));
  for(const model of ['auto','',null])assert.throws(()=>normalizeAnnaCaptionCompletion(complete('{}',{model})));
  assert.throws(()=>normalizeAnnaCaptionCompletion(complete(JSON.stringify({text:'x'.repeat(32000)}))));
});
test('fence normalization preserves composition validation and rejects captions over the region limit',async()=>{
  const invalid={decision:'compose',captions:[{id:'rejected',text:'x'.repeat(65)},{id:'preferred',text:'Preferred'}]};
  await assert.rejects(composeOnAnna(body,{fetchImpl:prepare,anna:{llm:{complete:async()=>complete(JSON.stringify(invalid))}}}),/incomplete caption layout/);
});
test('cancelled/stale host responses cannot become a new editor draft',async()=>{
  const aborted=new AbortController();aborted.abort();
  await assert.rejects(composeOnAnna(body,{signal:aborted.signal,fetchImpl:()=>assert.fail('Aborted before preparation')}),{name:'AbortError'});
  const late=new AbortController();
  await assert.rejects(composeOnAnna(body,{signal:late.signal,fetchImpl:prepare,anna:{llm:{complete:async()=>{late.abort();return complete();}}}}),{name:'AbortError'});
});

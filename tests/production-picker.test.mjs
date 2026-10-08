import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/src/index.mjs';
import {createGatewayClassifierFetch} from '../worker/src/gateway-classifier.mjs';
import {rankCandidatesByPerspective} from '../worker/src/classification.mjs';
import {catalogue} from '../worker/src/catalogue.stage3000.generated.mjs';
import {classifierUnavailable,reportPickerHealth} from '../worker/src/recommendation-health.mjs';
import {probePicker} from '../scripts/probe-production-picker.mjs';

const completion=results=>Response.json({choices:[{message:{content:JSON.stringify({results})}}]});
const requestInit=(labels=5,inputs=1)=>({body:JSON.stringify({inputs:Array(inputs).fill('fixture'),labels:Array.from({length:labels},(_,index)=>`label ${index}`)})});

test('gateway supports the 30-label perspective contract and rejects oversized inputs',async()=>{
  let calls=0;
  const adapter=createGatewayClassifierFetch({fetch:async request=>{
    calls++;
    assert.equal(request.headers.get('x-gateway-project-id'),'meme-lab');
    const body=await request.json();
    assert.equal(body.response_format.type,'json_schema');
    assert.equal(body.response_format.json_schema.strict,true);
    return completion([{label_index:29,scores:Array.from({length:30},(_,index)=>index/30)}]);
  }});
  const response=await adapter('',requestInit(30));
  assert.equal((await response.json()).results[0].label,'label 29');
  await assert.rejects(adapter('',requestInit(31)),/supported bounds/);
  assert.equal(calls,1);
});

test('gateway retries a transient 502 once and retains the original abort signal',async()=>{
  const signal=AbortSignal.timeout(3000);
  let calls=0;
  const adapter=createGatewayClassifierFetch({fetch:async request=>{
    assert.equal(request.signal.aborted,false);
    return ++calls===1?new Response(null,{status:502}):completion([{label_index:4,scores:[0,0,0,0,1]}]);
  }});
  assert.equal((await adapter('',{...requestInit(),signal})).status,200);
  assert.equal(calls,2);
});

test('gateway does not retry admission errors or expired deadlines and bounds invalid-output retries',async()=>{
  for(const status of [429,400]) {
    let calls=0;
    const adapter=createGatewayClassifierFetch({fetch:async()=>{calls++;return new Response(null,{status});}});
    assert.equal((await adapter('',requestInit())).status,status);
    assert.equal(calls,1);
  }
  let calls=0;
  const invalid=createGatewayClassifierFetch({fetch:async()=>{calls++;return completion([{label_index:4,scores:[1]}]);}});
  await assert.rejects(invalid('',requestInit()),/invalid category scores/);
  assert.equal(calls,2);
  await assert.rejects(invalid('',{...requestInit(),signal:AbortSignal.abort()}),{name:'AbortError'});
  assert.equal(calls,2);
  let unavailableCalls=0;
  const unavailable=createGatewayClassifierFetch({fetch:async()=>{unavailableCalls++;return new Response(null,{status:502});}});
  assert.equal((await unavailable('',requestInit())).status,502);
  assert.equal(unavailableCalls,2);
});

test('real perspective ranking accepts 30 candidates through the managed adapter',async()=>{
  const requests=[];
  const adapter=createGatewayClassifierFetch({fetch:async request=>{
    const body=await request.json();
    const prompt=body.messages[0].content;
    const labels=JSON.parse(prompt.split('Labels by index: ')[1].split('\nInputs: ')[0]);
    const inputs=JSON.parse(prompt.split('\nInputs: ')[1]);
    requests.push({labels:labels.length,inputs:inputs.length});
    return completion(inputs.map((_,index)=>[index===0?labels.length-1:Math.max(1,labels.length-2),...labels.map((_,labelIndex)=>labelIndex/(labels.length*2)+index/100)]));
  }});
  const ranked=await rankCandidatesByPerspective('I told my coworker the deadline was today and he started another coffee break.',catalogue.slice(0,30),{fetchImpl:adapter,limit:5});
  assert.equal(ranked.length,5);
  assert.equal(new Set(ranked.map(candidate=>candidate.id)).size,5);
  assert.deepEqual(new Set(ranked.map(candidate=>candidate.perspective)),new Set(['self','other','situation']));
  assert.deepEqual(requests.map(request=>request.labels),[30,30,30,5]);
});

test('equally strong final perspective fits retain the five independently ranked memes',async()=>{
  let calls=0;
  const fetchImpl=async(_url,init)=>{
    const {labels,inputs}=JSON.parse(init.body);calls++;
    if(labels.length===5)return Response.json({results:inputs.map(()=>({label:labels[3],scores:Object.fromEntries(labels.map((label,index)=>[label,index===3?1:0]))}))});
    const winner=(calls-1)%3;
    return Response.json({results:[{label:labels[winner],scores:Object.fromEntries(labels.map((label,index)=>[label,index===winner?0.9:0.01]))}]});
  };
  const ranked=await rankCandidatesByPerspective('I told my coworker the deadline was today and he started another coffee break.',catalogue.slice(0,30),{fetchImpl,limit:5});
  assert.equal(calls,4);assert.equal(ranked.length,5);assert.equal(new Set(ranked.map(x=>x.id)).size,5);
  assert.deepEqual(new Set(ranked.map(x=>x.perspective)),new Set(['self','other','situation']));
  assert(ranked.every(x=>x.fit_label==='strong'&&x.classifier_score===.75));
});

const budget={idFromName:name=>name,get:()=>({fetch:async(url,options)=>{
  const body=JSON.parse(options.body);const vector=url.endsWith('try-debit-vectorize');const amount=vector?body.dimensions:body.neurons;
  return Response.json({allowed:true,used:amount,remaining:(vector?45_000_000:9500)-amount,retryAfter:0,baselineVerified:true,[vector?'monthKey':'dayKey']:new Date().toISOString().slice(0,vector?7:10)});
}})};
const testEnv={
  NEURON_BUDGET:budget,
  AI:{run:async()=>({data:[[1,0,0]]})},
  FREE_AI:{run:async()=>({data:[[1,0,0]]})},
  MEME_INDEX:{query:async()=>({matches:catalogue.slice(0,30).map(record=>({id:record.id,metadata:{catalogue_id:record.id}}))})},
  DB:{prepare:()=>({bind:()=>({run:async()=>({success:true})})})}
};
const recommend=comment=>new Request('https://example.test/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment})});

test('public confidence follows ordinal probabilities while genuine weak results stay low',async()=>{
  for(const strong of [true,false]){
    let calls=0;
    const adapter=createGatewayClassifierFetch({fetch:async request=>{
      calls++;
      const {messages}=await request.json();
      const inputs=JSON.parse(messages[0].content.split('\nInputs: ')[1]);
      return completion(inputs.map((_,index)=>strong&&index===0?[1,0,.01,.01,.43,.55]:[4,.7+index/1000,.2-index/1000,.1,0,0]));
    }});
    const response=await worker.fetch(recommend('The meeting could have been an email.'),{...testEnv,CLASSIFIER_FETCH:adapter});
    const body=await response.json();
    assert.equal(response.status,200);assert.equal(body.degraded,false);assert.equal(calls,1);
    assert.equal(body.confidence,strong?'high':'low');
    assert.equal(body.candidates[0].fit_label,strong?'exact':'weak');
    if(strong)assert.equal(body.candidates[0].score,88);
  }
});

test('upstream 502 returns an honest low-confidence semantic fallback and logs degradation',async()=>{
  const warnings=[];const original=console.warn;console.warn=message=>warnings.push(JSON.parse(message));
  try {
    const response=await worker.fetch(recommend('The meeting could have been an email.'),{...testEnv,CLASSIFIER_FETCH:async()=>new Response(null,{status:502})});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.degraded,true);assert.equal(body.ranking_mode,'retrieval_fallback');
    assert.equal(body.confidence,'low');assert.equal(body.candidates.length,5);
    assert(body.candidates.every(candidate=>candidate.fit_label==='weak'));
    assert(warnings.some(event=>event.event==='recommendation.degraded'));
    assert(warnings.some(event=>event.event==='app_health_unconfigured'));
  } finally {console.warn=original;}
});

test('invalid ranking output uses only the honest retrieval fallback and logs degradation',async()=>{
  const warnings=[];const original=console.warn;console.warn=message=>warnings.push(JSON.parse(message));
  try {
    const response=await worker.fetch(recommend('Private fixture situation.'),{...testEnv,CLASSIFIER_FETCH:async()=>Response.json({results:[]})});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.degraded,true);assert.equal(body.confidence,'low');assert.equal(body.ranking_mode,'retrieval_fallback');
    assert(warnings.some(event=>event.event==='recommendation.degraded'));
    assert.doesNotMatch(JSON.stringify(warnings),/Private fixture situation/);
  } finally {console.warn=original;}
});

test('serious input abstains during a ranking-provider outage',async()=>{
  let classifierCalls=0;
  const response=await worker.fetch(recommend('My friend died and I need help writing condolences.'),{...testEnv,CLASSIFIER_FETCH:async()=>{classifierCalls++;return new Response(null,{status:502});}});
  const body=await response.json();
  assert.equal(body.decision,'none');assert.deepEqual(body.candidates,[]);assert.equal(classifierCalls,1);
});

test('failure logs reach the existing App Health sink without prompt data',async()=>{
  const original=globalThis.fetch;const delivered=[];const pending=[];
  globalThis.fetch=async(_url,init)=>{delivered.push(JSON.parse(init.body));return new Response(null,{status:202});};
  try {
    reportPickerHealth({APP_HEALTH_INGEST_KEY:'test-key'},{waitUntil:promise=>pending.push(promise)},'endpoint.failed',{method:'POST',route:'/api/recommend',status_code:503,duration_ms:2});
    await Promise.all(pending);
    assert.equal(delivered[0].logs[0].event,'endpoint.failed');assert.equal(delivered[0].logs[0].level,'error');
    assert.deepEqual(Object.keys(delivered[0].logs[0].props).sort(),['duration_ms','method','route','status_code']);
  } finally {globalThis.fetch=original;}
  assert.equal(classifierUnavailable(new Error('invalid category scores')),false);
});

test('functional probe rejects an HTTP 200 fallback and missing perspectives',async()=>{
  const candidates=Array.from({length:5},(_,index)=>({id:`candidate-${index}`,media_url:'https://example.test/image.png',score:80,perspective:['self','other','situation'][index%3]}));
  const success={decision:'meme',confidence:'high',candidates};
  assert.equal((await probePicker('https://example.test',async()=>Response.json(success))).status,'passed');
  for(const body of [{...success,degraded:true},{...success,confidence:'low'},{...success,candidates:candidates.map(candidate=>({...candidate,perspective:'best_match'}))}]) {
    assert.equal((await probePicker('https://example.test',async()=>Response.json(body))).status,'failed');
  }
});

test('probe distinguishes low confidence from fallback and missing perspectives without private fields',async()=>{
  const candidates=Array.from({length:5},(_,index)=>({id:`candidate-${index}`,media_url:'https://example.test/image.png',score:80,perspective:['self','other','situation'][index%3]}));
  const body={decision:'meme',confidence:'low',ranking_mode:'perspective',degraded:false,candidates,private:'private situation'};
  const result=await probePicker('https://example.test',async()=>Response.json(body));
  assert.equal(result.status,'failed');assert.equal(result.results[1].fallback,false);
  assert.equal(result.results[1].confidence,'low');assert.equal(result.results[1].ranking_mode,'perspective');
  assert.equal(result.results[1].perspectives_complete,true);assert.doesNotMatch(JSON.stringify(result),/private situation/);
  const unknown=await probePicker('https://example.test',async()=>Response.json({...body,confidence:'private secret',ranking_mode:'private account'}));
  assert.equal(unknown.results[0].confidence,null);assert.equal(unknown.results[0].ranking_mode,null);
});

test('browser reports caught picker errors without attaching comments or error text',()=>{
  const app=readFileSync(new URL('../worker/public/app.js',import.meta.url),'utf8');
  assert.match(app,/appHealthLog\?\.\('recommendation.failed'/);
  const event=app.split("appHealthLog?.('recommendation.failed'")[1].split('\n')[0];
  assert.doesNotMatch(event,/comment|error\.message/);
});

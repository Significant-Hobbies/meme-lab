import test from 'node:test';
import assert from 'node:assert/strict';
import {createGatewayClassifierFetch} from '../worker/src/gateway-classifier.mjs';

const init=(count=30)=>({body:JSON.stringify({inputs:Array(count).fill('private input'),labels:['wrong','weak','plausible','strong','exact']})});
const completion=(results,extra={})=>Response.json({choices:[{message:{content:JSON.stringify({results})},finish_reason:'stop'}],...extra});

test('compact full-batch answers preserve all ordinal probabilities and input order',async()=>{
  let calls=0;
  const tuples=Array.from({length:30},(_,i)=>i%2?[3,0,0,.1,.8,.1]:[4,0,0,0,.2,.8]);
  const adapter=createGatewayClassifierFetch({fetch:async request=>{
    calls++;
    const body=await request.json();
    assert.equal(body.model,'auto');assert.equal(body.max_tokens,2000);
    assert.deepEqual(body.response_format,{type:'json_object'});
    return completion(tuples);
  }});
  const body=await (await adapter('',init())).json();
  assert.equal(calls,1);assert.equal(body.results.length,30);
  for(let i=0;i<30;i++){
    assert.equal(body.results[i].label,i%2?'strong':'exact');
    assert.deepEqual(Object.values(body.results[i].scores),tuples[i].slice(1));
  }
});

test('compact perspective answers retain all 30 label scores',async()=>{
  const labels=Array.from({length:30},(_,i)=>`candidate ${i}`);
  const adapter=createGatewayClassifierFetch({fetch:async()=>completion([[29,...labels.map((_,i)=>i===29?1:0)]])});
  const body=await (await adapter('',{body:JSON.stringify({inputs:['comment'],labels})})).json();
  assert.equal(body.results[0].label,'candidate 29');
  assert.equal(Object.keys(body.results[0].scores).length,30);
  assert.equal(body.results[0].scores['candidate 29'],1);
});

test('invalid compact tuples never become fit scores and retries remain bounded',async()=>{
  for(const tuple of [[4,1],[5,0,0,0,0,1],[4,0,0,0,-.1,1.1],[4,0,0,0,0,0],[4,0,0,0,0,'1']]){
    let calls=0;
    const adapter=createGatewayClassifierFetch({fetch:async()=>{calls++;return completion([tuple]);}});
    await assert.rejects(adapter('',init(1)),/category scores/);
    assert.equal(calls,2);
  }
});

test('truncated JSON recovers once and logs termination metadata without content',async()=>{
  const warnings=[];const original=console.warn;console.warn=message=>warnings.push(JSON.parse(message));
  let calls=0;
  try {
    const adapter=createGatewayClassifierFetch({fetch:async()=>++calls===1?
      Response.json({choices:[{message:{content:'{"results":[ private prompt and secret'},finish_reason:'length'}],usage:{completion_tokens:2000},private:'private provider body'}):completion([[4,0,0,0,0,1]])});
    assert.equal((await adapter('',init(1))).status,200);assert.equal(calls,2);
    assert.deepEqual(warnings.map(({event,failure_kind,finish_reason,completion_tokens})=>({event,failure_kind,finish_reason,completion_tokens})),[{event:'classifier_output_invalid',failure_kind:'invalid_json',finish_reason:'length',completion_tokens:2000}]);
    assert.doesNotMatch(JSON.stringify(warnings),/private|prompt|secret|provider body|results/);
  }finally{console.warn=original;}
});

test('unknown provider finish reasons and token metadata are excluded',async()=>{
  const warnings=[];const original=console.warn;console.warn=message=>warnings.push(JSON.parse(message));
  try {
    const adapter=createGatewayClassifierFetch({fetch:async()=>Response.json({choices:[{message:{content:'invalid'},finish_reason:'private account detail'}],usage:{completion_tokens:'private key'}})});
    await assert.rejects(adapter('',init(1)),/invalid structured output/);
    assert.equal(warnings.length,2);
    for(const warning of warnings){assert.equal(warning.finish_reason,null);assert.equal(warning.completion_tokens,null);}
    assert.doesNotMatch(JSON.stringify(warnings),/private|account|key/);
  }finally{console.warn=original;}
});

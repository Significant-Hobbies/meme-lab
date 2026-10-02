import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/src/index.mjs';

function budgetNamespace({denyPath}={}) {
  const calls=[];
  return {
    calls,
    idFromName:name=>name,
    get:()=>({fetch:async(url,options)=>{
      const body=JSON.parse(options.body);
      const vector=url.endsWith('try-debit-vectorize');
      const amount=vector?body.dimensions:body.neurons;
      const cap=vector?45_000_000:9_500;
      const period=vector?'monthKey':'dayKey';
      calls.push({path:new URL(url).pathname,amount});
      if(denyPath===new URL(url).pathname) {
        return Response.json({allowed:false,used:0,remaining:cap,retryAfter:60,baselineVerified:true,[period]:new Date().toISOString().slice(0,vector?7:10)});
      }
      return Response.json({allowed:true,used:amount,remaining:cap-amount,retryAfter:0,baselineVerified:true,[period]:new Date().toISOString().slice(0,vector?7:10)});
    }})
  };
}

function retrievalEnv(budget,extra={}) {
  return {
    NEURON_BUDGET:budget,
    ANNA_SEARCH_LIMITER:{limit:async({key})=>({success:key==='shortlist:192.0.2.7'||key==='events:192.0.2.7'})},
    AI:{run:async(model,input)=>{
      assert.equal(model,'@cf/baai/bge-base-en-v1.5');
      assert.deepEqual(input,{text:['Private synthetic sentinel comment.'],pooling:'cls'});
      return {data:[[1,0,0]]};
    }},
    MEME_INDEX:{query:async(vector,options)=>{
      assert.deepEqual(vector,[1,0,0]);
      assert(options.filter?.view==='meaning'||options.filter?.view==='example');
      return {matches:[{id:`${options.filter.view}-vector`,score:0.9,metadata:{catalogue_id:'waiting-skeleton'}}]};
    }},
    DB:{prepare:()=>assert.fail('Anna retrieval must not write feedback or persist comments.')},
    CLASSIFIER_FETCH:()=>assert.fail('Contextual ranking belongs to Anna, not this endpoint.'),
    ...extra,
  };
}

test('Anna shortlist uses the existing guarded retrieval path and keeps comments out of storage and telemetry',async()=>{
  const budget=budgetNamespace();
  const env=retrievalEnv(budget,{APP_HEALTH_INGEST_KEY:'test-ingest-key',APP_HEALTH_ENVIRONMENT:'test'});
  const pending=[];
  const context={waitUntil:promise=>pending.push(promise)};
  const originalFetch=globalThis.fetch;
  const telemetry=[];
  globalThis.fetch=async(url,options)=>{
    telemetry.push({url:String(url),body:JSON.parse(options.body)});
    return new Response(null,{status:202});
  };
  try {
    const response=await worker.fetch(new Request('https://example.test/api/anna/shortlist',{
      method:'POST',
      headers:{'Content-Type':'application/json','Origin':'https://anna.partners','CF-Connecting-IP':'192.0.2.7'},
      body:JSON.stringify({comment:'Private synthetic sentinel comment.'})
    }),env,context);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
    const result=await response.json();
    assert.equal(result.decision,'shortlist');
    assert.equal(result.candidates[0].id,'waiting-skeleton');
    assert(!JSON.stringify(result).includes('Private synthetic sentinel comment.'));
    assert.deepEqual(budget.calls.map(call=>call.path),['/try-debit-vectorize','/try-debit']);
    assert.equal(budget.calls[0].amount,5*768);
    assert.equal(budget.calls[1].amount,1);
    assert(telemetry.some(item=>item.body.events?.[0]?.route==='/api/anna/shortlist'));
    assert(!JSON.stringify(telemetry).includes('Private synthetic sentinel comment.'));
    const preflight=await worker.fetch(new Request('https://example.test/api/anna/shortlist',{method:'OPTIONS'}),env);
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'*');
  } finally {
    globalThis.fetch=originalFetch;
    await Promise.all(pending);
  }
});

test('shared-budget denial returns retry guidance and CORS before any embedding',async()=>{
  const budget=budgetNamespace({denyPath:'/try-debit-vectorize'});
  let embeddings=0;
  const env=retrievalEnv(budget,{
    AI:{run:async()=>{embeddings++;return {data:[[1,0,0]]};}}
  });
  const originalError=console.error;
  const logs=[];
  console.error=value=>logs.push(String(value));
  try {
    const response=await worker.fetch(new Request('https://example.test/api/anna/shortlist',{
      method:'POST',
      headers:{'Content-Type':'application/json','Origin':'https://anna.partners','CF-Connecting-IP':'192.0.2.7'},
      body:JSON.stringify({comment:'Private synthetic sentinel comment.'})
    }),env);
    assert.equal(response.status,503);
    assert.equal(response.headers.get('Retry-After'),'60');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
    assert.equal(embeddings,0);
    assert.deepEqual(budget.calls.map(call=>call.path),['/try-debit-vectorize']);
  } finally {
    console.error=originalError;
  }
  assert(!JSON.stringify(logs).includes('Private synthetic sentinel comment.'));
  assert.deepEqual(logs,[JSON.stringify({event:'anna_shortlist',status:'unavailable'})]);
});

test('restored Anna limiter rejects before shared-budget reservations or embedding',async()=>{
  const budget=budgetNamespace();
  let embeddings=0;
  const env=retrievalEnv(budget,{
    ANNA_SEARCH_LIMITER:{limit:async({key})=>({success:key!=='shortlist:192.0.2.7'})},
    AI:{run:async()=>{embeddings++;return {data:[[1,0,0]]};}}
  });
  const response=await worker.fetch(new Request('https://example.test/api/anna/shortlist',{
    method:'POST',
    headers:{'Content-Type':'application/json','Origin':'https://anna.partners','CF-Connecting-IP':'192.0.2.7'},
    body:JSON.stringify({comment:'Private synthetic sentinel comment.'})
  }),env);
  assert.equal(response.status,429);
  assert.equal(response.headers.get('Retry-After'),'60');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
  assert.equal(embeddings,0);
  assert.deepEqual(budget.calls,[]);
});

test('Anna events allow only client-reported event names and telemetry contains no situation',async()=>{
  const env={APP_HEALTH_INGEST_KEY:'test-ingest-key',APP_HEALTH_ENVIRONMENT:'test'};
  const pending=[];
  const context={waitUntil:promise=>pending.push(promise)};
  const originalFetch=globalThis.fetch;
  const originalLog=console.log;
  const telemetry=[];
  globalThis.fetch=async(url,options)=>{
    telemetry.push({url:String(url),body:JSON.parse(options.body)});
    return new Response(null,{status:202});
  };
  console.log=()=>{};
  try {
    const response=await worker.fetch(new Request('https://example.test/api/anna/events',{
      method:'POST',
      headers:{'Content-Type':'application/json','Origin':'https://anna.partners','CF-Connecting-IP':'192.0.2.7'},
      body:JSON.stringify({event:'saved_reference'})
    }),env,context);
    assert.equal(response.status,202);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
    assert.equal((await response.json()).measurement,'client_reported');
    assert(telemetry.some(item=>item.body.logs?.[0]?.event==='anna.client.saved_reference'));
    assert(telemetry.some(item=>item.body.events?.[0]?.route==='/api/anna/events'));
    assert(!JSON.stringify(telemetry).includes('situation'));

    const invalid=await worker.fetch(new Request('https://example.test/api/anna/events',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({event:'saved_reference',comment:'PRIVATE'})
    }),env);
    assert.equal(invalid.status,400);
    assert.equal(invalid.headers.get('Access-Control-Allow-Origin'),'*');
  } finally {
    console.log=originalLog;
    globalThis.fetch=originalFetch;
    await Promise.all(pending);
  }
});

test('Anna privacy disclosure is present in the public assets fallback',async()=>{
  const disclosure=readFileSync(new URL('../worker/public/anna-privacy.html',import.meta.url),'utf8');
  const response=await worker.fetch(new Request('https://example.test/anna-privacy.html'),{
    ASSETS:{fetch:async()=>new Response(disclosure,{headers:{'Content-Type':'text/html; charset=utf-8'}})}
  });
  assert.equal(response.status,200);
  assert.equal(response.headers.get('X-Frame-Options'),'DENY');
  const html=await response.text();
  assert.match(html,/does not save your comment/);
  assert.match(html,/never saves your situation/);
  assert.match(html,/client-reported interactions/);
});

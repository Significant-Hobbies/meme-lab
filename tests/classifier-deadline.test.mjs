import test from 'node:test';
import assert from 'node:assert/strict';
import {withClassifierDeadline} from '../worker/src/classifier-deadline.mjs';

test('later classifier stages cannot restart an expired pipeline deadline',async()=>{
  let calls=0;
  const fetchImpl=withClassifierDeadline(async(_url,init)=>{
    calls++;assert.equal(init.body,'same payload');assert.equal(init.headers['content-type'],'application/json');
    return Response.json({ok:true});
  },10);
  const init={body:'same payload',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(1000)};
  assert.equal((await fetchImpl('https://classifier.test',init)).status,200);
  await new Promise(resolve=>setTimeout(resolve,25));
  await assert.rejects(fetchImpl('https://classifier.test',init),{name:'TimeoutError'});
  assert.equal(calls,1);
});

test('an in-flight classifier aborts at the shared deadline despite a longer per-stage timeout',async()=>{
  const fetchImpl=withClassifierDeadline(async(_url,{signal})=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>resolve(Response.json({ok:true})),1000);
    signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});
  }),15);
  await assert.rejects(fetchImpl('https://classifier.test',{signal:AbortSignal.timeout(1000)}),{name:'TimeoutError'});
});

test('caller cancellation remains terminal before and during managed inference',async()=>{
  const controller=new AbortController();let calls=0;
  const fetchImpl=withClassifierDeadline(async(_url,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},1000);
  const pending=fetchImpl('https://classifier.test',{signal:controller.signal});
  controller.abort();await assert.rejects(pending,{name:'AbortError'});
  await assert.rejects(fetchImpl('https://classifier.test',{signal:controller.signal}),{name:'AbortError'});
  assert.equal(calls,1);
});

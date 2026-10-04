import test from 'node:test';
import assert from 'node:assert/strict';
import {FIT_LABELS,rankCandidatesByPerspective} from '../worker/src/classification.mjs';
import {createGatewayClassifierFetch} from '../worker/src/gateway-classifier.mjs';

const candidates=['self','other','situation','backup-a','backup-b',...Array.from({length:25},(_,i)=>`weak-${i}`)].map(id=>({id,name:id,message:id,relational_pattern:id}));

test('managed perspectives score all candidates before assignment and keep those fit scores',async()=>{
  const calls=[];
  const fetchImpl=async(_url,options)=>{
    const body=JSON.parse(options.body);
    assert.deepEqual(body.labels,FIT_LABELS.map(({label})=>label));
    assert.equal(body.inputs.length,30);
    const viewpoint=body.inputs[0].split('VIEWPOINT: ')[1].split('\n')[0];
    calls.push(viewpoint);
    const lens={'My reaction':'self','Their side':'other','The situation':'situation'}[viewpoint];
    return Response.json({results:candidates.map(({id},index)=>{
      const winner=id===lens?4:index===3?3:index===4?2:0;
      return {label:body.labels[winner],scores:Object.fromEntries(body.labels.map((label,i)=>[label,i===winner?1:0]))};
    })});
  };
  const ranked=await rankCandidatesByPerspective('My coworker ignored my deadline.',candidates,{fetchImpl,limit:5,ordinalPerspectives:true});
  assert.deepEqual(calls.sort(),['My reaction','The situation','Their side']);
  assert.equal(ranked.length,5);
  assert.equal(new Set(ranked.map(({id})=>id)).size,5);
  for(const lens of ['self','other','situation']) {
    const winner=ranked.find(({id})=>id===lens);
    assert.equal(winner.perspective,lens);
    assert.equal(winner.classifier_score,1);
    assert.equal(winner.fit_label,'exact');
  }
  assert.equal(ranked.find(({id})=>id==='backup-a').classifier_score,.75);
  assert.equal(ranked.find(({id})=>id==='backup-b').classifier_score,.5);
});

test('one failed perspective aborts ranking rather than presenting partial coverage as healthy',async()=>{
  await assert.rejects(rankCandidatesByPerspective('My coworker ignored my deadline.',candidates,{
    ordinalPerspectives:true,limit:5,fetchImpl:async()=>new Response(null,{status:502})
  }),/HTTP 502/);
});

test('managed adapter normalizes category probability mass and rejects an empty distribution',async()=>{
  const completion=scores=>Response.json({choices:[{message:{content:JSON.stringify({results:[{label_index:1,scores}]})}}]});
  const init={body:JSON.stringify({inputs:['fixture'],labels:['a','b']})};
  const adapter=createGatewayClassifierFetch({fetch:async()=>completion([.2,.6])});
  const result=(await (await adapter('',init)).json()).results[0];
  assert.equal(result.scores.a,.25);
  assert(Math.abs(result.scores.b-.75)<1e-12);
  const empty=createGatewayClassifierFetch({fetch:async()=>completion([0,0])});
  await assert.rejects(empty('',init),/empty category scores/);
});

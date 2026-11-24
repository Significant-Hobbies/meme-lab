import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import worker from '../worker/src/index.mjs';
import {probePicker} from '../scripts/probe-production-picker.mjs';
import {reportPickerProbe} from '../scripts/report-production-picker.mjs';
import {recommendOnAnna} from '../anna/ranking.mjs';
import {suggestCatalogueClips} from '../worker/src/catalogue-suggestions.mjs';

const heldOutCases=[
  ['I opened the refrigerator twice hoping for leftovers.', 'clip-caminandes-3-deflated'],
  ['I checked the fridge four times hoping for snacks.', 'clip-caminandes-3-deflated'],
  ['My friend ate the last chocolate brownie and asked why I sighed.', 'clip-caminandes-3-already-gone'],
  ['My sibling ate the leftovers with my name on them, then asked why I looked upset.', 'clip-caminandes-3-already-gone'],
  ['My colleague took another coffee break right before the handoff deadline.', 'clip-bbb-waiting'],
  ['My boss started a coffee break when the document was due.', 'clip-bbb-waiting'],
  ['I have been waiting for the download for hours.', 'clip-bbb-waiting'],
  ['I am still waiting for the upload approval.', 'clip-bbb-waiting'],
  ['The build finally went green after the fifth restart.', 'clip-spring-made-it'],
  ['At last the test suite passed.', 'clip-spring-made-it'],
  ['After a long shift I came home exhausted and sat down on the couch.', 'clip-coffee-run-finally-home'],
  ['I am wiped after a long day and just got home.', 'clip-coffee-run-finally-home'],
  ['The doorbell rang just as I sat down for a quiet minute.', 'clip-bbb-peace'],
  ['I finally sat down and the delivery driver knocked.', 'clip-bbb-peace'],
  ['My coworker said the meeting could have been an email, then scheduled a follow-up meeting about it.', 'clip-bbb-not-impressed'],
  ['The meeting should have been an email and they booked another meeting.', 'clip-bbb-not-impressed'],
  ['My friend borrowed my charger for one minute and returned it three weeks later.', 'clip-bbb-not-impressed'],
  ['My teammate took my charging cable and brought it back five days later.', 'clip-bbb-not-impressed']
];

const unsupported=[
  'I did not open the fridge twice hoping for snacks.',
  'I never checked the refrigerator again hoping for leftovers.',
  'My friend did not eat the last chocolate brownie.',
  'My roommate watched while I ate the last brownie.',
  'My friend would eat the last brownie if she had the chance.',
  'My sibling said “my friend ate the last brownie.”',
  'After checking the fridge twice hoping for snacks, I found some cookies.',
  'I finally passed the test but it broke again.',
  'My manager finished the document before the deadline and took a coffee break.',
  'My friend ate the last slice of cake and had an allergic reaction.',
  'I finally sat down after a long day and the doorbell rang while I was getting help for chest pain.',
  'My neighbor died and I was waiting for minutes for the download.',
  'I finally passed the test and my sibling ate the last cookie.',
  'They replied k to the six-paragraph message I spent an hour writing.',
  'The fridge is on the patio.',
  'I checked the fridge twice. My friend brought snacks and I was hoping they could help move it.',
  'I have been waiting for approval for hours to have surgery.',
  'After a long day I came home exhausted and found my cat dead on the couch.',
  'After a long day I came home exhausted and my partner hit me again.',
  'He knocked me down again when I sat down.',
  'They knocked me down again every time I sat down.',
  'The delivery driver knocked me down again when I sat down.',
  'I collapsed at home after a long shift.',
  'I had a long day of chemo and collapsed on the couch.',
  'I was waiting for hours for the biopsy results download.',
  'I am suicidal and stuck waiting for hours for approval.',
  'I opened the fridge again hoping for food because we cannot afford groceries.'
];

test('local gallery suggestions cover bounded themes and reject held-out reversals and serious or unsupported situations',()=>{
  for(const [comment,expected] of heldOutCases){
    const clips=suggestCatalogueClips(comment);
    assert.equal(clips[0]?.id,expected,comment);
    assert.ok(clips.length>=1&&clips.length<=2,comment);
    for(const clip of clips){
      assert.equal(clip.catalogue_status,'active');
      assert.equal(clip.media_status,'approved');
      assert.match(clip.media_url,/^\/assets\/clips\//);
      assert.ok(clip.video_evidence.eligible);
      assert.ok(clip.example_context&&clip.near_miss_context);
    }
  }
  for(const comment of unsupported)assert.deepEqual(suggestCatalogueClips(comment),[],comment);
});

const makeRequest=(path,comment,headers={})=>new Request('https://memes.example.test'+path,{
  method:'POST',
  headers:{'Content-Type':'application/json','X-Fleet-Traffic':'qa',...headers},
  body:JSON.stringify({comment})
});
const budgetResponse=()=>Response.json({
  monthKey:new Date().toISOString().slice(0,7),baselineVerified:true,
  allowed:false,used:44_999_360,remaining:640,retryAfter:7200
});
function harness(){
  const calls={budget:0,index:0,ai:0,rank:0,saves:0,limit:0};
  const env={
    NEURON_BUDGET:{idFromName:n=>n,get:()=>({fetch:async(_url,opts)=>{
      calls.budget++;
      assert.deepEqual(JSON.parse(opts.body),{dimensions:3840});
      return budgetResponse();
    }})},
    FREE_AI:{run:()=>{calls.ai++;throw new Error('NO_PAID_EMBEDDING');}},
    MEME_INDEX:{query:()=>{calls.index++;throw new Error('NO_PAID_QUERY');}},
    CLASSIFIER_FETCH:()=>{calls.rank++;throw new Error('NO_PAID_RANK');},
    DB:{prepare:()=>({bind:()=>({run:async()=>{calls.saves++;return {success:true};}})})},
    ANNA_SEARCH_LIMITER:{limit:async()=>{calls.limit++;return {success:true};}}
  };
  return {env,calls};
}

test('live Worker route uses the gallery suggestion branch after one refused reservation',async()=>{
  const {env,calls}=harness();
  const delivered=[];
  const pending=[];
  env.APP_HEALTH_INGEST_KEY='test-only';
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    delivered.push({url,payload:JSON.parse(init.body)});
    return new Response(null,{status:202});
  };
  try {
    const reason='My friend ate the last chocolate brownie and asked why I sighed.';
    const response=await worker.fetch(makeRequest('/api/recommend',reason),env,{waitUntil:promise=>pending.push(promise)});
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.decision,'meme');
    assert.equal(body.ranking_mode,'catalogue_suggestions');
    assert.equal(body.degraded,true);
    assert.equal(body.feedback_enabled,false);
    assert.equal(body.confidence,'low');
    assert.deepEqual(body.candidates.map(({id})=>id),['clip-caminandes-3-already-gone','clip-caminandes-3-deflated']);
    for(const clip of body.candidates){
      assert.match(clip.media_url,/^https:\/\/memes\.example\.test\/assets\/clips\//);
      assert.equal(clip.perspective,'best_match');
      assert.equal(clip.score,0);
    }
    assert.deepEqual(calls,{budget:1,index:0,ai:0,rank:0,saves:0,limit:0});
    await Promise.all(pending);
    const logs=delivered.filter(entry=>entry.url.endsWith('/v1/logs')).flatMap(entry=>entry.payload.logs);
    assert.deepEqual(logs.map(log=>log.event).sort(),['recommendation.created','recommendation.degraded']);
    assert.ok(logs.every(log=>log.props.ranking_mode==='catalogue_suggestions'&&log.props.traffic_class==='qa'));
    assert.equal(logs.find(log=>log.event==='recommendation.degraded').props.failure_kind,'budget_exhausted');
    assert.equal(logs.find(log=>log.event==='recommendation.created').props.classifier_gate,'not_run');
    assert.equal(JSON.stringify(delivered).includes(reason),false);
    assert.equal(JSON.stringify(delivered).includes('44999360'),false);
  } finally {globalThis.fetch=originalFetch;}
});

test('unqualified comment retains the public failure response and skips inference and saves',async()=>{
  const {env,calls}=harness();
  const r=await worker.fetch(makeRequest('/api/recommend',unsupported[1]),env);
  assert.equal(r.status,503);
  assert.equal(r.headers.get('retry-after'),'60');
  assert.deepEqual(await r.json(),{error:'Meme matching is temporarily unavailable. Try again shortly.'});
  assert.deepEqual(calls,{budget:1,index:0,ai:0,rank:0,saves:0,limit:0});
});

test('Anna curated shortlist uses existing CORS and admission, preserves ranking metadata and stays stateless',async()=>{
  const {env,calls}=harness();
  const comment='My friend ate the last brownie and asked why I sighed.';
  const headers={Origin:'https://anna.partners','CF-Connecting-IP':'192.0.2.1'};
  const preflight=await worker.fetch(new Request('https://memes.example.test/api/anna/shortlist',{method:'OPTIONS',headers}),env);
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),'*');
  assert.equal(preflight.headers.get('access-control-allow-headers'),'Content-Type');
  const r=await worker.fetch(makeRequest('/api/anna/shortlist',comment,headers),env);
  const body=await r.json();
  assert.equal(r.status,200);
  assert.equal(r.headers.get('access-control-allow-origin'),'*');
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(body.decision,'shortlist');
  assert.equal(body.retrieval_mode,'curated_catalogue');
  assert.equal(body.perspectives,true);
  assert.equal(body.serious_hint,false);
  assert.equal(body.candidates[0]?.id,'clip-caminandes-3-already-gone');
  assert.ok(body.candidates.every(c=>c.message&&c.relational_pattern&&c.example_context&&c.near_miss_context));
  assert.deepEqual(calls,{budget:1,index:0,ai:0,rank:0,saves:0,limit:1});
  env.ANNA_SEARCH_LIMITER.limit=async()=>({success:false});
  const denied=await worker.fetch(makeRequest('/api/anna/shortlist',comment,headers),env);
  assert.equal(denied.status,429);
  assert.equal(denied.headers.get('access-control-allow-origin'),'*');
  assert.equal(calls.budget,1);
  env.ANNA_SEARCH_LIMITER.limit=async()=>({success:true});
  const unsafe=await worker.fetch(makeRequest('/api/anna/shortlist',unsupported[1],headers),env);
  assert.equal(unsafe.status,503);
  assert.equal(unsafe.headers.get('retry-after'),'60');
});

test('monitor reports gallery suggestions as a separate degraded result without passing semantic acceptance',async()=>{
  const {env,calls}=harness();
  const result=await probePicker('https://memes.example.test',(url,init)=>worker.fetch(new Request(url,init),env));
  assert.equal(result.status,'failed');
  assert.ok(result.results.every(item=>item.status_code===200&&item.ranking_mode==='catalogue_suggestions'&&item.degraded));
  assert.deepEqual(calls,{budget:2,index:0,ai:0,rank:0,saves:0,limit:0});
  let logged;
  const reported=await reportPickerProbe(result,{key:'test-only',fetchImpl:async(_url,req)=>{
    logged=JSON.parse(req.body).logs[0];
    return new Response(null,{status:202});
  }});
  assert.equal(reported.status,'accepted');
  assert.equal(logged.event,'production.probe.failed');
  assert.equal(logged.props.general_ranking_mode,'catalogue_suggestions');
  assert.equal(logged.props.perspectives_ranking_mode,'catalogue_suggestions');
  assert.equal(logged.props.traffic_class,'qa');
});

test('Anna host ranks the bounded list through its own model and retains curated provenance',async()=>{
  const {env,calls}=harness();
  let ranked;
  const result=await recommendOnAnna('My friend ate the last brownie and asked why I sighed.',{
    fetchImpl:async(_url,init)=>worker.fetch(new Request('https://memes.example.test/api/anna/shortlist',{
      ...init,headers:{...init.headers,'CF-Connecting-IP':'192.0.2.1','Origin':'https://anna.partners'}
    }),env),
    anna:{llm:{complete:async({messages})=>{
      ranked=JSON.parse(messages[0].content).candidates.map(row=>row.id);
      return {content:JSON.stringify({
        decision:'meme',none_reason:'',
        ratings:ranked.map(id=>({id,fit:'plausible'})),
        selected:ranked.map(id=>({id,perspective:'best_match'}))
      })};
    }}}
  });
  assert.equal(result.retrieval_mode,'curated_catalogue');
  assert.equal(result.feedback_enabled,false);
  assert.deepEqual(ranked,['clip-caminandes-3-already-gone','clip-caminandes-3-deflated']);
  assert.deepEqual(result.candidates.map(row=>row.id),ranked);
  assert.deepEqual(calls,{budget:1,index:0,ai:0,rank:0,saves:0,limit:1});
});

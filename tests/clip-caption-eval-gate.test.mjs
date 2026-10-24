import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {summarizeClipPreference} from '../scripts/clip-caption-eval-gate.mjs';

const manifest=JSON.parse(await readFile(new URL('../eval/clip_caption_quality_v1.json',import.meta.url),'utf8'));
const assignments=manifest.cases.map((fixture,index)=>({case_id:fixture.id,a:index%2?'candidate':'baseline',b:index%2?'baseline':'candidate'}));
const results=manifest.cases.flatMap(fixture=>['baseline','candidate'].map(arm=>({case_id:fixture.id,arm,status:200,request_sha256:'same-'+fixture.id,response:{decision:'captions',captions:['A concrete line.','A different line.','A third line.']}})));
const votes=(wins)=>assignments.map((assignment,index)=>({case_id:assignment.case_id,choice:index<wins?(assignment.a==='candidate'?'a':'b'):(assignment.a==='baseline'?'a':'b')}));
const evaluate=(overrides={})=>summarizeClipPreference({manifest,assignments,results,ratings:votes(21),rater:{kind:'human',attested:true},...overrides});

test('the predeclared gate needs twenty-one human preferences among all thirty cases',()=>{
  assert.equal(evaluate().claim_ready,true);assert.equal(evaluate().candidate_preference,.7);
  assert.equal(evaluate({ratings:votes(20)}).claim_ready,false);
  assert.equal(evaluate({ratings:votes(21).slice(0,29)}).state,'awaiting_human_review');
});

test('agent or model ratings cannot become human preference evidence',()=>{
  for(const rater of [{kind:'agent',attested:true},{kind:'model',attested:true},{kind:'human',attested:false},null]){
    const result=evaluate({rater,ratings:votes(30)});assert.equal(result.claim_ready,false);assert.equal(result.human_votes,0);assert.equal(result.candidate_wins,0);
  }
});

test('failures and mismatched inputs cannot inflate caption preference or shrink the denominator',()=>{
  const failed=structuredClone(results);failed.find(row=>row.arm==='candidate').status=503;
  const result=evaluate({results:failed,ratings:votes(30)});assert.equal(result.candidate_wins,29);assert.equal(result.denominator,30);assert.equal(result.reliability_gate,false);assert.equal(result.claim_ready,false);
  const mismatch=structuredClone(results);mismatch.find(row=>row.arm==='candidate').request_sha256='other input';
  assert.equal(evaluate({results:mismatch,ratings:votes(30)}).candidate_wins,29);
  assert.equal(evaluate({results:mismatch,ratings:votes(30)}).claim_ready,false);
});

test('ties, neither votes, duplicates and missing attempts cannot manufacture a pass',()=>{
  const ratings=votes(30).map((vote,index)=>({...vote,choice:index<10?'tie':index<20?'neither':vote.choice}));
  const result=evaluate({ratings});assert.equal(result.claim_ready,false);assert.equal(result.ties,10);assert.equal(result.neither,10);
  assert.throws(()=>evaluate({ratings:[...votes(30),votes(30)[0]]}),/duplicate/);
  assert.throws(()=>evaluate({results:[...results,results[0]]}),/repeated/);
  assert.equal(evaluate({results:results.slice(1),ratings:votes(30)}).claim_ready,false);
});

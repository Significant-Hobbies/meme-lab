import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendationOutcomeProps,recommendationTrafficClass,reportRecommendationOutcome} from '../worker/public/recommendation-outcomes.js';

const recommendation={request_id:'12345678-1234-1234-1234-123456789abc',decision:'meme',ranking_mode:'retrieval_fallback',degraded:true,candidates:[{id:'public-template',rank:1},{id:'public-backup',rank:2}],comment:'PRIVATE_COMMENT',caption:'PRIVATE_CAPTION'};

test('outcomes retain the existing recommendation join and categorical rank without content',()=>{
  const props=recommendationOutcomeProps(recommendation,{rank:2,name:'PRIVATE_NAME'},{search:'?fleet_qa=1&q=PRIVATE_SEARCH',verdict:'missed'});
  assert.deepEqual(props,{recommendation_id:recommendation.request_id,stage:'browser',traffic_class:'qa',decision:'meme',ranking_mode:'retrieval_fallback',degraded:true,candidate_count:2,candidate_rank:2,verdict:'missed'});
  assert.doesNotMatch(JSON.stringify(props),/PRIVATE|comment|caption|name|search|candidate_id/);
});

test('unmarked visits stay unclassified and unknown ranking is explicit',()=>{
  assert.equal(recommendationTrafficClass(''),'unclassified');
  assert.equal(recommendationTrafficClass('?fleet_qa=0&fleet_internal=1'),'internal');
  const props=recommendationOutcomeProps({...recommendation,ranking_mode:'PRIVATE_PROVIDER'}, {rank:100}, {verdict:'PRIVATE_VERDICT'});
  assert.equal(props.traffic_class,'unclassified');
  assert.equal(props.ranking_mode,'unknown');
  assert.equal(Object.hasOwn(props,'candidate_rank'),false);
  assert.equal(Object.hasOwn(props,'verdict'),false);
});

test('arbitrary identifiers and events cannot enter outcome logs',()=>{
  let calls=0;
  assert.equal(reportRecommendationOutcome('shown',{...recommendation,request_id:'PRIVATE_ID'},null,{log:()=>calls++}),false);
  assert.equal(reportRecommendationOutcome('PRIVATE_EVENT',recommendation,null,{log:()=>calls++}),false);
  assert.equal(calls,0);
});

test('a none result can be shown without implying a selected candidate',()=>{
  const props=recommendationOutcomeProps({...recommendation,decision:'none',candidates:[]},null);
  assert.equal(props.decision,'none');
  assert.equal(props.candidate_count,0);
  assert.equal(Object.hasOwn(props,'candidate_rank'),false);
});

test('export request and export failure remain distinct; neither asserts a saved file',()=>{
  const logs=[];
  const options={search:'?fleet_qa=1',log:(event,body)=>logs.push({event,...body})};
  assert.equal(reportRecommendationOutcome('download_requested',recommendation,{rank:2},options),true);
  assert.equal(reportRecommendationOutcome('export_failed',recommendation,{rank:2},options),true);
  assert.deepEqual(logs.map(log=>[log.event,log.level]),[['recommendation.download_requested','info'],['recommendation.export_failed','warn']]);
  assert.doesNotMatch(JSON.stringify(logs),/saved|copied|PRIVATE/);
});

test('missing or throwing diagnostics never interrupt the user workflow',()=>{
  assert.equal(reportRecommendationOutcome('shown',recommendation,null,{log:null}),false);
  assert.doesNotThrow(()=>reportRecommendationOutcome('shown',recommendation,null,{log:()=>{throw new Error('offline');}}));
});

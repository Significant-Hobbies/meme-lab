import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.mjs';
import {EMBEDDING_MODEL} from '../worker/src/retrieval.mjs';
import {decodeRanking,recommendOnAnna,requiresSincereResponse} from '../anna/ranking.mjs';

const budget={idFromName:name=>name,get:()=>({fetch:async(url,options)=>{const body=JSON.parse(options.body);const vector=url.endsWith('try-debit-vectorize');const amount=vector?body.dimensions:body.neurons;return Response.json({allowed:true,used:amount,remaining:(vector?45_000_000:9500)-amount,retryAfter:0,baselineVerified:true,[vector?'monthKey':'dayKey']:new Date().toISOString().slice(0,vector?7:10)});}})};
const records=Array.from({length:6},(_,i)=>({id:`meme-${i}`,name:`Meme ${i}`,message:'A documented social dynamic.',source_url:'https://i.imgflip.com/a.jpg'}));
const output={decision:'meme',none_reason:'',ratings:records.map((r,i)=>({id:r.id,fit:['exact','strong','plausible','weak','wrong','wrong'][i]})),selected:records.slice(0,5).map(r=>({id:r.id,perspective:'best_match'}))};
const completion=value=>({content:{type:'text',text:JSON.stringify(value)}});

test('ranking rejects hallucinated, duplicate, partial and reversed choices',()=>{
  for(const mutate of [
    d=>{d.selected[0].id='invented';},
    d=>{d.selected[1].id=d.selected[0].id;},
    d=>{d.ratings.pop();},
    d=>{d.selected.reverse();},
    d=>{d.ratings[0].fit='certain';}
  ]) {
    const value=structuredClone(output);mutate(value);
    assert.throws(()=>decodeRanking(completion(value),records));
  }
  const result=decodeRanking(completion(output),records);
  assert.equal(result.confidence,'high');
  assert.equal(result.candidates.length,5);
  assert.equal(result.candidates[4].fit_label,'wrong');
  assert.equal(result.feedback_enabled,false);
  assert(!result.candidates.some(c=>'message' in c));
});

test('serious-input abstention must be consistent and bounded',()=>{
  const value={decision:'none',none_reason:'This needs a sincere response.',ratings:[],selected:[]};
  assert.equal(decodeRanking(completion(value),records).decision,'none');
  assert.deepEqual(decodeRanking(completion({...value,selected:output.selected,ratings:output.ratings}),records).candidates,[]);
  assert.equal(decodeRanking(completion({...value,none_reason:'x'.repeat(301)}),records).none_reason.length,300);
  assert.match(decodeRanking(completion({...value,none_reason:null}),records).none_reason,/sincere/);
});

test('Anna performs the contextual ranking once without cookies or a provider fallback',async()=>{
  let calls=0;
  const result=await recommendOnAnna('The tests passed after I changed nothing.',{
    fetchImpl:async(url,options)=>{
      assert.equal(url,'https://memes.significanthobbies.com/api/anna/shortlist');
      assert.equal(options.credentials,'omit');
      return Response.json({decision:'shortlist',candidates:records});
    },
    anna:{llm:{complete:async(args)=>{
      calls++;assert.equal(args.maxTokens,2400);
      assert.equal(JSON.parse(args.messages[0].content).candidates.length,6);
      const result=structuredClone(output);result.selected[0].perspective="their_side";return completion(result);
    }}}
  });
  assert.equal(calls,1);assert.equal(result.candidates[0].id,'meme-0');
  assert(result.candidates.every(c=>c.perspective==='best_match'));
  await assert.rejects(()=>recommendOnAnna('a situation',{fetchImpl:async()=>Response.json({decision:'shortlist',candidates:records}),anna:{llm:{complete:async()=>{throw new Error('APP_QUOTA_EXCEEDED');}}}}),/quota/);
});

test('public shortlist is bounded, stateless and independent of classification and feedback',async()=>{
  const env={
    NEURON_BUDGET:budget,
    AI:{run:async(model)=>{assert.equal(model,EMBEDDING_MODEL);return{data:[[1,0,0]]};}},
    MEME_INDEX:{query:async()=>({matches:[{id:'vector',metadata:{catalogue_id:'waiting-skeleton'}}]})},
    DB:{prepare:()=>assert.fail('Anna retrieval must not write feedback.')},
    CLASSIFIER_FETCH:()=>assert.fail('Contextual ranking belongs to Anna.')
  };
  const url='https://example.test/api/anna/shortlist';
  const response=await worker.fetch(new Request(url,{method:'POST',headers:{'Content-Type':'application/json','Origin':'null'},body:JSON.stringify({comment:'I waited forever for approval.'})}),env);
  assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
  const body=await response.json();assert.equal(body.candidates[0].id,'waiting-skeleton');
  assert.equal(typeof body.candidates[0].near_miss_context,'string');
  assert(!JSON.stringify(body).includes('I waited forever'));
  assert.equal((await worker.fetch(new Request(url,{method:'OPTIONS'}),env)).status,204);
  assert.equal((await worker.fetch(new Request(url),env)).status,405);
  assert.equal((await worker.fetch(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:' '.repeat(5001)}),env)).status,413);
  const sameOrigin=await worker.fetch(new Request('https://example.test/api/recommend',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://anna.partners'},body:'{}'}),env);
  assert.equal(sameOrigin.status,403);
  assert.equal(sameOrigin.headers.get('Access-Control-Allow-Origin'),null);
});

 test('denied Anna admission stops retrieval before embeddings spend',async()=>{
  let embeddings=0;
  const env={ANNA_SEARCH_LIMITER:{limit:async()=>({success:false})},AI:{run:async()=>{embeddings++;throw new Error('unexpected spend');}}};
  const response=await worker.fetch(new Request('https://example.test/api/anna/shortlist',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({comment:'My weekend plan went hilariously wrong.'})}),env);
  assert.equal(response.status,429);assert.equal(embeddings,0);
});

test('explicit sincere apologies abstain before retrieval or AI while comic apologies remain eligible',async()=>{
  for(const comment of ['Help me make amends and apologize to my sister.','I want to say sorry sincerely for breaking trust.']){
    const result=await recommendOnAnna(comment,{fetchImpl:()=>assert.fail('No retrieval needed for sincere apology.'),anna:{llm:{complete:()=>assert.fail('No model spend needed.')}}});
    assert.equal(result.decision,'none');assert.deepEqual(result.candidates,[]);
  }
  for(const comment of ['My cat owes me an apology for stealing dinner.','I need a funny apology, not a sincere apology.','Sincerely shocked at this silly cat.'])assert.equal(requiresSincereResponse(comment),false);
});

test('Anna retrieval preserves the current shared spending guard',async()=>{
  let embeddings=0;
  const response=await worker.fetch(new Request('https://example.test/api/anna/shortlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:'Waiting forever for an approval.'})}),{AI:{run:async()=>{embeddings++;}}});
  assert.equal(response.status,503);assert.equal(embeddings,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {BudgetUnavailableError,reserveRetrievalBudget} from '../worker/src/ai-budget.mjs';
function namespace(handle) { return {idFromName:name=>{assert.equal(name,'global-budget');return name;},get:()=>({fetch:handle})}; }
function allowed(url,body) { const vector=url.endsWith('try-debit-vectorize');return Response.json({allowed:true,used:vector?body.dimensions:body.neurons,remaining:(vector?45_000_000:9500)-(vector?body.dimensions:body.neurons),retryAfter:0,baselineVerified:true,[vector?'monthKey':'dayKey']:new Date().toISOString().slice(0,vector?7:10)}); }
test('reserves all five Vectorize queries before gateway-managed embedding',async()=>{
  const calls=[];
  await reserveRetrievalBudget({NEURON_BUDGET:namespace(async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});return allowed(url,body);})},'🙂'.repeat(500));
  assert.equal(calls[0].body.dimensions,3840);
  assert.equal(calls.length,1);
});
for(const invalid of [{allowed:false},{allowed:'true'},{allowed:true,used:1,remaining:-1},{allowed:true,used:1,remaining:1,dayKey:'2020-01-01'},{allowed:true,used:NaN,remaining:1}]) {
  test(`invalid embedding admission fails closed ${JSON.stringify(invalid)}`,async()=>{
    await assert.rejects(reserveRetrievalBudget({NEURON_BUDGET:namespace(async(url,options)=>url.endsWith('try-debit-vectorize')?Response.json(invalid):allowed(url,JSON.parse(options.body)))},'approval'),BudgetUnavailableError);
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {listSaved,saveReference,removeReference,shareReference,referenceUrl} from '../anna/library.mjs';
import {annaAdmission} from '../worker/src/anna-http.mjs';
import {annaEvent} from '../worker/src/anna-events.mjs';

function storage() {
  const entries=new Map();
  const anna={storage:{list:async()=>({items:[...entries].map(([key,row])=>({key,metadata:row.metadata}))}),get:async({key})=>({exists:entries.has(key),value:entries.get(key)?.value}),set:async({key,value,metadata})=>entries.set(key,{value,metadata}),delete:async({key})=>entries.delete(key)}};
  return {anna,entries};
}
test('independent saved keys retain concurrent reactions and never save situations',async()=>{
  const {anna,entries}=storage();
  await Promise.all([saveReference(anna,{id:'facepalm',name:'Facepalm',comment:'PRIVATE'}),saveReference(anna,{id:'this-is-fine',name:'This Is Fine',comment:'PRIVATE'})]);
  assert.equal((await listSaved(anna)).length,2);assert(!JSON.stringify([...entries]).includes('PRIVATE'));
  await removeReference(anna,'facepalm');assert.deepEqual((await listSaved(anna)).map(r=>r.id),['this-is-fine']);
  await assert.rejects(()=>saveReference(anna,{id:'../../secret',name:'Bad'}));
});
test('corrupt saved metadata never produces an arbitrary URL and failed writes are not success',async()=>{
  const {anna,entries}=storage();entries.set('reactions/facepalm',{metadata:{id:'elsewhere',name:'Other'},value:{}});
  assert.deepEqual(await listSaved(anna),[]);
  anna.storage.set=async()=>{throw new Error('quota_exceeded');};
  await assert.rejects(()=>saveReference(anna,{id:'facepalm',name:'Facepalm'}),/quota/);
  assert.throws(()=>referenceUrl('https://evil.test'));
});
test('sharing selects the chosen reference, excludes situations, respects cancel and has a copy fallback',async()=>{
  const candidate={id:'this-is-fine',name:'This Is Fine',comment:'PRIVATE'};let payload,copied;
  assert.equal(await shareReference(candidate,{share:async value=>payload=value,copy:async()=>assert.fail()}),'share_completed');
  assert.deepEqual(payload,{title:'This Is Fine',url:'https://memes.significanthobbies.com/memes/this-is-fine'});
  assert.equal(await shareReference(candidate,{share:async()=>{throw Object.assign(new Error(),{name:'AbortError'});},copy:async()=>assert.fail()}),'share_cancelled');
  assert.equal(await shareReference(candidate,{share:null,copy:async value=>copied=value}),'link_copied');assert(!copied.includes('PRIVATE'));
});
test('configured admission blocks before costly work and fails closed on limiter failure',async()=>{
  const request=new Request('https://example.test',{headers:{'CF-Connecting-IP':'192.0.2.1'}});
  const response=await annaAdmission(request,{ANNA_SEARCH_LIMITER:{limit:async({key})=>{assert.equal(key,'shortlist:192.0.2.1');return {success:false};}}},'shortlist');
  assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');
  assert.equal((await annaAdmission(request,{ANNA_SEARCH_LIMITER:{limit:async()=>{throw new Error();}}},'shortlist')).status,503);
  assert.equal(await annaAdmission(request,{},'shortlist'),null);
});
test('events reject extra/private fields, unknown names and oversize payloads',async()=>{
  const request=body=>new Request('https://example.test/api/anna/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await annaEvent(request({event:'run_meme',comment:'PRIVATE'}),{})).status,400);
  assert.equal((await annaEvent(request({event:'invented'}),{})).status,400);
  assert.equal((await annaEvent(request({event:'x'.repeat(300)}),{})).status,413);
  const result=await annaEvent(request({event:'link_copied'}),{});assert.equal(result.status,202);assert.equal((await result.json()).measurement,'client_reported');
});

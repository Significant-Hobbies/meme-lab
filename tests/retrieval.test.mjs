import test from 'node:test';
import assert from 'node:assert/strict';
import {directRetriever,semanticRetriever} from '../worker/src/retrieval.mjs';

const catalogue=[
  {id:'waiting-skeleton',name:'Waiting Skeleton'},
  {id:'this-is-fine',name:'This Is Fine'},
  {id:'facepalm',name:'Facepalm'}
];

test('direct retrieval preserves the seed control catalogue',async()=>{
  assert.equal(await directRetriever(catalogue)(),catalogue);
});

test('semantic retrieval returns bounded, known, distinct records in score order',async()=>{
  let receivedTopK;
  const retrieve=semanticRetriever({
    catalogue,
    limit:2,
    embed:async text=>{assert.equal(text,'still waiting');return[0.1,0.2,0.3];},
    query:async(vector,options)=>{assert.deepEqual(vector,[0.1,0.2,0.3]);receivedTopK=options.topK;return[{id:'waiting-skeleton'},{id:'unknown'},{id:'waiting-skeleton'},{id:'facepalm'}];}
  });
  assert.deepEqual((await retrieve('still waiting')).map(record=>record.id),['waiting-skeleton','facepalm']);
  assert.equal(receivedTopK,2);
});

test('semantic retrieval rejects invalid vectors and empty known results',async()=>{
  await assert.rejects(semanticRetriever({catalogue,embed:async()=>[],query:async()=>[]})('hello'),/invalid vector/);
  await assert.rejects(semanticRetriever({catalogue,embed:async()=>[1],query:async()=>[{id:'unknown'}]})('hello'),/no known/);
});

 test('aliases resolve to one canonical choice and excluded assets never become candidates',async()=>{
  const records=[{id:'canonical',catalogue_status:'active'},{id:'alias',canonical_id:'canonical',catalogue_status:'active'},{id:'wrong',catalogue_status:'excluded'},{id:'offline',catalogue_status:'unavailable'},{id:'other',catalogue_status:'active'}];
  const retrieve=semanticRetriever({catalogue:records,embed:async()=>[1],query:async()=>[{id:'wrong'},{id:'alias'},{id:'canonical'},{id:'offline'},{id:'other'}]});
  assert.deepEqual((await retrieve('something')).map(record=>record.id),['canonical','other']);
 });

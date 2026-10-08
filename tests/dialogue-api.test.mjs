import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {configFromEnv} from '../src/config.mjs';
import {buildDialogueQualityCases} from '../scripts/build-dialogue-quality-eval.mjs';

const pilot=()=>Array.from({length:240},(_,index)=>({id:`wikiquote-${index}`,
  quote:'That is exactly what I expected to hear.',work_title:`Film ${index}`,
  speaker:'Speaker',screening:{screening_score:90},
  provenance:{provider:'English Wikiquote',source_url:`https://en.wikiquote.org/wiki/Film_${index}`,revision_id:index+1}}));

test('Wikiquote sample is independent of input order and retains 200 distinct films and source revisions',()=>{
  const input=pilot();
  const cases=buildDialogueQualityCases(input);
  assert.deepEqual(cases,buildDialogueQualityCases(input.reverse()));
  assert.equal(new Set(cases.map(row=>row.work_title)).size,200);
  assert(cases.every(row=>row.provenance.revision_id&&row.production_eligible===false&&row.human_validated===false));
  assert.throws(()=>buildDialogueQualityCases(pilot().slice(0,199)));
});

test('local review hides priors, saves immutable revisions, resumes and exports incomplete progress honestly',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'meme-dialogue-test-'));
  const dialogueFile=join(directory,'cases.jsonl');
  const storeDir=join(directory,'events');
  await writeFile(dialogueFile,buildDialogueQualityCases(pilot()).map(JSON.stringify).join('\n'));
  let app;
  const open=async()=>{
    app=createApp(configFromEnv({}),{storeDir,dialogueFile});
    await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
    return `http://127.0.0.1:${app.address().port}`;
  };
  const close=async()=>{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));};
  let url=await open();
  const get=async route=>(await fetch(url+route)).json();
  const post=body=>fetch(url+'/api/dialogue-review',{method:'POST',headers:{'Content-Type':'application/json','X-Meme-Lab':'1'},body:JSON.stringify(body)});
  try {
    const queue=await get('/api/dialogue-review-queue');
    assert.equal(queue.total,200);
    assert.equal(queue.reviewed,0);
    assert(!JSON.stringify(queue).includes('structural_score'));
    const id=queue.items[0].case_id;
    assert.equal((await post({case_id:id,sendability:'sendable'})).status,400);
    const first=await post({case_id:id,sendability:'sendable',standalone:'strong',strength:'memorable',note:'Synthetic test label.'});
    assert.equal(first.status,200);
    const revision=await post({case_id:id,sendability:'reject',standalone:'dependent',strength:'generic'});
    assert.equal(revision.status,200);
    assert.equal((await readdir(storeDir)).filter(name=>name.startsWith('dialogue_review-')).length,2);
    await close();url=await open();
    const resumed=await get('/api/dialogue-review-queue');
    assert.equal(resumed.reviewed,1);
    assert.equal(resumed.remaining,199);
    assert.equal(resumed.items[0].review.sendability,'reject');
    const report=await get('/api/dialogue-review-report');
    assert.equal(report.status,'model_labels_unavailable');
    assert.equal(report.metrics,null);
    assert.equal(report.model_available,false);
    const rows=(await(await fetch(url+'/api/dialogue-review-export')).text()).trim().split('\n').map(JSON.parse);
    assert.equal(rows.length,201);
    assert.equal(rows[0].remaining,199);
    assert.equal(rows[0].human_validated,false);
    assert.equal(rows[1].owner_review.sendability,'reject');
    assert.equal(rows[1].production_eligible,false);
    assert(rows[1].provenance.revision_id);
    // These remain synthetic labels in a disposable test store.
    for(const row of resumed.items.slice(1)) {
      assert.equal((await post({case_id:row.case_id,sendability:'sendable',standalone:'strong',strength:'solid'})).status,200);
    }
    const complete=(await(await fetch(url+'/api/dialogue-review-export')).text()).trim().split('\n').map(JSON.parse);
    assert.equal(complete[0].reviewed,200);
    assert.equal(complete[0].remaining,0);
    assert.equal(complete[0].human_validated,true);
    assert(complete.slice(1).every(row=>row.owner_review&&row.production_eligible===false));
    assert.equal((await get('/api/dialogue-review-report')).metrics,null);
  } finally {await close();await rm(directory,{recursive:true,force:true});}
});

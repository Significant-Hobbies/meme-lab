import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer,request} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {connect} from 'node:net';

const repo=resolve(import.meta.dirname,'..');
const manifestRaw=await readFile(resolve(repo,'eval/clip_caption_quality_v1.json'));
const manifest=JSON.parse(manifestRaw);

async function startReview(t){
  const root=await mkdtemp(resolve(tmpdir(),'meme-review-server-test-'));
  const run=resolve(root,'runs','heldout-v1');await mkdir(run,{recursive:true});
  await mkdir(resolve(root,'media'));
  const results=manifest.cases.flatMap(fixture=>['baseline','candidate'].map(arm=>({case_id:fixture.id,arm,status:fixture.id==='q01'&&arm==='baseline'?503:200,request_sha256:fixture.id,response:{decision:'captions',captions:['Synthetic first line.','Synthetic second line.','Synthetic third line.']}})));
  await writeFile(resolve(run,'results.jsonl'),results.map(row=>JSON.stringify(row)).join('\n')+'\n');
  await writeFile(resolve(run,'run.json'),JSON.stringify({split:'heldout',synthetic:true,manifest_sha256:createHash('sha256').update(manifestRaw).digest('hex')}));
  for(const id of new Set(manifest.cases.map(row=>row.candidate_id)))await writeFile(resolve(root,'media',id+'.mp4'),'synthetic media');
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(done=>reservation.close(done));
  const child=spawn(process.execPath,['scripts/serve-clip-caption-review.mjs','--root='+root,'--port='+port],{cwd:repo,stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
  const exited=once(child,'exit');
  t.after(async()=>{if(child.exitCode===null){child.kill('SIGTERM');await exited;}});
  await Promise.race([once(child.stdout,'data'),exited.then(()=>{throw Error('Review server exited: '+stderr);}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Review server startup timed out: '+stderr)),10000);timer.unref();})]);
  const send=(path='/data',{method='GET',host='127.0.0.1:'+port,origin,body,headers={}}={})=>new Promise((done,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path,method,headers:{Host:host,...(origin===undefined?{}:{Origin:origin}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers}},res=>{
      const parts=[];res.on('data',part=>parts.push(part));res.on('end',()=>done({status:res.statusCode,text:Buffer.concat(parts).toString(),headers:res.headers}));
    });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
  return {send,port,run};
}

test('local review serves complete blind pairs and persists synthetic choices without human qualification',async t=>{
  const {send,port,run}=await startReview(t);const origin='http://127.0.0.1:'+port;
  const response=await send();assert.equal(response.status,200);
  const data=JSON.parse(response.text);assert.equal(data.denominator,30);assert.equal(data.excluded_pairs,1);assert.equal(data.cases.length,29);assert.deepEqual(data.ratings,[]);
  assert.doesNotMatch(response.text,/results_sha256|assignments|request_sha256|candidate|baseline/);
  for(const path of ['/','/review.js','/clip-export.js',data.cases[0].media])assert.equal((await send(path)).status,200,path);
  assert.equal((await send('/data',{host:'localhost:'+port,origin:'http://localhost:'+port})).status,200);
  assert.equal((await send('/vote',{method:'POST',origin,body:{case_id:'q01',choice:'a'}})).status,400);
  for(const fixture of data.cases)assert.equal((await send('/vote',{method:'POST',origin,body:{case_id:fixture.id,choice:'a'}})).status,200);
  const saved=JSON.parse(await readFile(resolve(run,'human-review.json'),'utf8'));assert.equal(saved.ratings.length,29);assert.equal(saved.rater.kind,'agent-test');
  assert.equal(JSON.parse((await send()).text).ratings.length,29);
  assert.equal((await send('/finish',{method:'POST',origin,body:{attested:true}})).status,200);
  const report=JSON.parse(await readFile(resolve(run,'preference-report.json'),'utf8'));
  assert.equal(report.claim_ready,false);assert.equal(report.human_review_complete,false);assert.equal(report.human_votes,0);assert.equal(report.candidate_wins,0);assert.equal(report.denominator,30);
});

test('Host and supplied Origin are validated before every route without exposing or changing saved choices',async t=>{
  const {send,port,run}=await startReview(t);const origin='http://127.0.0.1:'+port;
  const data=JSON.parse((await send()).text);const vote={case_id:data.cases[0].id,choice:'b'};
  assert.equal((await send('/vote',{method:'POST',origin,body:vote})).status,200);
  const saved=await readFile(resolve(run,'human-review.json'),'utf8');
  const routes=['/data','/','/review.js','/clip-export.js',data.cases[0].media,'/missing','/vote','/finish'];
  for(const host of ['rebind.example:'+port,'127.0.0.1.evil.test:'+port,'localhost.evil.test:'+port,'localhost.: '+port,'127.1:'+port,'127.0.0.1','127.0.0.1:1','127.0.0.1:'+port+'@evil.test','127.0.0.1:'+port+'/','[broken'] ){
    for(const path of routes){
      const response=await send(path,{host});assert.equal(response.status,403,host+' '+path);assert.deepEqual(JSON.parse(response.text),{error:'Use the local review page.'});
    }
    assert.equal((await send('/vote',{method:'POST',host,origin,body:vote})).status,403,host);
  }
  for(const foreign of ['https://evil.test','null','http://localhost:'+port,'http://127.0.0.1:1',origin+'/',origin+'@evil.test']){
    for(const path of routes)assert.equal((await send(path,{origin:foreign})).status,403,foreign+' '+path);
    for(const path of ['/vote','/finish'])assert.equal((await send(path,{method:'POST',origin:foreign,body:vote})).status,403);
  }
  for(const site of ['cross-site','same-site'])for(const path of routes)assert.equal((await send(path,{headers:{'Sec-Fetch-Site':site}})).status,403);
  for(const site of ['same-origin','none'])assert.equal((await send('/data',{headers:{'Sec-Fetch-Site':site}})).status,200);
  assert.equal((await send('/vote',{method:'POST',body:vote})).status,403);
  for(const hostLines of ['Host: 127.0.0.1:'+port+'\r\nHost: evil.test\r\n','']){
    const response=await new Promise((done,reject)=>{
      const socket=connect(port,'127.0.0.1',()=>socket.end('GET /data HTTP/1.0\r\n'+hostLines+'\r\n'));
      let response='';socket.on('data',chunk=>{response+=chunk;});socket.on('end',()=>done(response));socket.on('error',reject);
    });
    assert.match(response,/^HTTP\/1\.1 403/);assert.doesNotMatch(response,/Synthetic|recorded_at/);
  }
  assert.equal((await send('http://evil.test/data')).status,403);
  assert.equal(await readFile(resolve(run,'human-review.json'),'utf8'),saved);
  const final=JSON.parse((await send()).text);assert.equal(final.ratings.length,1);assert.equal(final.ratings[0].choice,'b');
});

test('failed durable writes cannot publish votes or lock the review, and concurrent votes are retained',async t=>{
  const {send,port,run}=await startReview(t);const origin='http://127.0.0.1:'+port;
  const data=JSON.parse((await send()).text),temporary=resolve(run,'human-review.json.tmp');
  await mkdir(temporary);
  assert.equal((await send('/vote',{method:'POST',origin,body:{case_id:data.cases[0].id,choice:'a'}})).status,400);
  assert.deepEqual(JSON.parse((await send()).text).ratings,[]);
  await assert.rejects(readFile(resolve(run,'human-review.json')),{code:'ENOENT'});
  await rmdir(temporary);
  const reportTemporary=resolve(run,'preference-report.json.tmp');await mkdir(reportTemporary);
  const diagnostic=await send('/vote',{method:'POST',origin,body:{case_id:data.cases[0].id,choice:'b'}});
  assert.equal(diagnostic.status,200);assert.equal(JSON.parse(diagnostic.text).report_saved,false);
  assert.equal(JSON.parse(await readFile(resolve(run,'human-review.json'),'utf8')).ratings[0].choice,'b');
  await rmdir(reportTemporary);
  const responses=await Promise.all(data.cases.map(fixture=>send('/vote',{method:'POST',origin,body:{case_id:fixture.id,choice:'a'}})));
  assert.ok(responses.every(response=>response.status===200));
  const saved=await readFile(resolve(run,'human-review.json'),'utf8');assert.equal(JSON.parse(saved).ratings.length,29);
  await mkdir(temporary);
  assert.equal((await send('/finish',{method:'POST',origin,body:{attested:true}})).status,400);
  assert.equal(JSON.parse((await send()).text).finished,false);
  assert.equal(await readFile(resolve(run,'human-review.json'),'utf8'),saved);
  await rmdir(temporary);
  assert.equal((await send('/finish',{method:'POST',origin,body:{attested:true}})).status,200);
  assert.equal(JSON.parse((await send()).text).finished,true);
  assert.equal((await send('/vote',{method:'POST',origin,body:{case_id:data.cases[0].id,choice:'b'}})).status,409);
});

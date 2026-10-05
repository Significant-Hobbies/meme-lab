import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {reportPickerProbe} from '../scripts/report-production-picker.mjs';

const passed={status:'passed',results:[{case:'general',status:'passed',status_code:200,degraded:false,duration_ms:10}]};

test('probe outcomes reach App Health as explicit synthetic, privacy-bounded logs',async()=>{
  let sent;
  const result=await reportPickerProbe({...passed,prompt:'private',results:[{...passed.results[0],error:'private',headers:'private'},{case:'unknown',status:'failed',prompt:'private'}]}, {
    key:'test-key',release:'a'.repeat(40),runUrl:'https://github.com/Significant-Hobbies/meme-lab/actions/runs/123',
    fetchImpl:async(url,init)=>{sent={url,init,body:JSON.parse(init.body)};return new Response(null,{status:202});}
  });
  assert.deepEqual(result,{status:'accepted',status_code:202});
  assert.equal(sent.url,'https://ingest.sassmaker.com/v1/logs');
  assert.equal(sent.init.headers.authorization,'Bearer test-key');
  assert.equal(sent.body.environment,'production');
  const log=sent.body.logs[0];
  assert.equal(log.event,'production.probe.passed');
  assert.equal(log.level,'info');
  assert.equal(log.props.synthetic,true);
  assert.equal(log.props.general_status,'passed');
  assert.equal(log.props.release,'a'.repeat(40));
  assert.equal(log.props.run_url,'https://github.com/Significant-Hobbies/meme-lab/actions/runs/123');
  assert.equal(JSON.stringify(sent.body).includes('private'),false);
  assert.equal(JSON.stringify(sent.body).includes('test-key'),false);
  assert.equal(Object.hasOwn(log.props,'unknown_status'),false);
});

test('HTTP 200 degradation still produces an error-level failed probe event',async()=>{
  let body;
  await reportPickerProbe({status:'failed',results:[{case:'perspectives',status:'failed',status_code:200,degraded:true,duration_ms:100}]},{
    key:'test-key',fetchImpl:async(_url,init)=>{body=JSON.parse(init.body);return new Response(null,{status:202});}
  });
  assert.equal(body.logs[0].event,'production.probe.failed');
  assert.equal(body.logs[0].level,'error');
  assert.equal(body.logs[0].props.perspectives_status_code,200);
  assert.equal(body.logs[0].props.perspectives_degraded,true);
});

test('bounded cause fields reach App Health while unknown text is excluded',async()=>{
  let body;
  await reportPickerProbe({status:'failed',results:[
    {case:'perspectives',status:'failed',degraded:true,fallback:false,confidence:'low',ranking_mode:'perspective',perspectives_complete:true},
    {case:'general',status:'failed',confidence:'private secret',ranking_mode:'private prompt',fallback:'private',perspectives_complete:'private'}
  ]},{key:'test-key',fetchImpl:async(_url,init)=>{body=JSON.parse(init.body);return new Response(null,{status:202});}});
  const props=body.logs[0].props;
  assert.equal(props.perspectives_fallback,false);assert.equal(props.perspectives_confidence,'low');
  assert.equal(props.perspectives_ranking_mode,'perspective');assert.equal(props.perspectives_complete,true);
  assert.equal(Object.hasOwn(props,'general_confidence'),false);assert.equal(Object.hasOwn(props,'general_ranking_mode'),false);
  assert.doesNotMatch(JSON.stringify(body),/private|test-key/);
});

test('an unavailable public site still generates a failed probe log without an HTTP response',async()=>{
  let body;
  await reportPickerProbe({status:'failed',results:[{case:'general',status:'failed',reason:'request_or_response_failed',duration_ms:100}]},{
    key:'test-key',fetchImpl:async(_url,init)=>{body=JSON.parse(init.body);return new Response(null,{status:202});}
  });
  assert.equal(body.logs[0].event,'production.probe.failed');
  assert.equal(body.logs[0].props.general_status,'failed');
  assert.equal(Object.hasOwn(body.logs[0].props,'general_status_code'),false);
});

test('missing ingest configuration is explicit and makes no unauthenticated request',async()=>{
  let calls=0;
  assert.deepEqual(await reportPickerProbe(passed,{fetchImpl:async()=>{calls++;}}),{status:'unconfigured'});
  assert.equal(calls,0);
});

test('rejected log delivery is not reported as accepted',async()=>{
  assert.deepEqual(await reportPickerProbe(passed,{key:'test-key',fetchImpl:async()=>new Response(null,{status:401})}),{status:'failed',status_code:401});
});

test('delivery errors never expose credentials or thrown response text',async()=>{
  assert.deepEqual(await reportPickerProbe(passed,{key:'test-key',fetchImpl:async()=>{throw new Error('test-key private');}}),{status:'failed',reason:'delivery_failed'});
});

test('stalled ingestion respects its bounded deadline',async()=>{
  const result=await reportPickerProbe(passed,{key:'test-key',timeoutMs:10,fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>{
    const keepAlive=setTimeout(()=>resolve(new Response(null,{status:202})),500);
    signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(signal.reason);},{once:true});
  })});
  assert.deepEqual(result,{status:'failed',reason:'delivery_failed'});
});

test('invalid probe result cannot create a successful heartbeat',async()=>{
  let calls=0;
  assert.deepEqual(await reportPickerProbe({status:'unknown',results:[]},{key:'test-key',fetchImpl:async()=>{calls++;}}),{status:'failed',reason:'invalid_probe_result'});
  assert.equal(calls,0);
});

const preload=Buffer.from(`globalThis.fetch=async(url,init)=>{
  if(new URL(url).hostname==='ingest.sassmaker.com'){
    if(init.headers.authorization!=='Bearer test-key')throw new Error('Unexpected authentication');
    return new Response(null,{status:Number(process.env.MOCK_LOG_STATUS??202)});
  }
  if(new URL(url).hostname!=='memes.significanthobbies.com')throw new Error('Unexpected request');
  return Response.json({decision:'meme',confidence:'high',degraded:false,candidates:Array.from({length:5},(_,index)=>({
    id:'meme-'+index,media_url:'https://example.invalid/preview'+index,score:.9-index*.05,
    perspective:['self','other','situation','self','other'][index]
  }))});
};`).toString('base64');

for(const [name,key,ingestStatus,exitStatus,reportStatus] of [
  ['missing required configuration',undefined,202,1,'unconfigured'],
  ['accepted required reporting','test-key',202,0,'accepted'],
  ['rejected required reporting','test-key',401,1,'failed']
]) test(`CLI correctly handles ${name} after a successful picker check`,()=>{
  const env={APP_HEALTH_REPORT_REQUIRED:'1',GITHUB_SHA:'a'.repeat(40),
    GITHUB_REPOSITORY:'Significant-Hobbies/meme-lab',GITHUB_RUN_ID:'123',MOCK_LOG_STATUS:String(ingestStatus)};
  if(key)env.APP_HEALTH_INGEST_KEY=key;
  const child=spawnSync(process.execPath,['--import','data:text/javascript;base64,'+preload,
    fileURLToPath(new URL('../scripts/probe-production-picker.mjs',import.meta.url))],
    {env,encoding:'utf8',timeout:5000});
  assert.equal(child.error,undefined);
  assert.equal(child.status,exitStatus,child.stderr);
  const output=JSON.parse(child.stdout);
  assert.equal(output.status,'passed');
  assert.equal(output.app_health.status,reportStatus);
  assert.equal(child.stdout.includes('test-key'),false);
  assert.equal(child.stdout.includes('I opened'),false);
});

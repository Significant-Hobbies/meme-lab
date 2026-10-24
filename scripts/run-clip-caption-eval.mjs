import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {getPlatformProxy} from 'wrangler';

const args=Object.fromEntries(process.argv.slice(2).map(argument=>argument.replace(/^--/,'').split('=')));
const root=resolve(args.root??'.fleet-local/caption-quality-20261024');
const split=args.split??'development';if(!['development','heldout','guards'].includes(split))throw Error('Unknown split.');
const arms=(args.arms??'baseline').split(',');if(new Set(arms).size!==arms.length||arms.some(arm=>!['baseline','candidate'].includes(arm)))throw Error('Unknown or repeated arm.');
const spacing=Number(args.spacing??5000);if(!Number.isFinite(spacing)||spacing<0||spacing>60000)throw Error('Invalid request spacing.');
const manifestBytes=await readFile('eval/clip_caption_quality_v1.json');const manifest=JSON.parse(manifestBytes);
const provenance=JSON.parse(await readFile(resolve(root,'input-provenance.json'),'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
if(digest(manifestBytes)!==provenance.manifest_sha256)throw Error('Manifest changed after media/request freeze.');
const cases=manifest[split==='heldout'?'cases':split==='guards'?'guard_cases':'development_cases'];
const run=resolve(root,'runs',args.run??`${split}-${Date.now()}`);await mkdir(run,{recursive:true});
const baseline=await import(pathToFileURL(resolve(root,'baseline.mjs')));
const candidate=arms.includes('candidate')?await import(pathToFileURL(resolve('worker/src/clip-captions.mjs'))):null;
const implementation=await readFile('worker/src/clip-captions.mjs');
const metadata={version:1,created_at:new Date().toISOString(),split,arms,manifest_sha256:provenance.manifest_sha256,candidate_module_sha256:digest(implementation),candidate_writer_sha256:await readFile('worker/src/clip-caption-writer.mjs').then(digest).catch(()=>null),baseline:JSON.parse(await readFile(resolve(root,'baseline-provenance.json'),'utf8')),concurrency:2,minimum_start_spacing_ms:spacing,automatic_gateway:true,project:'meme-lab',first_attempts_only:true};
if(split==='heldout'){
  const frozen=JSON.parse(await readFile(resolve(root,'candidate-freeze.json'),'utf8'));
  for(const key of ['manifest_sha256','candidate_module_sha256','candidate_writer_sha256'])if(frozen[key]!==metadata[key])throw Error('Candidate or held-out cases changed after freeze.');
  if(arms.length!==2)throw Error('Held-out evaluation requires both arms.');
}
try{await readFile(resolve(run,'run.json'));throw Error('Run already exists; choose a new run ID.');}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(resolve(run,'run.json'),JSON.stringify(metadata,null,2)+'\n');
await writeFile(resolve(run,'candidate-module.mjs.txt'),implementation);
if(metadata.candidate_writer_sha256)await writeFile(resolve(run,'candidate-writer.mjs.txt'),await readFile('worker/src/clip-caption-writer.mjs'));
const platform=await getPlatformProxy({configPath:resolve(root,'wrangler.eval.json'),envFiles:[],persist:false});
const jobs=cases.flatMap((fixture,index)=>(index%2?[...arms].reverse():arms).map(arm=>({fixture,arm})));
const results=[];let cursor=0,nextStart=Date.now();
async function worker(){
 while(cursor<jobs.length){
  const {fixture,arm}=jobs[cursor++];const body=await readFile(resolve(root,'requests',fixture.id+'.json'));
  const startAt=nextStart;nextStart=Math.max(nextStart,Date.now())+spacing;await new Promise(resolve=>setTimeout(resolve,Math.max(0,startAt-Date.now())));
  if(digest(body)!==provenance.requests[fixture.id])throw Error('Frozen request changed: '+fixture.id);
  const calls=[];const env={FREE_AI:{fetch:async request=>{
   const began=Date.now();const call={status:0,milliseconds:0,model:null};calls.push(call);let response;try{response=await platform.env.FREE_AI.fetch(request);}catch(error){call.milliseconds=Date.now()-began;call.error=error.name;throw error;}let raw={};
   try{raw=await response.clone().json();}catch{}
   Object.assign(call,{status:response.status,milliseconds:Date.now()-began,model:raw.model??null,usage:raw.usage??null,retry_after:response.headers.get('retry-after'),error_type:raw.error?.type??null,error_code:raw.error?.code??null,finish_reason:raw.choices?.[0]?.finish_reason??null,writer_evidence:raw.choices?.[0]?.message?.content??null});return response;
  }}};
  const start=Date.now();let status,response;
  try{const result=await (arm==='baseline'?baseline:candidate).clipCaptions(new Request('https://caption-eval.local/api/clips/captions',{method:'POST',headers:{'Content-Type':'application/json'},body}),env);status=result.status;response=await result.json();}
  catch(error){status=0;response={error:error.name==='AbortError'?'aborted':error.message};}
  const row={case_id:fixture.id,arm,status,milliseconds:Date.now()-start,completed_at:new Date().toISOString(),request_sha256:digest(body),calls,response};
  results.push(row);await appendFile(resolve(run,'results.jsonl'),JSON.stringify(row)+'\n');
  console.log(JSON.stringify({case_id:fixture.id,arm,status,milliseconds:row.milliseconds,...(split==='development'?{response}:{})}));
 }
}
try{await Promise.all([worker(),worker()]);}
finally{await platform.dispose();}
const summary={split,cases:cases.length,arms:Object.fromEntries(arms.map(arm=>{const rows=results.filter(row=>row.arm===arm);const times=rows.map(row=>row.milliseconds).sort((a,b)=>a-b);return [arm,{attempted:rows.length,completed:rows.filter(row=>row.status===200&&row.response.decision==='captions').length,abstained:rows.filter(row=>row.status===200&&row.response.decision!=='captions').length,failed:rows.filter(row=>row.status!==200).length,p50_ms:times[Math.ceil(times.length*.5)-1],p95_ms:times[Math.ceil(times.length*.95)-1],gateway_requests:rows.reduce((sum,row)=>sum+row.calls.length,0),served_models:[...new Set(rows.flatMap(row=>row.calls.map(call=>call.model)).filter(Boolean))]}]})),human_preference_measured:false};
await writeFile(resolve(run,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));

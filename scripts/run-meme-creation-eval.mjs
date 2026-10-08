import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {catalogue} from '../worker/src/catalogue.stage3000.generated.mjs';
import {templateFor,creationMediaUrl,unchangedReactionFor} from '../worker/src/meme-templates.mjs';
import {composeMeme} from '../worker/src/meme-composition.mjs';
import {needsSeriousHandling,requiresFactualAnswer} from '../worker/src/classification.mjs';

const evaluationStartedAt=new Date().toISOString();
const [mode='coverage',output='.fleet-local/creation-eval/coverage.json',base='http://127.0.0.1:4331',onlyIds,pace]=process.argv.slice(2);
if(pace&&pace!=='paced')throw new Error('The optional pacing mode is paced.');
const readLines=async path=>(await readFile(path,'utf8')).trim().split('\n').map(JSON.parse);
const records=new Map(catalogue.map(record=>[record.id,record]));
const existing=await readLines('eval/relevance_stage3000_v1.jsonl');
const focused=JSON.parse(await readFile('eval/meme_creation_v1.json','utf8')).cases;
const request=body=>new Request('https://eval.local/api/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
async function waitForAdmission(vision=false) {
  const deadline=Date.now()+120000;let waited=0;
  while(Date.now()<deadline) {
    const response=await fetch('https://ai-gateway.sassmaker.com/v1/models',{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Could not inspect model availability.');
    const registry=await response.json();
    const eligible=registry.data?.filter(model=>model.type==='chat'&&model.enabled&&model.automatic_routing!==false&&model.json_mode&&(!vision||model.vision)&&model.headroom>0)??[];
    if(!eligible.length)throw new Error('No eligible automatic-routing model has daily headroom.');
    const delay=Math.min(...eligible.map(model=>Math.max(0,(model.cooldown_until??0)-Date.now())));
    if(!delay)return waited;
    const pause=Math.min(delay+500,30000);
    console.log(JSON.stringify({waiting_for:'automatic-json-routing',cooldown_ms:delay}));
    await new Promise(resolve=>setTimeout(resolve,pause));waited+=pause;
  }
  throw new Error('Eligible models remained in cooldown for two minutes; stopped without inference retries.');
}

let rows=[];let lastInferenceAt=0;
if(mode==='coverage') {
  for(const sample of existing) {
    const targets=(sample.acceptable_ids??[]).map(id=>records.get(id)).filter(Boolean);
    const record=targets.find(templateFor)??targets.find(creationMediaUrl)??targets[0]??records.get('drake-preference');
    let calls=0;
    const response=await composeMeme(request({comment:sample.context,candidate_id:record.id}),{FREE_AI:{fetch:async()=>{calls++;return new Response(null,{status:503});}}});
    const result=await response.json();
    rows.push({id:sample.id,title:sample.title,intent:sample.intent_label,candidate_id:record.id,coverage:sample.intent_label==='no_meme'?'no_meme':targets.some(templateFor)?'template':targets.some(record=>creationMediaUrl(record)&&!unchangedReactionFor(record))?'vision':'reference',inference_required:calls>0,decision:result.decision??null,status:response.status,correct_local_abstention:sample.intent_label==='no_meme'?result.decision==='none'&&calls===0:null});
  }
} else if(mode==='live'||mode==='holdout') {
  // Deliberate fixed bound: 16 focused cases + 3 supported original samples.
  // No retries, no paid/direct provider fallback, no arbitrary external URL.
  const extra=existing.filter(sample=>sample.intent_label==='humour'&&(sample.acceptable_ids??[]).some(id=>creationMediaUrl(records.get(id)))).slice(0,3).map(sample=>({id:sample.id,candidate_id:(sample.acceptable_ids??[]).find(id=>creationMediaUrl(records.get(id))),comment:sample.context,review:sample.title}));
  const suite=mode==='holdout'?JSON.parse(await readFile('eval/meme_creation_holdout_v2.json','utf8')).cases:[...focused,...extra];
  const samples=suite.filter(sample=>!onlyIds||onlyIds==='all'||onlyIds.split(',').includes(sample.id));
  if(!samples.length) throw new Error('No evaluation cases selected.');
  if(samples.length>(mode==='holdout'?32:19)) throw new Error('Evaluation call limit exceeded.');
  const url=new URL(base);if(!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Use the local evaluation adapter.');
  for(const sample of samples) {
    const record=records.get(sample.candidate_id);
    const inferenceRequired=!needsSeriousHandling(sample.comment)&&!requiresFactualAnswer(sample.comment)&&!unchangedReactionFor(record)&&creationMediaUrl(record);
    let admission_wait_ms=0;
    if(pace&&inferenceRequired) {
      // Respect the gateway's default 20/minute project bucket without raising
      // limits, changing client identity or retrying denied requests.
      const gap=Math.max(0,3200-(Date.now()-lastInferenceAt));
      if(gap){await new Promise(resolve=>setTimeout(resolve,gap));admission_wait_ms+=gap;}
      admission_wait_ms+=await waitForAdmission(!templateFor(record));
      lastInferenceAt=Date.now();
    }
    const response=await fetch(new URL('/api/create',url),{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(25000),body:JSON.stringify(sample)});
    const result=await response.json();
    rows.push({...sample,...result,admission_wait_ms});
    await mkdir(output.slice(0,output.lastIndexOf('/'))||'.',{recursive:true});
    await writeFile(output,JSON.stringify({mode,started_at:evaluationStartedAt,human_validated:false,rows},null,2)+'\n');
    console.log(JSON.stringify({id:sample.id,status:result.status,decision:result.result?.decision,model:result.attempts?.[0]?.model,tokens:result.attempts?.[0]?.usage?.total_tokens,captions:result.result?.layers?.map(layer=>layer.text)}));
  }
} else throw new Error('Use coverage, live or holdout mode.');
await mkdir(output.slice(0,output.lastIndexOf('/'))||'.',{recursive:true});
await writeFile(output,JSON.stringify({mode,started_at:evaluationStartedAt,created_at:new Date().toISOString(),human_validated:false,rows},null,2)+'\n');
if(mode==='coverage')console.log(JSON.stringify({cases:rows.length,coverage:rows.reduce((acc,row)=>(acc[row.coverage]=(acc[row.coverage]??0)+1,acc),{}),local_abstention_pass:rows.filter(row=>row.correct_local_abstention===true).length,local_abstention_gaps:rows.filter(row=>row.correct_local_abstention===false).map(row=>({id:row.id,title:row.title}))},null,2));

import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {randomInt,createHash} from 'node:crypto';
import {summarizeClipPreference} from './clip-caption-eval-gate.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(argument=>argument.replace(/^--/,'').split('=')));
const root=resolve(args.root??'.fleet-local/caption-quality-20261024');const run=resolve(root,'runs',args.run??'heldout-v1');
const port=Number(args.port??4342);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port.');
const raw=await readFile(resolve(run,'results.jsonl'));const results=raw.toString().trim().split('\n').map(JSON.parse);
const metadata=JSON.parse(await readFile(resolve(run,'run.json'),'utf8'));const manifestRaw=await readFile('eval/clip_caption_quality_v1.json');const manifest=JSON.parse(manifestRaw);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(metadata.split!=='heldout'||metadata.manifest_sha256!==hash(manifestRaw))throw Error('This review requires the unchanged held-out manifest.');
if(results.length!==60)throw Error('All sixty first attempts must be retained before review.');
const privatePath=resolve(run,'review-private.json');let sealed;
try{sealed=JSON.parse(await readFile(privatePath,'utf8'));if(sealed.results_sha256!==hash(raw))throw Error('Results changed after blind assignments were sealed.');}
catch(error){if(error.code!=='ENOENT')throw error;sealed={results_sha256:hash(raw),assignments:manifest.cases.map(fixture=>({case_id:fixture.id,...(randomInt(2)?{a:'baseline',b:'candidate'}:{a:'candidate',b:'baseline'})}))};await writeFile(privatePath,JSON.stringify(sealed,null,2)+'\n');}
const raterKind=metadata.synthetic?'agent-test':'human';
const reviewPath=resolve(run,'human-review.json');let review={version:1,results_sha256:sealed.results_sha256,ratings:[],rater:{kind:raterKind,attested:false}};
try{review=JSON.parse(await readFile(reviewPath,'utf8'));if(review.results_sha256!==sealed.results_sha256)throw Error('Votes refer to another result set.');}catch(error){if(error.code!=='ENOENT')throw error;}
const byResult=new Map(results.map(row=>[row.case_id+':'+row.arm,row]));const allowedMedia=new Set();
const data=manifest.cases.map(fixture=>{
  const assignment=sealed.assignments.find(item=>item.case_id===fixture.id);allowedMedia.add(fixture.candidate_id+'.mp4');
  return {id:fixture.id,situation:fixture.comment,audience:fixture.audience,tone:fixture.tone,media:'/media/'+fixture.candidate_id+'.mp4',sides:Object.fromEntries(['a','b'].map(side=>{const row=byResult.get(fixture.id+':'+assignment[side]);return [side,{available:row?.status===200&&row.response?.decision==='captions',captions:row?.response?.captions??[]}];}))};
});
const report=()=>summarizeClipPreference({manifest,assignments:sealed.assignments,ratings:review.ratings,results,rater:{...review.rater,kind:raterKind}});report();
const reply=(res,status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'"});res.end(type==='application/json'?JSON.stringify(body):body);};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(req.method==='GET'){
      if(url.pathname==='/')return reply(res,200,await readFile(new URL('./fixtures/clip-caption-review.html',import.meta.url)),'text/html; charset=utf-8');
      if(url.pathname==='/review.js')return reply(res,200,await readFile(new URL('./fixtures/clip-caption-review.js',import.meta.url)),'text/javascript');
      if(url.pathname==='/clip-export.js')return reply(res,200,await readFile('worker/public/clip-export.js'),'text/javascript');
      if(url.pathname==='/data')return reply(res,200,{cases:data,ratings:review.ratings,finished:review.rater.attested});
      if(url.pathname.startsWith('/media/')&&allowedMedia.has(basename(url.pathname)))return reply(res,200,await readFile(resolve(root,'media',basename(url.pathname))),'video/mp4');
      return reply(res,404,{error:'Not found.'});
    }
    if(req.method!=='POST'||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='application/json')return reply(res,403,{error:'Use the local review page.'});
    let length=0,parts=[];for await(const part of req){length+=part.length;if(length>64000)return reply(res,413,{error:'Request too large.'});parts.push(part);}
    const body=JSON.parse(Buffer.concat(parts).toString());
    if(url.pathname==='/vote'){
      if(review.rater.attested)return reply(res,409,{error:'This review is already finished.'});
      if(!manifest.cases.some(fixture=>fixture.id===body.case_id)||!['a','b','tie','neither'].includes(body.choice))return reply(res,400,{error:'Choose A, B, tie or neither.'});
      review.ratings=review.ratings.filter(vote=>vote.case_id!==body.case_id).concat({case_id:body.case_id,choice:body.choice,recorded_at:new Date().toISOString()});
    }else if(url.pathname==='/finish'){
      if(body.attested!==true||review.ratings.length!==30)return reply(res,400,{error:'Review all thirty pairs and confirm these are your choices.'});
      review.rater={kind:raterKind,attested:true,attested_at:new Date().toISOString(),method:'Owner choices entered in the local blind review page.'};
    }else return reply(res,404,{error:'Not found.'});
    const summary=report();await writeFile(reviewPath,JSON.stringify(review,null,2)+'\n');await writeFile(resolve(run,'preference-report.json'),JSON.stringify(summary,null,2)+'\n');
    return reply(res,200,{saved:review.ratings.length,finished:review.rater.attested});
  }catch(error){return reply(res,400,{error:error.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({review_url:'http://127.0.0.1:'+port,blind_pairs:data.length,human_votes:review.ratings.length,claim_ready:report().claim_ready})));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));

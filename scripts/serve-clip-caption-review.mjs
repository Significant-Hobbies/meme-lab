import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {randomInt,createHash} from 'node:crypto';
import {captionResultValid,summarizeClipPreference} from './clip-caption-eval-gate.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(argument=>argument.replace(/^--/,'').split('=')));
const root=resolve(args.root??'.fleet-local/caption-quality-20261024');const run=resolve(root,'runs',args.run??'heldout-v1');
const port=Number(args.port??4342);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port.');
const secondary=args.comparison==='cliphub'?JSON.parse(await readFile(resolve(root,'cliphub-results.json'),'utf8')):null;
if(args.comparison&&!secondary)throw Error('Unknown comparison.');
const raw=await readFile(resolve(run,'results.jsonl'));const results=raw.toString().trim().split('\n').map(JSON.parse);
const metadata=JSON.parse(await readFile(resolve(run,'run.json'),'utf8'));const manifestRaw=await readFile('eval/clip_caption_quality_v1.json');const manifest=JSON.parse(manifestRaw);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(metadata.split!=='heldout'||metadata.manifest_sha256!==hash(manifestRaw))throw Error('This review requires the unchanged held-out manifest.');
if(results.length!==60)throw Error('All sixty first attempts must be retained before review.');
const fixtures=secondary?manifest.cases.filter(fixture=>secondary.cases.some(row=>row.case_id===fixture.id)):manifest.cases;
if(secondary&&(fixtures.length!==secondary.cases.length||fixtures.length!==10))throw Error('Expected ten matched secondary cases.');
if(secondary&&secondary.cases.some(row=>!/^cliphub-(Happy|Proud|Shocked|Sad)\.mp4$/.test(row.media)||!Array.isArray(row.captions)||![0,5].includes(row.captions.length)||row.captions.some(text=>typeof text!=='string'||!text.trim()||text.length>2000)))throw Error('Invalid saved secondary result.');
const otherArm=secondary?'cliphub':'baseline',reviewRun=secondary?resolve(run,'cliphub-review'):run;await mkdir(reviewRun,{recursive:true});
const resultsHash=hash(secondary?Buffer.concat([raw,Buffer.from(JSON.stringify(secondary))]):raw);
const privatePath=resolve(reviewRun,'review-private.json');let sealed;
try{sealed=JSON.parse(await readFile(privatePath,'utf8'));if(sealed.results_sha256!==resultsHash)throw Error('Results changed after blind assignments were sealed.');}
catch(error){if(error.code!=='ENOENT')throw error;sealed={results_sha256:resultsHash,assignments:fixtures.map(fixture=>({case_id:fixture.id,...(randomInt(2)?{a:otherArm,b:'candidate'}:{a:'candidate',b:otherArm})}))};await writeFile(privatePath,JSON.stringify(sealed,null,2)+'\n');}
const raterKind=metadata.synthetic?'agent-test':'human';
const reviewPath=resolve(reviewRun,'human-review.json');let review={version:1,results_sha256:sealed.results_sha256,ratings:[],rater:{kind:raterKind,attested:false}};
try{review=JSON.parse(await readFile(reviewPath,'utf8'));if(review.results_sha256!==sealed.results_sha256)throw Error('Votes refer to another result set.');}catch(error){if(error.code!=='ENOENT')throw error;}
const byResult=new Map(results.map(row=>[row.case_id+':'+row.arm,row]));const allowedMedia=new Map();
const mediaUrl=filename=>{const alias=hash(Buffer.from(filename)).slice(0,20)+'.mp4';allowedMedia.set(alias,filename);return '/media/'+alias;};
if(secondary)for(const row of secondary.cases)byResult.set(row.case_id+':cliphub',{status:row.captions.length?200:0,response:{decision:'captions',captions:row.captions},media:row.media});
const data=fixtures.map(fixture=>{
  const assignment=sealed.assignments.find(item=>item.case_id===fixture.id);
  return {id:fixture.id,situation:fixture.comment,audience:fixture.audience,tone:fixture.tone,media:mediaUrl(fixture.candidate_id+'.mp4'),sides:Object.fromEntries(['a','b'].map(side=>{const row=byResult.get(fixture.id+':'+assignment[side]);return [side,{media:row?.media?mediaUrl(row.media):undefined,available:assignment[side]==='cliphub'?row?.status===200:captionResultValid(row),captions:row?.response?.captions??[]}];}))};
});
const completeData=data.filter(fixture=>Object.values(fixture.sides).every(side=>side.available)&&(secondary||byResult.get(fixture.id+':candidate').request_sha256===byResult.get(fixture.id+':baseline').request_sha256));
const reviewableIds=new Set(completeData.map(fixture=>fixture.id));
const reviewPolicy='complete_pairs_v2';
const policyPath=resolve(reviewRun,'review-policy.json');
try{const policy=JSON.parse(await readFile(policyPath,'utf8'));if(policy.id!==reviewPolicy)throw Error('Unexpected review policy.');}catch(error){if(error.code!=='ENOENT')throw error;if(review.ratings.length||review.rater.attested)throw Error('Do not change review policy after human voting starts.');await writeFile(policyPath,JSON.stringify({id:reviewPolicy,recorded_at:new Date().toISOString(),human_votes_at_amendment:0,reason:'Exclude incomplete pairs from voting; preserve all attempts, the original denominator, twenty-one-win threshold and reliability gate.'},null,2)+'\n');}
const report=(state=review)=>secondary?secondaryReport(state):summarizeClipPreference({manifest,assignments:sealed.assignments,ratings:state.ratings,results,rater:{...state.rater,kind:raterKind},reviewPolicy});report();
let saves=Promise.resolve();
function persist(update){const task=saves.then(async()=>{
  const next=update(structuredClone(review)),summary=report(next);
  await writeFile(reviewPath+'.tmp',JSON.stringify(next,null,2)+'\n');await rename(reviewPath+'.tmp',reviewPath);review=next;
  let reportSaved=true;const path=resolve(reviewRun,'preference-report.json');
  try{await writeFile(path+'.tmp',JSON.stringify(summary,null,2)+'\n');await rename(path+'.tmp',path);}catch{reportSaved=false;}
  return reportSaved;
});saves=task.catch(()=>{});return task;}
function secondaryReport(state){const human=raterKind==='human'&&state.rater.attested;const counts={candidate:0,cliphub:0,tie:0,neither:0,unavailable:fixtures.length-completeData.length};let reviewed=0;for(const vote of state.ratings){if(!reviewableIds.has(vote.case_id))continue;reviewed++;const assignment=sealed.assignments.find(row=>row.case_id===vote.case_id);if(human)counts[vote.choice==='a'||vote.choice==='b'?assignment[vote.choice]:vote.choice]++;}return {claim_ready:false,human_review_complete:human&&completeData.length>0&&reviewed===completeData.length,denominator:fixtures.length,human_votes:human?reviewed:0,reviewable_pairs:completeData.length,preferences:counts,scope:'Descriptive secondary comparison: matched situations, audiences and styles, different footage, three versus five options. No universal superiority claim or predeclared pass threshold.'};}
const reply=(res,status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'"});res.end(type==='application/json'?JSON.stringify(body):body);};
const server=createServer(async(req,res)=>{
  try{
    const host=req.headers.host;
    const hostCount=req.rawHeaders.filter((_,index)=>index%2===0&&req.rawHeaders[index].toLowerCase()==='host').length;
    if(hostCount!==1||!['127.0.0.1:'+port,'localhost:'+port].includes(host))return reply(res,403,{error:'Use the local review page.'});
    if(req.headers['sec-fetch-site']!==undefined&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return reply(res,403,{error:'Use the local review page.'});
    const origin='http://'+host;
    if(req.headers.origin!==undefined&&req.headers.origin!==origin)return reply(res,403,{error:'Use the local review page.'});
    const url=new URL(req.url,origin);
    if(url.origin!==origin)return reply(res,403,{error:'Use the local review page.'});
    if(req.method==='GET'){
      if(url.pathname==='/')return reply(res,200,await readFile(new URL('./fixtures/clip-caption-review.html',import.meta.url)),'text/html; charset=utf-8');
      if(url.pathname==='/review.js')return reply(res,200,await readFile(new URL('./fixtures/clip-caption-review.js',import.meta.url)),'text/javascript');
      if(url.pathname==='/clip-export.js')return reply(res,200,await readFile('worker/public/clip-export.js'),'text/javascript');
      if(url.pathname==='/data')return reply(res,200,{cases:completeData,denominator:fixtures.length,excluded_pairs:fixtures.length-completeData.length,ratings:review.ratings.filter(vote=>reviewableIds.has(vote.case_id)),finished:review.rater.attested,description:secondary?'Same situation, audience and style, with different footage. Compare all three or five caption options. These are silent previews. Version names are hidden.':undefined});
      if(url.pathname.startsWith('/media/')&&allowedMedia.has(basename(url.pathname)))return reply(res,200,await readFile(resolve(root,'media',allowedMedia.get(basename(url.pathname)))),'video/mp4');
      return reply(res,404,{error:'Not found.'});
    }
    if(req.method!=='POST'||req.headers.origin!==origin||req.headers['content-type']!=='application/json')return reply(res,403,{error:'Use the local review page.'});
    let length=0,parts=[];for await(const part of req){length+=part.length;if(length>64000)return reply(res,413,{error:'Request too large.'});parts.push(part);}
    const body=JSON.parse(Buffer.concat(parts).toString());
    if(!['/vote','/finish'].includes(url.pathname))return reply(res,404,{error:'Not found.'});
    const reportSaved=await persist(next=>{
      if(url.pathname==='/vote'){
        if(next.rater.attested)throw Object.assign(Error('This review is already finished.'),{status:409});
        if(!reviewableIds.has(body.case_id)||!['a','b','tie','neither'].includes(body.choice))throw Object.assign(Error('Choose A, B, tie or neither.'),{status:400});
        next.ratings=next.ratings.filter(vote=>vote.case_id!==body.case_id).concat({case_id:body.case_id,choice:body.choice,recorded_at:new Date().toISOString()});
      }else{
        if(body.attested!==true||!completeData.length||!completeData.every(fixture=>next.ratings.some(vote=>vote.case_id===fixture.id)))throw Object.assign(Error('Review every pair and confirm these are your choices.'),{status:400});
        next.rater={kind:raterKind,attested:true,attested_at:new Date().toISOString(),method:'Owner choices entered in the local blind review page.'};
      }
      return next;
    });
    return reply(res,200,{saved:review.ratings.length,finished:review.rater.attested,report_saved:reportSaved,description:secondary?'Same situation, audience and style, with different footage. Compare all three or five caption options. These are silent previews. Version names are hidden.':undefined});
  }catch(error){const status=[400,409].includes(error.status)?error.status:error instanceof SyntaxError?400:500;return reply(res,status,{error:status===500?'Could not complete the request. Try again.':error instanceof SyntaxError?'Invalid JSON.':error.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({review_url:'http://127.0.0.1:'+port,blind_pairs:completeData.length,excluded_pairs:fixtures.length-completeData.length,human_votes:review.ratings.length,claim_ready:report().claim_ready})));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));

import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {randomInt,createHash} from 'node:crypto';
import {summarizeClipPreference} from './clip-caption-eval-gate.mjs';

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
  return {id:fixture.id,situation:fixture.comment,audience:fixture.audience,tone:fixture.tone,media:mediaUrl(fixture.candidate_id+'.mp4'),sides:Object.fromEntries(['a','b'].map(side=>{const row=byResult.get(fixture.id+':'+assignment[side]);return [side,{media:row?.media?mediaUrl(row.media):undefined,available:row?.status===200&&row.response?.decision==='captions',captions:row?.response?.captions??[]}];}))};
});
const report=()=>secondary?secondaryReport():summarizeClipPreference({manifest,assignments:sealed.assignments,ratings:review.ratings,results,rater:{...review.rater,kind:raterKind}});report();
let saves=Promise.resolve();
function persist(summary){const snapshot=JSON.stringify(review,null,2)+'\n';const task=saves.then(async()=>{for(const [path,body] of [[reviewPath,snapshot],[resolve(reviewRun,'preference-report.json'),JSON.stringify(summary,null,2)+'\n']]){await writeFile(path+'.tmp',body);await rename(path+'.tmp',path);}});saves=task.catch(()=>{});return task;}
function secondaryReport(){const human=raterKind==='human'&&review.rater.attested;const counts={candidate:0,cliphub:0,tie:0,neither:0,unavailable:0};for(const vote of review.ratings){const assignment=sealed.assignments.find(row=>row.case_id===vote.case_id);const available=['candidate','cliphub'].every(arm=>byResult.get(vote.case_id+':'+arm)?.status===200);if(!available){counts.unavailable++;continue;}if(human)counts[vote.choice==='a'||vote.choice==='b'?assignment[vote.choice]:vote.choice]++;}return {claim_ready:false,human_review_complete:human&&review.ratings.length===fixtures.length,denominator:fixtures.length,human_votes:human?review.ratings.length:0,preferences:counts,scope:'Descriptive secondary comparison: matched situations, audiences and styles, different footage, three versus five options. No universal superiority claim or predeclared pass threshold.'};}
const reply=(res,status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'"});res.end(type==='application/json'?JSON.stringify(body):body);};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(req.method==='GET'){
      if(url.pathname==='/')return reply(res,200,await readFile(new URL('./fixtures/clip-caption-review.html',import.meta.url)),'text/html; charset=utf-8');
      if(url.pathname==='/review.js')return reply(res,200,await readFile(new URL('./fixtures/clip-caption-review.js',import.meta.url)),'text/javascript');
      if(url.pathname==='/clip-export.js')return reply(res,200,await readFile('worker/public/clip-export.js'),'text/javascript');
      if(url.pathname==='/data')return reply(res,200,{cases:data,ratings:review.ratings,finished:review.rater.attested,description:secondary?'Same situation, audience and style, with different footage. Compare all three or five caption options. These are silent previews. Version names are hidden.':undefined});
      if(url.pathname.startsWith('/media/')&&allowedMedia.has(basename(url.pathname)))return reply(res,200,await readFile(resolve(root,'media',allowedMedia.get(basename(url.pathname)))),'video/mp4');
      return reply(res,404,{error:'Not found.'});
    }
    if(req.method!=='POST'||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)||req.headers['content-type']!=='application/json')return reply(res,403,{error:'Use the local review page.'});
    let length=0,parts=[];for await(const part of req){length+=part.length;if(length>64000)return reply(res,413,{error:'Request too large.'});parts.push(part);}
    const body=JSON.parse(Buffer.concat(parts).toString());
    if(url.pathname==='/vote'){
      if(review.rater.attested)return reply(res,409,{error:'This review is already finished.'});
      if(!fixtures.some(fixture=>fixture.id===body.case_id)||!['a','b','tie','neither'].includes(body.choice))return reply(res,400,{error:'Choose A, B, tie or neither.'});
      review.ratings=review.ratings.filter(vote=>vote.case_id!==body.case_id).concat({case_id:body.case_id,choice:body.choice,recorded_at:new Date().toISOString()});
    }else if(url.pathname==='/finish'){
      if(body.attested!==true||review.ratings.length!==fixtures.length)return reply(res,400,{error:'Review every pair and confirm these are your choices.'});
      review.rater={kind:raterKind,attested:true,attested_at:new Date().toISOString(),method:'Owner choices entered in the local blind review page.'};
    }else return reply(res,404,{error:'Not found.'});
    const summary=report();await persist(summary);
    return reply(res,200,{saved:review.ratings.length,finished:review.rater.attested,description:secondary?'Same situation, audience and style, with different footage. Compare all three or five caption options. These are silent previews. Version names are hidden.':undefined});
  }catch(error){return reply(res,400,{error:error.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({review_url:'http://127.0.0.1:'+port,blind_pairs:data.length,human_votes:review.ratings.length,claim_ready:report().claim_ready})));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));

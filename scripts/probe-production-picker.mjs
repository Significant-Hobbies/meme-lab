import {pathToFileURL} from 'node:url';
import {reportPickerProbe} from './report-production-picker.mjs';

export const pickerCases=[
  {id:'general',comment:'I opened the fridge three times hoping new snacks would appear.'},
  {id:'perspectives',comment:'I told my coworker the deadline was today and he started another coffee break.'}
];

export async function probePicker(origin='https://memes.significanthobbies.com',fetchImpl=fetch) {
  const results=[];
  for(const fixture of pickerCases) {
    const started=Date.now();
    try {
      const response=await fetchImpl(new URL('/api/recommend',origin),{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({comment:fixture.comment}),signal:AbortSignal.timeout(30_000)
      });
      const body=await response.json();
      const candidates=body?.candidates;
      const valid=response.ok&&body.decision==='meme'&&Array.isArray(candidates)&&candidates.length===5
        &&new Set(candidates.map(candidate=>candidate.id)).size===5
        &&candidates.every(candidate=>typeof candidate.id==='string'&&candidate.id&&typeof candidate.media_url==='string'&&/^https:\/\//.test(candidate.media_url)&&Number.isFinite(candidate.score));
      const perspectives=new Set((candidates??[]).map(candidate=>candidate.perspective));
      const perspectives_complete=['self','other','situation'].every(perspective=>perspectives.has(perspective));
      const degraded=body.degraded===true||body.confidence==='low'||(fixture.id==='perspectives'&&!perspectives_complete);
      const confidence=['high','medium','low'].includes(body.confidence)?body.confidence:null;
      const ranking_mode=['general','perspective','general_fallback','retrieval_fallback'].includes(body.ranking_mode)?body.ranking_mode:null;
      results.push({case:fixture.id,status:valid&&!degraded?'passed':'failed',status_code:response.status,degraded,fallback:body.degraded===true,confidence,ranking_mode,...(fixture.id==='perspectives'?{perspectives_complete}:{}),duration_ms:Date.now()-started});
    } catch {
      results.push({case:fixture.id,status:'failed',reason:'request_or_response_failed',duration_ms:Date.now()-started});
    }
  }
  return {status:results.every(result=>result.status==='passed')?'passed':'failed',results};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=await probePicker(process.argv[2]);
  const reporting=await reportPickerProbe(result,{
    key:process.env.APP_HEALTH_INGEST_KEY,
    release:process.env.GITHUB_SHA,
    runUrl:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  });
  console.log(JSON.stringify({...result,app_health:reporting},null,2));
  if(result.status!=='passed'||reporting.status==='failed'
    ||(process.env.APP_HEALTH_REPORT_REQUIRED==='1'&&reporting.status!=='accepted')) process.exitCode=1;
}

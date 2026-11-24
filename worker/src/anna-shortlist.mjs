import {retrieveCandidates} from './retrieval.mjs';
import {presentSelection} from './recommendation.mjs';
import {hasMultiplePerspectives,needsSeriousHandling,requiresFactualAnswer} from './classification.mjs';
import {BudgetUnavailableError} from './ai-budget.mjs';
import {CATALOGUE_SUGGESTIONS,suggestCatalogueClips} from './catalogue-suggestions.mjs';
import {reportPickerHealth,requestTrafficClass} from './recommendation-health.mjs';

import {annaHeaders,annaJson as json,readAnnaBody,annaAdmission} from './anna-http.mjs';

// Public catalogue retrieval. Personal data and AI quota are handled by Anna.
export async function annaShortlist(request,env,ctx) {
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:annaHeaders});
  if(request.method!=='POST')return json({error:'Use POST.'},405);
  const parsed=await readAnnaBody(request);
  if(parsed.error)return parsed.error;
  const body=parsed.body;
  const comment=typeof body?.comment==='string'?body.comment.trim():'';
  if(!comment||comment.length>1000) return json({error:'Paste a comment within 1,000 characters.'},400);
  if(requiresFactualAnswer(comment)) return json({decision:'none',confidence:'low',none_reason:'This calls for a serious response, not a meme.',candidates:[]});
  const denied=await annaAdmission(request,env,'shortlist');
  if(denied)return denied;
  const started=Date.now();
  let records;
  let local=false;
  try {
    records=await retrieveCandidates(env,comment,30);
  } catch(error) {
    if(error instanceof BudgetUnavailableError) {
      records=suggestCatalogueClips(comment);
      local=records.length>0;
    }
    if(!local) {
      // Do not log or persist the submitted comment.
      console.error(JSON.stringify({event:'anna_shortlist',status:'unavailable'}));
      const headers=error instanceof BudgetUnavailableError?{'Retry-After':'60'}:{};
      return json({error:'Meme search is temporarily unavailable. Try again shortly.'},503,headers);
    }
    reportPickerHealth(env,ctx,'recommendation.degraded',{
      route:'/api/anna/shortlist',ranking_mode:CATALOGUE_SUGGESTIONS,failure_kind:error.reason,
      duration_ms:Date.now()-started,stage:'server',traffic_class:requestTrafficClass(request)
    });
  }
  const publicCandidates=presentSelection({decision:'meme',confidence:'low',candidates:records.map(record=>({id:record.id,score:0}))},{assetBaseUrl:request.url}).candidates;
  return json({
    decision:'shortlist',
    ...(local?{retrieval_mode:'curated_catalogue'}:{}),
    serious_hint:needsSeriousHandling(comment),
    perspectives:hasMultiplePerspectives(comment),
    candidates:records.map((record,index)=>({
      ...publicCandidates[index],
      message:record.message,
      relational_pattern:record.relational_pattern,
      example_context:record.example_context,
      near_miss_context:record.near_miss_context
    }))
  });
}

const events=new Set(['degraded','shown','detail_open_requested','candidate_selected','feedback_saved','download_requested','export_failed']);
const modes=new Set(['general','perspective','general_fallback','retrieval_fallback']);

export function recommendationTrafficClass(search='') {
  const params=new URLSearchParams(search);
  return params.get('fleet_qa')==='1'?'qa':params.get('fleet_internal')==='1'?'internal':'unclassified';
}

export function recommendationOutcomeProps(recommendation,candidate,{search='',verdict,durationMs}={}) {
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(recommendation?.request_id??''))return null;
  const props={
    recommendation_id:recommendation.request_id,
    stage:'browser',
    traffic_class:recommendationTrafficClass(search),
    decision:recommendation.decision==='meme'?'meme':recommendation.decision==='none'?'none':'unknown',
    ranking_mode:modes.has(recommendation.ranking_mode)?recommendation.ranking_mode:'unknown',
    degraded:recommendation.degraded===true,
    candidate_count:Array.isArray(recommendation.candidates)?Math.min(recommendation.candidates.length,5):0,
  };
  if(Number.isInteger(candidate?.rank)&&candidate.rank>=1&&candidate.rank<=5)props.candidate_rank=candidate.rank;
  if(verdict==='landed'||verdict==='missed')props.verdict=verdict;
  if(Number.isFinite(durationMs)&&durationMs>=0)props.duration_ms=Math.min(Math.round(durationMs),3600000);
  return props;
}

export function reportRecommendationOutcome(event,recommendation,candidate,{search=globalThis.location?.search??'',log=globalThis.appHealthLog,verdict,durationMs}={}) {
  if(!events.has(event)||typeof log!=='function')return false;
  const props=recommendationOutcomeProps(recommendation,candidate,{search,verdict,durationMs});
  if(!props)return false;
  try {
    log(`recommendation.${event}`,{level:event==='export_failed'||event==='degraded'?'warn':'info',title:'Meme recommendation outcome',props});
    return true;
  } catch {return false;}
}

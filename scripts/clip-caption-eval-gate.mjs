export function captionResultValid(row) {
  const captions=row?.response?.captions;
  return row?.status===200&&row.response.decision==='captions'&&Array.isArray(captions)&&captions.length===3&&new Set(captions).size===3&&captions.every(text=>typeof text==='string'&&text.trim()&&Array.from(text).length<=140);
}

export function summarizeClipPreference({manifest,assignments,ratings,results,rater}) {
  const ids=new Set(manifest.cases.map(fixture=>fixture.id));
  if(ids.size!==30||manifest.protocol.denominator!==30||manifest.protocol.minimum_human_candidate_wins!==21)throw Error('Expected the frozen thirty-case protocol.');
  const byCase=new Map(),byResult=new Map(),votes=new Map();
  for(const assignment of assignments){
    if(!ids.has(assignment.case_id)||byCase.has(assignment.case_id)||![assignment.a,assignment.b].includes('candidate')||![assignment.a,assignment.b].includes('baseline'))throw Error('Invalid or duplicate blind assignment.');
    byCase.set(assignment.case_id,assignment);
  }
  if(byCase.size!==30)throw Error('Every frozen case needs a blind assignment.');
  for(const row of results){
    const key=row.case_id+':'+row.arm;
    if(!ids.has(row.case_id)||!['candidate','baseline'].includes(row.arm)||byResult.has(key))throw Error('Unexpected or repeated inference result.');
    byResult.set(key,row);
  }
  for(const vote of ratings){
    if(!ids.has(vote.case_id)||votes.has(vote.case_id)||!['a','b','tie','neither'].includes(vote.choice))throw Error('Invalid or duplicate preference vote.');
    votes.set(vote.case_id,vote);
  }
  const human=rater?.kind==='human'&&rater?.attested===true;
  let candidateWins=0,baselineWins=0,ties=0,neither=0,unavailable=0;
  for(const id of ids){
    const a=byResult.get(id+':baseline'),b=byResult.get(id+':candidate');
    const valid=captionResultValid(a)&&captionResultValid(b)&&typeof a.request_sha256==='string'&&a.request_sha256===b.request_sha256;
    if(!valid){unavailable++;continue;}
    const vote=votes.get(id);if(!vote||!human)continue;
    if(vote.choice==='tie'){ties++;continue;}if(vote.choice==='neither'){neither++;continue;}
    if(byCase.get(id)[vote.choice]==='candidate')candidateWins++;else baselineWins++;
  }
  const completion=Object.fromEntries(['baseline','candidate'].map(arm=>[arm,[...ids].filter(id=>captionResultValid(byResult.get(id+':'+arm))).length]));
  const allAttempts=byResult.size===60;
  const inputIntegrity=[...ids].every(id=>{const a=byResult.get(id+':baseline'),b=byResult.get(id+':candidate');return typeof a?.request_sha256==='string'&&a.request_sha256===b?.request_sha256;});
  const reliabilityGate=allAttempts&&completion.candidate>=completion.baseline;
  const humanComplete=human&&votes.size===30;
  const ready=humanComplete&&candidateWins>=21&&reliabilityGate&&inputIntegrity;
  return {claim_ready:ready,human_review_complete:humanComplete,human_votes:human?votes.size:0,denominator:30,candidate_wins:candidateWins,baseline_wins:baselineWins,ties,neither,unavailable_pairs:unavailable,candidate_preference:candidateWins/30,completion,reliability_gate:reliabilityGate,input_integrity:inputIntegrity,
    state:!humanComplete?'awaiting_human_review':ready?'bounded_preference_gate_passed':'preference_gate_not_passed',
    scope:'Thirty assistant-authored held-out situations; automatic gateway routing. Preference and one-run completion counts do not establish universal humour quality or sustained reliability.'};
}

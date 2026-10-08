import {randomUUID} from 'node:crypto';

export async function reportPickerProbe(result,{key,fetchImpl=fetch,runUrl,release,timeoutMs=3000}={}) {
  if(!key) return {status:'unconfigured'};
  if(!['passed','failed'].includes(result?.status)||!Array.isArray(result?.results))
    return {status:'failed',reason:'invalid_probe_result'};
  const failed=result.status==='failed';
  const props={monitor:'public-picker',synthetic:true,route:'/api/recommend'};
  for(const fixture of result.results) {
    if(!['general','perspectives'].includes(fixture.case)) continue;
    props[`${fixture.case}_status`]=fixture.status==='passed'?'passed':'failed';
    if(Number.isInteger(fixture.status_code)&&fixture.status_code>=100&&fixture.status_code<=599)
      props[`${fixture.case}_status_code`]=fixture.status_code;
    if(typeof fixture.degraded==='boolean') props[`${fixture.case}_degraded`]=fixture.degraded;
    if(typeof fixture.fallback==='boolean') props[`${fixture.case}_fallback`]=fixture.fallback;
    if(['high','medium','low'].includes(fixture.confidence)) props[`${fixture.case}_confidence`]=fixture.confidence;
    if(['general','perspective','general_fallback','retrieval_fallback'].includes(fixture.ranking_mode)) props[`${fixture.case}_ranking_mode`]=fixture.ranking_mode;
    if(fixture.case==='perspectives'&&typeof fixture.perspectives_complete==='boolean') props.perspectives_complete=fixture.perspectives_complete;
    if(Number.isFinite(fixture.duration_ms)&&fixture.duration_ms>=0)
      props[`${fixture.case}_duration_ms`]=Math.min(Math.round(fixture.duration_ms),600000);
  }
  if(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/.test(runUrl??'')) props.run_url=runUrl;
  if(/^[a-f0-9]{40}$/.test(release??'')) props.release=release;
  try {
    const response=await fetchImpl('https://ingest.sassmaker.com/v1/logs',{
      method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},
      signal:AbortSignal.timeout(Number.isInteger(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,3000):3000),
      body:JSON.stringify({batch_id:randomUUID(),schema_version:'v1',environment:'production',logs:[{
        log_id:randomUUID(),timestamp:Date.now(),event:failed?'production.probe.failed':'production.probe.passed',
        level:failed?'error':'info',title:failed?'Public meme picker check failed':'Public meme picker check passed',props
      }]})
    });
    await response.body?.cancel();
    return {status:response.ok?'accepted':'failed',status_code:response.status};
  } catch {
    return {status:'failed',reason:'delivery_failed'};
  }
}

import {pingFor} from './ping.mjs';

export function classifierUnavailable(error) {
  return /\bHTTP (?:429|500|502|503|504)\b/.test(error instanceof Error?error.message:'')
    ||/^(?:Free AI (?:classifier|gateway) returned (?:invalid|an unexpected|empty)|Classifier returned (?:an unexpected|incomplete|flat)|Free AI classifier could not produce)/.test(error instanceof Error?error.message:'')
    ||error?.name==='TimeoutError'||error?.name==='AbortError';
}

// Caller-authored fields only: no submitted comments, headers or provider bodies.
export function reportPickerHealth(env,ctx,event,props) {
  const failed=event==='endpoint.failed';
  console[failed?'error':'warn'](JSON.stringify({event,...props}));
  if(!env.APP_HEALTH_INGEST_KEY) {
    console.warn(JSON.stringify({event:'app_health_unconfigured',route:props.route??'/api/recommend'}));
    return;
  }
  if(typeof ctx?.waitUntil==='function') {
    ctx.waitUntil(pingFor(env)(event,{level:failed?'error':'warn',title:failed?'API request failed':'Meme picker degraded',props}));
  }
}

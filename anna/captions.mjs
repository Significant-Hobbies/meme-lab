import {annaCaptionRequest,normalizeAnnaCaptionCompletion} from './caption-completion.mjs';
import {validateComposition} from '../worker/src/caption-core.mjs';

export async function composeOnAnna(body,{anna,fetchImpl=fetch,signal}={}) {
  signal?.throwIfAborted();
  const response=await fetchImpl('https://memes.significanthobbies.com/api/anna/composition',{
    method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',
    body:JSON.stringify(body),signal:signal??AbortSignal.timeout(20000)
  });
  if(!response.ok)throw new Error('Caption preparation is unavailable. Try again shortly.');
  const plan=await response.json();
  signal?.throwIfAborted();
  if(plan.result)return plan.result;
  if(!plan.record||plan.record.id!==body.candidate_id||![800,1200].includes(plan.max_tokens)||!Array.isArray(plan.messages))throw new Error('Caption preparation returned an invalid template.');
  if(typeof anna?.llm?.complete!=='function')throw new Error('Open Meme Lab inside Anna and enable its AI access.');
  let completion;
  try {
    // One host request; Anna owns routing and quotas. No website AI fallback.
    completion=await anna.llm.complete(annaCaptionRequest(plan),{timeoutMs:20000});
  }catch(error){
    signal?.throwIfAborted();
    if(/quota|credit|balance/i.test(error?.message??''))throw new Error('Your Anna AI quota is unavailable. Check your credits or BYOK settings.');
    if(/grant|permission|not.granted/i.test(error?.message??''))throw new Error('Enable Meme Lab’s AI permission in Anna.');
    throw new Error('Anna could not write the captions. Your existing edits are still here.');
  }
  signal?.throwIfAborted();
  try {
    const normalized=normalizeAnnaCaptionCompletion(completion);
    const draft=validateComposition(JSON.parse(normalized.choices[0].message.content),plan.record,plan.profile);
    return {...draft,source_url:plan.record.source_url,media_status:plan.record.media_status,media_url:`/api/create/media/${encodeURIComponent(plan.record.id)}`};
  }catch{throw new Error('Anna returned an incomplete caption layout. Try another template or edit the text.');}
}

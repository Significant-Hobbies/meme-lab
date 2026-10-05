import {catalogue} from './catalogue.stage3000.generated.mjs';
import {needsSeriousHandling,requiresFactualAnswer} from './classification.mjs';
import {creationMediaUrl,templateFor,unchangedReactionFor} from './meme-templates.mjs';

const byId=new Map(catalogue.map(record=>[record.id,record]));
const MAX_IMAGE_BYTES=6*1024*1024;
export const CAPTION_MODEL='auto';
const perspectives=new Set(['best_match','self','other','situation']);
import {compositionPrompt,validateComposition,captionPerspective} from './caption-core.mjs';
export {compositionPrompt,validateComposition} from './caption-core.mjs';
import {annaHeaders,annaJson,readAnnaBody,annaAdmission} from './anna-http.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
class InputError extends Error {
  constructor(status,message) { super(message);this.status=status; }
}
export async function boundedBytes(stream,limit) {
  const reader=stream?.getReader();
  if(!reader) throw new InputError(400,'Expected a request body.');
  const chunks=[];let length=0;
  try {
    while(true) {
      const {done,value}=await reader.read();if(done)break;
      length+=value.byteLength;
      if(length>limit) {await reader.cancel();throw new InputError(413,'Request too large.');}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

export function planComposition(body) {
  if(!body||typeof body.comment!=='string'||!body.comment.trim()||body.comment.trim().length>1000) throw new InputError(400,'Use a situation of 1–1,000 characters.');
  const record=typeof body.candidate_id==='string'?byId.get(body.candidate_id):null;
  if(!record) throw new InputError(400,'Unknown meme.');
  const perspective=captionPerspective(body.perspective);
  if(!perspectives.has(perspective)) throw new InputError(400,'Unknown viewpoint.');
  const comment=body.comment.trim();
  if(needsSeriousHandling(comment)||requiresFactualAnswer(comment)) return {local:{decision:'none',candidate_id:record.id,layers:[],message:'This calls for a sincere response rather than a meme.'}};
  if(unchangedReactionFor(record)) return {local:{decision:'reference',candidate_id:record.id,layers:[],message:'This image already supplies the punchline. Use the original reaction or choose another template for editable captions.'}};
  const imageUrl=creationMediaUrl(record);
  if(!imageUrl) return {local:{decision:'reference',candidate_id:record.id,layers:[],message:record.media_type==='gif'?'This is an animated reaction. Keep the original GIF.':'This source is available as a reference, but not for image composition.'}};
  const profile=templateFor(record);
  const prompt=compositionPrompt(comment,record,perspective,profile);
  const content=profile?prompt:[{type:'text',text:prompt},{type:'image_url',image_url:{url:imageUrl}}];
  return {record,profile,content};
}

export async function composeMeme(request,env) {
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json') return json({error:'Expected JSON.'},415);
  let body;
  try {body=JSON.parse(new TextDecoder().decode(await boundedBytes(request.body,5000)));}
  catch(error) {return json({error:error instanceof InputError?error.message:'Invalid JSON.'},error instanceof InputError?error.status:400);}
  let plan;try {plan=planComposition(body);}catch(error){return json({error:error.message},error.status||400);}
  if(plan.local)return json(plan.local);
  const {record,profile,content}=plan;
  if(typeof env.FREE_AI?.fetch!=='function') return json({error:'Caption generation is temporarily unavailable. You can still use the original reaction.'},503);
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(20000)]);
  const headers={'content-type':'application/json',authorization:'Bearer service-binding','x-gateway-project-id':'meme-lab'};
  const address=request.headers.get('cf-connecting-ip');if(address)headers['cf-connecting-ip']=address;
  try {
    // One caller request, attributed to Meme Lab and admitted by the existing
    // budgeted gateway. Automatic routing selects eligible JSON/vision models
    // and owns bounded fallback. No direct provider or unbudgeted fallback.
    const response=await env.FREE_AI.fetch(new Request('https://fleet-gateway.internal/v1/chat/completions',{method:'POST',headers,signal,body:JSON.stringify({model:CAPTION_MODEL,reasoning_effort:'low',stream:false,response_format:{type:'json_object'},messages:[{role:'user',content}],max_tokens:profile?800:1200})}));
    if(!response.ok) {await response.body?.cancel();return json({error:'Caption generation is temporarily unavailable. Try again shortly.'},response.status===429?429:503);}
    const raw=JSON.parse(new TextDecoder().decode(await boundedBytes(response.body,32000)));
    if(typeof raw?.model!=='string'||!raw.model.trim()||raw.model==='auto'||(raw.x_gateway?.model&&raw.x_gateway.model!==raw.model)) throw new Error('Missing or conflicting served-model attribution.');
    const output=raw?.choices?.[0];
    if(output?.finish_reason&&output.finish_reason!=='stop') throw new Error('Incomplete generation.');
    const data=validateComposition(JSON.parse(output?.message?.content??''),record,profile);
    return json({...data,media_url:`/api/create/media/${encodeURIComponent(record.id)}`,source_url:record.provenance?.source_url??record.source_url??record.image_url,media_status:record.media_status});
  } catch {
    // Do not log provider payloads: they may contain the situation or captions.
    return json({error:'Could not generate a complete caption layout. Try again or choose another template.'},503);
  }
}

function isRaster(bytes,type) {
  if(type==='image/jpeg') return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(type==='image/png') return bytes.length>=8&&bytes.slice(0,8).every((n,i)=>n===[137,80,78,71,13,10,26,10][i]);
  if(type==='image/webp') return new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
  return false;
}

export async function compositionMedia(id,fetchImpl=fetch) {
  const record=byId.get(id);const url=creationMediaUrl(record);
  if(!url) return json({error:'Image composition is unavailable for this reference.'},404);
  let stage='fetch',upstreamStatus;
  try {
    // Workerd rejects redirect:"error". Manual mode keeps redirects unfollowed;
    // the response gate below rejects every non-2xx before reading any bytes.
    const response=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});
    upstreamStatus=response.status;stage='response';
    const type=response.headers.get('content-type')?.split(';')[0].toLowerCase();
    if(!response.ok||!['image/jpeg','image/png','image/webp'].includes(type)||Number(response.headers.get('content-length'))>MAX_IMAGE_BYTES) {await response.body?.cancel();throw new Error();}
    stage='read';const bytes=await boundedBytes(response.body,MAX_IMAGE_BYTES);
    stage='signature';
    if(!isRaster(bytes,type)) throw new Error();
    return new Response(bytes,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer'}});
  } catch {
    console.log(JSON.stringify({event:'composition.media_failed',stage,upstream_status:upstreamStatus}));
    return json({error:'Could not load the source image. Try again shortly.'},502);
  }
}

export async function annaComposition(request,env) {
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:annaHeaders});
  if(request.method!=='POST')return annaJson({error:'Use POST.'},405);
  const parsed=await readAnnaBody(request);if(parsed.error)return parsed.error;
  const denied=await annaAdmission(request,env,'composition');if(denied)return denied;
  try {
    const plan=planComposition(parsed.body);
    if(plan.local)return annaJson({result:plan.local});
    const {record,profile,content}=plan;
    return annaJson({record:{id:record.id,name:record.name,source_url:record.provenance?.source_url??record.source_url??record.image_url,media_status:record.media_status},profile,messages:[{role:'user',content}],max_tokens:profile?800:1200});
  }catch(error){return annaJson({error:error.message},error.status||400);}
}

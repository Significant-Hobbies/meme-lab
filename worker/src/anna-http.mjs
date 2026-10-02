export const annaHeaders={
  'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'
};
export const annaJson=(body,status=200,extra={})=>Response.json(body,{status,headers:{...annaHeaders,...extra}});
export async function readAnnaBody(request,maxBytes=5000) {
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return {error:annaJson({error:'Expected JSON.'},415)};
  const reader=request.body?.getReader();if(!reader)return {error:annaJson({error:'Expected JSON.'},400)};
  const chunks=[];let size=0;
  while(true) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();return {error:annaJson({error:'Request too large.'},413)};}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return {body:JSON.parse(new TextDecoder().decode(bytes))};}catch{return {error:annaJson({error:'Invalid JSON.'},400)};}
}
export async function annaAdmission(request,env,route) {
  // Only admission control; this does not authenticate an Anna user or prove MAU.
  // Activation is an explicit production configuration change, not a fake JS limiter.
  if(!env.ANNA_SEARCH_LIMITER)return null;
  const address=request.headers.get('CF-Connecting-IP');
  if(!address)return annaJson({error:'Search is temporarily unavailable.'},503);
  try {
    const result=await env.ANNA_SEARCH_LIMITER.limit({key:route+':'+address});
    return result.success?null:annaJson({error:'Too many requests. Wait a minute and try again.'},429,{'Retry-After':'60'});
  } catch {return annaJson({error:'Search is temporarily unavailable.'},503);}
}

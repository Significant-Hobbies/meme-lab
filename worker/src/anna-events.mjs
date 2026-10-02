import {annaHeaders,annaJson,readAnnaBody,annaAdmission} from './anna-http.mjs';
import {pingFor} from './ping.mjs';
const allowed=new Set(['run_meme','run_none','run_error','link_copied','share_completed','saved_reference','removed_reference','return_visit']);
export async function annaEvent(request,env,ctx) {
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:annaHeaders});
  if(request.method!=='POST')return annaJson({error:'Use POST.'},405);
  const parsed=await readAnnaBody(request,256);if(parsed.error)return parsed.error;
  const body=parsed.body;
  if(!body||Object.keys(body).length!==1||!allowed.has(body.event))return annaJson({error:'Unknown event.'},400);
  const denied=await annaAdmission(request,env,'events');if(denied)return denied;
  // Caller-controlled events are aggregate interaction signals, never verified people.
  const event='anna.client.'+body.event;
  console.log(JSON.stringify({event,measurement:'client_reported'}));
  const send=pingFor(env)(event,{title:'Anna interaction (client reported)',props:{measurement:'client_reported'}});
  if(ctx?.waitUntil)ctx.waitUntil(send);else await send;
  return annaJson({accepted:true,measurement:'client_reported'},202);
}

const events=new Set(['run_meme','run_none','run_error','link_copied','share_completed','saved_reference','removed_reference','return_visit']);
export async function reportEvent(event,{fetchImpl=fetch}={}) {
  if(!events.has(event)||['localhost','127.0.0.1'].includes(globalThis.location?.hostname))return false;
  try {const response=await fetchImpl('https://memes.significanthobbies.com/api/anna/events',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({event}),keepalive:true});return response.ok;}
  catch{return false;}
}

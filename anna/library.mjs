const prefix='reactions/';
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);
const unwrap=value=>value?.result??value;
const code=error=>error?.code??error?.error?.code;
export const referenceUrl=id=>{if(!validId(id)) throw new Error('Invalid reference.');return 'https://memes.significanthobbies.com/memes/'+encodeURIComponent(id);};
export function savedReference(candidate) {
  if(!validId(candidate?.id)||typeof candidate.name!=='string'||!candidate.name.trim()) throw new Error('Invalid reference.');
  return {id:candidate.id,name:candidate.name.trim().slice(0,160)};
}
export async function listSaved(anna) {
  if(!anna?.storage?.list) throw new Error('Saved reactions need Anna storage access.');
  const result=unwrap(await anna.storage.list({prefix,limit:50}));
  if(!Array.isArray(result?.items)) throw new Error('Saved reactions could not be loaded.');
  const entries=await Promise.all(result.items.filter(row=>row.key?.startsWith(prefix)&&validId(row.key.slice(prefix.length))).map(async row=>{
    try {const item=row.metadata?.id?{value:row.metadata}:unwrap(await anna.storage.get({key:row.key}));const value=savedReference(item.value);return value.id===row.key.slice(prefix.length)?value:null;}
    catch(error) {if(code(error)==='not_found')return null;throw error;}
  }));
  return entries.filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
}
export async function saveReference(anna,candidate) {
  const value=savedReference(candidate);
  const entries=await listSaved(anna);
  if(entries.length>=50&&!entries.some(item=>item.id===value.id)) throw new Error('You can save 50 reactions. Remove one to save another.');
  // Independent keys prevent concurrent saves of different reactions from overwriting a list.
  await anna.storage.set({key:prefix+value.id,value,metadata:value});
  return value;
}
export async function removeReference(anna,id) {
  referenceUrl(id);
  try {await anna.storage.delete({key:prefix+id});}
  catch(error) {if(code(error)!=='not_found')throw error;}
}
export async function shareReference(candidate,{share=navigator.share?.bind(navigator),copy=text=>navigator.clipboard.writeText(text)}={}) {
  const value=savedReference(candidate);const url=referenceUrl(value.id);
  if(share) {
    try {await share({title:value.name,url});return 'share_completed';}
    catch(error) {if(error.name==='AbortError')return 'share_cancelled';}
  }
  await copy(url);return 'link_copied';
}

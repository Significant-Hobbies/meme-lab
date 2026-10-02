import {MAX_IMAGE_BYTES,remoteImageUrl} from './personalize.mjs';
const pathPattern=/^creations\/[a-f0-9-]{36}\.png$/;
function validPath(path){if(typeof path!=='string'||!pathPattern.test(path))throw new Error('Invalid saved meme.');return path;}
export async function persistMeme(anna,blob,{fetchImpl=fetch,id=crypto.randomUUID(),signal}={}) {
  if(!(blob instanceof Blob)||blob.type!=='image/png'||blob.size<12||blob.size>MAX_IMAGE_BYTES)throw new Error('Choose a generated PNG meme smaller than 8 MB.');
  const path=validPath(`creations/${id}.png`);
  if(typeof anna?.files?.upload_init!=='function'||typeof anna?.files?.upload_finalize!=='function')throw new Error('Anna file storage access is required to save this meme.');
  const ticket=await anna.files.upload_init({path,content_type:'image/png',size:blob.size,ttl_seconds:300,metadata:{kind:'personal-meme'}});
  const url=remoteImageUrl(ticket?.put_url);
  if(!ticket.headers||typeof ticket.headers!=='object'||Object.values(ticket.headers).some(value=>typeof value!=='string'))throw new Error('Anna returned an invalid upload ticket.');
  const response=await fetchImpl(url,{method:'PUT',headers:ticket.headers,body:blob,credentials:'omit',redirect:'error',signal:signal||AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Could not upload your meme to Anna. It has not been saved.');
  const etag=response.headers.get('etag');
  const result=await anna.files.upload_finalize({path,size_bytes:blob.size,...(etag?{etag}:{})});
  if(result?.path!==path||result.size_bytes!==blob.size||typeof result.etag!=='string'||!result.etag)throw new Error('Anna did not confirm the saved meme.');
  return {path,etag:result.etag,bytes:blob.size};
}
export async function downloadSavedMeme(anna,path) {
  // The Anna host triggers the download outside the iframe sandbox.
  const result=await anna.files.download({path:validPath(path),filename:'my-meme.png'});
  if(result?.ok!==true)throw new Error('Anna could not start the download.');
  return 'download_started'; // A dialog is not proof of a completed disk save.
}
export async function removeSavedMeme(anna,entry) {
  if(typeof entry?.etag!=='string'||!entry.etag)throw new Error('Refresh the saved meme before removing it.');
  const result=await anna.files.delete({path:validPath(entry?.path),if_match:entry.etag});
  if(result?.deleted!==true)throw new Error('Anna did not confirm removal.');
  return 'removed';
}
export async function listSavedMemePage(anna,{cursor}={}) {
  const result=await anna.files.list({prefix:'creations/',limit:12,...(cursor?{cursor}:{})});
  const items= (Array.isArray(result?.items)?result.items:[]).filter(item=>pathPattern.test(item?.path||'')&&item.content_type==='image/png'&&Number.isInteger(item.size_bytes)&&item.size_bytes>0&&item.size_bytes<=MAX_IMAGE_BYTES&&typeof item.etag==='string'&&item.etag&&item.metadata?.kind==='personal-meme').sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))).slice(0,12);
  return {items,nextCursor:typeof result?.next_cursor==='string'&&result.next_cursor?result.next_cursor:null};
}
export async function listSavedMemes(anna) {return (await listSavedMemePage(anna)).items;}
export async function readSavedMeme(anna,path,{fetchImpl=fetch}={}) {
  const result=await anna.files.download_url({path:validPath(path)});
  const response=await fetchImpl(remoteImageUrl(result?.get_url),{credentials:'omit',signal:AbortSignal.timeout(30000)});
  if(!response.ok||!response.body||Number(response.headers.get('content-length'))>MAX_IMAGE_BYTES)throw new Error('Saved meme is unavailable.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_IMAGE_BYTES){await reader.cancel();throw new Error('Saved meme is too large.');}chunks.push(part.value);}}
  finally{reader.releaseLock();}
  if(size<12)throw new Error('Saved meme is incomplete.');
  const blob=new Blob(chunks,{type:'image/png'});
  const header=new Uint8Array(await blob.slice(0,8).arrayBuffer());
  if(![137,80,78,71,13,10,26,10].every((value,index)=>header[index]===value))throw new Error('Saved meme is not a PNG image.');
  return blob;
}

import {readFile,writeFile} from 'node:fs/promises';
import {catalogue} from '../worker/src/catalogue.stage3000.generated.mjs';

const root=new URL('../',import.meta.url);
const measured=(await readFile(new URL('expansion/reviewed/gallery-clips.jsonl',root),'utf8')).trim().split('\n').map(JSON.parse);
const display=JSON.parse(await readFile(new URL('expansion/curated-clip-display.json',root),'utf8'));
const baseline=new Set(catalogue.map(record=>record.id)),ids=new Set();
const records=measured.map(({source,media})=>{
  const id=source.proposed_id;
  if(!['width','height','duration','fps','bytes'].every(key=>Number.isFinite(media[key]))||!Array.isArray(media.frame_hashes)||media.frame_hashes.length!==3||media.frame_hashes.some(hash=>!/^[0-9a-f]{64}$/.test(hash))||new Set(media.frame_hashes).size<2)throw new Error('Missing measured video evidence: '+id);
  if(!id||baseline.has(id)||ids.has(id)||media.id!==id||!media.eligible||!media.motion_checked||media.distinct_frames<2||media.width<1||media.height<1||Math.max(media.width,media.height)<480||Math.min(media.width,media.height)<270||media.duration<.4||media.duration>30||media.fps<10||media.fps>60||media.bytes>20*1024*1024||media.bytes<1||media.url!==source.media_url.replace(/giphy\.gif$/,'giphy.mp4'))throw new Error('Unqualified or duplicate gallery clip: '+id);
  const url=new URL(source.media_url);
  if(url.origin!=='https://media.giphy.com'||!/^\/media\/[a-zA-Z0-9]+\/giphy\.gif$/.test(url.pathname)||url.search||url.hash)throw new Error('Unknown source: '+id);
  ids.add(id);
  const sourcePage=new URL(source.source_url);
  if(sourcePage.origin!=='https://giphy.com'||!sourcePage.pathname.includes(source.source_id)||sourcePage.username||sourcePage.password)throw new Error('Unknown provenance: '+id);
  const tags=source.categories.filter(tag=>tag!=='reaction-gif');
  return {id,name:display[id]?.name??source.name.replace(/ Reaction \d+$/,''),message:tags.slice(0,4).join(' · '),relational_pattern:source.assistive_text,example_context:'',near_miss_context:'',tags,media_type:'gif',image_url:source.image_url,media_url:source.media_url,preview_url:source.preview_url,mime_type:'image/gif',media_status:'source-preview',availability:'live',catalogue_scope:'gallery',human_validated:false,video_evidence:media,provenance:{provider:source.provider,provider_id:source.source_id,source_url:source.source_url,usage_evidence:source.usage_evidence,observed_on:source.observed_on,metadata_kind:'source_tags_and_ocr',...(display[id]?{display_review:display[id].basis}:{})}};
});
if(!records.length)throw new Error('No qualified gallery clips.');
await writeFile(new URL('worker/public/clips.json',root),JSON.stringify(records)+'\n');
await writeFile(new URL('worker/src/clip-library.generated.mjs',root),'// Generated from measured gallery-only reaction clips. Rebuild with build:clips.\nexport const clipLibrary='+JSON.stringify(records)+';\n');
console.log(JSON.stringify({gallery_clips_added:records.length,gallery_references:catalogue.length+records.length,retrieval_references:catalogue.length,human_validated:false}));

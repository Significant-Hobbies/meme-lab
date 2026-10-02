import {listSaved,saveReference,removeReference,shareReference,referenceUrl} from './library.mjs';
import {reportEvent} from './engagement.mjs';
let ready;
let savedIds=new Set();
let refreshGeneration=0;
const $=selector=>document.querySelector(selector);
const announce=text=>{$('#library-status').textContent=text;};
const action=(label,handler)=>{const button=document.createElement('button');button.type='button';button.className='reference-action';button.textContent=label;button.addEventListener('click',handler);return button;};
function shareButton(candidate) {
  const native=typeof navigator.share==='function';
  const button=action(native?'Share':'Copy link',async()=>{
    try {const outcome=await shareReference(candidate);if(outcome==='share_cancelled')return;
      button.textContent=outcome==='link_copied'?'Copied':'Shared';
      announce(outcome==='link_copied'?'Reference link copied. Your situation is not included.':'Share completed. Your situation is not included.');void reportEvent(outcome);
    } catch {announce('Sharing is unavailable. Open the reference title and copy its address.');}
  });
  button.setAttribute('aria-label',`${native?'Share':'Copy link for'} ${candidate.name}`);return button;
}
function copyButton(candidate) {
  const button=action('Copy link',async()=>{
    try {await shareReference(candidate,{share:null});button.textContent='Copied';announce('Reference link copied. Your situation is not included.');void reportEvent('link_copied');}
    catch {announce('Copying is unavailable. Open the reference title and copy its address.');}
  });button.setAttribute('aria-label',`Copy link for ${candidate.name}`);return button;
}
function sharingControls(candidate) {return typeof navigator.share==='function'?[shareButton(candidate),copyButton(candidate)]:[shareButton(candidate)];}
function saveButton(candidate) {
  const button=action(savedIds.has(candidate.id)?'Saved':'Save',async()=>{
    if(savedIds.has(candidate.id))return;button.disabled=true;
    try {await saveReference(await ready,candidate);savedIds.add(candidate.id);button.textContent='Saved';announce('Saved to your Anna account. Your situation is not saved.');void reportEvent('saved_reference');await refreshSaved();}
    catch(error) {announce(error.message?.includes('50 reactions')?error.message:'Could not save this reaction. Check Anna storage access and try again.');}
    finally {button.disabled=savedIds.has(candidate.id);}
  });
  button.dataset.savedId=candidate.id;button.disabled=savedIds.has(candidate.id);button.setAttribute('aria-label',`Save ${candidate.name}`);return button;
}
export function decorateResults(data) {
  const hosts=[$('#best-result .result-copy'),...document.querySelectorAll('#alternatives .alternative-copy')];
  data.candidates.forEach((candidate,index)=>{if(!hosts[index])return;const controls=document.createElement('div');controls.className='reference-actions';controls.append(...sharingControls(candidate),saveButton(candidate));hosts[index].append(controls);});
}
async function refreshSaved() {
  const generation=++refreshGeneration;
  try {
    const entries=await listSaved(await ready);if(generation!==refreshGeneration)return;
    savedIds=new Set(entries.map(item=>item.id));for(const button of document.querySelectorAll('[data-saved-id]')){const saved=savedIds.has(button.dataset.savedId);button.textContent=saved?'Saved':'Save';button.disabled=saved;}const host=$('#saved-reactions');host.replaceChildren();
    $('#library-empty').hidden=entries.length>0;
    for(const candidate of entries) {
      const row=document.createElement('li');row.className='saved-reference';
      const link=document.createElement('a');link.href=referenceUrl(candidate.id);link.target='_blank';link.rel='noopener noreferrer';link.textContent=candidate.name;
      const remove=action('Remove',async()=>{
        remove.disabled=true;
        try {await removeReference(await ready,candidate.id);savedIds.delete(candidate.id);announce('Removed from your saved reactions.');void reportEvent('removed_reference');await refreshSaved();}
        catch {announce('Could not remove this reaction. Try again.');remove.disabled=false;}
      });remove.setAttribute('aria-label',`Remove ${candidate.name}`);
      const controls=document.createElement('div');controls.className='reference-actions';controls.append(...sharingControls(candidate),remove);row.append(link,controls);host.append(row);
    }
  } catch {if(generation===refreshGeneration)announce('Saved reactions are unavailable. You can still find and share reactions.');}
}
export function initializeInteractions(annaReady) {
  ready=annaReady;
  void refreshSaved();
  window.addEventListener('focus',()=>void refreshSaved());
  void ready.then(async anna=>{
    const key='usage/last-visit-day';const day=new Date().toISOString().slice(0,10);
    let previous;try {previous=(await anna.storage.get({key}))?.value;}catch(error){if(error.code!=='not_found')return;}
    if(typeof previous==='string'&&previous!==day)void reportEvent('return_visit');
    await anna.storage.set({key,value:day});
  }).catch(()=>{});
}

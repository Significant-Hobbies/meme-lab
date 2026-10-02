import {PersonalMemeJob,validateImageFile,shareMeme,imageError} from './personalize.mjs';
import {prepareImage,encodeImage,composeMeme} from './image-tools.mjs';
import {persistMeme,downloadSavedMeme,removeSavedMeme,listSavedMemePage,readSavedMeme} from './creations.mjs';
import {reportEvent} from './engagement.mjs';
const $=id=>document.getElementById(id);
const button=(label,handler)=>{const b=document.createElement('button');b.type='button';b.className='reference-action';b.textContent=label;b.onclick=handler;return b;};
export function initializePersonalEditor(annaReady) {
  const job=new PersonalMemeJob(),savedByBlob=new WeakMap();
  let photo,template,output,photoUrl,templateUrl,outputUrl,busy=false,revision=0,libraryGeneration=0,libraryCursor=null;
  const selections={photo:0,template:0};
  const announce=(text,error=false)=>{$('personal-status').textContent=text;$('personal-status').dataset.error=String(error);};
  const libraryMessage=text=>{$('personal-library-status').textContent=text;};
  const region=()=>({x:Number($('face-x').value)/100,y:Number($('face-y').value)/100,width:Number($('face-width').value)/100,height:Number($('face-height').value)/100});
  const updateGenerate=()=>{$('personal-zoom').disabled=!template;$('personal-generate').disabled=busy||!photo||!template||!$('personal-consent').checked;$('personal-output-empty').querySelector('span').textContent=photo&&template?'Choose the face area, then generate your version.':!photo&&!template?'Add your meme and photo to begin.':!photo?'Add your photo to create your version.':'Add a meme image to create your version.';};
  const resetOutput=()=>{if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=null;output=null;$('personal-output').removeAttribute('src');$('personal-output').hidden=true;$('personal-output-empty').hidden=false;$('personal-output-actions').hidden=true;$('personal-model').textContent='';$('personal-saved-note').hidden=true;};
  const invalidate=()=>{revision++;job.invalidate();resetOutput();updateGenerate();};
  const drawRegion=()=>{
    const r=region();const area=$('personal-face-area');Object.assign(area.style,{left:`${r.x*100}%`,top:`${r.y*100}%`,width:`${r.width*100}%`,height:`${r.height*100}%`});
    for(const name of ['x','y','width','height'])$(`face-${name}-value`).textContent=$(`face-${name}`).value+'%';$('face-size').value=$('face-width').value;$('face-size-value').textContent=$('face-width').value+'%';
  };
  function open(){document.body.classList.add('page-personalizing');$('personal-editor').hidden=false;$('open-personal').classList.add('active');$('open-personal').setAttribute('aria-current','page');document.querySelector('.site-nav a.active')?.classList.remove('active');document.querySelector('.site-nav a[aria-current]')?.removeAttribute('aria-current');$('personal-title').focus();$('personal-editor').scrollIntoView({block:'start',behavior:'auto'});}
  function close(){document.body.classList.remove('page-personalizing');$('personal-editor').hidden=true;$('open-personal').classList.remove('active');$('open-personal').removeAttribute('aria-current');const reactions=document.querySelector('.site-nav a');reactions.classList.add('active');reactions.setAttribute('aria-current','page');reactions.focus();}
  $('personal-zoom').onclick=()=>{const expanded=$('personal-comparison').classList.toggle('expanded');$('personal-zoom').setAttribute('aria-expanded',String(expanded));$('personal-zoom').textContent=expanded?'Compact previews':'Enlarge previews';};
  $('open-personal').onclick=open;$('personal-entry').onclick=open;$('personal-close').onclick=close;
  document.querySelector('.site-nav a').addEventListener('click',event=>{if(document.body.classList.contains('page-personalizing')){event.preventDefault();close();}});
  async function choose(role,file) {
    invalidate();const version=++selections[role];const input=$(`personal-${role}`);input.setCustomValidity('');input.removeAttribute('aria-invalid');
    if(role==='photo'){photo=null;if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;$('personal-photo-preview').hidden=true;}
    else{template=null;$('personal-dimensions').textContent='';$('personal-original-surface').dataset.ready='false';if(templateUrl)URL.revokeObjectURL(templateUrl);templateUrl=null;$('personal-original').hidden=true;$('personal-original-empty').hidden=false;$('personal-face-area').hidden=true;$('personal-region').disabled=true;}
    updateGenerate();if(!file)return;
    try{
      validateImageFile(file);const prepared=await prepareImage(file,{role});if(version!==selections[role])return;
      if(role==='photo'){photo=prepared.blob;photoUrl=URL.createObjectURL(photo);$('personal-photo-preview').src=photoUrl;$('personal-photo-preview').hidden=false;}
      else{template=prepared.blob;templateUrl=URL.createObjectURL(template);$('personal-original').src=templateUrl;$('personal-original').hidden=false;$('personal-original-empty').hidden=true;$('personal-original-surface').dataset.ready='true';$('personal-face-area').hidden=false;$('personal-region').disabled=false;$('personal-dimensions').textContent=`${prepared.width} × ${prepared.height}`;for(const media of document.querySelectorAll('.personal-comparison .personal-media'))media.style.setProperty('--meme-ratio',`${prepared.width}/${prepared.height}`);drawRegion();}
      announce('');updateGenerate();
    }catch(error){if(version===selections[role]){const message=error.message||'Could not read that image. Try another JPG, PNG or WebP.';input.setCustomValidity(message);input.setAttribute('aria-invalid','true');announce(message,true);updateGenerate();}}
  }
  $('personal-photo').onchange=event=>void choose('photo',event.target.files[0]);$('personal-template').onchange=event=>void choose('template',event.target.files[0]);
  $('personal-consent').onchange=updateGenerate;
  $('face-size').oninput=()=>{const r=region(),width=Number($('face-size').value)/100,height=Math.max(.02,Math.min(.75,width*r.height/r.width));$('face-width').value=Math.round(width*100);$('face-height').value=Math.round(height*100);$('face-x').value=Math.round(Math.max(0,Math.min(r.x+r.width/2-width/2,1-width))*100);$('face-y').value=Math.round(Math.max(0,Math.min(r.y+r.height/2-height/2,1-height))*100);invalidate();drawRegion();};
  for(const name of ['x','y','width','height'])$(`face-${name}`).oninput=()=>{
    const r=region();$('face-x').value=Math.round(Math.min(r.x,1-r.width)*100);$('face-y').value=Math.round(Math.min(r.y,1-r.height)*100);invalidate();drawRegion();
  };
  $('personal-original-surface').onclick=event=>{
    if(!template)return;const rect=event.currentTarget.getBoundingClientRect(),r=region();
    $('face-x').value=Math.round(Math.max(0,Math.min(1-r.width,(event.clientX-rect.left)/rect.width-r.width/2))*100);
    $('face-y').value=Math.round(Math.max(0,Math.min(1-r.height,(event.clientY-rect.top)/rect.height-r.height/2))*100);invalidate();drawRegion();
  };
  $('personal-form').onsubmit=async event=>{
    event.preventDefault();if(busy||!photo||!template||!$('personal-consent').checked)return;
    invalidate();const version=revision;busy=true;$('personal-editor').setAttribute('aria-busy','true');updateGenerate();
    try{
      const anna=await annaReady;if(version!==revision)return;
      const result=await job.generate({anna,photo,template,region:region(),prepare:prepareImage,encode:encodeImage,compose:composeMeme,onStage:text=>{if(version===revision)announce(text);}});
      if(version!==revision)return;output=result.blob;outputUrl=URL.createObjectURL(output);$('personal-output').src=outputUrl;$('personal-output').hidden=false;$('personal-output-empty').hidden=true;$('personal-output-actions').hidden=false;$('personal-model').textContent=result.model.slice(0,120);$('personal-save').textContent='Save to Anna';$('personal-save').disabled=false;
      announce('Your version is ready. Check your likeness, the caption and the layout before sharing.');void reportEvent('created_meme');
    }catch(error){if(version===revision)announce(imageError(error),true);}
    finally{busy=false;$('personal-editor').setAttribute('aria-busy','false');updateGenerate();}
  };
  async function save(blob) {
    let promise=savedByBlob.get(blob);
    if(!promise){promise=annaReady.then(anna=>persistMeme(anna,blob)).catch(error=>{savedByBlob.delete(blob);throw error;});savedByBlob.set(blob,promise);}
    return await promise;
  }
  async function withOutput(control,work) {
    const blob=output;if(!blob)return;control.disabled=true;
    try{await work(blob);}
    catch{announce(control.id==='personal-download'?'Download could not start. Check Anna file access and try again. Your version is still available here.':'Saving could not be confirmed. Check Anna file access and storage quota, then try again.',true);}
    finally{control.disabled=false;}
  }
  $('personal-save').onclick=()=>void withOutput($('personal-save'),async blob=>{await save(blob);if(output===blob){$('personal-saved-note').hidden=false;$('personal-save').textContent='Saved to Anna';announce('Saved privately to your Anna account.');}void reportEvent('saved_creation');await refreshLibrary();});
  $('personal-download').onclick=()=>void withOutput($('personal-download'),async blob=>{const entry=await save(blob);await downloadSavedMeme(await annaReady,entry.path);if(output===blob){$('personal-saved-note').hidden=false;announce('Anna opened the image download. Your version is saved privately too.');}void reportEvent('download_started');await refreshLibrary();});
  $('personal-share').onclick=()=>void withOutput($('personal-share'),async blob=>{
    let result;try{result=await shareMeme(blob);}catch{announce('Sharing is unavailable. Download the PNG, then attach it in your chat.');return;}if(result==='cancelled')return;
    if(result==='download_required'){announce('This browser cannot share image files directly. Download the PNG, then attach it in your chat.');return;}
    announce('Image share completed.');void reportEvent('image_share_completed');
  });
  $('personal-clear').onclick=()=>{
    invalidate();selections.photo++;selections.template++;photo=template=null;for(const url of [photoUrl,templateUrl])if(url)URL.revokeObjectURL(url);photoUrl=templateUrl=null;
    $('personal-form').reset();$('personal-comparison').classList.remove('expanded');$('personal-zoom').setAttribute('aria-expanded','false');$('personal-zoom').textContent='Enlarge previews';for(const role of ['photo','template']){const input=$(`personal-${role}`);input.setCustomValidity('');input.removeAttribute('aria-invalid');}for(const [name,value] of Object.entries({x:25,y:10,width:40,height:40}))$(`face-${name}`).value=value;drawRegion();$('personal-photo-preview').hidden=true;$('personal-photo-preview').removeAttribute('src');$('personal-original').hidden=true;$('personal-original').removeAttribute('src');$('personal-original-surface').dataset.ready='false';$('personal-original-empty').hidden=false;$('personal-face-area').hidden=true;$('personal-region').disabled=true;$('personal-dimensions').textContent='';updateGenerate();announce(busy?'Cleared. The in-flight request may still finish and use Anna quota.':'Cleared from this editor. Uploaded-photo retention is governed by Anna and its provider.');
  };
  async function refreshLibrary(append=false) {
    const generation=++libraryGeneration;$('personal-library-empty').hidden=true;libraryMessage('Loading your personal memes…');
    try{
      const anna=await annaReady,page=await listSavedMemePage(anna,{cursor:append?libraryCursor:undefined}),entries=page.items;if(generation!==libraryGeneration)return;libraryCursor=page.nextCursor;$('personal-more').hidden=!libraryCursor;
      const host=$('personal-library');if(!append)host.replaceChildren();$('personal-library-empty').hidden=append||entries.length>0;libraryMessage('');
      for(const entry of entries){
        const card=document.createElement('article');card.className='personal-saved';const image=document.createElement('img');image.alt='Saved personal meme';image.loading='lazy';
        const note=document.createElement('p');const date=new Date(entry.updated_at);note.textContent=Number.isNaN(date.getTime())?'Saved personal meme':`Saved ${date.toLocaleDateString()}`;
        const controls=document.createElement('div');controls.className='reference-actions';
        const act=(label,work)=>button(label,async event=>{const b=event.currentTarget;b.disabled=true;try{await work();}catch{libraryMessage('Could not complete that action. Check Anna file access and try again.');}finally{b.disabled=false;}});
        const removeButton=act('Remove',async()=>{const confirm=act('Confirm removal',async()=>{await removeSavedMeme(anna,entry);const blob=output,cached=blob&&savedByBlob.get(blob);if(cached&&(await cached).path===entry.path){savedByBlob.delete(blob);$('personal-saved-note').hidden=true;$('personal-save').textContent='Save to Anna';}await refreshLibrary();libraryMessage('Removed from your Anna library.');});const cancel=button('Keep meme',()=>{confirm.replaceWith(removeButton);cancel.remove();libraryMessage('Kept in your Anna library.');});removeButton.replaceWith(confirm);confirm.after(cancel);libraryMessage('Remove this saved PNG? Source uploads and previously shared copies are separate.');});
        controls.append(act('Download',async()=>{await downloadSavedMeme(anna,entry.path);libraryMessage('Anna opened the download.');void reportEvent('download_started');}),act('Prepare share',async()=>{const blob=await readSavedMeme(anna,entry.path);const ready=button('Share image',async()=>{try{const result=await shareMeme(blob);if(result==='download_required')libraryMessage('Download the image, then attach it in your chat.');else if(result==='shared'){libraryMessage('Image share completed.');void reportEvent('image_share_completed');}}catch{libraryMessage('Sharing is unavailable. Download the image, then attach it in your chat.');}});controls.querySelectorAll('button')[1].replaceWith(ready);libraryMessage('Image ready. Choose Share image to open your browser’s sharing menu.');}),removeButton);
        card.append(image,note,controls);host.append(card);
        void anna.files.download_url({path:entry.path}).then(result=>{if(generation===libraryGeneration&&typeof result.get_url==='string')image.src=result.get_url;}).catch(()=>{image.alt='Preview unavailable; you can still download this saved meme.';});
      }
    }catch{if(generation===libraryGeneration)libraryMessage('Personal memes are unavailable. Enable Meme Lab’s Anna file storage to save and download images.');}
  }
  $('personal-refresh').onclick=()=>void refreshLibrary();$('personal-more').onclick=async()=>{const b=$('personal-more');b.disabled=true;try{await refreshLibrary(true);}finally{b.disabled=false;}};
  window.addEventListener('focus',()=>{if(!$('personal-editor').hidden)void refreshLibrary();});
  void refreshLibrary();void annaReady.then(anna=>{if(anna.entryPayload?.action==='personalize')open();anna.on('entry_payload',payload=>{if(payload?.action==='personalize')open();});}).catch(()=>{});
}

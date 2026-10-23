import {paintClip,recordClip,recordingFormat,videoEvent} from './clip-export.js';
import {sampleClipFrames} from './clip-frames.js';

export class ClipStudio {
  constructor(host) {
    this.host=host;this.version=0;
    host.innerHTML=`<div class="clip-layout"><div class="clip-workspace"><canvas aria-label="Captioned reaction video preview" hidden></canvas><video playsinline muted loop preload="auto" hidden></video><p class="clip-load" role="status">Loading the clip…</p><button type="button" data-clip-action="retry" hidden>Retry clip</button><button type="button" data-clip-action="play" disabled>Play preview</button><p class="clip-meta"></p></div><div class="clip-controls"><h3>Your caption</h3><p class="clip-hint">Generate three options above, or write your own.</p><div class="clip-options" aria-label="Caption options"></div><label for="clip-caption">Edit caption</label><textarea id="clip-caption" maxlength="140" rows="4" placeholder="When the tests pass on the first try…"></textarea><div class="clip-caption-info"><span class="clip-characters">0 / 140</span><label for="clip-position">Placement <select id="clip-position"><option value="top">Above clip</option><option value="bottom">Below clip</option></select></label></div><button type="button" class="primary" data-clip-action="download" disabled>Download video</button><button type="button" data-clip-action="cancel" hidden>Cancel export</button><p class="clip-status" role="status" aria-live="polite"></p><p class="clip-hint">Captions sit outside the picture so faces stay visible. Video is rendered in this tab, with no watermark. Reaction clips are silent.</p><a class="clip-source" target="_blank" rel="noopener noreferrer">Open source · media rights not established</a></div></div>`;
    this.$=selector=>host.querySelector(selector);this.canvas=this.$('canvas');this.video=this.$('video');this.caption=this.$('#clip-caption');
    this.caption.addEventListener('input',()=>{this.blocked=false;this.syncCaption();});this.$('#clip-position').addEventListener('change',()=>this.paint());
    this.$('[data-clip-action="play"]').addEventListener('click',()=>this.toggle());
    this.$('[data-clip-action="download"]').addEventListener('click',()=>this.download());
    this.$('[data-clip-action="cancel"]').addEventListener('click',()=>this.exportAbort?.abort());
    this.$('[data-clip-action="retry"]').addEventListener('click',()=>this.load());
    this.video.addEventListener('play',()=>{this.$('[data-clip-action="play"]').textContent='Pause preview';this.animate();});
    this.video.addEventListener('pause',()=>{this.$('[data-clip-action="play"]').textContent='Play preview';cancelAnimationFrame(this.frame);this.paint();});
  }
  paint(){paintClip(this.canvas,this.video,this.caption.value,this.$('#clip-position').value);}
  animate(){cancelAnimationFrame(this.frame);if(this.video.paused)return;this.paint();this.frame=requestAnimationFrame(()=>this.animate());}
  message(text,error=false){this.$('.clip-status').textContent=text;this.$('.clip-status').classList.toggle('error',error);}
  close(){this.version++;this.abort?.abort();this.generationAbort?.abort();this.generationAbort=null;this.exportAbort?.abort();this.video.pause();this.video.removeAttribute('src');this.video.load();if(this.objectUrl)URL.revokeObjectURL(this.objectUrl);this.objectUrl=null;this.ready=false;this.exporting=false;this.generating=false;cancelAnimationFrame(this.frame);this.host.hidden=true;}
  open(candidate){this.close();this.candidate=candidate;this.blocked=false;this.caption.value='';this.$('.clip-options').replaceChildren();this.$('#clip-position').value='top';this.$('.clip-source').href=candidate.provenance?.source_url||candidate.media_url;this.host.hidden=false;this.message('');this.syncCaption();return this.load();}
  async load(){
    this.abort?.abort();this.abort=new AbortController();const version=++this.version;
    this.ready=false;this.canvas.hidden=true;this.$('.clip-meta').textContent='';this.$('.clip-load').hidden=false;this.$('.clip-load').textContent='Loading the clip…';this.$('[data-clip-action="retry"]').hidden=true;this.controls();
    try {
      const response=await fetch('/api/clips/media/'+encodeURIComponent(this.candidate.id),{signal:this.abort.signal});
      if(!response.ok)throw new Error('This clip could not be loaded. Try again or choose another reaction.');
      const blob=await response.blob();if(version!==this.version)return;
      if(this.objectUrl)URL.revokeObjectURL(this.objectUrl);this.objectUrl=URL.createObjectURL(blob);
      const loaded=videoEvent(this.video,'loadeddata',{signal:this.abort.signal});this.video.src=this.objectUrl;await loaded;
      if(version!==this.version)return;
      if(!Number.isFinite(this.video.duration)||this.video.duration<=0||this.video.duration>30||!this.video.videoWidth||this.video.videoWidth>4096||this.video.videoHeight>4096||this.video.videoWidth*this.video.videoHeight>12_000_000)throw new Error('Choose a reaction clip up to 30 seconds long and 4,096 pixels wide or tall.');
      this.ready=true;this.canvas.hidden=false;this.$('.clip-load').hidden=true;this.$('.clip-meta').textContent=`${this.video.videoWidth} × ${this.video.videoHeight} source · ${this.video.duration.toFixed(1)} s · silent reaction clip`;this.paint();
    } catch(error){if(version!==this.version||error.name==='AbortError')return;this.$('.clip-load').textContent=error.message;this.$('[data-clip-action="retry"]').hidden=false;}
    finally{if(version===this.version)this.controls();}
  }
  async generate(brief){
    if(this.exporting)return;
    this.generationAbort?.abort();const controller=this.generationAbort=new AbortController();
    this.generating=true;this.controls();
    this.message('Reading the reaction and writing three caption options…');
    try {
      const frames=await sampleClipFrames(this.video,{signal:controller.signal});
      const response=await fetch('/api/clips/captions',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({candidate_id:this.candidate.id,...brief,frames})});
      const data=await response.json();if(controller!==this.generationAbort)return;
      if(!response.ok)throw new Error(data.error||'Could not generate captions. Try again or write your own.');
      const options=this.$('.clip-options');options.replaceChildren();
      if(data.decision==='none'||data.decision==='reference'){this.blocked=true;this.caption.value='';this.message(data.message);this.syncCaption();return;}
      if(data.decision!=='captions'||!Array.isArray(data.captions)||data.captions.length!==3||data.captions.some(text=>typeof text!=='string'||!text.trim()||Array.from(text).length>140))throw new Error('Caption generation returned an unreadable response. Try again.');
      this.blocked=false;
      for(const [index,text] of data.captions.entries()){
        const button=Object.assign(document.createElement('button'),{type:'button',textContent:text});button.setAttribute('aria-label',`Use caption ${index+1}: ${text}`);
        button.addEventListener('click',()=>{this.caption.value=text;this.syncCaption();});options.append(button);
      }
      this.caption.value=data.captions[0];this.syncCaption();this.message('Three drafts ready. Pick one and make it yours.');
    } catch(error){if(controller!==this.generationAbort||error.name==='AbortError')return;this.message(error.message,true);throw error;}
    finally{if(controller===this.generationAbort){this.generating=false;this.controls();}}
  }
  syncCaption(){this.$('.clip-characters').textContent=`${Array.from(this.caption.value).length} / 140`;for(const button of this.$('.clip-options').children)button.setAttribute('aria-pressed',String(button.textContent===this.caption.value));this.paint();this.controls();}
  controls(){const format=recordingFormat();this.$('[data-clip-action="play"]').disabled=!this.ready||this.exporting||this.generating;this.$('[data-clip-action="download"]').disabled=!this.ready||!this.caption.value.trim()||this.blocked||this.exporting||this.generating||!format;this.$('[data-clip-action="download"]').textContent=format?`Download ${format.extension.toUpperCase()}`:'Video export unavailable';this.$('[data-clip-action="cancel"]').hidden=!this.exporting;this.caption.disabled=this.exporting||this.generating;this.$('#clip-position').disabled=this.exporting;for(const button of this.$('.clip-options').children)button.disabled=this.exporting||this.generating;this.host.dispatchEvent(new CustomEvent('clip-export-state',{detail:{exporting:this.exporting}}));}
  async toggle(){if(this.video.paused){try{await this.video.play();}catch{this.message('Preview playback was blocked. Try again.',true);}}else this.video.pause();}
  async download(){
    if(!this.ready||this.exporting||this.generating||!this.caption.value.trim()||this.blocked)return;
    this.exporting=true;this.exportAbort=new AbortController();const version=this.version;this.controls();
    try {
      const {blob,extension}=await recordClip(this.video,this.canvas,()=>this.paint(),{signal:this.exportAbort.signal,fps:this.candidate.video_evidence?.fps??30,onProgress:percent=>this.message(`Exporting video… ${percent}% · keep this tab visible`)});
      if(version!==this.version)return;
      const url=URL.createObjectURL(blob);const link=Object.assign(document.createElement('a'),{href:url,download:`${this.candidate.id}-captioned.${extension}`});link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      this.message('Video exported. Your download is ready.');window.appHealthLog?.('clip.exported',{props:{format:extension}});
    } catch(error){if(version===this.version)this.message(error.name==='AbortError'?'Export cancelled. Your caption is still here.':error.message,error.name!=='AbortError');}
    finally{if(version===this.version){this.exporting=false;this.controls();}}
  }
}

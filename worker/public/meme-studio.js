import {clampBox,renderMeme} from './meme-renderer.js';

export class MemeStudio {
  constructor(host) {
    this.host=host;this.version=0;this.image=null;this.layers=[];this.originals=[];this.selected=null;this.busy=false;this.blocked=false;
    host.innerHTML=`<header class="studio-header"><div><p class="eyebrow">MAKE IT YOURS</p><h2 id="studio-heading">Meme Studio</h2><p class="studio-context"></p></div><div class="studio-actions"><button type="button" data-action="regenerate">New captions</button><button type="button" class="primary" data-action="download">Download PNG</button></div></header>
      <p class="studio-status" role="status" aria-live="polite"></p>
      <div class="studio-grid"><aside class="studio-layers" aria-label="Text layers"><h3>Text layers</h3><div class="studio-layer-list"></div><button type="button" data-action="add">+ Add text</button></aside>
      <div class="studio-workspace"><div class="studio-frame"><canvas aria-label="Meme image preview">The meme preview. All captions can also be read and edited in the text controls.</canvas><div class="studio-selection" hidden><button class="studio-move" type="button" aria-label="Move selected caption with arrow keys"></button><button class="studio-resize" type="button" aria-label="Resize selected caption with arrow keys"></button></div></div><p class="studio-canvas-note">Loading the original image…</p><button type="button" data-action="reload-image" hidden>Retry image</button></div>
      <aside class="studio-inspector" aria-label="Caption controls"><h3>Selected text</h3><label>Caption<textarea class="studio-text" maxlength="280" rows="3" placeholder="Your caption…"></textarea></label><p class="studio-role"></p><h3>Position & size</h3><div class="studio-numbers">${[['x','X (%)'],['y','Y (%)'],['width','Width (%)'],['height','Height (%)']].map(([field,label])=>`<label>${label}<input type="number" data-field="${field}" min="0" max="100" step="1"></label>`).join('')}</div><div class="studio-format"><label>Max text size<input type="number" data-field="fontSize" min="10" max="240" step="1"></label><label>Rotation (°)<input type="number" data-field="rotation" min="-20" max="20" step="1"></label></div><label>Text style<select class="studio-style"><option value="plain">Black text</option><option value="outlined">White with outline</option></select></label><p class="studio-help">Drag a text box to move it. Drag its corner to resize. Use arrow keys when focused, or the position fields.</p><div class="studio-edit-actions"><button type="button" data-action="reset">Reset placement</button><button type="button" data-action="remove">Remove text</button></div></aside></div>
      <div class="studio-footer"><p class="studio-placement"></p><a class="studio-source" target="_blank" rel="noopener noreferrer">Open original source</a></div><p class="studio-privacy">Caption drafts stay in this tab. Your situation and the template are processed by the AI provider for captioning. Review the wording before sharing.</p>`;
    this.$=selector=>host.querySelector(selector);
    this.canvas=this.$('canvas');
    for(const action of ['regenerate','download','add','reset','remove','reload-image']) this.$(`[data-action="${action}"]`).addEventListener('click',()=>this[action==='reload-image'?'reloadImage':action]());
    this.$('.studio-text').addEventListener('input',()=>{
      const layer=this.selectedLayer();if(!layer)return;
      layer.text=this.$('.studio-text').value;this.layerButtons();this.paint();
    });
    this.$('.studio-style').addEventListener('change',()=>{const layer=this.selectedLayer();if(layer){layer.style=this.$('.studio-style').value;this.paint();}});
    for(const input of host.querySelectorAll('[data-field]')) input.addEventListener('change',()=>this.editField(input));
    this.canvas.addEventListener('pointerdown',event=>{
      if(this.busy||!this.image)return;
      const rect=this.canvas.getBoundingClientRect();const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
      const layer=[...this.layers].reverse().find(layer=>x>=layer.box[0]&&x<=layer.box[0]+layer.box[2]&&y>=layer.box[1]&&y<=layer.box[1]+layer.box[3]);
      if(layer)this.select(layer.id);
    });
    for(const mode of ['move','resize']) {
      const control=this.$('.studio-'+mode);
      control.addEventListener('pointerdown',event=>this.startDrag(event,mode));
      control.addEventListener('pointermove',event=>this.drag(event));
      control.addEventListener('pointerup',()=>{this.dragState=null;});
      control.addEventListener('pointercancel',()=>{this.dragState=null;});
      control.addEventListener('keydown',event=>this.keyboardMove(event,mode));
    }
    this.controls();
  }

  close() {
    this.version++;this.abort?.abort();this.abort=null;this.image?.close();this.image=null;this.layers=[];this.originals=[];this.selected=null;this.dragState=null;this.busy=false;this.expectedAspect=null;this.layoutIssue=false;this.host.hidden=true;
  }
  selectedLayer() {return this.layers.find(layer=>layer.id===this.selected);}
  message(text,error=false) {this.$('.studio-status').textContent=text;this.$('.studio-status').classList.toggle('error',error);}
  async open(candidate,situation) {
    this.close();this.candidate=candidate;this.situation=situation;this.host.hidden=false;this.busy=true;this.blocked=false;
    this.$('#studio-heading').textContent=candidate.name;
    this.$('.studio-context').textContent=`${candidate.perspective_label||'Best match'} · ${candidate.fit_label||'weak'} fit`;
    this.$('.studio-placement').textContent='Writing captions for this template’s structure…';
    this.$('.studio-source').href=candidate.source_url||candidate.image_url;
    this.$('.studio-source').textContent=candidate.license_url?'Open licensed source':'Open source preview · media rights not established';
    this.message('Writing your captions and loading the original image…');
    this.$('.studio-canvas-note').textContent='Loading the original image…';
    this.canvas.width=1;this.canvas.height=1;this.$('.studio-frame').hidden=true;
    this.$('[data-action="reload-image"]').hidden=true;
    this.layerButtons();this.inspector();this.controls();
    const version=this.version;this.abort=new AbortController();
    const imageRequest=this.fetchImage(this.abort.signal).then(image=>{
      if(version===this.version){this.setImage(image);this.paint();}else image.close();
      return image;
    });
    const [draft,image]=await Promise.allSettled([this.fetchDraft(this.abort.signal),imageRequest]);
    if(version!==this.version) {if(image.status==='fulfilled')image.value.close();return;}
    this.busy=false;
    if(image.status!=='fulfilled')this.imageError();
    if(draft.status==='fulfilled')this.applyDraft(draft.value);else this.message(draft.reason.message,true);
    this.paint();this.controls();
  }

  async fetchDraft(signal) {
    const response=await fetch('/api/create',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({comment:this.situation,candidate_id:this.candidate.id,perspective:this.candidate.perspective||'best_match'})});
    let data;try{data=await response.json();}catch{throw new Error('Caption generation returned an unreadable response. Try again.');}
    if(!response.ok) {
      window.appHealthLog?.('composition.failed',{level:'error',title:'Meme captions failed',props:{route:'/api/create',status_code:response.status}});
      throw new Error(data.error||'Could not generate captions. Try again.');
    }
    return data;
  }
  async fetchImage(signal) {
    const response=await fetch(`/api/create/media/${encodeURIComponent(this.candidate.id)}`,{signal});
    if(!response.ok)throw new Error('Could not load the source image.');
    const image=await createImageBitmap(await response.blob());
    if(!image.width||!image.height||image.width>4096||image.height>4096||image.width*image.height>12_000_000) {image.close();throw new Error('This source image is too large to edit.');}
    return image;
  }
  setImage(image) {
    this.image?.close();this.image=image;this.canvas.width=image.width;this.canvas.height=image.height;
    this.$('.studio-frame').hidden=false;
    this.$('.studio-frame').style.setProperty('--frame-width',Math.min(620,560*image.width/image.height)+'px');
    this.$('.studio-canvas-note').textContent=`${image.width} × ${image.height} · Original resolution`;
    this.$('[data-action="reload-image"]').hidden=true;
  }
  imageError() {
    this.$('.studio-frame').hidden=true;this.$('.studio-canvas-note').textContent='The source image could not be loaded.';
    this.$('[data-action="reload-image"]').hidden=false;
  }
  applyDraft(data) {
    this.blocked=data.decision==='none';this.layers=data.decision==='compose'?structuredClone(data.layers):[];this.originals=structuredClone(this.layers);this.selected=this.layers[0]?.id??null;
    this.expectedAspect=data.expected_aspect;
    this.$('.studio-placement').textContent=data.placement==='template'?'Placement follows verified template regions.':data.placement==='vision'?'AI placement · check each label and region.':'Original reaction';
    this.layerButtons();this.inspector();
    this.message(data.decision==='compose'?'Your meme is prefilled. Select any text to adjust it.':data.message||'Use the original reaction.');
  }
  async regenerate() {
    if(this.busy)return;this.busy=true;this.abort?.abort();this.abort=new AbortController();const version=++this.version;
    this.message('Writing a fresh caption draft…');this.controls();
    try {const draft=await this.fetchDraft(this.abort.signal);if(version===this.version)this.applyDraft(draft);}
    catch(error) {if(version===this.version&&error.name!=='AbortError')this.message(error.message,true);}
    finally {if(version===this.version){this.busy=false;this.paint();this.controls();}}
  }
  async reloadImage() {
    if(this.busy)return;this.busy=true;this.abort=new AbortController();const version=++this.version;this.controls();
    try {const image=await this.fetchImage(this.abort.signal);if(version!==this.version){image.close();return;}this.setImage(image);this.message(this.layers.length?'Source image loaded. Your caption draft is ready.':'Source image loaded. Try New captions or add your own text.');}
    catch {if(version===this.version)this.imageError();}
    finally {if(version===this.version){this.busy=false;this.paint();this.controls();}}
  }
  layerButtons() {
    const host=this.$('.studio-layer-list');host.replaceChildren();
    for(const layer of this.layers) {
      const button=document.createElement('button');button.type='button';button.className='studio-layer';button.dataset.layer=layer.id;
      button.setAttribute('aria-pressed',String(layer.id===this.selected));button.disabled=this.busy;
      const title=document.createElement('strong');title.textContent=layer.label;
      const preview=document.createElement('span');preview.textContent=layer.text||'Empty caption';
      button.append(title,preview);button.addEventListener('click',()=>this.select(layer.id));host.append(button);
    }
    if(!this.layers.length)host.append(Object.assign(document.createElement('p'),{className:'studio-help',textContent:this.busy?'Understanding the template…':'Your text layers will appear here.'}));
  }
  select(id) {this.selected=id;this.layerButtons();this.inspector();this.paint();this.controls();}
  inspector() {
    const layer=this.selectedLayer();
    this.$('.studio-text').value=layer?.text??'';this.$('.studio-role').textContent=layer?.role??'Select a caption layer to edit its text and placement.';
    for(const [index,field] of ['x','y','width','height'].entries())this.$(`[data-field="${field}"]`).value=layer?Math.round(layer.box[index]*100):'';
    this.$('[data-field="rotation"]').value=layer?.rotation??0;
    this.$('[data-field="fontSize"]').value=layer?Math.round(layer.fontSize??Math.max(18,Math.min(this.canvas.width,this.canvas.height)*.065)):'';
    this.$('.studio-style').value=layer?.style??'outlined';
  }
  editField(input) {
    const layer=this.selectedLayer();if(!layer)return;const value=Number(input.value);if(!Number.isFinite(value))return;
    const field=input.dataset.field,index=['x','y','width','height'].indexOf(field);
    if(index>=0){layer.box[index]=value/100;layer.box=clampBox(layer.box);}
    else if(field==='rotation')layer.rotation=Math.max(-20,Math.min(20,value));
    else if(field==='fontSize')layer.fontSize=Math.max(10,Math.min(240,value));
    this.inspector();this.paint();
  }
  add() {
    if(this.busy||!this.image||this.blocked||this.layers.length>=8)return;
    const id='text-'+crypto.randomUUID();this.layers.push({id,label:'Your caption',role:'An extra caption you added.',text:'',box:[.08,.04,.84,.18],style:'outlined',rotation:0});this.select(id);this.$('.studio-text').focus();
  }
  remove() {this.layers=this.layers.filter(layer=>layer.id!==this.selected);this.select(this.layers[0]?.id??null);}
  reset() {
    const layer=this.selectedLayer(),original=this.originals.find(layer=>layer.id===this.selected);if(!layer||!original)return;
    layer.box=[...original.box];layer.rotation=original.rotation;layer.style=original.style;delete layer.fontSize;this.inspector();this.paint();
  }
  startDrag(event,mode) {
    if(this.busy||!this.selectedLayer())return;event.preventDefault();
    this.dragState={mode,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,box:[...this.selectedLayer().box]};event.currentTarget.setPointerCapture(event.pointerId);
  }
  drag(event) {
    const state=this.dragState,layer=this.selectedLayer();if(!state||event.pointerId!==state.pointer||!layer)return;
    const rect=this.canvas.getBoundingClientRect();const dx=(event.clientX-state.startX)/rect.width,dy=(event.clientY-state.startY)/rect.height;
    const box=[...state.box];if(state.mode==='move'){box[0]+=dx;box[1]+=dy;}else{box[2]=Math.min(1-box[0],box[2]+dx);box[3]=Math.min(1-box[1],box[3]+dy);}
    layer.box=clampBox(box);this.inspector();this.paint();
  }
  keyboardMove(event,mode) {
    if(this.busy||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    const layer=this.selectedLayer();if(!layer)return;event.preventDefault();
    const delta=event.shiftKey?.05:.01,index=(mode==='resize'?2:0)+(['ArrowUp','ArrowDown'].includes(event.key)?1:0);
    layer.box[index]+=delta*(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1);
    if(mode==='resize'){layer.box[2]=Math.min(1-layer.box[0],layer.box[2]);layer.box[3]=Math.min(1-layer.box[1],layer.box[3]);}
    layer.box=clampBox(layer.box);this.inspector();this.paint();
  }
  paint() {
    const wasIssue=this.layoutIssue;
    this.layoutIssue=false;
    if(this.image) {
      const result=renderMeme(this.canvas,this.image,this.layers);
      const aspectMismatch=this.layers.length&&this.expectedAspect&&Math.abs(this.image.width/this.image.height-this.expectedAspect)>.02;
      const empty=this.layers.some(layer=>!layer.text.trim());
      this.layoutIssue=result.failed.length>0||!!aspectMismatch||empty;
      if(result.failed.length)this.message('Some text cannot fit inside the image. Shorten it, adjust its box, or reduce rotation before downloading.',true);
      else if(aspectMismatch)this.message('The source image shape has changed. Check the placement before using this template.',true);
      else if(empty)this.message('Fill in or remove empty caption layers before downloading.');
      else if(wasIssue)this.message('The text fits. Your meme is ready to download.');
    }
    const selection=this.$('.studio-selection'),layer=this.selectedLayer();selection.hidden=!this.image||!layer||this.busy;
    if(layer){const [x,y,w,h]=layer.box;Object.assign(selection.style,{left:x*100+'%',top:y*100+'%',width:w*100+'%',height:h*100+'%',transform:`rotate(${layer.rotation||0}deg)`});}
    this.controls();
  }
  controls() {
    const active=!!this.selectedLayer()&&!this.busy&&!this.blocked;
    for(const control of this.host.querySelectorAll('.studio-inspector input,.studio-inspector textarea,.studio-inspector select,.studio-edit-actions button'))control.disabled=!active;
    this.$('[data-action="reset"]').disabled=!active||!this.originals.some(layer=>layer.id===this.selected);
    for(const button of this.host.querySelectorAll('.studio-layer'))button.disabled=this.busy;
    this.$('[data-action="regenerate"]').disabled=this.busy;
    this.$('[data-action="download"]').disabled=this.busy||!this.image||!this.layers.length||this.layoutIssue||this.blocked;
    this.$('[data-action="add"]').disabled=this.busy||!this.image||this.blocked||this.layers.length>=8;
    this.$('[data-action="reload-image"]').disabled=this.busy;
  }
  async download() {
    if(this.$('[data-action="download"]').disabled)return;
    const filename=`meme-${this.candidate.id}.png`,version=this.version;
    try {
      // Selection handles live in a separate DOM overlay, never in the image.
      const blob=await new Promise((resolve,reject)=>{try{this.canvas.toBlob(value=>value?resolve(value):reject(new Error()),'image/png');}catch(error){reject(error);}});
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      if(version===this.version)this.message('PNG download started at the original image resolution.');
    } catch {if(version===this.version)this.message('Could not export this image. Your edits are still here; try again.',true);}
  }
}

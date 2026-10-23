import {MemeStudio} from "./meme-studio.js";
import {ClipStudio} from "./clip-studio.js";

for(const style of document.querySelectorAll("link[data-collection-style]"))style.media="all";
const $=selector=>document.querySelector(selector);
const grid=$("#collection-grid"),search=$("#catalogue-search"),count=$("#collection-count"),empty=$("#collection-empty");
const failure=$("#collection-error"),failureMessage=$("#collection-error-message"),retry=$("#collection-retry");
const pagination=$("#collection-pagination"),previous=$("#collection-previous"),next=$("#collection-next");
const dialog=$("#collection-create"),form=$("#collection-caption-form"),generate=$("#collection-generate"),createStatus=$("#collection-create-status");
const staticStudio=new MemeStudio($("#collection-static-studio")),clipStudio=new ClipStudio($("#collection-clip-studio"));
const moods={awkward:/awkward|embarrass|cringe/i,celebrating:/success|victory|celebrat|proud|triumph/i,waiting:/wait|bored|impatien|delay/i,chaos:/chaos|panic|disaster|overwhelm/i,unimpressed:/unimpress|eye.roll|disappoint|skepti/i};
const featured=["drake-preference","gif-yrufixsnwfvcxaxpmx","success-kid","gif-s2e0eucjhwjr6x9pbw","two-buttons","gif-65odcwm00nvmeylsx3","distracted-boyfriend","gif-jumltr3dhegpw"];
const params=new URL(location.href).searchParams;
let format=["image","gif"].includes(params.get("type"))?params.get("type"):"all";
let mood=Object.hasOwn(moods,params.get("mood"))?params.get("mood"):"";
let page=Math.max(1,Number.parseInt(params.get("page"),10)||1),loading=false,catalogue=[],filtered=[],selected=null,generating=false,creatorVersion=0;
const pageSize=24;
search.value=params.get("q")||"";
$("#collection-sort").value=params.get("sort")==="name"?"name":"featured";

function updateUrl(){const url=new URL(location.href);for(const [key,value] of Object.entries({q:search.value.trim(),type:format==="all"?"":format,mood,page:page===1?"":page,sort:$("#collection-sort").value==="featured"?"":"name"})){if(value)url.searchParams.set(key,String(value));else url.searchParams.delete(key);}history.replaceState(null,"",url);}
function controls(){for(const button of document.querySelectorAll("[data-format]"))button.setAttribute("aria-pressed",String(button.dataset.format===format));for(const button of document.querySelectorAll("[data-mood]"))button.setAttribute("aria-pressed",String(button.dataset.mood===mood));$("#collection-clear").hidden=!search.value&&!mood&&format==="all";}

function imageFor(meme,index){
  const frame=Object.assign(document.createElement("div"),{className:"collection-media"});
  const preview=meme.preview_url||meme.media_url||meme.image_url;
  const image=Object.assign(document.createElement("img"),{alt:`${meme.name} reaction preview`,loading:index<8?"eager":"lazy",decoding:"async",referrerPolicy:"no-referrer"});
  image.onerror=()=>{image.remove();frame.prepend(Object.assign(document.createElement("span"),{className:"media-fallback",textContent:"Preview unavailable"}));};
  if(preview)image.src=preview;else image.onerror();
  const button=Object.assign(document.createElement("button"),{type:"button",className:"collection-preview-button"});
  button.setAttribute("aria-label",`${meme.media_type==="gif"?"Preview":"Create with"} ${meme.name}`);
  if(meme.media_type==="gif"){
    const play=Object.assign(document.createElement("span"),{className:"collection-play",textContent:"▶"});play.setAttribute("aria-hidden","true");
    button.setAttribute("aria-pressed","false");button.addEventListener("click",()=>{const playing=button.getAttribute("aria-pressed")!=="true";button.setAttribute("aria-pressed",String(playing));button.setAttribute("aria-label",`${playing?"Pause":"Preview"} ${meme.name}`);image.src=playing?(meme.media_url||meme.image_url):preview;play.textContent=playing?"Ⅱ":"▶";});
    button.append(image,play);
  }else{button.append(image);button.addEventListener("click",()=>openCreator(meme));}
  frame.append(button,Object.assign(document.createElement("span"),{className:"media-kind",textContent:meme.media_type==="gif"?"CLIP":"TEMPLATE"}));
  return frame;
}

function render(){
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pages);
  const start=(page-1)*pageSize,items=filtered.slice(start,start+pageSize),fragment=document.createDocumentFragment();
  for(const [index,meme] of items.entries()){
    const card=Object.assign(document.createElement("article"),{className:"collection-card"}),copy=Object.assign(document.createElement("div"),{className:"collection-copy"}),title=document.createElement("h2");
    title.append(Object.assign(document.createElement("a"),{href:`/memes/${encodeURIComponent(meme.id)}`,textContent:meme.name}));
    const tags=Object.assign(document.createElement("div"),{className:"tag-list"});
    for(const tag of meme.tags.slice(0,2)){const button=Object.assign(document.createElement("button"),{type:"button",textContent:tag});button.addEventListener("click",()=>{search.value=tag;filterCollection();});tags.append(button);}
    const create=Object.assign(document.createElement("button"),{type:"button",className:"collection-create-button",textContent:meme.media_type==="gif"?"Caption this clip →":"Make this meme →"});create.addEventListener("click",()=>openCreator(meme));
    copy.append(title,Object.assign(document.createElement("p"),{textContent:meme.message}),tags,create);card.append(imageFor(meme,index),copy);fragment.append(card);
  }
  grid.replaceChildren(fragment);empty.hidden=items.length!==0;
  count.textContent=filtered.length===0?"0 memes":`Showing ${start+1}–${start+items.length} of ${filtered.length.toLocaleString()} memes`;
  pagination.hidden=filtered.length<=pageSize;$("#collection-page-label").textContent=`Page ${page} of ${pages}`;previous.disabled=page===1;next.disabled=page===pages;controls();updateUrl();
}

function filterCollection(reset=true){
  const words=search.value.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  filtered=catalogue.filter(meme=>{const text=[meme.name,meme.message,meme.relational_pattern,meme.example_context,...meme.tags].join(" ").toLocaleLowerCase();return (format==="all"||meme.media_type===format)&&(!mood||moods[mood].test(text))&&words.every(word=>text.includes(word));});
  if($("#collection-sort").value==="name")filtered.sort((a,b)=>a.name.localeCompare(b.name));
  else filtered.sort((a,b)=>{const ai=featured.indexOf(a.id),bi=featured.indexOf(b.id);return (ai<0?featured.length:ai)-(bi<0?featured.length:bi);});
  if(reset)page=1;render();
}

function showLoading(){
  grid.setAttribute("aria-busy","true");failure.hidden=true;empty.hidden=true;pagination.hidden=true;count.textContent="Loading the collection…";
  const fragment=document.createDocumentFragment();
  for(let index=0;index<pageSize;index++){const card=Object.assign(document.createElement("div"),{className:"collection-card collection-skeleton"});card.setAttribute("aria-hidden","true");card.innerHTML="<div class=\"collection-media\"></div><div class=\"collection-copy\"><span></span><span></span><span></span></div>";fragment.append(card);}
  grid.replaceChildren(fragment);
}
async function loadCollection(){
  if(loading)return;loading=true;retry.disabled=true;showLoading();
  try{
    const response=await fetch("/collection.json");if(!response.ok)throw new Error("Could not load the collection.");
    const rows=await response.json();if(!Array.isArray(rows)||rows.some(row=>!row||typeof row.id!=="string"||typeof row.name!=="string"||!Array.isArray(row.tags)))throw new Error("The collection response was unreadable.");
    catalogue=rows;filterCollection(false);
    const id=new URL(location.href).searchParams.get("meme");if(id){const meme=catalogue.find(item=>item.id===id);if(meme)openCreator(meme);}
  }catch(error){grid.replaceChildren();count.textContent="Collection unavailable";failureMessage.textContent=error.message;failure.hidden=false;empty.hidden=true;pagination.hidden=true;}
  finally{loading=false;retry.disabled=false;grid.setAttribute("aria-busy","false");}
}

function openCreator(meme){
  creatorVersion++;
  staticStudio.close();clipStudio.close();selected=meme;generating=false;generate.disabled=false;generate.textContent="Generate captions →";createStatus.textContent="";
  $("#collection-create-title").textContent=meme.name;
  const preview=$(".collection-selected img");preview.hidden=false;preview.onerror=()=>{preview.hidden=true;};preview.src=meme.preview_url||meme.media_url||meme.image_url;preview.alt=meme.name;
  $(".collection-selected p").textContent=meme.message;$(".collection-selected a").href=`/memes/${encodeURIComponent(meme.id)}`;
  if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
  const url=new URL(location.href);url.searchParams.set("meme",meme.id);history.replaceState(null,"",url);
  if(meme.media_type==="gif")void clipStudio.open(meme);
  $("#collection-situation").focus({preventScroll:true});
}
function closeCreator(){creatorVersion++;staticStudio.close();clipStudio.close();selected=null;generating=false;const url=new URL(location.href);url.searchParams.delete("meme");history.replaceState(null,"",url);}
dialog.addEventListener("close",closeCreator);
$("#collection-create-close").addEventListener("click",()=>dialog.close());
dialog.addEventListener("click",event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
$("#collection-clip-studio").addEventListener("clip-export-state",event=>{generate.disabled=generating||event.detail.exporting;});
form.addEventListener("submit",async event=>{
  event.preventDefault();if(!selected||generating||clipStudio.exporting)return;
  const version=creatorVersion,candidate=selected,brief={comment:$("#collection-situation").value.trim(),audience:$("#collection-audience").value.trim(),tone:$("#collection-tone").value};
  if(!brief.comment){$("#collection-situation").focus();return;}
  generating=true;generate.disabled=true;generate.textContent="Writing captions…";createStatus.textContent="";
  try {
    if(candidate.media_type==="gif")await clipStudio.generate(brief);
    else await staticStudio.open({...candidate,source_url:candidate.provenance?.source_url||candidate.media_url||candidate.image_url,from_collection:true},brief.comment,{audience:brief.audience,tone:brief.tone});
    if(version===creatorVersion)(candidate.media_type==="gif"?clipStudio.host:staticStudio.host).scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
  }catch(error){if(version===creatorVersion)createStatus.textContent=error.message;}
  finally{if(version===creatorVersion){generating=false;generate.disabled=clipStudio.exporting;generate.textContent="Generate new captions →";}}
});

search.addEventListener("input",()=>{if(!loading&&failure.hidden)filterCollection();});
for(const button of document.querySelectorAll("[data-format]"))button.addEventListener("click",()=>{format=button.dataset.format;filterCollection();});
for(const button of document.querySelectorAll("[data-mood]"))button.addEventListener("click",()=>{mood=mood===button.dataset.mood?"":button.dataset.mood;filterCollection();});
$("#collection-sort").addEventListener("change",()=>filterCollection());
$("#collection-clear").addEventListener("click",()=>{search.value="";format="all";mood="";filterCollection();search.focus();});
previous.addEventListener("click",()=>{page--;render();grid.scrollIntoView({behavior:"smooth",block:"start"});});next.addEventListener("click",()=>{page++;render();grid.scrollIntoView({behavior:"smooth",block:"start"});});
retry.addEventListener("click",loadCollection);controls();await loadCollection();

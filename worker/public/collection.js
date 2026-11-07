import {collectionPageSize,collectionDescription,collectionAction,collectionDetail} from "./collection-copy.js";
import {MemeStudio} from "./meme-studio.js";
import {ClipStudio} from "./clip-studio.js";
import {creationMediaUrl} from "./meme-media.js";
import {taxonomy,catalogueViews,browseCatalogue,inferredFacets} from "./catalogue-model.js";

for(const style of document.querySelectorAll("link[data-collection-style]"))style.media="all";
const $=selector=>document.querySelector(selector);
const grid=$("#collection-grid"),search=$("#catalogue-search"),count=$("#collection-count"),empty=$("#collection-empty");
const failure=$("#collection-error"),failureMessage=$("#collection-error-message"),retry=$("#collection-retry");
const pagination=$("#collection-pagination"),previous=$("#collection-previous"),next=$("#collection-next");
const dialog=$("#collection-create"),form=$("#collection-caption-form"),generate=$("#collection-generate"),createStatus=$("#collection-create-status");
const staticStudio=new MemeStudio($("#collection-static-studio")),clipStudio=new ClipStudio($("#collection-clip-studio"));
const moods={awkward:"awkwardness",celebrating:"celebration",waiting:"impatience",chaos:"panic",unimpressed:"skepticism",confused:"confusion"};
const params=new URL(location.href).searchParams;
let format=["image","gif"].includes(params.get("type"))?params.get("type"):"all";
let mood=Object.hasOwn(moods,params.get("mood"))?params.get("mood"):"";
let page=Math.max(1,Number.parseInt(params.get("page"),10)||1),loading=false,catalogue=[],filtered=[],selected=null,generating=false,creatorVersion=0;
let shelves=[],collection=params.get("collection")||(["q","type","mood","context","intensity","resolution","meme"].some(key=>params.has(key))?"all":"selected");
let context=Object.hasOwn(taxonomy.contexts,params.get("context"))?params.get("context"):"",intensity=["quiet","expressive","exaggerated"].includes(params.get("intensity"))?params.get("intensity"):"";
let resolution=["720","1080"].includes(params.get("resolution"))?params.get("resolution"):"";
const pageSize=collectionPageSize;
search.value=params.get("q")||"";
$("#collection-sort").value=params.get("sort")==="name"?"name":"featured";

function updateUrl(){const url=new URL(location.href);for(const [key,value] of Object.entries({q:search.value.trim(),type:format==="all"?"":format,mood,collection,context,intensity,resolution,page:page===1?"":page,sort:$("#collection-sort").value==="featured"?"":"name"})){if(value)url.searchParams.set(key,String(value));else url.searchParams.delete(key);}history.replaceState(null,"",url);}
function controls(){if(context||intensity||resolution)$("#collection-refine").open=true;for(const button of document.querySelectorAll("[data-format]"))button.setAttribute("aria-pressed",String(button.dataset.format===format));for(const button of document.querySelectorAll("[data-mood]"))button.setAttribute("aria-pressed",String(button.dataset.mood===mood));$("#collection-clear").hidden=!search.value&&!mood&&!context&&!intensity&&!resolution&&format==="all"&&collection==="selected";$("#collection-shelf").value=collection;$("#collection-context").value=context;$("#collection-intensity").value=intensity;$("#collection-resolution").value=resolution;const shelf=shelves.find(shelf=>shelf.id===collection);$("#collection-shelf-description").textContent=collectionDescription(shelves,collection);}

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
    const video=meme.mime_type?.startsWith("video/")?Object.assign(document.createElement("video"),{muted:true,loop:true,playsInline:true,hidden:true}):null;
    button.setAttribute("aria-pressed","false");button.addEventListener("click",async()=>{const playing=button.getAttribute("aria-pressed")!=="true";button.setAttribute("aria-pressed",String(playing));button.setAttribute("aria-label",`${playing?"Pause":"Preview"} ${meme.name}`);play.textContent=playing?"Ⅱ":"▶";if(video){image.hidden=playing;video.hidden=!playing;if(playing){if(!video.src)video.src='/api/clips/media/'+encodeURIComponent(meme.id)+(meme.media_revision?'?v='+meme.media_revision:'');try{await video.play();}catch{video.hidden=true;image.hidden=false;button.setAttribute("aria-pressed","false");play.textContent="▶";}}else video.pause();}else image.src=playing?(meme.media_url||meme.image_url):preview;});
    button.append(image,...(video?[video]:[]),play);
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
    const editable=meme.media_type==="gif"||creationMediaUrl(meme);
    const create=Object.assign(document.createElement("button"),{type:"button",className:"collection-create-button",textContent:collectionAction(meme,editable)});create.addEventListener("click",()=>openCreator(meme));
    const detail=collectionDetail(meme);
    copy.append(title,Object.assign(document.createElement("p"),{className:"collection-source-detail",textContent:detail}),Object.assign(document.createElement("p"),{textContent:meme.message}),tags,create);card.append(imageFor(meme,index),copy);fragment.append(card);
  }
  grid.replaceChildren(fragment);empty.hidden=items.length!==0;
  count.textContent=filtered.length===0?"0 memes":`Showing ${start+1}–${start+items.length} of ${filtered.length.toLocaleString()} memes`;
  pagination.hidden=filtered.length<=pageSize;$("#collection-page-label").textContent=`Page ${page} of ${pages}`;previous.disabled=page===1;next.disabled=page===pages;controls();updateUrl();
}

function filterCollection(reset=true){
  if(reset)page=1;
  if(loading||!failure.hidden){controls();updateUrl();return;}
  filtered=browseCatalogue(catalogue,{query:search.value,format,reaction:moods[mood]||"",context,intensity,resolution,collection,collections:shelves,sort:$("#collection-sort").value});
  render();
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
    const libraryStatus=$("#collection-library-status");libraryStatus.hidden=true;
    try{
      const response=await fetch("/catalogue-v2.json");if(!response.ok)throw new Error("Catalog unavailable");
      const model=await response.json();catalogue=catalogueViews(model);shelves=model.collections;
    }catch{
      const response=await fetch("/collection.json");if(!response.ok)throw new Error("Could not load the collection.");
      const rows=await response.json();if(!Array.isArray(rows)||rows.some(row=>!row||typeof row.id!=="string"||typeof row.name!=="string"||!Array.isArray(row.tags)))throw new Error("The collection response was unreadable.");
      let extras=[];try{const more=await fetch("/clips.json");if(!more.ok)throw new Error();extras=await more.json();if(!Array.isArray(extras)||extras.some(row=>!row||typeof row.id!=="string"||!Array.isArray(row.tags)))throw new Error();}catch{extras=[];}
      const originals=[...rows,...extras],aliases=new Map();for(const record of originals)if(record.canonical_id&&record.canonical_id!==record.id)aliases.set(record.canonical_id,[...(aliases.get(record.canonical_id)||[]),record.id]);
      catalogue=originals.filter(record=>(!record.canonical_id||record.canonical_id===record.id)&&(!record.catalogue_status||record.catalogue_status==="active")).map(record=>({...record,alias_ids:aliases.get(record.id)||[],facets:record.catalogue_profile?.facets||inferredFacets(record),review:{state:record.catalogue_profile?"editorial":"unreviewed"},search_text:[record.name,record.message,record.relational_pattern,...record.tags].join(" ").toLocaleLowerCase()}));shelves=[];collection="all";
      libraryStatus.textContent="Selected collections are unavailable. Showing the original catalog; reload to try again.";libraryStatus.hidden=false;
    }
    const shelfSelect=$("#collection-shelf");shelfSelect.replaceChildren();for(const shelf of [{id:"selected",title:"Selected reactions"},{id:"all",title:"Every reaction"},...shelves])shelfSelect.append(Object.assign(document.createElement("option"),{value:shelf.id,textContent:shelf.title}));
    if(!["all","selected",...shelves.map(shelf=>shelf.id)].includes(collection))collection="all";
    for(const [selector,values,placeholder] of [["#collection-context",taxonomy.contexts,"Any situation"],["#collection-intensity",Object.fromEntries(Object.entries(taxonomy.intensity).filter(([id])=>id!=="unknown")),"Any energy"]]){const select=$(selector);select.replaceChildren(Object.assign(document.createElement("option"),{value:"",textContent:placeholder}));for(const [id,label] of Object.entries(values))select.append(Object.assign(document.createElement("option"),{value:id,textContent:label}));}
    $(".beta").textContent=catalogue.length.toLocaleString()+" REACTIONS";loading=false;filterCollection(false);
    const id=new URL(location.href).searchParams.get("meme");if(id){const meme=catalogue.find(item=>item.id===id||item.alias_ids?.includes(id));if(meme)openCreator(meme);}
  }catch(error){grid.replaceChildren();count.textContent="Collection unavailable";failureMessage.textContent=error.message;failure.hidden=false;empty.hidden=true;pagination.hidden=true;}
  finally{loading=false;retry.disabled=false;grid.setAttribute("aria-busy","false");}
}

function openCreator(meme){
  if(meme.media_type!=="gif"&&!creationMediaUrl(meme)){location.assign(`/memes/${encodeURIComponent(meme.id)}`);return;}
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
$("#collection-clip-studio").addEventListener("clip-export-state",event=>{generate.disabled=generating||event.detail.exporting||(selected?.media_type==="gif"&&!clipStudio.ready);});
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

search.addEventListener("input",()=>{if(collection==="selected"&&search.value.trim())collection="all";filterCollection();});
for(const button of document.querySelectorAll("[data-format]"))button.addEventListener("click",()=>{format=button.dataset.format;filterCollection();});
for(const button of document.querySelectorAll("[data-mood]"))button.addEventListener("click",()=>{mood=mood===button.dataset.mood?"":button.dataset.mood;filterCollection();});
$("#collection-sort").addEventListener("change",()=>filterCollection());
$("#collection-shelf").addEventListener("change",event=>{collection=event.target.value;filterCollection();});
$("#collection-context").addEventListener("change",event=>{context=event.target.value;filterCollection();});
$("#collection-intensity").addEventListener("change",event=>{intensity=event.target.value;filterCollection();});
$("#collection-resolution").addEventListener("change",event=>{resolution=event.target.value;filterCollection();});
$("#collection-clear").addEventListener("click",()=>{search.value="";format="all";mood="";context="";intensity="";resolution="";collection="all";filterCollection();search.focus();});
previous.addEventListener("click",()=>{page--;render();grid.scrollIntoView({behavior:"smooth",block:"start"});});next.addEventListener("click",()=>{page++;render();grid.scrollIntoView({behavior:"smooth",block:"start"});});
retry.addEventListener("click",loadCollection);controls();await loadCollection();

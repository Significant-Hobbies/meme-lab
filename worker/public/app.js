import {MemeStudio} from './meme-studio.js';
import {recommendationTrafficClass,reportRecommendationOutcome} from './recommendation-outcomes.js';

const $=selector=>document.querySelector(selector);
const form=$('#meme-form');
const comment=$('#comment');
const submit=$('#submit');
const status=$('#status');
const loading=$('#loading');
const result=$('#result');
const noMatch=$('#no-match');
let currentRecommendation=null;
let selectedCandidate=null;
let submittedSituation='';
let searchVersion=0;
const studio=new MemeStudio($('#meme-studio'));
const fitText=candidate=>`${candidate.fit_label||'weak'}`.toUpperCase()+' FIT';
const displayText=value=>String(value??'')
  .replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi,(_,code)=>String.fromCodePoint(Number.parseInt(code,16)))
  .replaceAll('&quot;','"')
  .replaceAll('&apos;',"'")
  .replaceAll('&amp;','&')
  .replaceAll('&lt;','<')
  .replaceAll('&gt;','>');

function showOnly(target) {
  loading.hidden=target!=='loading';
  result.hidden=target!=='result';
  noMatch.hidden=target!=='none';
}

function media(candidate,className) {
  const wrap=document.createElement('div');
  wrap.className=className;
  const mediaUrl=candidate.media_url||candidate.image_url;
  if(!mediaUrl) {
    wrap.append(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'Preview unavailable'}));
    return wrap;
  }
  if(candidate.mime_type?.startsWith('video/')&&candidate.id) {
    const video=Object.assign(document.createElement('video'),{controls:true,muted:true,playsInline:true,preload:'metadata',poster:candidate.preview_url||'',src:'/api/clips/media/'+encodeURIComponent(candidate.id)+(candidate.media_revision?'?v='+candidate.media_revision:'')});
    video.setAttribute('aria-label',`${displayText(candidate.name)} reaction clip`);
    wrap.classList.add('video-reaction');
    wrap.append(video,Object.assign(document.createElement('span'),{className:'media-kind',textContent:'CLIP'}));
    return wrap;
  }
  const image=document.createElement('img');
  image.alt=`Meme preview: ${displayText(candidate.name)}`;
  image.referrerPolicy='no-referrer';
  image.loading='eager';
  image.decoding='async';
  image.onerror=()=>wrap.replaceChildren(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'Preview unavailable'}));
  image.src=mediaUrl;
  if(candidate.id) {
    const link=Object.assign(document.createElement('a'),{className:'media-link',href:`/memes/${encodeURIComponent(candidate.id)}`,'aria-label':`Open ${displayText(candidate.name)} meme details`});
    link.addEventListener('click',()=>reportRecommendationOutcome('detail_open_requested',currentRecommendation,candidate));
    link.append(image);
    wrap.append(link);
  } else wrap.append(image);
  if(candidate.media_type==='gif') wrap.append(Object.assign(document.createElement('span'),{className:'media-kind',textContent:'CLIP'}));
  return wrap;
}

function renderBest(candidate) {
  const host=$('#best-result');
  host.replaceChildren();
  const copy=document.createElement('div');
  copy.className='result-copy';
  const lowConfidence=currentRecommendation?.confidence==='low';
  const perspectiveAware=candidate.perspective&&candidate.perspective!=='best_match';
  const matchLabel=perspectiveAware?candidate.perspective_label.toUpperCase():candidate.rank===1?'BEST MATCH':'SELECTED TEMPLATE';
  const rank=Object.assign(document.createElement('span'),{className:`rank${lowConfidence?' low-confidence':''}`,textContent:`${lowConfidence?'LOW CONFIDENCE · ':''}${matchLabel} · ${fitText(candidate)}`});
  const title=document.createElement('h2');
  title.append(Object.assign(document.createElement('a'),{href:`/memes/${encodeURIComponent(candidate.id)}`,textContent:displayText(candidate.name)}));
  title.firstChild.addEventListener('click',()=>reportRecommendationOutcome('detail_open_requested',currentRecommendation,candidate));
  const signals=Object.assign(document.createElement('p'),{className:'signal-note',textContent:candidate.signal_summary});
  const sourceText=candidate.license_url?'Open original · licensed source':candidate.media_status==='approved'?'Open approved source':'Open source preview · media rights not established';
  const source=document.createElement('p');
  source.className='source-note';
  if(candidate.source_url) {
    const link=Object.assign(document.createElement('a'),{textContent:sourceText,href:candidate.source_url,target:'_blank',rel:'noopener noreferrer'});
    source.append(link);
  } else source.textContent=sourceText;
  copy.append(rank,title,signals,source);
  if(candidate.media_type==='gif')copy.append(Object.assign(document.createElement('a'),{className:'primary',href:`/collection?meme=${encodeURIComponent(candidate.id)}`,textContent:'Caption this clip →'}));
  host.append(media(candidate,'hero-media'),copy);
}

function renderAlternatives(candidates) {
  const host=$('#alternatives');
  host.replaceChildren();
  $('#alternatives-wrap').hidden=!candidates.length;
  const perspectiveAware=candidates.some(candidate=>candidate.perspective&&candidate.perspective!=='best_match');
  $('#alternatives-title').textContent=perspectiveAware?'OTHER PERSPECTIVES':'ALSO FITS';
  $('#alternatives-subtitle').textContent=perspectiveAware?'Different angles, ranked by fit.':'Four backups, ranked by fit.';
  for(const candidate of candidates) {
    const card=document.createElement('article');
    card.className='alternative';
    const copy=document.createElement('div');
    copy.className='alternative-copy';
    const title=document.createElement('h3');
    title.append(Object.assign(document.createElement('a'),{href:`/memes/${encodeURIComponent(candidate.id)}`,textContent:displayText(candidate.name)}));
    title.firstChild.addEventListener('click',()=>reportRecommendationOutcome('detail_open_requested',currentRecommendation,candidate));
    copy.append(
      Object.assign(document.createElement('span'),{textContent:`${candidate.perspective&&candidate.perspective!=='best_match'?candidate.perspective_label.toUpperCase():`#${candidate.rank}`} · ${fitText(candidate)}`}),
      title,
      Object.assign(document.createElement('p'),{className:'signal-note',textContent:candidate.signal_summary})
    );
    if(candidate.media_type!=='gif') {
      const create=Object.assign(document.createElement('button'),{type:'button',className:'create-alternative',textContent:'Make this meme'});
      create.addEventListener('click',()=>openStudio(candidate));copy.append(create);
    }else copy.append(Object.assign(document.createElement('a'),{className:'create-alternative',href:`/collection?meme=${encodeURIComponent(candidate.id)}`,textContent:'Caption this clip →'}));
    card.append(media(candidate,'alternative-media'),copy);
    host.append(card);
  }
}

function openStudio(candidate,{intentional=true}={}) {
  selectedCandidate=candidate;
  const recommendation=currentRecommendation;
  if(intentional)reportRecommendationOutcome('candidate_selected',recommendation,candidate);
  studio.onExportOutcome=outcome=>reportRecommendationOutcome(outcome,recommendation,candidate);
  renderBest(candidate);
  $('#feedback-status').textContent='';
  for(const button of document.querySelectorAll('[data-verdict]')) {button.disabled=false;button.removeAttribute('aria-pressed');}
  $('#best-result').hidden=true;
  studio.open({...candidate,name:displayText(candidate.name)},submittedSituation).then(()=>{
    if(!studio.host.hidden&&studio.candidate.id===candidate.id&&!studio.image)$('#best-result').hidden=false;
  });
  result.scrollIntoView({behavior:'smooth',block:'start'});
}

async function findMeme() {
  const value=comment.value.trim();
  if(!value) { status.textContent='Paste a comment first.'; comment.focus(); return; }
  const version=++searchVersion;
  studio.close();
  $('#best-result').hidden=false;
  status.textContent='';
  submit.disabled=true;
  submit.querySelector('span').textContent='Finding it…';
  showOnly('loading');
  const started=Date.now();
  let responseStatus=0;
  try {
    const response=await fetch('/api/recommend',{method:'POST',headers:{'Content-Type':'application/json','X-Fleet-Traffic':recommendationTrafficClass(location.search)},body:JSON.stringify({comment:value})});
    responseStatus=response.status;
    const data=await response.json();
    if(version!==searchVersion)return;
    if(!response.ok) throw new Error(data.error||'Could not find a meme.');
    if(data.degraded)reportRecommendationOutcome('degraded',data,null,{durationMs:Date.now()-started});
    if(data.decision==='none') {
      currentRecommendation=data;
      $('#no-match-reason').textContent=data.none_reason;
      showOnly('none');
      reportRecommendationOutcome('shown',data,null);
      return;
    }
    currentRecommendation=data;
    submittedSituation=value;
    selectedCandidate=data.candidates[0];
    renderBest(data.candidates[0]);
    renderAlternatives(data.candidates.slice(1));
    $('#feedback').hidden=!data.feedback_enabled;
    $('#feedback-status').textContent='';
    for(const button of document.querySelectorAll('[data-verdict]')) { button.disabled=false;button.removeAttribute('aria-pressed'); }
    showOnly('result');
    reportRecommendationOutcome('shown',data,selectedCandidate);
    if(data.candidates[0].media_type!=='gif')openStudio(data.candidates[0],{intentional:false});
    result.scrollIntoView({behavior:'smooth',block:'start'});
  } catch(error) {
    if(version!==searchVersion)return;
    window.appHealthLog?.('recommendation.failed',{level:'error',title:'Meme picker failed',props:{route:'/api/recommend',status_code:responseStatus,duration_ms:Date.now()-started,stage:'browser',traffic_class:recommendationTrafficClass(location.search)}});
    showOnly('form');
    status.textContent=error.message;
  } finally {
    if(version!==searchVersion)return;
    submit.disabled=false;
    submit.querySelector('span').textContent='Find the meme';
  }
}

form.addEventListener('submit',event=>{event.preventDefault();findMeme();});
for(const button of document.querySelectorAll('[data-example]')) button.addEventListener('click',()=>{if(submit.disabled)return;comment.value=button.dataset.example;button.closest("details")?.removeAttribute("open");form.requestSubmit();});
$('#try-again').addEventListener('click',()=>{studio.close();showOnly('form');comment.focus();window.scrollTo({top:0,behavior:'smooth'});});
$('#edit-comment').addEventListener('click',()=>{studio.close();showOnly('form');comment.focus();window.scrollTo({top:0,behavior:'smooth'});});
for(const button of document.querySelectorAll('[data-verdict]')) button.addEventListener('click',async()=>{
  if(!currentRecommendation?.request_id||!selectedCandidate) return;
  const recommendation=currentRecommendation,candidate=selectedCandidate,verdict=button.dataset.verdict;
  for(const peer of document.querySelectorAll('[data-verdict]')) peer.disabled=true;
  $('#feedback-status').textContent='Saving…';
  try {
    const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json','X-Fleet-Traffic':recommendationTrafficClass(location.search)},body:JSON.stringify({request_id:recommendation.request_id,verdict,candidate_id:candidate.id})});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||'Could not save feedback.');
    reportRecommendationOutcome('feedback_saved',recommendation,candidate,{verdict});
    button.setAttribute('aria-pressed','true');
    $('#feedback-status').textContent='Saved. Thank you.';
  } catch(error) {
    $('#feedback-status').textContent=error.message;
    for(const peer of document.querySelectorAll('[data-verdict]')) peer.disabled=false;
  }
});

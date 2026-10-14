// Above-fold rules are in the initial response; load the unchanged full styles without blocking it.
for(const style of document.querySelectorAll('link[data-collection-style]')) style.media='all';
const grid=document.querySelector('#collection-grid');
const search=document.querySelector('#catalogue-search');
const count=document.querySelector('#collection-count');
const empty=document.querySelector('#collection-empty');
const failure=document.querySelector('#collection-error');
const failureMessage=document.querySelector('#collection-error-message');
const retry=document.querySelector('#collection-retry');
let loading=false;
const pagination=document.querySelector('#collection-pagination');
const pageLabel=document.querySelector('#collection-page-label');
const previous=document.querySelector('#collection-previous');
const next=document.querySelector('#collection-next');
let catalogue=[];
let filtered=[];
let page=1;
const pageSize=24;

function imageFor(meme,index) {
  const frame=document.createElement('div');
  frame.className='collection-media';
  const mediaUrl=meme.media_type==='gif'?(meme.preview_url||meme.media_url||meme.image_url):(meme.media_url||meme.image_url);
  if(!mediaUrl) {
    frame.append(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'Preview unavailable'}));
    return frame;
  }
  const image=document.createElement('img');
  image.alt=`${meme.name} meme reference`;
  image.loading=index<6?'eager':'lazy';
  image.decoding='async';
  image.referrerPolicy='no-referrer';
  image.onerror=()=>frame.replaceChildren(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'Preview unavailable'}));
  image.src=mediaUrl;
  const link=Object.assign(document.createElement('a'),{className:'media-link',href:`/memes/${encodeURIComponent(meme.id)}`,'aria-label':`Open ${meme.name} meme details`});
  link.append(image);
  frame.append(link);
  if(meme.media_type==='gif') frame.append(Object.assign(document.createElement('span'),{className:'media-kind',textContent:'GIF'}));
  return frame;
}

function render() {
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  page=Math.min(page,pages);
  const start=(page-1)*pageSize;
  const items=filtered.slice(start,start+pageSize);
  grid.replaceChildren();
  const fragment=document.createDocumentFragment();
  for(const [index,meme] of items.entries()) {
    const card=document.createElement('article');
    card.className=`collection-card collection-card-${meme.availability}`;
    const copy=document.createElement('div');
    copy.className='collection-copy';
    const tags=document.createElement('div');
    tags.className='tag-list';
    for(const tag of meme.tags.slice(0,3)) tags.append(Object.assign(document.createElement('span'),{textContent:tag}));
    const title=document.createElement('h2');
    title.append(Object.assign(document.createElement('a'),{href:`/memes/${encodeURIComponent(meme.id)}`,textContent:meme.name}));
    copy.append(
      Object.assign(document.createElement('span'),{className:`collection-state collection-state-${meme.availability}`,textContent:meme.availability==='live'?'Live now':'Experimental'}),
      title,
      Object.assign(document.createElement('p'),{textContent:meme.message}),
      tags
    );
    card.append(imageFor(meme,index),copy);
    fragment.append(card);
  }
  grid.append(fragment);
  empty.hidden=items.length!==0;
  count.textContent=filtered.length===0?'0 memes':`Showing ${start+1}–${start+items.length} of ${filtered.length} memes`;
  pagination.hidden=filtered.length<=pageSize;
  pageLabel.textContent=`Page ${page} of ${pages}`;
  previous.disabled=page===1;
  next.disabled=page===pages;
}

function filterCollection() {
  const query=search.value.trim().toLocaleLowerCase();
  filtered=query?catalogue.filter(meme=>[meme.name,meme.message,meme.relational_pattern,...meme.tags].join(' ').toLocaleLowerCase().includes(query)):catalogue;
  page=1;
  render();
}

function showLoading() {
  grid.hidden=false;
  grid.setAttribute('aria-busy','true');
  failure.hidden=true;
  empty.hidden=true;
  pagination.hidden=true;
  count.textContent='Loading the collection…';
  const fragment=document.createDocumentFragment();
  for(let index=0;index<pageSize;index+=1) {
    const card=document.createElement('div');
    card.className='collection-card collection-skeleton';
    card.setAttribute('aria-hidden','true');
    const media=document.createElement('div');
    media.className='collection-media';
    const copy=document.createElement('div');
    copy.className='collection-copy';
    for(let line=0;line<3;line+=1) copy.append(document.createElement('span'));
    card.append(media,copy);
    fragment.append(card);
  }
  grid.replaceChildren(fragment);
}

async function loadCollection() {
  if(loading) return;
  loading=true;
  retry.disabled=true;
  showLoading();
  try {
    const response=await fetch('/collection.json');
    if(!response.ok) throw new Error('Could not load the collection.');
    const rows=await response.json();
    if(!Array.isArray(rows)) throw new Error('The collection response was unreadable.');
    catalogue=rows;
    filterCollection();
  } catch(error) {
    grid.replaceChildren();
    count.textContent='Collection unavailable';
    failureMessage.textContent=error instanceof Error?error.message:'Could not load the collection.';
    failure.hidden=false;
    empty.hidden=true;
    pagination.hidden=true;
  } finally {
    loading=false;
    retry.disabled=false;
    grid.setAttribute('aria-busy','false');
  }
}

search.addEventListener('input',()=>{if(!loading&&failure.hidden) filterCollection();});
previous.addEventListener('click',()=>{page-=1;render();grid.scrollIntoView({behavior:'smooth',block:'start'});});
next.addEventListener('click',()=>{page+=1;render();grid.scrollIntoView({behavior:'smooth',block:'start'});});
retry.addEventListener('click',loadCollection);
await loadCollection();

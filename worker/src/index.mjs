import {createPublicReadability,staticPaths} from './public-readability.mjs';
import {wantsMarkdown} from './agent-surfaces/http.mjs';
import {catalogue,clipLibrary,retrievalCatalogue} from './catalogue.mjs';
import {createGatewayClassifierFetch,hasMultiplePerspectives,humourBelongs,needsSeriousHandling,rankCandidates,rankCandidatesByPerspective,requiresFactualAnswer} from './classification.mjs';
import {withClassifierDeadline} from './classifier-deadline.mjs';
import {MAX_RECOMMENDATIONS,presentSelection,selectionFromRanking} from './recommendation.mjs';
import {retrieveCandidates} from './retrieval.mjs';
import {classifierUnavailable,reportPickerHealth} from './recommendation-health.mjs';
import {BudgetUnavailableError} from './ai-budget.mjs';
import {endpointFor,pingFor} from './ping.mjs';
import {annaEvent} from './anna-events.mjs';
import {annaShortlist} from './anna-shortlist.mjs';
import {composeMeme,compositionMedia,annaComposition} from './meme-composition.mjs';
import {clipCaptions,clipMedia} from './clip-captions.mjs';
import {creationMediaUrl} from './meme-templates.mjs';

const allowedIds=new Set(retrievalCatalogue.map(record=>record.id));
const catalogueById=new Map([...catalogue,...clipLibrary].map(record=>[record.id,record]));
const CLASSIFIER_MODEL='free-ai:auto';
const RETRIEVAL_FALLBACK_MODEL='vector-retrieval-fallback';
const SITE_ORIGIN='https://memes.significanthobbies.com';
function forHead(request,response) {
  if(request.method!=='HEAD') return response;
  return new Response(null,{status:response.status,statusText:response.statusText,headers:response.headers});
}

function agentCatalog(origin=SITE_ORIGIN) {
  return {
    name:'Meme Lab',
    version:'1',
    url:origin,
    llms:`${origin}/llms.txt`,
    llmsFull:`${origin}/llms-full.txt`,
    sitemap:`${origin}/sitemap.xml`,
    robots:`${origin}/robots.txt`,
    markdown:{suffix:'.md',negotiation:true,catalog:origin+'/api/md/_catalog'},
    surfaces:[
      {id:'home',url:`${origin}/`,md:`${origin}/index.md`,kind:'static',description:'Paste a comment and get the best-matching meme.'},
      {id:'collection',url:`${origin}/collection`,md:`${origin}/collection.md`,kind:'collection',description:'Browse meme templates and measured reaction clips; create an image or captioned video.'},
      {id:'how-it-works',url:`${origin}/how-it-works`,md:`${origin}/how-it-works.md`,kind:'static',description:'How retrieval, ranking and evaluation work.'},
      ...staticPaths.filter(path=>!['/','/collection','/how-it-works'].includes(path)).map(path=>({id:path.slice(1),url:origin+path,md:origin+path+'.md',kind:'static'})),
      {id:'meme',url:`${origin}/memes/{id}`,md:`${origin}/memes/{id}.md`,kind:'dynamic',description:'One reference page per catalogued meme; replace {id} with a sitemap meme id.'}
    ],
    auth:{public:true,notes:'Public surfaces need no authentication. The /api/recommend and /api/feedback endpoints are POST-only and excluded.'}
  };
}

function json(data,status=200,extraHeaders={}) {
  return Response.json(data,{status,headers:{
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'X-Robots-Tag':'noindex, nofollow',
    ...extraHeaders
  }});
}

function escapeHtml(value) {
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function secureHeaders(headers=new Headers()) {
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('X-Frame-Options','DENY');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' https://sassmaker.com https://health.sassmaker.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://i.imgflip.com https://api.memegen.link https://media.giphy.com; media-src 'self' blob:; connect-src 'self' https://ingest.sassmaker.com https://api.sassmaker.com https://sassmaker.com https://cloudflareinsights.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return headers;
}

function pageResponse(body,{status=200,indexable=true,cacheControl='public, max-age=3600'}={}) {
  const headers=secureHeaders(new Headers({'Cache-Control':cacheControl,'Content-Type':'text/html; charset=utf-8'}));
  if(!indexable) headers.set('X-Robots-Tag','noindex, nofollow');
  return new Response(body,{status,headers});
}

function textResponse(body,{status=200,contentType='text/plain; charset=utf-8',cacheControl='public, max-age=21600'}={}) {
  return new Response(body,{status,headers:secureHeaders(new Headers({'Cache-Control':cacheControl,'Content-Type':contentType}))});
}

function publicMemePath(record) {
  return `/memes/${encodeURIComponent(record.id)}`;
}

function structuredData(value) {
  return JSON.stringify(value).replaceAll('<','\\u003c');
}

function memePage(record) {
  const path=publicMemePath(record);
  const canonical=`${SITE_ORIGIN}${path}`;
  const name=escapeHtml(record.name);
  const description=escapeHtml(`${record.name} works when ${record.message.charAt(0).toLocaleLowerCase()}${record.message.slice(1)}`);
  const mediaUrl=escapeHtml(record.media_url||record.image_url||'');
  const previewUrl=escapeHtml(record.preview_url||record.media_url||record.image_url||'');
  const tags=record.tags.map(tag=>`<li>${escapeHtml(tag)}</li>`).join('');
  const sourceNote=record.media_status==='approved'?'Approved media source':'Source preview; redistribution rights are not established';
  const schema={
    '@context':'https://schema.org',
    '@type':'CreativeWork',
    name:`${record.name} meme`,
    description:`${record.message} ${record.relational_pattern}`,
    url:canonical,
    image:record.preview_url||record.media_url||record.image_url,
    keywords:record.tags.join(', '),
    isPartOf:{'@type':'WebSite',name:'Meme Lab',url:SITE_ORIGIN}
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${name} Meme Meaning, Examples &amp; When to Use It | Meme Lab</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Meme Lab">
  <meta property="og:title" content="${name} Meme Meaning &amp; Examples">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  ${previewUrl?`<meta property="og:image" content="${previewUrl}">`:''}
  <meta name="twitter:card" content="summary_large_image">
  <link rel="alternate" type="text/markdown" href="${canonical}.md" title="Markdown version">
  <script type="application/ld+json">${structuredData(schema)}</script>
  <script src="/app-health-log.js" defer></script>
  <script src="/fleet-engagement.js" defer></script>
  <link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/footer-precise.css">
</head>
<body class="page-meme">
  <header class="topbar">
    <a class="brand" href="/" aria-label="Meme Lab home">Meme Lab</a>
    <nav class="site-nav" aria-label="Main navigation">
      <a href="/">Try it</a>
      <a href="/collection">Collection</a>
      <a href="/how-it-works">How it works</a>
    </nav>
    <span class="beta">MEMES + CLIPS</span>
  </header>
  <main class="meme-detail-main">
    <a class="back-link" href="/collection">&larr; Back to the collection</a>
    <article class="meme-detail">
      <div class="meme-detail-media">
        ${mediaUrl?record.mime_type?.startsWith('video/')?`<video controls playsinline loop muted preload="metadata" poster="${previewUrl}" src="/api/clips/media/${encodeURIComponent(record.id)}${record.media_revision?'?v='+record.media_revision:''}" aria-label="${name} reaction clip"></video>`:`<img src="${mediaUrl}" alt="${name} meme reference" referrerpolicy="no-referrer">`:'<span class="media-fallback">Preview unavailable</span>'}
        ${record.media_type==='gif'?'<span class="media-kind">CLIP</span>':''}
      </div>
      <div class="meme-detail-copy">
        <p class="eyebrow">MEME REFERENCE</p>
        <h1>${name}</h1>
        <p class="meme-definition">${escapeHtml(record.message)}</p>
        <dl class="meme-guide">
          ${record.video_evidence?`<div><dt>Source dimensions</dt><dd>${record.video_evidence.width} × ${record.video_evidence.height} encoded pixels · ${record.video_evidence.fps} fps · ${record.video_evidence.duration.toFixed(1)} seconds</dd></div>`:''}
          ${record.catalogue_scope!=='gallery'||record.catalogue_profile?`<div><dt>What it expresses</dt><dd>${escapeHtml(record.relational_pattern)}</dd></div><div><dt>Example</dt><dd>${escapeHtml(record.example_context)}</dd></div><div><dt>When not to use it</dt><dd>${escapeHtml(record.near_miss_context)}</dd></div>`:''}
          ${record.catalogue_scope==='gallery'&&!allowedIds.has(record.id)?'<div><dt>About this reaction</dt><dd>This clip is available to browse and caption. It has not been evaluated for automatic recommendations.</dd></div>':''}
        </dl>
        <ul class="tag-list meme-detail-tags" aria-label="Related moods">${tags}</ul>
        <div class="meme-detail-actions">
          ${record.media_type==='gif'||creationMediaUrl(record)?`<a class="primary" href="/collection?meme=${encodeURIComponent(record.id)}">${record.media_type==='gif'?'Caption this clip':'Make this meme'} <span aria-hidden="true">&rarr;</span></a>`:''}
          <a href="/">Find a meme for your situation</a>
          ${record.image_url?`<a class="source-link" href="${escapeHtml(record.provenance?.source_url||record.image_url)}" target="_blank" rel="noopener noreferrer">${sourceNote}</a>`:''}
          ${record.attribution?`<p class="source-credit">${escapeHtml(record.attribution)}</p>`:''}
        </div>
      </div>
    </article>
  </main>
  <fleet-footer-extension data-fleet-footer-project="meme-lab" product-name="Meme Lab" theme="light" surface="web" font-base="/fonts/fleet-footer-precise-v1/" signature-font="newsreader" art-src="/footer-art/meme-lab-original-v1.webp" art-alt="Two reaction-card characters flank a blank comment card." art-width="2170" art-height="725" art-position="50% 50%">
    <a data-fleet-footer-cta data-fleet-footer-primary slot="cta" href="/collection">Browse memes and reaction clips <span aria-hidden="true">→</span></a>
    <footer data-fleet-footer-navigation slot="navigation">
      <nav aria-label="Footer navigation"><a href="/">Meme Lab home</a><a href="/collection">Collection</a><a href="/how-it-works">How it works</a></nav>
      <p>Match the situation, then pick the perspective.</p>
    </footer>
  </fleet-footer-extension>
  <script src="https://sassmaker.com/project-strip.js?v=precise-b0adaa67" data-project="meme-lab" data-theme="light" data-host-only="true" defer></script>
  <script src="https://sassmaker.com/ai-chat-footer.js?v=precise-b0adaa67" data-project="meme-lab" data-name="Meme Lab" data-theme="light" data-surface="web" data-art-src="/footer-art/meme-lab-original-v1.webp" data-art-alt="Two reaction-card characters flank a blank comment card." data-art-width="2170" data-art-height="725" data-art-position="50% 50%" data-host-only="true" data-capture="false" defer></script>
</body>
</html>`;
}

function notFoundPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Meme not found | Meme Lab</title><link rel="stylesheet" href="/app.css"></head><body><main class="not-found"><p class="eyebrow">404</p><h1>That meme is not in the collection.</h1><p class="intro">Browse the live catalogue or try another situation.</p><a class="primary" href="/collection">Browse the collection <span aria-hidden="true">&rarr;</span></a></main></body></html>`;
}

function memeMarkdown(record) {
  const canonical=`${SITE_ORIGIN}${publicMemePath(record)}`;
  const media=record.preview_url||record.media_url||record.image_url||'';
  const sourceNote=record.media_status==='approved'?'Approved media source':'Source preview; redistribution rights are not established';
  const lines=[
    `# ${record.name} — Meme Lab`,
    '',
    record.message,
    '',
    ...(record.catalogue_scope!=='gallery'||record.catalogue_profile?[`- What it expresses: ${record.relational_pattern}`,`- Example: ${record.example_context}`,`- When not to use it: ${record.near_miss_context}`]:[])
  ];
  if(record.video_evidence)lines.push(`- Source dimensions: ${record.video_evidence.width} × ${record.video_evidence.height} encoded pixels · ${record.video_evidence.fps} fps · ${record.video_evidence.duration.toFixed(1)} seconds`);
  if(record.catalogue_scope==='gallery'&&!allowedIds.has(record.id))lines.push('- About this reaction: This clip is available to browse and caption. It has not been evaluated for automatic recommendations.');
  if(record.media_type==='gif'||creationMediaUrl(record))lines.push(`[${record.media_type==='gif'?'Caption this clip':'Make this meme'}](${SITE_ORIGIN}/collection?meme=${encodeURIComponent(record.id)})`);
  lines.push(`[Find a meme for your situation](${SITE_ORIGIN}/)`);
  if(record.attribution)lines.push(record.attribution);
  if(record.tags?.length) lines.push(`- Tags: ${record.tags.join(', ')}`);
  if(media) lines.push(`- Media: ${media}`);
  if(record.image_url) lines.push(`- Source: ${record.provenance?.source_url||record.image_url} (${sourceNote})`);
  lines.push(`- Page: ${canonical}`,`- Collection: ${SITE_ORIGIN}/collection`,'');
  return lines.join('\n');
}

function memeNotFound(request,asMarkdown) {
  if(asMarkdown||wantsMarkdown(request)) {
    return textResponse('# Not found\n\nThat meme is not in the collection.\n',{status:404,contentType:'text/markdown; charset=utf-8',cacheControl:'no-store'});
  }
  return pageResponse(notFoundPage(),{status:404,indexable:false,cacheControl:'no-store'});
}

const publicReadability=createPublicReadability([...catalogueById.values()],memeMarkdown);

function safeError(error) {
  return error instanceof Error?error.message:String(error);
}

function isClassifierThrottled(error) {
  return /\bHTTP 429\b/.test(safeError(error));
}

function retrievalFallback(shortlist,limit=MAX_RECOMMENDATIONS) {
  return shortlist.slice(0,limit).map((record,index)=>({
    ...record,
    classifier_score:Math.max(.25,.49-index*.04),
    fit_label:'weak',
    retrieval_rank:index+1
  }));
}

function validateComment(value) {
  if(typeof value!=='string') throw new Error('Paste a comment first.');
  const comment=value.trim();
  if(!comment) throw new Error('Paste a comment first.');
  if(comment.length>1000) throw new Error('Keep the comment within 1,000 characters.');
  return comment;
}

async function persistRecommendation(env,recommendation,comment,model=CLASSIFIER_MODEL) {
  const createdAt=new Date();
  const expiresAt=new Date(createdAt.getTime()+30*24*60*60*1000);
  await env.DB.prepare(`INSERT INTO recommendations
    (id, comment_text, decision, candidates_json, model, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(recommendation.request_id,comment,recommendation.decision,JSON.stringify(recommendation.candidates.map(({id,rank,score,fit_label,perspective})=>({id,rank,score,fit_label,perspective}))),model,createdAt.toISOString(),expiresAt.toISOString())
    .run();
}

function requestTrafficClass(request) {
  const value=request.headers.get('x-fleet-traffic');
  return value==='qa'||value==='internal'?value:'unclassified';
}

function reportRecommendationCreated(request,env,ctx,recommendation,details) {
  ctx?.waitUntil(pingFor(env)('recommendation.created',{
    title:`decision: ${recommendation.decision}`,
    props:{decision:recommendation.decision,confidence:recommendation.confidence,candidates:recommendation.candidates.length,...details,recommendation_id:recommendation.request_id,stage:'server',traffic_class:requestTrafficClass(request)}
  }));
}

async function saveFeedback(request,env,ctx) {
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json') return json({error:'Expected JSON.'},415);
  const contentLength=Number(request.headers.get('content-length')??0);
  if(contentLength>2000) return json({error:'Request too large.'},413);
  let body;
  try { body=await request.json(); }
  catch { return json({error:'Invalid JSON.'},400); }
  if(typeof body?.request_id!=='string'||!/^[a-f0-9-]{36}$/.test(body.request_id)) return json({error:'Unknown recommendation.'},400);
  if(!['landed','missed'].includes(body.verdict)) return json({error:'Unknown verdict.'},400);
  if(body.candidate_id!==null&&!allowedIds.has(body.candidate_id)) return json({error:'Unknown candidate.'},400);
  const recommendation=await env.DB.prepare('SELECT id FROM recommendations WHERE id = ? AND expires_at > ?').bind(body.request_id,new Date().toISOString()).first();
  if(!recommendation) return json({error:'This recommendation is no longer available.'},404);
  await env.DB.prepare(`INSERT INTO feedback (id, recommendation_id, verdict, candidate_id, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(recommendation_id) DO UPDATE SET verdict = excluded.verdict, candidate_id = excluded.candidate_id, created_at = excluded.created_at`)
    .bind(crypto.randomUUID(),body.request_id,body.verdict,body.candidate_id,new Date().toISOString())
    .run();
  console.log(JSON.stringify({event:'feedback',verdict:body.verdict}));
  ctx?.waitUntil(pingFor(env)('feedback.submitted',{title:`verdict: ${body.verdict}`,props:{verdict:body.verdict,recommendation_id:body.request_id,stage:'server',traffic_class:requestTrafficClass(request)}}));
  return json({saved:true,verdict:body.verdict});
}

async function recommend(request,env,ctx) {
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json') return json({error:'Expected JSON.'},415);
  const contentLength=Number(request.headers.get('content-length')??0);
  if(contentLength>5000) return json({error:'Request too large.'},413);
  let body;
  try { body=await request.json(); }
  catch { return json({error:'Invalid JSON.'},400); }
  let comment;
  try { comment=validateComment(body?.comment); }
  catch(error) { return json({error:safeError(error)},400); }
  const started=Date.now();
  try {
    const shortlist=await retrieveCandidates(env,comment,30);
    // Keep the gateway's per-visitor limit; addressless jobs retain its project bucket.
    const classifierFetch=typeof env.CLASSIFIER_FETCH==='function'?env.CLASSIFIER_FETCH:createGatewayClassifierFetch(env.FREE_AI,'meme-lab',request.headers.get('cf-connecting-ip'),request.cf?.colo);
    const classifierOptions={fetchImpl:withClassifierDeadline(classifierFetch,25000)};
    let classifier_gate='not_needed';
    const factualRequest=requiresFactualAnswer(comment);
    const seriousRequest=needsSeriousHandling(comment);
    if(factualRequest||seriousRequest) {
      try {
        if(factualRequest||!await humourBelongs(comment,classifierOptions)) {
          classifier_gate='serious';
          const selection={decision:'none',confidence:'low',none_reason:'This calls for a serious response, not a meme.',candidates:[]};
          const recommendation=presentSelection(selection);
          let feedback_enabled=true;
          try { await persistRecommendation(env,recommendation,comment,'safety-gate'); }
          catch(error) {
            feedback_enabled=false;
            console.error(JSON.stringify({event:'recommendation_store',status:'error',error:safeError(error)}));
          }
          console.log(JSON.stringify({event:'recommendation',status:'ok',duration_ms:Date.now()-started,decision:'none',confidence:'low',candidate_count:0,classifier_gate}));
          reportRecommendationCreated(request,env,ctx,recommendation,{ranking_mode:'safety_gate',classifier_gate});
          return json({...recommendation,feedback_enabled});
        }
        classifier_gate='humour';
      } catch(error) {
        const throttled=isClassifierThrottled(error);
        classifier_gate=throttled?'throttled_abstain':'unavailable_abstain';
        const selection={decision:'none',confidence:'low',none_reason:'This may call for a serious response, and the safety check is temporarily unavailable.',candidates:[]};
        const recommendation=presentSelection(selection);
        let feedback_enabled=true;
        try { await persistRecommendation(env,recommendation,comment,throttled?'safety-gate-throttled':'safety-gate-unavailable'); }
        catch(storeError) {
          feedback_enabled=false;
          console.error(JSON.stringify({event:'recommendation_store',status:'error',error:safeError(storeError)}));
        }
        console.error(JSON.stringify({event:'classifier_gate',status:classifier_gate,error:safeError(error)}));
        reportPickerHealth(env,ctx,'recommendation.degraded',{route:'/api/recommend',classifier_gate,duration_ms:Date.now()-started,recommendation_id:recommendation.request_id,stage:'server',traffic_class:requestTrafficClass(request)});
        reportRecommendationCreated(request,env,ctx,recommendation,{ranking_mode:'safety_gate',classifier_gate});
        return json({...recommendation,feedback_enabled,degraded:true});
      }
    }
    // Safety, ranking and any fallback share one clock. Slow managed batches
    // can finish without granting each later stage a fresh timeout window.
    const rankingOptions={...classifierOptions,timeoutMs:25000,ordinalPerspectives:typeof env.CLASSIFIER_FETCH!=='function'};
    let ranked;
    let ranking_mode='general';
    let ranking_model=CLASSIFIER_MODEL;
    const perspectiveEligible=hasMultiplePerspectives(comment);
    try {
      ranked=perspectiveEligible
        ? await rankCandidatesByPerspective(comment,shortlist,{...rankingOptions,limit:Math.min(MAX_RECOMMENDATIONS,shortlist.length)})
        : await rankCandidates(comment,shortlist,{...rankingOptions,limit:Math.min(MAX_RECOMMENDATIONS,shortlist.length)});
      if(perspectiveEligible) ranking_mode='perspective';
    }
    catch(error) {
      console.error(JSON.stringify({event:'classifier_rank',status:'fallback',mode:perspectiveEligible?'perspective':'general',error:safeError(error)}));
      if(classifierUnavailable(error)) {
        ranked=retrievalFallback(shortlist);
        ranking_mode='retrieval_fallback';
        ranking_model=RETRIEVAL_FALLBACK_MODEL;
      } else if(perspectiveEligible) {
        try {
          ranked=await rankCandidates(comment,shortlist,{...rankingOptions,limit:Math.min(MAX_RECOMMENDATIONS,shortlist.length)});
          ranking_mode='general_fallback';
        }
        catch(fallbackError) {
          console.error(JSON.stringify({event:'classifier_rank',status:'fallback',mode:'general',error:safeError(fallbackError)}));
          if(classifierUnavailable(fallbackError)) {
            ranked=retrievalFallback(shortlist);
            ranking_mode='retrieval_fallback';
            ranking_model=RETRIEVAL_FALLBACK_MODEL;
          } else return json({error:'Meme ranking is temporarily unavailable. Try again shortly.'},503,{'Retry-After':'60'});
        }
      } else {
        return json({error:'Meme ranking is temporarily unavailable. Try again shortly.'},503,{'Retry-After':'60'});
      }
    }
    const selection=selectionFromRanking(ranked);
    const degraded=ranking_mode==='retrieval_fallback'||ranking_mode==='general_fallback';
    console.log(JSON.stringify({event:'recommendation',status:degraded?'degraded':'ok',duration_ms:Date.now()-started,decision:selection.decision,confidence:selection.confidence,candidate_count:selection.candidates.length,classifier_gate,classifier_ranked:ranking_mode!=='retrieval_fallback',ranking_mode}));
    const perspectives=new Map((ranked??[]).filter(record=>record.perspective).map(record=>[record.id,{perspective:record.perspective,perspective_label:record.perspective_label}]));
    const recommendation=presentSelection(selection,{perspectives});
    if(degraded) reportPickerHealth(env,ctx,'recommendation.degraded',{route:'/api/recommend',ranking_mode,classifier_gate,duration_ms:Date.now()-started,recommendation_id:recommendation.request_id,stage:'server',traffic_class:requestTrafficClass(request)});
    let feedback_enabled=true;
    try { await persistRecommendation(env,recommendation,comment,ranking_model); }
    catch(error) {
      feedback_enabled=false;
      console.error(JSON.stringify({event:'recommendation_store',status:'error',error:safeError(error)}));
    }
    reportRecommendationCreated(request,env,ctx,recommendation,{ranking_mode,classifier_gate});
    return json({...recommendation,feedback_enabled,degraded,ranking_mode});
  } catch(error) {
    if(error instanceof BudgetUnavailableError) return json({error:'Meme matching is temporarily unavailable. Try again shortly.'},503,{'Retry-After':'60'});
    console.error(JSON.stringify({event:'recommendation',status:'error',duration_ms:Date.now()-started,error:safeError(error)}));
    return json({error:'The meme picker had a wobble. Try again.'},502);
  }
}

function secureAsset(response) {
  const headers=secureHeaders(new Headers(response.headers));
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function queueEndpointMeasurement(request,env,ctx,route,status_code,startedAt) {
  if(status_code>=500) reportPickerHealth(env,ctx,'endpoint.failed',{method:request.method,route,status_code,duration_ms:Date.now()-startedAt,stage:'server',traffic_class:requestTrafficClass(request)});
  if(!env.APP_HEALTH_INGEST_KEY||typeof ctx?.waitUntil!=='function') return;
  ctx.waitUntil(endpointFor(env)({
    method:request.method,
    route,
    status_code,
    duration_ms:Date.now()-startedAt
  }));
}

async function withEndpointMeasurement(request,env,ctx,route,handler) {
  const startedAt=Date.now();
  try {
    const response=await handler();
    queueEndpointMeasurement(request,env,ctx,route,response.status,startedAt);
    return response;
  } catch(error) {
    queueEndpointMeasurement(request,env,ctx,route,500,startedAt);
    throw error;
  }
}

export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    const isRead=request.method==='GET'||request.method==='HEAD';
    if(url.pathname==='/api/clips/captions'&&request.method==='POST')return withEndpointMeasurement(request,env,ctx,'/api/clips/captions',()=>{
      const origin=request.headers.get('origin');
      if(origin&&origin!==url.origin)return json({error:'Cross-origin requests are blocked.'},403);
      return clipCaptions(request,env);
    });
    if(isRead&&url.pathname.startsWith('/api/clips/media/'))return withEndpointMeasurement(request,env,ctx,'/api/clips/media/{id}',async()=>{
      let id;try{id=decodeURIComponent(url.pathname.slice('/api/clips/media/'.length));}catch{return json({error:'Unknown reaction clip.'},400);}
      const sourceFetch=(source,options)=>source.startsWith('/assets/clips/')?env.ASSETS.fetch(new Request(new URL(source,request.url),options)):fetch(source,options);
      return forHead(request,await clipMedia(id,sourceFetch,request.signal));
    });
    if(url.pathname==='/api/create'&&request.method==='POST') return withEndpointMeasurement(request,env,ctx,'/api/create',()=>{
      const origin=request.headers.get('origin');
      if(origin&&origin!==url.origin) return json({error:'Cross-origin requests are blocked.'},403);
      return composeMeme(request,env);
    });
    if((isRead||request.method==='OPTIONS')&&url.pathname.startsWith('/api/create/media/')) return withEndpointMeasurement(request,env,ctx,'/api/create/media/{id}',async()=>{
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'}});
      let id;
      try {id=decodeURIComponent(url.pathname.slice('/api/create/media/'.length));}
      catch {return json({error:'Unknown meme.'},400);}
      const response=await compositionMedia(id);
      const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','*');
      return forHead(request,new Response(response.body,{status:response.status,headers}));
    });
    if(url.pathname==='/api/anna/composition') return withEndpointMeasurement(request,env,ctx,'/api/anna/composition',()=>annaComposition(request,env));
    if(url.pathname==='/api/anna/shortlist') return withEndpointMeasurement(request,env,ctx,'/api/anna/shortlist',()=>annaShortlist(request,env));
    if(url.pathname==='/api/anna/events') return withEndpointMeasurement(request,env,ctx,'/api/anna/events',()=>annaEvent(request,env,ctx));
    if(isRead&&url.pathname==='/robots.txt') return forHead(request,textResponse(publicReadability.robots()));
    if(isRead&&url.pathname==='/sitemap.xml') return forHead(request,textResponse(publicReadability.sitemap(),{contentType:'application/xml; charset=utf-8'}));
    if(isRead&&url.pathname==='/api/ai') {
      const origin=SITE_ORIGIN;
      return forHead(request,textResponse(`${JSON.stringify(agentCatalog(origin),null,2)}\n`,{contentType:'application/json; charset=utf-8',cacheControl:'public, max-age=300'}));
    }
    if(isRead&&url.pathname.startsWith('/memes/')) {
      let slug=url.pathname.slice('/memes/'.length).replace(/\/$/,'');
      const markdownPath=slug.endsWith('.md');
      if(markdownPath) slug=slug.slice(0,-3);
      let id;
      try { id=decodeURIComponent(slug); }
      catch { return forHead(request,memeNotFound(request,markdownPath)); }
      const record=catalogueById.get(id);
      if(!record||record.catalogue_status!=='active') return markdownPath||wantsMarkdown(request)?publicReadability.handle(request,env.ASSETS):forHead(request,memeNotFound(request,false));
      if(record.canonical_id&&record.canonical_id!==id) return forHead(request,Response.redirect(`${SITE_ORIGIN}/memes/${encodeURIComponent(record.canonical_id)}${markdownPath?'.md':''}`,308));
      if(markdownPath||wantsMarkdown(request)||request.method==='OPTIONS') return publicReadability.handle(request,env.ASSETS);
      const canonicalPath=publicMemePath(record);
      if(url.pathname!==canonicalPath) return forHead(request,Response.redirect(`${SITE_ORIGIN}${canonicalPath}`,301));
      return forHead(request,await publicReadability.advertise(pageResponse(memePage(record)),canonicalPath));
    }
    if(url.pathname==='/api/health'&&isRead) return withEndpointMeasurement(request,env,ctx,'/api/health',()=>forHead(request,json({status:'ok',catalogue:catalogue.length})));
    if(isRead&&(url.pathname==='/studio'||url.pathname==='/studio/')) return forHead(request,new Response(null,{status:302,headers:secureHeaders(new Headers({Location:'/#meme-form'}))}));
    const publicResponse=await publicReadability.handle(request,env.ASSETS);
    if(publicResponse)return publicResponse;
    if(isRead&&staticPaths.includes(url.pathname))return forHead(request,await publicReadability.advertise(secureAsset(await env.ASSETS.fetch(request)),url.pathname));
    if(url.pathname==='/api/recommend'&&request.method==='POST') {
      return withEndpointMeasurement(request,env,ctx,'/api/recommend',()=>{
        const origin=request.headers.get('origin');
        if(origin&&origin!==url.origin) return json({error:'Cross-origin requests are blocked.'},403);
        return recommend(request,env,ctx);
      });
    }
    if(url.pathname==='/api/feedback'&&request.method==='POST') {
      return withEndpointMeasurement(request,env,ctx,'/api/feedback',()=>{
        const origin=request.headers.get('origin');
        if(origin&&origin!==url.origin) return json({error:'Cross-origin requests are blocked.'},403);
        return saveFeedback(request,env,ctx);
      });
    }
    if(url.pathname.startsWith('/api/')) return json({error:'Not found.'},404);
    return secureAsset(await env.ASSETS.fetch(request));
  },
  async scheduled(controller,env,ctx) {
    ctx.waitUntil(env.DB.prepare('DELETE FROM recommendations WHERE expires_at <= ?').bind(new Date(controller.scheduledTime).toISOString()).run());
  }
};

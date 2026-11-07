// Public copy is generated from authored HTML; legacy static Markdown assets are not serving sources.
import copy from './public-copy.generated.json' with {type:'json'};
import {createAgentSurfaceManifest} from './agent-surfaces/manifest.mjs';
import {createAgentSurfaceHandler,discoveryLinkHeader} from './agent-surfaces/handler.mjs';
import {absoluteMarkdownLinks} from './agent-surfaces/format.mjs';
import {markdownPathFor,markdownResponse} from './agent-surfaces/http.mjs';
import {catalogueViews,browseCatalogue} from '../public/catalogue-model.js';
import {creationMediaUrl} from '../public/meme-media.js';
import {collectionPageSize,collectionDescription,collectionAction,collectionDetail} from '../public/collection-copy.js';

export const origin='https://memes.significanthobbies.com';
export const staticPaths=['/','/collection','/how-it-works','/privacy','/anna-privacy'];
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function createPublicReadability(records,renderRecord){
  const publicRecords=records.filter(record=>record.catalogue_status==='active'&&(!record.canonical_id||record.canonical_id===record.id));
  const byPath=new Map(publicRecords.map(record=>['/memes/'+encodeURIComponent(record.id),record]));
  const routes=[...staticPaths.map(path=>({path,title:copy[path].title,description:copy[path].description,...(path==='/'?{}:{aliases:[path+'.html']})})),...publicRecords.map(record=>({path:'/memes/'+encodeURIComponent(record.id),title:record.name,description:record.message}))].map(route=>({...route,url:origin+route.path,md:origin+markdownPathFor(route.path)}));
  const manifest=createAgentSurfaceManifest({name:'Meme Lab',url:origin,summary:copy['/'].description,trainingAllowed:true,contact:'https://github.com/Significant-Hobbies/meme-lab/issues',excludedPaths:['/api/recommend','/api/feedback','/api/create','/api/anna','/studio','user input and generated results'],sitemap:origin+'/sitemap.xml',surfaces:routes.map(route=>({id:route.path,url:route.path,md:markdownPathFor(route.path),kind:byPath.has(route.path)?'dynamic':'static'}))});
  async function loadMarkdown(path,assets){
    let body=copy[path]?.markdown;
    if(path==='/collection'){
      const response=await assets.fetch(new Request(origin+'/catalogue-v2.json'));
      if(!response.ok)throw Error('Public catalogue unavailable');
      const model=await response.json();
      const records=browseCatalogue(catalogueViews(model),{collection:'selected',collections:model.collections});
      const items=records.slice(0,collectionPageSize);
      body+='\n'+collectionDescription(model.collections,'selected')+'\n\n'+(records.length?`Showing 1–${items.length} of ${records.length.toLocaleString()} memes`:'0 memes')+'\n\n';
      for(const record of items)body+=`### [${record.name}](/memes/${encodeURIComponent(record.id)})\n\n${record.message}\n\n${record.tags.slice(0,2).join(' · ')}\n\n${collectionDetail(record)}\n\n${collectionAction(record,Boolean(creationMediaUrl(record)))}\n\n`;
      if(records.length>collectionPageSize)body+=`Page 1 of ${Math.ceil(records.length/collectionPageSize)}\n`;
    }
    if(byPath.has(path))body=renderRecord(byPath.get(path));
    return body==null?null:absoluteMarkdownLinks(body,origin+path);
  }
  return {routes,manifest,loadMarkdown,
    async handle(request,assets){
      try{return await createAgentSurfaceHandler({manifest,listMarkdownRoutes:()=>routes,loadMarkdown:path=>loadMarkdown(path,assets)})(request);}
      catch{
        const response=markdownResponse('# Markdown temporarily unavailable\n',request,{'Cache-Control':'no-store','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store'});
        return new Response(response.body,{status:503,headers:response.headers});
      }
    },
    sitemap(){return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+routes.map(route=>`<url><loc>${escape(route.url)}</loc></url>`).join('\n')+'\n</urlset>\n';},
    robots(){return '# Keep in sync with ai.txt and llms.txt.\n'+['*','GPTBot','ClaudeBot','Google-Extended','Applebot-Extended','CCBot','Bytespider'].map(bot=>`User-agent: ${bot}\nAllow: /\nDisallow: /api/\nAllow: /api/md/\nAllow: /api/ai\nDisallow: /studio\n`).join('\n')+`\nSitemap: ${origin}/sitemap.xml\n`;},
    async advertise(response,path){
      const route=routes.find(route=>route.path===path);
      if(!route||response.status!==200||!response.headers.get('content-type')?.includes('text/html'))return response;
      let html=await response.text();
      html=html.replace(/<meta\b[^>]*name=["']ai-summary["'][^>]*>/gi,'').replace(/<link\b[^>]*type=["']text\/markdown["'][^>]*>/gi,'');
      const schema=path==='/'?`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:'Meme Lab',url:origin}).replaceAll('<','\\u003c')}</script>`:'';
      html=html.replace('</head>',`<meta name="ai-summary" content="${escape(route.description)}"><link rel="alternate" type="text/markdown" href="${route.md}">${schema}</head>`);
      const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('ETag');
      const vary=headers.get('Vary');if(vary!=='*'&&!vary?.split(',').some(value=>value.trim().toLowerCase()==='accept'))headers.set('Vary',vary?vary+', Accept':'Accept');
      headers.append('Link',`<${route.md}>; rel="alternate"; type="text/markdown", ${discoveryLinkHeader(origin)}`);
      return new Response(html,{status:response.status,headers});
    }
  };
}

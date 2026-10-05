import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const out=new URL('anna/bundle/',root);
await mkdir(out,{recursive:true});
let html=await readFile(new URL('worker/public/index.html',root),'utf8');
// Keep the approved interface; remove website-only telemetry and crawl metadata.
html=html.replace(/  <script[^>]*>[\s\S]*?<\/script>\n/g,'')
  .replace(/  <(?:meta[^>]*(?:property="og:|name="twitter:|name="robots)|link[^>]*(?:rel="canonical"|rel="alternate"))[^>]*>\n/g,'')
  .replace('Better to say nothing.','No meme fits this request.')
  .replace('href="/app.css"','href="./app.css"')
  .replace('href="/meme-studio.css"','href="./meme-studio.css"')
  .replaceAll('href="/"','href="#"')
  .replaceAll('href="/collection"','href="https://memes.significanthobbies.com/collection" target="_blank" rel="noopener noreferrer"')
  .replaceAll('href="/memes/', 'target="_blank" rel="noopener noreferrer" href="https://memes.significanthobbies.com/memes/')
  .replaceAll('href="/how-it-works"','href="https://memes.significanthobbies.com/how-it-works" target="_blank" rel="noopener noreferrer"')
  .replace('Your comment and returned candidates are kept for 30 days to support feedback.','Your comment goes to Meme Lab’s search service and your Anna AI provider. Meme Lab’s search endpoint does not store it. AI usage may consume Anna credits or your BYOK quota. Anonymous interaction counts help us improve.')
  .replace('then the shortlist is scored on five ordered fit levels.','then your Anna AI model rates the shortlist on five ordered fit levels.')
;
html=html.replace('<section class="about"', '<section class="saved-library" aria-labelledby="library-title"><h2 id="library-title">Saved reactions</h2><p class="library-note">Keep useful reactions with your Anna account. Your situations are never saved.</p><p id="library-empty">Save a reaction from any result to find it here next time.</p><ul id="saved-reactions"></ul><p id="library-status" role="status" aria-live="polite"></p></section><section class="about"');
html=html.replace('      <a href="https://memes.significanthobbies.com/collection"', '      <button id="open-personal" type="button">Make this me</button>\n      <a href="https://memes.significanthobbies.com/collection"');
html=html.replace('<p id="status" class="status"', '<p class="personal-entry"><button id="personal-entry" type="button">Want to be in the meme? Make this me →</button></p><p id="status" class="status"');
html=html.replace('    <section id="loading"', (await readFile(new URL('anna/personal-editor.html',root),'utf8'))+'\n    <section id="loading"');
html=html.replace('</body>','  <script type="module" src="./app.js"></script>\n</body>');
html=html.replace('<section id="no-match" class="no-match" hidden>','<section id="no-match" class="no-match" hidden role="status" aria-live="polite">');
const action='<button id="submit" class="primary" type="submit"><span>Find the meme</span><span aria-hidden="true">→</span></button>';
html=html.replace(`          ${action}\n`,'').replace('<div class="form-row">',`<div class="form-row">\n          ${action}`);
for(const file of ['meme-studio.js','meme-renderer.js','meme-studio.css'])await copyFile(new URL('worker/public/'+file,root),new URL(file,out));
for(const file of ['caption-core.mjs','meme-templates.mjs'])await copyFile(new URL('worker/src/'+file,root),new URL(file,out));
let app=await readFile(new URL('worker/public/app.js',root),'utf8');
const oldRequest="const response=await fetch('/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:value})});\n    responseStatus=response.status;\n    const data=await response.json();\n    if(version!==searchVersion)return;\n    if(!response.ok) throw new Error(data.error||'Could not find a meme.');";
if(!app.includes(oldRequest)) throw new Error('Website recommendation adapter changed; review the Anna build.');
if(!app.includes("const studio=new MemeStudio($('#meme-studio'));"))throw new Error('Website caption adapter changed; review the Anna build.');
app=app.replace("const studio=new MemeStudio($('#meme-studio'));","const studio=new MemeStudio($('#meme-studio'),{generateDraft:async(body,{signal})=>composeOnAnna(body,{anna:await annaReady,signal}),mediaBase:'https://memes.significanthobbies.com',downloadBlob:async blob=>{const anna=await annaReady;const entry=await persistMeme(anna,blob);await downloadSavedMeme(anna,entry.path);}});");
app=app.replace(oldRequest,'const data=await recommendOnAnna(value,{anna:await annaReady});')
  .replaceAll('href:`/memes/${encodeURIComponent(candidate.id)}`','href:`https://memes.significanthobbies.com/memes/${encodeURIComponent(candidate.id)}`,target:"_blank",rel:"noopener noreferrer"');
// Anna does not retain website feedback. Remove that listener entirely.
const feedbackStart=app.indexOf("for(const button of document.querySelectorAll('[data-verdict]')) button.addEventListener");
if(feedbackStart<0) throw new Error('Website feedback adapter changed; review the Anna build.');
app=app.slice(0,feedbackStart);
app=app.replace('renderAlternatives(data.candidates.slice(1));','renderAlternatives(data.candidates.slice(1));\n    decorateResults(data);\n    void reportEvent(\"run_meme\");')
  .replace("$('#no-match-reason').textContent=data.none_reason;","$('#no-match-reason').textContent=data.none_reason;\n      void reportEvent('run_none');")
  .replace('status.textContent=error.message;',"status.textContent=error.message;\n    void reportEvent('run_error');");
app=app.replace("showOnly('none');","showOnly('none');\n      noMatch.scrollIntoView({behavior:'smooth',block:'start'});")
  .replace('status.textContent=error.message;',"status.textContent=error.message;\n    status.scrollIntoView({behavior:'smooth',block:'nearest'});");
app="import {composeOnAnna} from './captions.mjs';\nimport {persistMeme,downloadSavedMeme} from './creations.mjs';\nimport {initializePersonalEditor} from './personal-editor.mjs';\nimport {decorateResults,initializeInteractions} from './interactions.mjs';\nimport {reportEvent} from './engagement.mjs';\nimport {recommendOnAnna} from './ranking.mjs';\n"+app+`
const annaReady=import('/static/anna-apps/_sdk/latest/index.js')
  .then(({AnnaAppRuntime})=>AnnaAppRuntime.connect())
  .then(anna=>{
    const applyPayload=payload=>{ if(typeof payload?.comment==='string') comment.value=payload.comment.slice(0,1000); };
    applyPayload(anna.entryPayload);
    anna.on('entry_payload',applyPayload);
    return anna;
  });
annaReady.catch(()=>{ status.textContent='Open this app inside Anna to enable AI matching.'; });
initializeInteractions(annaReady);
initializePersonalEditor(annaReady);
`;
await writeFile(new URL('index.html',out),html);
await writeFile(new URL('app.js',out),app);
const css=await readFile(new URL('worker/public/app.css',root),'utf8');
await writeFile(new URL('app.css',out),css+'\n/* Fit the existing Reference Desk system to Anna’s default window. */\n.retention-note{font-size:12px}\n.form-row>.primary{order:1}.examples{order:2}\n.reference-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.reference-action{min-height:44px;padding:8px 14px;border:1px solid #b7c2d5;border-radius:8px;background:#fff;color:#243759;font:600 13px system-ui;cursor:pointer}.reference-action:hover{background:#e9effa}.reference-action:focus-visible{outline:3px solid #3e56b6;outline-offset:3px}.reference-action:disabled{opacity:.6;cursor:wait}.saved-library{max-width:1020px;margin:32px auto;padding:24px;border:1px solid #d8deea;border-radius:12px;background:white}.saved-library h2{margin:0 0 8px;font-size:20px}.library-note,#library-empty,#library-status{font-size:13px;line-height:1.6;color:#52617b}#saved-reactions{list-style:none;margin:16px 0;padding:0}.saved-reference{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #d8deea}.saved-reference>a{font-weight:600;overflow-wrap:anywhere}.saved-reference .reference-actions{margin:0}@media(max-width:600px){.saved-reference{align-items:flex-start;flex-direction:column}.saved-library{padding:18px}}\n');
await writeFile(new URL('app.css',out),(await readFile(new URL('app.css',out),'utf8'))+'\n'+(await readFile(new URL('anna/personal-editor.css',root),'utf8')));
for(const file of ['captions.mjs','caption-completion.mjs','ranking.mjs','library.mjs','interactions.mjs','engagement.mjs','personal-editor.mjs','personalize.mjs','image-tools.mjs','creations.mjs']) await copyFile(new URL('anna/'+file,root),new URL(file,out));
await writeFile(new URL('meme-studio.js',out),(await readFile(new URL('worker/public/meme-studio.js',root),'utf8')).replace('Caption drafts stay in this tab.','Editable drafts stay in this tab. Downloading saves the finished PNG privately to Anna.'));
await writeFile(new URL('captions.mjs',out),(await readFile(new URL('anna/captions.mjs',root),'utf8')).replace('../worker/src/caption-core.mjs','./caption-core.mjs'));
await writeFile(new URL('privacy.html',out),(await readFile(new URL('worker/public/anna-privacy.html',root),'utf8')).replace('href="/app.css"','href="./app.css"')
  .replace('href="/meme-studio.css"','href="./meme-studio.css"').replaceAll('href="/"','href="https://memes.significanthobbies.com/"'));
console.log('Anna bundle built from the approved Studio interface.');

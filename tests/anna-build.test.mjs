import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url),bundle=new URL('anna/bundle/',root);

test('Anna rebuild packages the current home and a complete local editor without website telemetry',async()=>{
  execFileSync(process.execPath,['scripts/build-anna.mjs'],{cwd:root});
  const names=await readdir(bundle),before=new Map(await Promise.all(names.map(async name=>[name,await readFile(new URL(name,bundle),'utf8')])));
  execFileSync(process.execPath,['scripts/build-anna.mjs'],{cwd:root});
  for(const [name,bytes]of before)assert.equal(await readFile(new URL(name,bundle),'utf8'),bytes,`Anna build is not deterministic: ${name}`);
  const html=await readFile(new URL('index.html',bundle),'utf8'),app=await readFile(new URL('app.js',bundle),'utf8');
  for(const id of ['meme-form','submit','open-personal','personal-entry','personal-editor','saved-reactions'])assert.equal([...html.matchAll(new RegExp(`id="${id}"`,'g'))].length,1,`Missing or duplicated ${id}`);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length,'Duplicate DOM ids in Anna bundle');
  assert.doesNotMatch(html,/data-feedback|data-subscribe|app-health-log|fleet-engagement|application\/ld\+json|rel="(?:canonical|alternate)"|property="og:|name="(?:robots|twitter:)/);
  assert.doesNotMatch(app,/recommendation-outcomes\.js|window\.appHealthLog|fetch\('\/api\/(?:recommend|feedback)/);
  for(const [,path]of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g))assert.ok((await readFile(new URL(path,bundle))).length,`Missing bundle asset ${path}`);
  const css=await readFile(new URL('landing.css',bundle),'utf8');
  assert.ok(css.includes('--canvas'),'Current landing CSS was not included');
  for(const [name,bytes]of before){
    if(!/\.(?:js|mjs)$/.test(name))continue;
    for(const [,path]of bytes.matchAll(/(?:from|import\()\s*['"](\.\/[^'"]+)/g))assert.ok((await readFile(new URL(path,bundle))).length,`Missing import ${path} from ${name}`);
  }
});

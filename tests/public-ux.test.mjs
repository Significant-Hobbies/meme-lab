import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../worker/src/index.mjs';

test('legacy Studio links reach the composer without invoking services',async()=>{
 for(const method of ['GET','HEAD'])for(const path of ['/studio','/studio/']) {
  const response=await worker.fetch(new Request('https://memes.significanthobbies.com'+path,{method}),{});
  assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/#meme-form');
  assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
 }
});
test('own privacy route serves the app disclosure with security headers',async()=>{
 const html=await readFile(new URL('../worker/public/privacy.html',import.meta.url),'utf8');
 const paths=[];
 const response=await worker.fetch(new Request('https://memes.significanthobbies.com/privacy'),{ASSETS:{fetch:async request=>{
  paths.push(new URL(request.url).pathname);return new Response(html,{headers:{'Content-Type':'text/html'}});
 }}});
 assert.equal(response.status,200);assert.deepEqual(paths,['/privacy.html']);
 assert.match(await response.text(),/30 days/);assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalogue} from '../worker/src/catalogue.stage3000.generated.mjs';
import {clipLibrary} from '../worker/src/clip-library.generated.mjs';
import {clipSource,clipCaptions} from '../worker/src/clip-captions.mjs';
import worker from '../worker/src/index.mjs';

test('gallery expansion contains measured distinct animations while retrieval stays frozen',async()=>{
  const report=JSON.parse(await readFile(new URL('../expansion/sources/gallery-clips-report.json',import.meta.url),'utf8'));
  assert.equal(catalogue.length,3000);assert.equal(clipLibrary.length,report.qualified);assert.ok(clipLibrary.length>=1000);
  const all=[...catalogue,...clipLibrary];assert.equal(new Set(all.map(record=>record.id)).size,all.length);
  for(const record of clipLibrary){
    assert.equal(record.catalogue_scope,'gallery');assert.equal(record.human_validated,false);assert.ok(clipSource(record));
    const video=record.video_evidence;
    assert.ok(Math.max(video.width,video.height)>=480&&Math.min(video.width,video.height)>=270);
    assert.ok(video.duration>=.4&&video.duration<=30&&video.fps>=10&&video.fps<=60);
    assert.equal(video.motion_checked,true);assert.equal(video.frame_hashes.length,3);assert.ok(new Set(video.frame_hashes).size>=2);
    assert.ok(record.provenance.source_url.includes(record.provenance.provider_id));
    assert.equal(record.meme_strength,undefined,'Gallery source tags must not invent a fit or strength rating');
  }
  assert.equal((await (await worker.fetch(new Request('https://example.test/api/health'),{})).json()).catalogue,3000);
});

test('new gallery references are browsable and captionable without pretending contextual evaluation',async()=>{
  const record=clipLibrary[0];
  const page=await worker.fetch(new Request('https://example.test/memes/'+record.id),{});assert.equal(page.status,200);
  const html=await page.text();assert.match(html,/Source quality/);assert.match(html,/not been evaluated for automatic recommendations/);assert.ok(html.includes('/collection?meme='+record.id));assert.doesNotMatch(html,/undefined|<dt>Example<\/dt>/);
  const request=new Request('https://example.test/api/clips/captions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate_id:record.id,comment:'The tests passed after changing absolutely nothing.'})});
  const response=await clipCaptions(request,{FREE_AI:{fetch:async()=>Response.json({model:'served-model',choices:[{finish_reason:'stop',message:{content:JSON.stringify({decision:'captions',captions:['Changed nothing. Fixed everything.','The fix was running it again.','A very productive up arrow.']})}}]})}});
  assert.equal(response.status,200);assert.equal((await response.json()).candidate_id,record.id);
});

test('staged owner review judgments remain unmodified and explicitly unvalidated',async()=>{
  const text=await readFile(new URL('../eval/reaction_gif_expansion_quality_sample.jsonl',import.meta.url),'utf8');
  const rows=text.trim().split('\n').map(JSON.parse);assert.equal(rows.length,120);
  assert.ok(rows.every(record=>record.human_validated===false&&record.keep===null));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonalMemeJob,validateImageFile,validateRegion,remoteImageUrl,cropRegion,shareMeme} from '../anna/personalize.mjs';
import {blendFace,faceAlpha,faceCrop,validateDimensions,squarePlacement} from '../anna/image-tools.mjs';
const blob=()=>new Blob([new Uint8Array(40)],{type:'image/png'});
const region={x:.2,y:.2,width:.3,height:.4};
function fixture() {
  const calls=[];const anna={upload:{inline:async args=>{calls.push(['upload',args]);return {download_url:'https://cdn.anna.partners/input.png'};}},image:{generate:async args=>{calls.push(['generate',args]);return {images:[{url:'https://cdn.anna.partners/output.png'}],model:'real-route-not-tested'};}}};
  const args={anna,photo:blob(),template:blob(),region,prepare:async input=>({blob:input,width:100,height:80}),encode:async()=> 'base64-test',compose:async()=>blob()};
  return {calls,args};
}
test('malformed/oversized/nonstatic inputs and invalid face selections spend no host quota',async()=>{
  for(const bad of [{type:'image/gif',size:50},{type:'image/svg+xml',size:50},{type:'image/png',size:9*1024*1024}]){
    const {calls,args}=fixture();await assert.rejects(new PersonalMemeJob().generate({...args,photo:bad}));assert.equal(calls.length,0);
  }
  for(const bad of [{...region,x:-.1},{...region,width:1},{...region,height:NaN},{x:0,y:0,width:1,height:1}])assert.throws(()=>validateRegion(bad));
  assert.throws(()=>validateImageFile(null));assert.throws(()=>validateDimensions(8192,8192));
});
test('uses two bounded uploads, one generation and no storage/analytics writes',async()=>{
  const {calls,args}=fixture();const result=await new PersonalMemeJob().generate(args);
  assert.equal(result.blob.type,'image/png');assert.deepEqual(calls.map(c=>c[0]),['upload','upload','generate']);
  assert.equal(calls[0][1].purpose,'image_reference');assert.equal(calls[1][1].purpose,'image_input');
  assert.equal(calls[2][1].n,1);assert.equal(calls[2][1].reference_image_urls.length,2);
  assert.match(calls[2][1].prompt,/Preserve all other characters/);
  assert.equal(calls[1][1].filename,'portrait.png');
});
test('quota/permission/provider failure is not retried and never produces a result',async()=>{
  for(const code of ['APP_QUOTA_EXCEEDED','APP_NOT_GRANTED','APP_PROVIDER_ERROR']){
    const {calls,args}=fixture();let attempts=0;args.anna.image.generate=async()=>{attempts++;throw Object.assign(new Error('signed private provider detail'),{code});};
    await assert.rejects(new PersonalMemeJob().generate(args),{code});assert.equal(attempts,1);assert.equal(calls.length,2);
  }
});
test('whole-meme requests preserve portrait and landscape canvases without extra generations',async()=>{
  for(const [width,height,expected] of [[896,1152,'796x1024'],[1200,800,'1024x683'],[512,512,'1024x1024']]){
    const {calls,args}=fixture();
    args.prepare=async input=>({blob:input,width,height});
    await new PersonalMemeJob().generate(args);
    const requests=calls.filter(c=>c[0]==='generate');
    assert.equal(requests.length,1);
    assert.equal(requests[0][1].size,expected);
    assert.match(requests[0][1].prompt,new RegExp(width+':'+height+' aspect ratio'));
  }
});
test('invalid decoded dimensions fail before uploads or image quota',async()=>{
  const {calls,args}=fixture();
  args.prepare=async input=>({blob:input,width:NaN,height:100});
  await assert.rejects(new PersonalMemeJob().generate(args),/dimensions/);
  assert.equal(calls.length,0);
});
test('oversized normalized reference fails before either upload',async()=>{
  const {calls,args}=fixture();
  args.prepare=async input=>({blob:input,referenceBlob:new Blob([new Uint8Array(8*1024*1024+1)],{type:'image/png'}),width:100,height:80});
  await assert.rejects(new PersonalMemeJob().generate(args),/8 MB/);assert.equal(calls.length,0);
});
test('experimental face-patch retains its square reference canvas',async()=>{
  const {calls,args}=fixture();
  args.prepare=async input=>({blob:input,width:1200,height:800});
  await new PersonalMemeJob().generate({...args,mode:'face-patch'});
  assert.equal(calls.find(c=>c[0]==='generate')[1].size,'1024x1024');
});
test('padded whole-meme references keep target geometry and recover the original canvas without stretching',async()=>{
  for(const [width,height] of [[896,1152],[1200,800],[512,512]]){
    const frame=squarePlacement(width,height);
    assert.equal(frame.width/frame.height,width/height);
    assert.equal(frame.x*2+frame.width,1);assert.equal(frame.y*2+frame.height,1);
    const {calls,args}=fixture();
    args.prepare=async(input,options)=>({blob:input,width,height,...(options.role==='template'?{frame,referenceBlob:blob()}: {})});
    const output=await new PersonalMemeJob().generate(args);
    const request=calls.find(c=>c[0]==='generate')[1];
    assert.equal(request.size,'1024x1024');
    assert.match(request.prompt,/including identical padding/);
    assert.ok(request.prompt.includes('x='+(frame.x+region.x*frame.width).toFixed(3)));
    assert.equal(output.width,width);assert.equal(output.height,height);
  }
});
test('missing capability, failed second upload and malformed model output do not fake success',async()=>{
  let {calls,args}=fixture();args.anna.image={};await assert.rejects(new PersonalMemeJob().generate(args));assert.equal(calls.length,0);
  ({calls,args}=fixture());let uploads=0;args.anna.upload.inline=async()=>{if(++uploads===2)throw new Error('denied');return {download_url:'https://cdn.anna.partners/a.png'};};
  await assert.rejects(new PersonalMemeJob().generate(args));assert.equal(calls.length,0);
  for(const images of [[],[{url:'http://localhost/x'}],[{url:'https://cdn.anna.partners/a'},{url:'https://cdn.anna.partners/b'}]]){
    ({calls,args}=fixture());args.anna.image.generate=async()=>({images});await assert.rejects(new PersonalMemeJob().generate(args));
  }
});
test('changing the selection stops subsequent calls and discards an in-flight generation',async()=>{
  const job=new PersonalMemeJob();let {calls,args}=fixture();args.prepare=async input=>{job.invalidate();return {blob:input,width:100,height:100};};
  await assert.rejects(job.generate(args),{name:'AbortError'});assert.equal(calls.length,0);
  ({calls,args}=fixture());let finish;args.anna.image.generate=()=>new Promise(resolve=>{finish=resolve;});let composed=false;args.compose=async()=>{composed=true;return blob();};
  const pending=job.generate(args);while(!finish)await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(job.generate(args),/already/);job.invalidate();finish({images:[{url:'https://cdn.anna.partners/result.png'}]});
  await assert.rejects(pending,{name:'AbortError'});assert.equal(composed,false);
});
test('ellipse composition preserves every pixel outside face, including captions and other people',()=>{
  const width=100,height=80;const original=new Uint8ClampedArray(width*height*4);const generated=new Uint8ClampedArray(original.length);
  for(let i=0;i<original.length;i+=4){original.set([15,30,70,255],i);generated.set([240,120,10,255],i);}
  const result=blendFace(original,generated,width,height,region);let changed=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const offset=(y*width+x)*4;
    if(faceAlpha(x,y,width,height,region)===0)assert.deepEqual(result.slice(offset,offset+4),original.slice(offset,offset+4));
    else if(result[offset]!==original[offset])changed++;
  }
  assert.ok(changed>300);assert.deepEqual([...original.slice(0,4)],[15,30,70,255]);
});
test('square face crop maps landscape/portrait targets and stays inside original image at edges',()=>{
  for(const [width,height,r] of [[1200,800,region],[768,960,{x:.5,y:.22,width:.25,height:.23}],[100,80,{x:0,y:0,width:.1,height:.1}]]){
    const crop=faceCrop(width,height,r),mapped=cropRegion(r,crop);
    assert.ok(Math.abs(crop.width*width-crop.height*height)<.00001);
    assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=1&&crop.y+crop.height<=1);
    assert.ok(Math.abs(crop.x+mapped.x*crop.width-r.x)<.00001);
    assert.ok(Math.abs(crop.y+mapped.y*crop.height-r.y)<.00001);
  }
  assert.throws(()=>faceCrop(800,100,{x:0,y:0,width:.8,height:.1}),/tighter/);
  assert.throws(()=>cropRegion(region,{x:0,y:0,width:-1,height:1}));
});
test('remote addresses reject local/IP/credential and insecure URLs',()=>{
  for(const value of ['http://example.com/x','https://127.0.0.1/x','https://[::1]/x','https://user:pass@example.com/x','data:image/png;base64,x','https://private.local/x'])assert.throws(()=>remoteImageUrl(value));
  assert.equal(remoteImageUrl('https://cdn.anna.partners/image?signature=example'),'https://cdn.anna.partners/image?signature=example');
});
test('image share cancel does not download; unsupported files request download without claiming share',async()=>{
  let calls=0;const FileType=class{constructor(parts,name,options){this.parts=parts;this.name=name;this.type=options.type;}};
  const cancelled=await shareMeme(blob(),{FileType,canShare:()=>true,share:async payload=>{calls++;assert.equal(payload.files[0].name,'my-meme.png');throw Object.assign(new Error('cancel'),{name:'AbortError'});}});
  assert.equal(cancelled,'cancelled');assert.equal(calls,1);
  assert.equal(await shareMeme(blob(),{FileType,canShare:()=>false,share:async()=>{calls++;}}),'download_required');assert.equal(calls,1);
});

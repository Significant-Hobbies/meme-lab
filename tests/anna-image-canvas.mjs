import {prepareImage,composeMeme,faceAlpha} from '../anna/image-tools.mjs';

const png=canvas=>new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
const pixels=async blob=>{
  const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');
  canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
  return ctx.getImageData(0,0,canvas.width,canvas.height).data;
};
const check=(condition,message)=>{if(!condition)throw new Error(message);};

export async function verifyCanvas() {
  const results=[],nativeFetch=globalThis.fetch;
  try {
    for(const [width,height] of [[200,200],[240,320],[320,240]]){
      const region={x:.25,y:.2,width:.4,height:.4};
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#d0c0b0';ctx.fillRect(0,0,width,height);
      ctx.fillStyle='#225588';ctx.fillRect(width*.1,height*.8,width*.8,height*.1);
      ctx.fillStyle='#663322';ctx.fillRect(width*.3,height*.25,width*.25,height*.25);
      const source=await png(canvas),base=await prepareImage(source,{role:'template',region,mode:'format'});
      const before=await pixels(source);
      const reference=await pixels(base.referenceBlob),side=Math.max(width,height);
      const centerX=Math.floor((base.frame.x+(region.x+region.width/2)*base.frame.width)*side);
      const centerY=Math.floor((base.frame.y+(region.y+region.height/2)*base.frame.height)*side);
      const offset=(centerY*side+centerX)*4;
      check(reference.slice(offset,offset+3).every((value,c)=>value===[181,154,135][c]),'Original identity remains in model reference');
      const clean=await pixels(base.blob);
      check(clean.every((value,i)=>value===before[i]),'Preparing the reference changed the original');
      const generated=document.createElement('canvas');generated.width=generated.height=1024;
      const edit=generated.getContext('2d');edit.fillStyle='#000';edit.fillRect(0,0,1024,1024);
      const frame=base.frame;
      edit.fillStyle='#ee8844';edit.fillRect(frame.x*1024+12,frame.y*1024+12,frame.width*1024-24,frame.height*1024-24);
      const response=await png(generated);
      globalThis.fetch=async url=>String(url)==='https://canvas-fixture.example/output.png'?new Response(response,{headers:{'content-type':'image/png'}}):nativeFetch(url);
      const output=await composeMeme({original:base,generatedUrl:'https://canvas-fixture.example/output.png',region});
      const after=await pixels(output);let changedInside=0,changedOutside=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const offset=(y*width+x)*4;
        const changed=before.slice(offset,offset+4).some((value,c)=>value!==after[offset+c]);
        if(changed){if(faceAlpha(x,y,width,height,region)===0)changedOutside++;else changedInside++;}
      }
      check(changedOutside===0,`${width}x${height}: ${changedOutside} pixels changed outside selected face`);
      check(changedInside>100,`${width}x${height}: generated face was not composited`);
      check(after.length===before.length,'Output dimensions changed');
      results.push({width,height,changedOutside,changedInside});
    }
    const region={x:.25,y:.2,width:.4,height:.4};
    const transparent=document.createElement('canvas');transparent.width=transparent.height=200;
    const ctx=transparent.getContext('2d');ctx.fillStyle='#bb6644';ctx.fillRect(20,20,160,160);
    ctx.clearRect(85,65,10,20);
    const source=await png(transparent),base=await prepareImage(source,{role:'template',region});
    const solid=document.createElement('canvas');solid.width=solid.height=200;
    const solidCtx=solid.getContext('2d');solidCtx.fillStyle='#336699';solidCtx.fillRect(0,0,200,200);
    const solidBlob=await png(solid);
    globalThis.fetch=async()=>new Response(solidBlob,{headers:{'content-type':'image/png'}});
    const composed=await pixels(await composeMeme({original:base,generatedUrl:'https://canvas-fixture.example/output.png',region}));
    const original=await pixels(base.blob);
    check(composed.every((value,i)=>i%4!==3||value===original[i]),'Template transparency changed');
    results.push({templateAlpha:'preserved'});
    for(const [name,response]of [['blank',base.referenceBlob],['unchanged',(await prepareImage(source,{role:'template'})).referenceBlob]]){
      globalThis.fetch=async()=>new Response(response,{headers:{'content-type':'image/png'}});
      let error;try{await composeMeme({original:base,generatedUrl:'https://canvas-fixture.example/output.png',region});}catch(e){error=e;}
      check(error?.code==='face_not_replaced',`${name} face was accepted`);
      results.push({[name]:'rejected'});
    }
    const rejected=document.createElement('canvas');rejected.width=300;rejected.height=200;
    const response=await png(rejected);
    globalThis.fetch=async()=>new Response(response,{headers:{'content-type':'image/png'}});
    let error;try{await composeMeme({original:base,generatedUrl:'https://canvas-fixture.example/output.png',region});}catch(e){error=e;}
    check(error?.code==='output_format_mismatch','Distorted model output was accepted');
    results.push({distortedOutput:'rejected'});
    return results;
  } finally {globalThis.fetch=nativeFetch;}
}

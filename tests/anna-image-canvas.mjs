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
    return results;
  } finally {globalThis.fetch=nativeFetch;}
}

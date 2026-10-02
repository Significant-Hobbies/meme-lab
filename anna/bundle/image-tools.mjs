import {validateImageFile,validateRegion,remoteImageUrl,MAX_IMAGE_BYTES} from './personalize.mjs';
export function validateDimensions(width,height) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<48||height<48||width>8192||height>8192||width*height>16_000_000)throw new Error('Use an image between 48 and 8192 pixels, with no more than 16 megapixels.');
}
// Normalized ellipse with a narrow inner feather. Alpha is exactly zero outside.
export function faceAlpha(px,py,width,height,region) {
  const {x,y,width:rw,height:rh}=region;
  const dx=(px+.5-(x+rw/2)*width)/(rw*width/2),dy=(py+.5-(y+rh/2)*height)/(rh*height/2);
  const distance=Math.sqrt(dx*dx+dy*dy);
  const feather=Math.min(.12,4/Math.min(rw*width,rh*height));
  return Math.max(0,Math.min(1,(1-distance)/feather));
}
export function blendFace(original,generated,width,height,region) {
  validateRegion(region);
  if(original.length!==width*height*4||generated.length!==original.length)throw new Error('Image dimensions do not match.');
  const output=new Uint8ClampedArray(original);
  const left=Math.max(0,Math.floor(region.x*width)),top=Math.max(0,Math.floor(region.y*height));
  const right=Math.min(width,Math.ceil((region.x+region.width)*width)),bottom=Math.min(height,Math.ceil((region.y+region.height)*height));
  for(let py=top;py<bottom;py++)for(let px=left;px<right;px++){
    const offset=(py*width+px)*4;
    const alpha=faceAlpha(px,py,width,height,region)*(generated[offset+3]/255);
    if(alpha===0)continue;
    // Preserve source alpha and leave every outside pixel untouched.
    for(let channel=0;channel<3;channel++)output[offset+channel]=original[offset+channel]*(1-alpha)+generated[offset+channel]*alpha;
  }
  return output;
}
async function assertStatic(blob) {
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const ascii=(offset,length)=>String.fromCharCode(...bytes.slice(offset,offset+length));
  const png=bytes[0]===137&&ascii(1,3)==='PNG';
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP';
  if(!((blob.type==='image/png'&&png)||(blob.type==='image/jpeg'&&jpeg)||(blob.type==='image/webp'&&webp)))throw new Error('The file contents do not match its image type.');
  if(png){const view=new DataView(bytes.buffer);for(let i=8;i+12<=bytes.length;){const size=view.getUint32(i);if(ascii(i+4,4)==='acTL')throw new Error('Animated images are not supported yet.');if(size>bytes.length-i-12)throw new Error('This image file is incomplete.');i+=size+12;}}
  if(webp){const view=new DataView(bytes.buffer);for(let i=12;i+8<=bytes.length;){const size=view.getUint32(i+4,true);if(ascii(i,4)==='ANIM'||ascii(i,4)==='ANMF'||(ascii(i,4)==='VP8X'&&(bytes[i+8]&2)))throw new Error('Animated images are not supported yet.');if(size>bytes.length-i-8)throw new Error('This image file is incomplete.');i+=8+size+(size%2);}}
}
const canvasBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not encode this image.')),'image/png'));
export function faceCrop(width,height,region) {
  const r=validateRegion(region);
  const side=Math.min(Math.min(width,height),Math.max(r.width*width,r.height*height)*1.5);
  if(side<r.width*width||side<r.height*height)throw new Error('Choose a tighter face area.');
  const left=Math.max(0,Math.min(width-side,(r.x+r.width/2)*width-side/2));
  const top=Math.max(0,Math.min(height-side,(r.y+r.height/2)*height-side/2));
  return {x:left/width,y:top/height,width:side/width,height:side/height};
}
export async function prepareImage(blob,{role,region,mode='format'}) {
  validateImageFile(blob);await assertStatic(blob);
  const bitmap=await createImageBitmap(blob);
  try {
    validateDimensions(bitmap.width,bitmap.height);
    // Strip metadata via pixel decode/re-encode. Preserve template resolution.
    const scale=role==='photo'?Math.min(1,1536/Math.max(bitmap.width,bitmap.height)):1;
    const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const normalized=await canvasBlob(canvas);
    if(normalized.size>MAX_IMAGE_BYTES)throw new Error('The decoded image is too large. Choose a smaller image.');
    if(role==='template'&&mode==='face-patch') {
      const crop=faceCrop(canvas.width,canvas.height,region),reference=document.createElement('canvas');reference.width=reference.height=Math.min(1536,Math.round(crop.width*canvas.width));
      reference.getContext('2d').drawImage(canvas,crop.x*canvas.width,crop.y*canvas.height,crop.width*canvas.width,crop.height*canvas.height,0,0,reference.width,reference.height);
      return {blob:normalized,referenceBlob:await canvasBlob(reference),crop,width:canvas.width,height:canvas.height};
    }
    return {blob:normalized,width:canvas.width,height:canvas.height};
  } finally {bitmap.close();}
}
export function encodeImage(blob) {
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read the image.'));reader.readAsDataURL(blob);});
}
export async function composeMeme({original,generatedUrl,region,mode='format'}) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
  let generatedBitmap,originalBitmap;
  try {
    let response;
    try{response=await fetch(remoteImageUrl(generatedUrl),{credentials:'omit',signal:controller.signal});}
    catch(error){throw Object.assign(new Error('The generated image could not be loaded.',{cause:error}),{code:'image_delivery_failed'});}
    if(!response.ok)throw new Error('Could not retrieve Anna’s generated image.');
    if(Number(response.headers.get('content-length'))>MAX_IMAGE_BYTES)throw new Error('Generated image is too large.');
    if(!response.body)throw new Error('Generated image is unavailable.');
    const reader=response.body.getReader();const chunks=[];let size=0;
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_IMAGE_BYTES){await reader.cancel();throw new Error('Generated image is too large.');}chunks.push(part.value);}}
    finally{reader.releaseLock();}
    const blob=new Blob(chunks,{type:response.headers.get('content-type')?.split(';')[0]||'image/png'});
    validateImageFile(blob);await assertStatic(blob);
    generatedBitmap=await createImageBitmap(blob);validateDimensions(generatedBitmap.width,generatedBitmap.height);
    if(mode==='face-patch'&&Math.abs(generatedBitmap.width/generatedBitmap.height-1)>.05)throw Object.assign(new Error('Anna changed the face crop’s proportions.'),{code:'output_format_mismatch'});
    if(mode==='format'&&Math.abs((generatedBitmap.width/generatedBitmap.height)/(original.width/original.height)-1)>.15)throw Object.assign(new Error('Anna changed the meme format’s proportions too much.'),{code:'output_format_mismatch'});
    if(!['format','face-patch'].includes(mode))throw new Error('Unsupported image workflow.');
    const canvas=document.createElement('canvas');canvas.width=original.width;canvas.height=original.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(mode==='format'){
      ctx.drawImage(generatedBitmap,0,0,canvas.width,canvas.height);
      return await canvasBlob(canvas);
    }
    originalBitmap=await createImageBitmap(original.blob);
    ctx.drawImage(originalBitmap,0,0);const base=ctx.getImageData(0,0,canvas.width,canvas.height);
    const crop=original.crop||{x:0,y:0,width:1,height:1};
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(generatedBitmap,0,0,generatedBitmap.width,generatedBitmap.height,crop.x*canvas.width,crop.y*canvas.height,crop.width*canvas.width,crop.height*canvas.height);
    const edited=ctx.getImageData(0,0,canvas.width,canvas.height);
    ctx.putImageData(new ImageData(blendFace(base.data,edited.data,canvas.width,canvas.height,region),canvas.width,canvas.height),0,0);
    return await canvasBlob(canvas);
  } finally {clearTimeout(timer);originalBitmap?.close();generatedBitmap?.close();}
}
export const composeFace=args=>composeMeme({...args,mode:'face-patch'});

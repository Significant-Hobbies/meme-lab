// The same renderer paints both the visible preview and downloaded image.
const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
const graphemes=text=>Array.from(segmenter.segment(text),part=>part.segment);

export function clampBox(box) {
  const width=Math.max(.08,Math.min(1,Number(box[2])||.08));
  const height=Math.max(.04,Math.min(1,Number(box[3])||.04));
  return [Math.max(0,Math.min(1-width,Number(box[0])||0)),Math.max(0,Math.min(1-height,Number(box[1])||0)),width,height];
}

export function wrapText(ctx,text,width,breakWords=true) {
  const lines=[];
  for(const paragraph of String(text).split('\n')) {
    if(!paragraph.trim()) {lines.push('');continue;}
    let line='';
    for(const word of paragraph.trim().split(/\s+/u)) {
      const proposed=line?`${line} ${word}`:word;
      if(ctx.measureText(proposed).width<=width) {line=proposed;continue;}
      if(line) {lines.push(line);line='';}
      if(ctx.measureText(word).width<=width) {line=word;continue;}
      if(!breakWords)return null;
      for(const part of graphemes(word)) {
        if(line&&ctx.measureText(line+part).width>width) {lines.push(line);line='';}
        if(ctx.measureText(part).width>width) return null;
        line+=part;
      }
    }
    if(line)lines.push(line);
  }
  return lines;
}

export function fitText(ctx,text,width,height,preferredSize) {
  const minimum=10;
  // First shrink enough to preserve complete words. Splitting is a last resort
  // for unbroken URLs/identifiers or scripts without whitespace, not a reason
  // to keep an oversized font on narrow panels.
  for(const breakWords of [false,true]) {
    for(let size=Math.floor(Math.max(minimum,preferredSize));size>=minimum;size--) {
      ctx.font=`800 ${size}px Arial, sans-serif`;
      const lines=wrapText(ctx,text,width,breakWords);
      if(lines&&lines.length*size*1.18<=height) return {size,lines,lineHeight:size*1.18};
    }
  }
  return null;
}

export function renderMeme(canvas,image,layers) {
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const failed=[];
  for(const layer of layers) {
    const [x,y,w,h]=clampBox(layer.box);
    const width=w*canvas.width,height=h*canvas.height;
    const angle=(layer.rotation||0)*Math.PI/180;
    const extentX=(Math.abs(Math.cos(angle))*width+Math.abs(Math.sin(angle))*height)/2;
    const extentY=(Math.abs(Math.sin(angle))*width+Math.abs(Math.cos(angle))*height)/2;
    const centerX=(x+w/2)*canvas.width,centerY=(y+h/2)*canvas.height;
    if(centerX-extentX<-.01||centerY-extentY<-.01||centerX+extentX>canvas.width+.01||centerY+extentY>canvas.height+.01) {failed.push(layer.id);continue;}
    const padding=Math.max(3,Math.min(width,height)*.04);
    const size=layer.fontSize??Math.max(18,Math.min(canvas.width,canvas.height)*.065);
    const fitted=fitText(ctx,layer.text,width-padding*2,height-padding*2,size);
    if(!fitted) {failed.push(layer.id);continue;}
    ctx.save();
    ctx.translate((x+w/2)*canvas.width,(y+h/2)*canvas.height);
    ctx.rotate(angle);
    ctx.beginPath();ctx.rect(-width/2,-height/2,width,height);ctx.clip();
    ctx.font=`800 ${fitted.size}px Arial, sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
    ctx.fillStyle=layer.style==='plain'?'#151a25':'#fff';ctx.strokeStyle='#111';
    ctx.lineWidth=Math.max(2,fitted.size*.11);
    const start=-(fitted.lines.length-1)*fitted.lineHeight/2;
    for(let index=0;index<fitted.lines.length;index++) {
      const y=start+index*fitted.lineHeight;
      if(layer.style!=='plain')ctx.strokeText(fitted.lines[index],0,y);
      ctx.fillText(fitted.lines[index],0,y);
    }
    ctx.restore();
  }
  return {failed};
}

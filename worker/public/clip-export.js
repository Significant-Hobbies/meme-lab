export function recordingFormat() {
  if(!globalThis.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)return null;
  for(const mime of ['video/mp4;codecs=avc1.640033','video/mp4;codecs=avc1.42002A','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']) {
    if(MediaRecorder.isTypeSupported(mime))return {mime,extension:mime.startsWith('video/mp4')?'mp4':'webm'};
  }
  return null;
}

function linesFor(ctx,text,maxWidth) {
  const lines=[];
  for(const paragraph of text.split('\n')) {
    let line='';
    for(const word of paragraph.split(/\s+/u).filter(Boolean)) {
      if(line&&ctx.measureText(line+' '+word).width>maxWidth){lines.push(line);line='';}
      for(const char of Array.from((line?' ':'')+word)) {
        if(ctx.measureText(line+char).width>maxWidth&&line){lines.push(line);line='';}
        line+=char;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function paintClip(canvas,video,caption,position='top',{attribution=''}={}) {
  if(!video.videoWidth)return;
  const scale=Math.min(1,1920/Math.max(video.videoWidth,video.videoHeight));
  const width=Math.max(2,Math.floor(video.videoWidth*scale/2)*2);
  const videoHeight=Math.round(video.videoHeight*width/video.videoWidth);
  const font=Math.round(width*.052),padding=Math.round(width*.045),lineHeight=Math.round(font*1.25);
  const ctx=canvas.getContext('2d');
  ctx.font=`650 ${font}px ui-sans-serif, system-ui, sans-serif`;
  const lines=linesFor(ctx,caption.trim(),width-padding*2);
  const captionHeight=caption.trim()?padding*2+lines.length*lineHeight:0;
  const creditFont=Math.max(10,Math.round(width*.013));
  ctx.font=`400 ${creditFont}px ui-sans-serif, system-ui, sans-serif`;
  const creditLines=attribution?linesFor(ctx,attribution,width-padding*2):[];
  const creditHeight=creditLines.length?Math.round(padding/2)*2+creditLines.length*Math.ceil(creditFont*1.35):0;
  const height=Math.ceil((videoHeight+captionHeight+creditHeight)/2)*2;
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(video,0,position==='bottom'?0:captionHeight,width,videoHeight);
  ctx.font=`650 ${font}px ui-sans-serif, system-ui, sans-serif`;ctx.fillStyle='#111';ctx.textBaseline='top';
  for(const [index,line] of lines.entries())ctx.fillText(line,padding,(position==='bottom'?videoHeight:0)+padding+index*lineHeight);
  ctx.font=`400 ${creditFont}px ui-sans-serif, system-ui, sans-serif`;ctx.fillStyle='#444';
  for(const [index,line] of creditLines.entries())ctx.fillText(line,padding,videoHeight+captionHeight+Math.round(padding/2)+index*Math.ceil(creditFont*1.35));
}

export function videoEvent(video,event,{signal,timeout=12000}={}) {
  return new Promise((resolve,reject)=>{
    const clean=()=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener('error',fail);signal?.removeEventListener('abort',abort);};
    const done=()=>{clean();resolve();};
    const fail=()=>{clean();reject(new Error('This clip could not be decoded. Choose another reaction.'));};
    const abort=()=>{clean();reject(new DOMException('Cancelled','AbortError'));};
    const timer=setTimeout(()=>{clean();reject(new Error('The clip took too long to load. Try again.'));},timeout);
    video.addEventListener(event,done,{once:true});video.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
  });
}

export async function recordClip(video,canvas,paint,{signal,onProgress,fps=30,preserveCadence=false}={}) {
  const format=recordingFormat();
  if(!format)throw new Error('Video export is unavailable in this browser. Try a recent Chrome, Edge or Safari.');
  if(document.hidden)throw new Error('Keep this tab visible while exporting your video.');
  if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>30)throw new Error('Choose a clip up to 30 seconds long.');
  video.pause();
  if(video.currentTime>.001){const seek=videoEvent(video,'seeked',{signal});video.currentTime=0;await seek;}
  signal?.throwIfAborted();paint();
  const loop=video.loop;video.loop=false;
  const frameRate=Number.isFinite(fps)?Math.max(preserveCadence?1:30,Math.min(60,fps)):30;
  const stream=canvas.captureStream(frameRate);
  let recorder,frame,timer;
  try {
    const bitrate=Math.round(Math.max(8_000_000,Math.min(20_000_000,canvas.width*canvas.height*frameRate*.18)));
    recorder=new MediaRecorder(stream,{mimeType:format.mime,videoBitsPerSecond:bitrate});
    const chunks=[];
    const result=new Promise((resolve,reject)=>{
      let failure;
      const stop=()=>{if(recorder.state!=='inactive')recorder.stop();};
      const abort=()=>{failure=new DOMException('Cancelled','AbortError');stop();};
      const hidden=()=>{if(document.hidden){failure=new Error('Export stopped because the tab was hidden. Keep it visible and try again.');stop();}};
      const failed=()=>{failure=new Error('Video export failed. Try again.');stop();};
      const clean=()=>{clearTimeout(timer);video.removeEventListener('ended',stop);video.removeEventListener('error',failed);signal?.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',hidden);};
      recorder.addEventListener('dataavailable',event=>{if(event.data.size)chunks.push(event.data);});
      recorder.addEventListener('error',()=>{failure=new Error('The browser could not encode this video. Try another browser.');if(recorder.state==='inactive'){clean();reject(failure);}else stop();},{once:true});
      recorder.addEventListener('stop',()=>{
        clean();
        const blob=new Blob(chunks,{type:recorder.mimeType||format.mime});
        if(failure)reject(failure);else if(blob.size<100)reject(new Error('The exported video was empty. Try again.'));else resolve({blob,extension:format.extension});
      },{once:true});
      video.addEventListener('ended',stop,{once:true});video.addEventListener('error',failed,{once:true});signal?.addEventListener('abort',abort,{once:true});document.addEventListener('visibilitychange',hidden);
      timer=setTimeout(()=>{failure=new Error('Export took too long. Try again.');stop();},(video.duration+12)*1000);
      recorder.start(250);
      video.play().catch(()=>{failure=new Error('Playback was blocked. Preview the clip, then try exporting again.');stop();});
    });
    const draw=()=>{paint();onProgress?.(Math.min(99,Math.round(video.currentTime/video.duration*100)));frame=requestAnimationFrame(draw);};
    draw();
    return await result;
  } finally {
    cancelAnimationFrame(frame);clearTimeout(timer);video.pause();video.loop=loop;stream.getTracks().forEach(track=>track.stop());
  }
}

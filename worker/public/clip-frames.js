import {videoEvent} from './clip-export.js';

export async function sampleClipFrames(video,{signal}={}) {
  if(video.readyState<2||!Number.isFinite(video.duration)||video.duration<=0)throw new Error('Wait for the clip to load, then try again.');
  const playing=!video.paused,originalTime=video.currentTime;
  video.pause();
  const canvas=document.createElement('canvas'),scale=Math.min(1,512/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  const ctx=canvas.getContext('2d'),frames=[];
  try {
    for(const fraction of [.12,.5,.88]) {
      signal?.throwIfAborted();const at=video.duration*fraction;
      if(Math.abs(video.currentTime-at)>.01){const seek=videoEvent(video,'seeked',{signal});video.currentTime=at;await seek;}
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      frames.push({at_seconds:Number(at.toFixed(3)),data_url:canvas.toDataURL('image/jpeg',.75)});
    }
    return frames;
  }finally{
    if(!signal?.aborted){
      if(Math.abs(video.currentTime-originalTime)>.01){const seek=videoEvent(video,'seeked',{signal});video.currentTime=originalTime;await seek;}
      if(playing)await video.play();
    }
    canvas.width=canvas.height=1;
  }
}

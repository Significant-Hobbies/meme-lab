export function creationMediaUrl(record) {
  if(!record||record.media_type==='gif') return null;
  try {
    const url=new URL(record.media_url||record.image_url);
    if(url.protocol!=='https:'||url.username||url.password||url.port) return null;
    if(url.hostname==='i.imgflip.com'&&/^\/(?:4\/)?[a-z0-9]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return url.href;
    if(url.hostname==='api.memegen.link'&&/^\/images\/[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return url.href;
  } catch { /* Unknown media stays a reference instead of becoming a proxy URL. */ }
  return null;
}

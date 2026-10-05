// Anna caption-provider adapter. Placement remains in the shared
// template validator. No provider/model pinning or cross-provider fallback.
export function annaCaptionRequest(payload) {
  return {
    messages:payload.messages.map(message=>({...message,content:typeof message.content==='string'?message.content:message.content.map(block=>block.type==='image_url'?{type:'image',url:block.image_url.url}:block)})),
    maxTokens:payload.max_tokens,
    temperature:0,
    modelPreferences:{costPriority:.8,speedPriority:.6,intelligencePriority:.8},
  };
}

export function normalizeAnnaCaptionCompletion(result) {
  if (typeof result?.model!=='string' || !result.model.trim() || result.model==='auto') throw new Error('Missing served model.');
  if (result.stopReason!=='endTurn') throw new Error('Incomplete Anna generation.');
  const blocks=Array.isArray(result.content)?result.content:[result.content];
  if (!blocks.length || blocks.some(block=>block?.type!=='text' || typeof block.text!=='string')) throw new Error('Expected text completion.');
  const text=blocks.map(block=>block.text).join('').trim();
  if (new TextEncoder().encode(text).length>32000) throw new Error('Caption response too large.');
  // Anna has no documented response_format argument. Accept exactly one
  // complete JSON code block or bare JSON, never prose or substring extraction.
  const fence=text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  const content=JSON.stringify(JSON.parse(fence?fence[1]:text));
  return {model:result.model,choices:[{message:{content},finish_reason:'stop'}],usage:result.usage};
}

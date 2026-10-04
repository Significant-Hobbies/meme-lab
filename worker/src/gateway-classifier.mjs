// Preserve the classifier response contract while using managed inference.
export function createGatewayClassifierFetch(binding,projectId='meme-lab') {
  return async (_url,init={})=>{
    if(!binding||typeof binding.fetch!=='function') throw new Error('Free AI gateway binding is unavailable.');
    const source=JSON.parse(init.body||'{}');
    const labels=Array.isArray(source.labels)?source.labels:[];
    const inputs=Array.isArray(source.inputs)?source.inputs:[];
    // Ordinal ranking has five labels; perspective selection has one per meme.
    if(!inputs.length||inputs.length>30||!labels.length||labels.length>30) throw new Error('Classifier input is outside the supported bounds.');
    const labelIndexes=labels.map((_,index)=>index);
    const schema={type:'object',additionalProperties:false,required:['results'],properties:{results:{type:'array',minItems:inputs.length,maxItems:inputs.length,items:{type:'object',additionalProperties:false,required:['label_index','scores'],properties:{label_index:{type:'integer',enum:labelIndexes},scores:{type:'array',minItems:labels.length,maxItems:labels.length,items:{type:'number',minimum:0,maximum:1}}}}}}};
    const prompt=`Classify each input independently. Return label_index using only the listed label indexes. Return scores in the same order as the labels; each score must be between 0 and 1 and scores must form a probability distribution summing to 1, not all be equal. label_index must identify the highest-probability label. Preserve input order. Follow this output shape: ${JSON.stringify(schema)}\nInstructions: ${String(source.instructions||'').slice(0,3000)}\nLabels by index: ${JSON.stringify(labels.map((label,index)=>({index,label})))}\nInputs: ${JSON.stringify(inputs)}`;
    const body=JSON.stringify({model:'auto',stream:false,response_format:{type:'json_object'},messages:[{role:'user',content:prompt}],max_tokens:2000});
    for(let attempt=0;attempt<2;attempt++) {
      init.signal?.throwIfAborted();
      try {
        const response=await binding.fetch(new Request('https://fleet-gateway.internal/v1/chat/completions',{
          method:'POST',
          headers:{authorization:'Bearer service-binding','content-type':'application/json','x-gateway-project-id':projectId},
          signal:init.signal,
          body
        }));
        if(!response.ok) {
          if(![500,502,503,504].includes(response.status)||attempt===1||init.signal?.aborted) return response;
          await response.body?.cancel();
          continue;
        }
        return await decodeClassifierResponse(response,inputs,labels,labelIndexes);
      } catch(error) {
        // A syntactically invalid provider answer is transient too. Retry once
        // under the original deadline, never use invalid data as fit scores.
        if(attempt===1||init.signal?.aborted) throw error;
      }
    }
    throw new Error('Free AI classifier could not produce a valid answer.');
  };
}

async function decodeClassifierResponse(response,inputs,labels,labelIndexes) {
  let raw;
  try { raw=await response.json(); } catch { throw new Error('Free AI gateway returned invalid JSON.'); }
  if(typeof raw?.choices?.[0]?.message?.content!=='string') throw new Error('Free AI classifier returned invalid structured output.');
  let parsed;
  try { parsed=JSON.parse((raw?.choices?.[0]?.message?.content??'').replace(/^```(?:json)?\s*|\s*```$/g,'')); } catch { throw new Error('Free AI classifier returned invalid structured output.'); }
  if(!Array.isArray(parsed?.results)||parsed.results.length!==inputs.length) throw new Error('Free AI classifier returned an unexpected result count.');
  const results=parsed.results.map(result=>{
    if(!Number.isInteger(result?.label_index)||!labelIndexes.includes(result.label_index)||!Array.isArray(result.scores)||result.scores.length!==labels.length||result.scores.some(score=>typeof score!=='number'||!Number.isFinite(score)||score<0||score>1)) throw new Error('Free AI classifier returned invalid category scores.');
    const total=result.scores.reduce((sum,score)=>sum+score,0);
    if(total<=0) throw new Error('Free AI classifier returned empty category scores.');
    return {label:labels[result.label_index],scores:Object.fromEntries(labels.map((label,index)=>[label,result.scores[index]/total]))};
  });
  return Response.json({results},{status:200});
}

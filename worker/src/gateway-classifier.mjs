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
    // Tuples avoid repeating field names for every candidate in the bounded
    // completion. Decode them back into the unchanged classifier contract.
    // Uniform numeric arrays avoid tuple-only schema keywords across providers.
    // The decoder still requires an integer category and probabilities in [0,1].
    const schema={type:'object',additionalProperties:false,required:['results'],properties:{results:{type:'array',minItems:inputs.length,maxItems:inputs.length,items:{type:'array',minItems:labels.length+1,maxItems:labels.length+1,items:{type:'number',minimum:0,maximum:Math.max(1,labels.length-1)}}}}};
    const prompt=`Classify each input independently. Return compact JSON without indentation or commentary. Each results entry is one flat array [label_index,score_0,score_1,...], with exactly ${labels.length+1} numbers. Return label_index using only the listed label indexes. Return scores in the same order as the labels; each score must be between 0 and 1 and scores must form a probability distribution summing to 1, not all be equal. Use at most three decimal places per score. label_index must identify the highest-probability label. Preserve input order. Follow this output shape: ${JSON.stringify(schema)}\nInstructions: ${String(source.instructions||'').slice(0,3000)}\nLabels by index: ${JSON.stringify(labels.map((label,index)=>({index,label})))}\nInputs: ${JSON.stringify(inputs)}`;
    const body=JSON.stringify({model:'auto',stream:false,response_format:{type:'json_schema',json_schema:{name:'classifier_results',strict:true,schema}},messages:[{role:'user',content:prompt}],max_tokens:2000});
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
        return await decodeClassifierResponse(response,inputs,labels,labelIndexes,init.classifierRejectFlatOrdinal);
      } catch(error) {
        // A syntactically invalid provider answer is transient too. Retry once
        // under the original deadline, never use invalid data as fit scores.
        if(attempt===1||init.signal?.aborted) throw error;
      }
    }
    throw new Error('Free AI classifier could not produce a valid answer.');
  };
}

async function decodeClassifierResponse(response,inputs,labels,labelIndexes,rejectFlatOrdinal) {
  let raw;
  try { raw=await response.json(); } catch { throw new Error('Free AI gateway returned invalid JSON.'); }
  if(typeof raw?.choices?.[0]?.message?.content!=='string') {
    logInvalidOutput(raw,'missing_content');
    throw new Error('Free AI classifier returned invalid structured output.');
  }
  let parsed;
  try { parsed=JSON.parse(raw.choices[0].message.content.replace(/^```(?:json)?\s*|\s*```$/g,'')); } catch {
    logInvalidOutput(raw,'invalid_json');
    throw new Error('Free AI classifier returned invalid structured output.');
  }
  if(!Array.isArray(parsed?.results)||parsed.results.length!==inputs.length) throw new Error('Free AI classifier returned an unexpected result count.');
  const ordinalFit=labels.length===5&&labels.every((label,index)=>typeof label==='string'&&label.startsWith(`${index} | `));
  const results=parsed.results.map(result=>{
    // Accept previous object-shaped answers too; validate either representation
    // before exposing any scores to ranking.
    if(Array.isArray(result)) result={label_index:result[0],scores:result.slice(1)};
    if(!Number.isInteger(result?.label_index)||!labelIndexes.includes(result.label_index)||!Array.isArray(result.scores)||result.scores.length!==labels.length||result.scores.some(score=>typeof score!=='number'||!Number.isFinite(score)||score<0||score>1)) throw new Error('Free AI classifier returned invalid category scores.');
    const total=result.scores.reduce((sum,score)=>sum+score,0);
    if(total<=0) throw new Error('Free AI classifier returned empty category scores.');
    // The redundant generated index sometimes contradicts its own scores.
    // Derive ordinal fit from the validated distribution; an exact tie keeps
    // the lower fit level. Preserve the separate safety gate's categorical
    // decision and the generic perspective contract.
    const winner=ordinalFit?result.scores.reduce((best,score,index)=>score>result.scores[best]?index:best,0):result.label_index;
    return {label:labels[winner],scores:Object.fromEntries(labels.map((label,index)=>[label,result.scores[index]/total]))};
  });
  // The ranker's flat-batch invariant belongs inside the bounded repair loop.
  // Final winners may legitimately tie, so only shortlist scoring opts in.
  if(rejectFlatOrdinal&&ordinalFit&&results.length>1) {
    const fits=results.map(result=>labels.reduce((total,label,index)=>total+result.scores[label]*index,0)/(labels.length-1));
    if(fits.every(score=>score===fits[0])) {
      logInvalidOutput(raw,'flat_ordinal_scores');
      throw new Error('Free AI classifier returned flat ordinal scores.');
    }
  }
  return Response.json({results},{status:200});
}

function logInvalidOutput(raw,failure_kind) {
  const reason=raw?.choices?.[0]?.finish_reason;
  const tokens=raw?.usage?.completion_tokens;
  console.warn(JSON.stringify({
    event:'classifier_output_invalid',failure_kind,
    finish_reason:['stop','length','content_filter','tool_calls'].includes(reason)?reason:null,
    completion_tokens:Number.isInteger(tokens)&&tokens>=0&&tokens<=2000?tokens:null
  }));
}

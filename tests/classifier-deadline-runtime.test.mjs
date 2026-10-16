import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const tooling=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=tooling('miniflare');
const {buildSync}=tooling('esbuild');
const root=fileURLToPath(new URL('../',import.meta.url));
const script=buildSync({stdin:{contents:`import {withClassifierDeadline} from './worker/src/classifier-deadline.mjs';
export default {async fetch(){
  let calls=0;const bounded=withClassifierDeadline(async()=>{calls++;return Response.json({ok:true});},1000);
  const first=await bounded('https://classifier.test',{signal:AbortSignal.timeout(1000)});
  let aborted;try{await bounded('https://classifier.test',{signal:AbortSignal.abort()});}catch(error){aborted=error.name;}
  return Response.json({first:first.status,aborted,calls});
}};`,resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser'}).outputFiles[0].text;

test('actual Workerd supports combined classifier deadlines and prevents cancelled dispatch',async()=>{
  const runtime=new Miniflare(convertV4MiniflareOptions({name:'classifier-deadline-regression',modules:true,compatibilityDate:'2026-09-01',script}));
  try{assert.deepEqual(await (await runtime.dispatchFetch('http://localhost/')).json(),{first:200,aborted:'AbortError',calls:1});}
  finally{await runtime.dispose();}
});

test('actual named service binding preserves the classifier visitor address',async()=>{
  const consumer=buildSync({stdin:{contents:`import {createGatewayClassifierFetch} from './worker/src/gateway-classifier.mjs';
export default {async fetch(request,env){
  const classify=createGatewayClassifierFetch(env.FREE_AI,'meme-lab','192.0.2.1');
  return classify('',{body:JSON.stringify({inputs:['fixture'],labels:['yes','no']})});
}};`,resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser'}).outputFiles[0].text;
  const gateway=`import {WorkerEntrypoint} from 'cloudflare:workers';
export class Gateway extends WorkerEntrypoint {
  async fetch(request){
    if(request.headers.get('cf-connecting-ip')!=='192.0.2.1')return new Response(null,{status:429});
    return Response.json({choices:[{message:{content:JSON.stringify({results:[[0,1,0]]})}}]});
  }
}
export default {fetch(){return new Response(null,{status:404});}};`;
  const runtime=new Miniflare(convertV4MiniflareOptions({workers:[
    {name:'consumer',modules:true,compatibilityDate:'2026-09-19',script:consumer,serviceBindings:{FREE_AI:{name:'gateway',entrypoint:'Gateway'}}},
    {name:'gateway',modules:true,compatibilityDate:'2026-09-19',script:gateway}
  ]}));
  try{
    const response=await runtime.dispatchFetch('http://localhost/');
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{results:[{label:'yes',scores:{yes:1,no:0}}]});
  }finally{await runtime.dispose();}
});

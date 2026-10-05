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

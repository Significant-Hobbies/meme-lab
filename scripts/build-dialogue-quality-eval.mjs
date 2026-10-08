import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stableDialogueEvalId,validateDialogueEvalCases} from '../src/dialogue-eval.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function buildDialogueQualityCases(records,{count=200}={}) {
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const eligible=records.filter(row=>row.provenance?.provider==='English Wikiquote'
    && typeof row.quote==='string'&&row.quote.length>=3&&row.quote.length<=500
    && typeof row.speaker==='string'&&row.speaker.trim()&&row.work_title);
  const ordered=eligible.sort((a,b)=>hash(a.id).localeCompare(hash(b.id))||a.id.localeCompare(b.id));
  const films=new Set();
  const selected=[];
  for(const row of ordered) {
    if(films.has(row.work_title)) continue;
    films.add(row.work_title);
    selected.push({id:stableDialogueEvalId(row.id),dialogue_id:row.id,quote:row.quote,
      work_title:row.work_title,speaker:row.speaker,provenance:row.provenance,
      structural_score:row.screening?.screening_score??null,
      sample_strategy:'stable_hash_one_line_per_wikiquote_film',
      review_status:'pending_owner_review',human_validated:false,production_eligible:false});
    if(selected.length===count) break;
  }
  validateDialogueEvalCases(selected,{expectedCount:count});
  return selected;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const input=resolve(process.argv[2]??resolve(root,'.fleet-local/dialogue8/wikiquote-pilot.jsonl'));
  const output=resolve(process.argv[3]??resolve(root,'.fleet-local/dialogue8/dialogue_quality_cases.jsonl'));
  const text=await readFile(input,'utf8');
  const cases=buildDialogueQualityCases(text.split('\n').filter(Boolean).map(JSON.parse));
  await mkdir(dirname(output),{recursive:true});
  const content=cases.map(row=>JSON.stringify(row)).join('\n')+'\n';
  await writeFile(output,content);
  console.log(JSON.stringify({cases:cases.length,distinct_films:new Set(cases.map(row=>row.work_title)).size,
    source:'English Wikiquote',input_sha256:createHash('sha256').update(text).digest('hex'),
    output_sha256:createHash('sha256').update(content).digest('hex'),human_validated:false,
    production_eligible:false,output},null,2));
}

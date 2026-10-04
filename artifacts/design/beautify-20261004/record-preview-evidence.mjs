import {readFile,writeFile,copyFile} from 'node:fs/promises';
const base='artifacts/design/beautify-20261004/';
for(const id of ['a','b','c'])for(const kind of ['','-phone'])await copyFile('/tmp/meme-lab-direction-'+id+kind+'.png',base+id+kind+'.png');
await copyFile('/tmp/meme-lab-design-before-web.png',base+'before-web.png');
const path='.fleet/design-review-beautify-20261004.json';
const r=JSON.parse(await readFile(path,'utf8'));
r.project='meme-lab';
r.direction.productSurfaces={scope:'paired',landing:'https://memes.significanthobbies.com (entry and operating picker)',app:'Anna Dashboard app389 / Make this me',reason:'Website is also the public entry surface; Anna hosts the signed-in editor.'};
r.direction.before=base+'before-web.png';
r.direction.references=['Imgflip Meme Generator','Photopea','Are.na'];
r.direction.library={strategy:'upstream-first',primary:'healthy-project-native',sources:['https://github.com/Significant-Hobbies/meme-lab/blob/main/worker/public/index.html','https://github.com/Significant-Hobbies/meme-lab/blob/main/anna/personal-editor.html'],runtime:'Native controls; no new dependencies',customReplacement:{used:false,authorization:'not-required',reason:'Adapt existing native inputs, consent, slider, actions and preview components; no replacement primitive.'}};
const descriptions=[
 ['a','Studio','Quiet compact controls with equal full-meme canvases.','Split situation/composer website; narrow editor tool rail.','System sans with compact strong headings.'],
 ['b','Postcard','Personal keepsake with an editorial three-phase rhythm.','Underlined composer; centered comparison with phase navigation.','Georgia display and entered language; sans controls.'],
 ['c','Contact Sheet','An image-led dark workspace.','Narrow situation column and contact sheet; dominant result beside smaller original.','System sans plus monospace controls/metadata.']
];
r.direction.probes=descriptions.map(([id,name,thesis,layout,typography])=>({id,name,path:base+id+'.png',thesis,layout,typography,surfaces:{landing:base+id+'.png',app:base+id+'.png'},compact:base+id+'-phone.png',note:'One labeled paired capture contains distinct website and Anna screens.'}));
r.direction.contract={purpose:'Meme Lab helps people selecting reactions for everyday conversations find a fitting meme through a corrected catalogue and contextual AI ranking.',purposeSource:'PRODUCT.md; saas-maker/catalog/projects.json projects[meme-lab].presentation.directory.purposeContract',canonicalPurpose:'Turn one pasted comment or situation into a useful meme immediately.',purposeAlignment:'repository-override',driftNote:'Only version/lifecycle metadata differs: canonical Anna1.2.0 is now resubmitted1.2.1. Shared purpose unchanged; catalog refresh pending before future landing approval.',audience:'People choosing conversational reactions and consenting users creating personal photo memes.',job:'Choose a fitting reaction or review a personal image before exporting.',thesis:'Images carry personality; compact controls support the task.',system:'Direction-specific layouts, type and semantic color roles are recorded in '+base+'brief.md.',signature:'Original/result comparison with an explicit face target; recognizable reaction imagery.',risk:'A restrained tone, B additional steps, C reduced original size; see direction-specific risks in the brief.',qualityBar:'Readable compact controls, image-first hierarchy, consistent website/Anna identity, full-canvas review, truthful availability, no decorative dashboard or fake proof.'};
r.evidence.slopScale.checkpoints=descriptions.map(([id])=>({stage:'directions',direction:id,status:'scanned',command:'node saas-maker/tooling/scripts/slop-score.mjs http://127.0.0.1:58121/'+id+'.html --json',report:'.fleet-local/slop/beautify-20261004/'+id+'.json',findingsReview:id==='b'?'Uppercase cues and numbered phases are intentional task separation and actual proposed workflow. Preview wrapper affects scoring.':'Uppercase cues separate tasks. Native input and image boundaries are intentional working surfaces; no icon-feature card wall. Preview wrapper affects scoring.'}));
r.evidence.productContinuity.reason='Paired static direction previews reviewed; real implemented handoff remains pending owner selection.';
r.ownerFeedback.note='Three rendered systems prepared. Selection required before production UI edits.';
await writeFile(path,JSON.stringify(r,null,2)+'\n');
console.log('Preview captures and direction evidence retained; approval remains pending.');

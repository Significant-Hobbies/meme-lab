import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const landing=createRequire(new URL('../landing/package.json',import.meta.url));
const astro=createRequire(landing.resolve('astro/package.json'));
const parserPackage=astro.resolve('ultrahtml/package.json');
const {parse,TEXT_NODE,COMMENT_NODE,DOCUMENT_NODE}=await import(new URL('./dist/index.js',pathToFileURL(parserPackage)));
const {unescape}=astro('html-escaper');
const normalize=value=>unescape(value).replace(/\s+/g,' ').trim();
function find(node,predicate){if(predicate(node))return node;for(const child of node.children||[]){const found=find(child,predicate);if(found)return found;}}
function render(node){
  if(node.type===TEXT_NODE)return unescape(node.value).replace(/\s+/g,' ');
  if(node.type===COMMENT_NODE)return '';
  if(node.type===DOCUMENT_NODE)return (node.children||[]).map(render).join('');
  const attrs=node.attributes||{};
  if(['script','style','nav','footer','dialog','svg'].includes(node.name)||Object.hasOwn(attrs,'hidden')||attrs['aria-hidden']==='true')return '';
  if(['collection-count','collection-grid','collection-shelf-description'].includes(attrs.id))return '';
  const body=(node.children||[]).map(render).join('');
  if(/^h[1-6]$/.test(node.name))return `\n\n${'#'.repeat(Number(node.name[1]))} ${normalize(body)}\n\n`;
  if(node.name==='a')return `[${normalize(body)}](${attrs.href||''})`;
  if(node.name==='img')return attrs.alt?`![${normalize(attrs.alt)}](${attrs.src})`:'';
  if(node.name==='code')return `\`${normalize(body)}\``;
  if(['strong','b'].includes(node.name))return `**${normalize(body)}**`;
  if(['em','i'].includes(node.name))return `_${normalize(body)}_`;
  if(node.name==='br')return '\n';
  if(node.name==='input'||node.name==='textarea')return attrs.placeholder?`\n\n${normalize(attrs.placeholder)}\n\n`:'';
  if(node.name==='li'||node.name==='option')return `\n- ${normalize(body)}\n`;
  if(node.name==='th'||node.name==='td')return ` ${normalize(body).replaceAll('|','\\|')} |`;
  if(node.name==='tr')return `|${body}\n${node.children?.some(child=>child.name==='th')?'|'+node.children.filter(child=>child.name==='th').map(()=>' --- |').join('')+'\n':''}`;
  if(['thead','tbody','tfoot'].includes(node.name))return body;
  assert.ok(['main','article','section','div','p','span','ul','ol','table','dl','dt','dd','details','summary','figure','figcaption','aside','header','form','label','button','select','optgroup','small','sup','sub'].includes(node.name),`Unsupported authored element: ${node.name}`);
  return ['span','small','sup','sub'].includes(node.name)?` ${body} `:`\n\n${body.trim()}\n\n`;
}
const clean=value=>value.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()+'\n';
const documents={};
// These four checked-in HTML files are authored source, not emitted landing output.
for(const path of ['/collection','/how-it-works','/privacy','/anna-privacy']){
  const source=await readFile(new URL(`../worker/public${path}.html`,import.meta.url),'utf8');
  const tree=parse(source),main=find(tree,node=>node.name==='main');
  assert.ok(main,`Missing authored main: ${path}`);
  assert.ok(!find(tree,node=>node.name==='meta'&&node.attributes?.name==='robots'&&/noindex/.test(node.attributes.content)),`Noindex source: ${path}`);
  const title=find(tree,node=>node.name==='title');
  const description=find(tree,node=>node.name==='meta'&&node.attributes?.name==='description')?.attributes.content||'';
  documents[path]={title:normalize(title.children.map(node=>node.value||'').join('')),description:unescape(description),markdown:clean(render(main))};
}
const home=JSON.parse(await readFile(new URL('../landing/src/content/home.json',import.meta.url),'utf8'));
const lines=[`# ${home.intro.title}`,'',home.intro.eyebrow,'',home.intro.body,'',`## ${home.composer.label}`,'',home.composer.placeholder,'',home.composer.submit,'',`${home.composer.retention} [Privacy](/privacy)`,'',home.composer.examplesTitle,'',...home.composer.examples.slice(1).map(item=>`- ${item.label}`),'',`## ${home.collection.title}`,'',`[${home.collection.browse}](/collection)`,'',...home.collection.items.flatMap(item=>[`### [${item.title}](${item.href})`,'',`![${item.alt}](${item.image})`,'',item.body,'']),home.collection.note,'',...home.about.flatMap(item=>[`## ${item.title}`,'',clean(render(parse(item.body))),''])];
documents['/']={title:home.meta?.title||'Meme Lab',description:home.meta?.description||home.intro.body,markdown:clean(lines.join('\n'))};
const output=new URL('../worker/src/public-copy.generated.json',import.meta.url);
const serialized=JSON.stringify(documents,null,2)+'\n';
if(process.argv.includes('--check'))assert.equal(await readFile(output,'utf8'),serialized,'Regenerate public readability source');
else await writeFile(output,serialized);
console.log(`Public readability source: ${Object.keys(documents).length} authored pages`);

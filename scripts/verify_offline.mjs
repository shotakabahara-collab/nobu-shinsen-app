import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const required=['pyodide/pyodide.js','pyodide/pyodide.asm.js','pyodide/pyodide.asm.wasm','pyodide/pyodide-lock.json','pyodide/python_stdlib.zip','runtime-worker.js','runtime_bundle_b223.tgz','canonical_officer_catalog.json','canonical_skill_catalog.json','manifest.webmanifest','apple-touch-icon.png','icon-192.png','icon-512.png'];
const sw=await readFile(join('dist','sw.js'),'utf8');
const worker=await readFile(join('dist','runtime-worker.js'),'utf8');
const manifest=JSON.parse(await readFile(join('dist','manifest.webmanifest'),'utf8'));
const lock=JSON.parse(await readFile(join('canonical','LOCK.json'),'utf8'));
const bundle=await readFile(join('dist','runtime_bundle_b223.tgz'));
const officerCatalog=JSON.parse(await readFile(join('dist','canonical_officer_catalog.json'),'utf8'));
const skillCatalog=JSON.parse(await readFile(join('dist','canonical_skill_catalog.json'),'utf8'));
const bundleSha=createHash('sha256').update(bundle).digest('hex');

for(const asset of required)if(!sw.includes(asset))throw new Error(`offline precache missing: ${asset}`);
if(/https?:\/\//.test(worker))throw new Error('runtime worker still contains an external URL');
if(bundleSha!==lock.runtimeBundleSha256)throw new Error(`runtime bundle SHA mismatch: ${bundleSha}`);
if(officerCatalog.canonicalVersion!==lock.canonicalVersion||officerCatalog.canonicalArchiveSha256!==lock.archiveSha256)throw new Error('canonical officer catalog release lock mismatch');
if(!Array.isArray(officerCatalog.officers)||officerCatalog.officerCount!==officerCatalog.officers.length)throw new Error('canonical officer catalog is malformed');
if(officerCatalog.unitLevelRule?.baseLevel!==5||officerCatalog.unitLevelRule?.defaultCap!==10||officerCatalog.unitLevelRule?.generalTraitCap!==11)throw new Error('canonical troop level rule is malformed');
const officerByName=new Map(officerCatalog.officers.map(officer=>[officer.name,officer]));
if(!officerByName.get('松永久秀')?.unitLevelTraits?.some(trait=>trait.name==='砲術Ⅲ'&&trait.unlockedAt===3&&trait.levelBonus===3))throw new Error('canonical troop level trait missing: 松永久秀 砲術Ⅲ');
if(skillCatalog.canonicalVersion!==lock.canonicalVersion||skillCatalog.canonicalArchiveSha256!==lock.archiveSha256)throw new Error('canonical skill catalog release lock mismatch');
if(!Array.isArray(skillCatalog.skills)||skillCatalog.skillCount!==skillCatalog.skills.length)throw new Error('canonical skill catalog is malformed');
const skillByName=new Map(skillCatalog.skills.map(skill=>[skill.name,skill]));
if(skillByName.get('梟雄の計')?.attachable!==false||skillByName.get('紅蓮の炎')?.attachable!==true)throw new Error('canonical skill attachability is malformed');
if(manifest.display!=='standalone'||manifest.orientation!=='portrait'||manifest.start_url!=='/nobu-shinsen-app/')throw new Error('PWA manifest is not configured for iPhone standalone launch');
for(const size of ['192x192','512x512'])if(!manifest.icons?.some(icon=>icon.sizes===size&&icon.type==='image/png'))throw new Error(`PWA manifest missing PNG icon: ${size}`);
console.log(`offline precache verified: ${required.length} required assets; ${officerCatalog.officerCount} canonical officers with troop-level traits; ${skillCatalog.skillCount} canonical skills with attachability; runtime bundle ${bundleSha}`);

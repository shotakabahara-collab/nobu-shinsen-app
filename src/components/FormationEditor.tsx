import {useEffect,useMemo,useState} from 'react';
import {formationSchema,troopTypes,type Formation,type SkillRecord,type WarriorRecord} from '../domain/schemas';
import {calculateTroopLevel,findDuplicateEquippedSkill,normalizeFormationName,type EquippedSkillLocation} from '../domain/formationRules';
import {findCanonicalOfficer,loadCanonicalOfficerCatalog,type CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import {loadCanonicalSkillCatalog,type CanonicalSkill} from '../services/canonicalSkillCatalog';
import {AutocompleteInput,type AutocompleteOption} from './ui/AutocompleteInput';
import {Button} from './ui/button';

const roles=['大将','副将1','副将2'] as const;
const defaultUnitLevelRule={baseLevel:5,defaultCap:10,capUnlockMode:'unbounded'} as const;

type Props={
 initial?:Formation;
 warriors?:WarriorRecord[];
 skills?:SkillRecord[];
 canonicalOfficers?:CanonicalOfficer[];
 canonicalSkills?:CanonicalSkill[];
 onSave:(value:Formation)=>Promise<void>|void;
 onCancel:()=>void;
};

type Warning={title:string;message:string};

export function createEmptyFormation():Formation{
 const now=new Date().toISOString();
 const warrior=()=>({id:crypto.randomUUID(),name:'',limitBreak:0,inherentSkill:'未登録',equippedSkills:['',''] as [string,string]});
 return {id:crypto.randomUUID(),name:'',kind:'ally',troopType:'騎馬',troopLevel:5,troops:10000,warriors:[warrior(),warrior(),warrior()],createdAt:now,updatedAt:now};
}

function slotLabel(location:EquippedSkillLocation):string{
 return `${roles[location.warriorIndex]??`武将${location.warriorIndex+1}`}の装着戦法${location.skillIndex+1}`;
}

export function FormationEditor({initial,warriors=[],skills=[],canonicalOfficers,canonicalSkills,onSave,onCancel}:Props){
 const [value,setValue]=useState<Formation>(()=>structuredClone(initial??createEmptyFormation()));
 const [officerCatalog,setOfficerCatalog]=useState<CanonicalOfficer[]>(canonicalOfficers??[]);
 const [skillCatalog,setSkillCatalog]=useState<CanonicalSkill[]>(canonicalSkills??[]);
 const [unitLevelRule,setUnitLevelRule]=useState(defaultUnitLevelRule);
 const [officerCatalogError,setOfficerCatalogError]=useState('');
 const [skillCatalogError,setSkillCatalogError]=useState('');
 const [error,setError]=useState('');
 const [warning,setWarning]=useState<Warning|null>(null);
 const field='w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white';
 const canonicalByName=useMemo(()=>new Map(officerCatalog.map(officer=>[normalizeFormationName(officer.name),officer])),[officerCatalog]);
 const canonicalSkillByName=useMemo(()=>new Map(skillCatalog.map(skill=>[normalizeFormationName(skill.name),skill])),[skillCatalog]);
 const inherentNames=useMemo(()=>new Set(officerCatalog.map(officer=>normalizeFormationName(officer.inherentSkill)).filter(Boolean)),[officerCatalog]);
 const localSkillByName=useMemo(()=>new Map(skills.map(skill=>[normalizeFormationName(skill.name),skill])),[skills]);

 const warriorOptions=useMemo<AutocompleteOption[]>(()=>{
  const byName=new Map<string,AutocompleteOption>();
  for(const officer of officerCatalog)byName.set(officer.name,{value:officer.name,detail:officer.inherentSkill,keywords:[officer.id]});
  for(const warrior of warriors){
   const canonical=canonicalByName.get(normalizeFormationName(warrior.name));
   byName.set(warrior.name,{value:warrior.name,detail:canonical?`所有 ${warrior.limitBreak}凸・${canonical.inherentSkill}`:`登録武将 ${warrior.limitBreak}凸`,priority:10});
  }
  return Array.from(byName.values());
 },[canonicalByName,officerCatalog,warriors]);

 const allSkillOptions=useMemo<AutocompleteOption[]>(()=>{
  const byName=new Map<string,AutocompleteOption>();
  for(const skill of skillCatalog)byName.set(skill.name,{value:skill.name,detail:[skill.type,skill.attachable?'装着可':'固有・装着不可'].filter(Boolean).join('・'),keywords:[skill.id]});
  for(const skill of skills){
   const canonical=canonicalSkillByName.get(normalizeFormationName(skill.name));
   byName.set(skill.name,{value:skill.name,detail:`所有・${canonical?.type||skill.category}`,priority:10});
  }
  return Array.from(byName.values());
 },[canonicalSkillByName,skillCatalog,skills]);

 const equippableSkillOptions=useMemo<AutocompleteOption[]>(()=>{
  const byName=new Map<string,AutocompleteOption>();
  for(const skill of skillCatalog){
   if(!skill.attachable||inherentNames.has(normalizeFormationName(skill.name)))continue;
   byName.set(skill.name,{value:skill.name,detail:[skill.type,'装着可'].filter(Boolean).join('・'),keywords:[skill.id]});
  }
  for(const skill of skills){
   const normalized=normalizeFormationName(skill.name);
   const canonical=canonicalSkillByName.get(normalized);
   if(skill.category==='固有'||inherentNames.has(normalized)||canonical?.attachable===false)continue;
   byName.set(skill.name,{value:skill.name,detail:`所有・${canonical?.type||skill.category}`,priority:10});
  }
  return Array.from(byName.values());
 },[canonicalSkillByName,inherentNames,skillCatalog,skills]);

 const troopLevel=useMemo(()=>calculateTroopLevel(value.troopType,value.warriors,officerCatalog,skillCatalog,unitLevelRule),[officerCatalog,skillCatalog,unitLevelRule,value.troopType,value.warriors]);

 useEffect(()=>{
  if(canonicalOfficers){setOfficerCatalog(canonicalOfficers);setOfficerCatalogError('');return;}
  let active=true;
  void loadCanonicalOfficerCatalog().then(result=>{if(active){setOfficerCatalog(result.officers);setUnitLevelRule(result.unitLevelRule);setOfficerCatalogError('');}}).catch(reason=>{if(active)setOfficerCatalogError(reason instanceof Error?reason.message:'正本武将カタログを読み込めませんでした');});
  return()=>{active=false;};
 },[canonicalOfficers]);

 useEffect(()=>{
  if(canonicalSkills){setSkillCatalog(canonicalSkills);setSkillCatalogError('');return;}
  let active=true;
  void loadCanonicalSkillCatalog().then(result=>{if(active){setSkillCatalog(result.skills);setSkillCatalogError('');}}).catch(reason=>{if(active)setSkillCatalogError(reason instanceof Error?reason.message:'正本戦法カタログを読み込めませんでした');});
  return()=>{active=false;};
 },[canonicalSkills]);

 useEffect(()=>{
  if(!officerCatalog.length)return;
  setValue(current=>{
   let changed=false;
   const next=current.warriors.map(warrior=>{
    const match=findCanonicalOfficer(officerCatalog,warrior.name);
    if(match&&warrior.inherentSkill!==match.inherentSkill){changed=true;return {...warrior,inherentSkill:match.inherentSkill};}
    return warrior;
   }) as Formation['warriors'];
   return changed?{...current,warriors:next}:current;
  });
 },[officerCatalog]);

 useEffect(()=>{
  setValue(current=>current.troopLevel===troopLevel.level?current:{...current,troopLevel:troopLevel.level});
 },[troopLevel.level]);

 function updateWarrior(index:number,patch:Partial<Formation['warriors'][number]>){
  const next=structuredClone(value.warriors);const current=next[index];if(!current)return;
  next[index]={...current,...patch};setError('');setValue({...value,warriors:next});
 }

 function updateWarriorName(index:number,name:string){
  const match=canonicalByName.get(normalizeFormationName(name));
  updateWarrior(index,{name,inherentSkill:match?.inherentSkill??'未登録'});
 }

 function equippedSkillRestriction(name:string):string|undefined{
  const normalized=normalizeFormationName(name);
  if(!normalized)return undefined;
  const canonical=canonicalSkillByName.get(normalized);
  const local=localSkillByName.get(normalized);
  if(inherentNames.has(normalized)||canonical?.attachable===false||local?.category==='固有')return `「${normalized}」は固有戦法のため、装着戦法には設定できません。`;
  return undefined;
 }

 function updateEquippedSkill(warriorIndex:number,skillIndex:0|1,name:string){
  const restriction=equippedSkillRestriction(name);
  if(restriction){setWarning({title:'装着できない戦法です',message:restriction});return;}
  const next=structuredClone(value.warriors);
  const warrior=next[warriorIndex];if(!warrior)return;
  warrior.equippedSkills[skillIndex]=name;
  const duplicate=findDuplicateEquippedSkill(next);
  if(duplicate){
   setWarning({title:'装着戦法が重複しています',message:`「${duplicate.name}」は${slotLabel(duplicate.first)}ですでに使用されています。同じ編成内では装着戦法を重複できません。`});
   return;
  }
  setError('');setValue({...value,warriors:next});
 }

 async function submit(e:React.FormEvent){
  e.preventDefault();
  for(let warriorIndex=0;warriorIndex<value.warriors.length;warriorIndex++){
   const warrior=value.warriors[warriorIndex];if(!warrior)continue;
   for(let skillIndex=0;skillIndex<warrior.equippedSkills.length;skillIndex++){
    const restriction=equippedSkillRestriction(warrior.equippedSkills[skillIndex]??'');
    if(restriction){setWarning({title:'装着できない戦法です',message:`${slotLabel({warriorIndex,skillIndex})}：${restriction}`});return;}
   }
  }
  const duplicate=findDuplicateEquippedSkill(value.warriors);
  if(duplicate){setWarning({title:'装着戦法が重複しています',message:`「${duplicate.name}」は${slotLabel(duplicate.first)}と${slotLabel(duplicate.duplicate)}で重複しています。修正するまで保存できません。`});return;}
  const normalized={
   ...value,
   kind:'ally' as const,
   troopLevel:troopLevel.level,
   warriors:value.warriors.map(warrior=>{
    const match=canonicalByName.get(normalizeFormationName(warrior.name));
    return match?{...warrior,name:match.name,inherentSkill:match.inherentSkill}:warrior;
   }) as Formation['warriors'],
   updatedAt:new Date().toISOString(),
  };
  const parsed=formationSchema.safeParse(normalized);
  if(!parsed.success){setError(parsed.error.issues[0]?.message||'入力を確認してください');return;}
  await onSave(parsed.data);
 }

 const troopLevelDetails=troopLevel.sources.length
  ? troopLevel.sources.map(source=>source.sourceType==='trait'
   ? `${source.officerName}「${source.sourceName}」+${source.levelBonus}${source.capUnlock?'/上限解放':''}`
   : `戦法「${source.sourceName}」+${source.levelBonus}${source.capUnlock?'/上限解放':''}`).join('、')
  : '対象兵種の兵種Lv効果なし';
 const capDetails=troopLevel.capUnlocked?'上限解放済み・天井なし':`上限${troopLevel.cap}`;

 return <form onSubmit={e=>void submit(e)} className="space-y-4">
  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
   <h2 className="mb-4 text-lg font-bold">編成編集</h2>
   <div className="grid grid-cols-2 gap-3">
    <label className="col-span-2 text-sm text-slate-400">編成名<input aria-label="編成名" className={field} value={value.name} onChange={e=>setValue({...value,name:e.target.value})}/></label>
    <label className="col-span-2 text-sm text-slate-400">兵種<select aria-label="兵種" className={field} value={value.troopType} onChange={e=>setValue({...value,troopType:e.target.value as Formation['troopType']})}>{troopTypes.map(type=><option key={type}>{type}</option>)}</select></label>
    <label className="text-sm text-slate-400">兵種Lv<span className="ml-2 text-xs text-emerald-400">凸・戦法・特性から自動</span><input aria-label="兵種Lv" className={`${field} opacity-80`} type="number" min="1" value={troopLevel.level} readOnly/></label>
    <label className="text-sm text-slate-400">兵力<input aria-label="兵力" className={`${field} opacity-75`} type="number" value={10000} readOnly aria-describedby="troops-help"/></label>
    <p id="troops-help" className="col-span-2 text-xs text-slate-400">b223正式評価仕様に従い、兵力は各武将10,000固定です。</p>
    <p className="col-span-2 rounded-lg bg-slate-950 p-3 text-xs text-emerald-300" aria-label="兵種Lv計算根拠">兵舎Lv{troopLevel.baseLevel}＋{troopLevelDetails}＝兵種Lv{troopLevel.level}（{capDetails}）</p>
    {troopLevel.unknownOfficers.length>0&&<p className="col-span-2 text-xs text-amber-300">未登録武将の兵種特性は未加算：{troopLevel.unknownOfficers.join('、')}</p>}
    <p className="col-span-2 text-xs text-emerald-400">すべての登録編成は、対戦時に編成A・編成Bのどちらにも選択できます。</p>
   </div>
  </section>
  {officerCatalogError&&<p role="alert" className="rounded-xl bg-red-950 p-3 text-sm text-red-300">{officerCatalogError}。未登録武将は固有戦法を手入力できます。</p>}
  {skillCatalogError&&<p role="alert" className="rounded-xl bg-red-950 p-3 text-sm text-red-300">{skillCatalogError}。登録済み戦法は引き続き入力できます。</p>}
  {value.warriors.map((warrior,index)=>{
   const canonical=canonicalByName.get(normalizeFormationName(warrior.name));
   return <section key={warrior.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
    <h3 className="mb-3 font-bold text-amber-400">{roles[index]}</h3>
    <div className="grid grid-cols-2 gap-3">
     <label className="col-span-2 text-sm text-slate-400">武将名<AutocompleteInput label={`${roles[index]} 武将名`} className={field} value={warrior.name} options={warriorOptions} onChange={name=>updateWarriorName(index,name)} placeholder="例：松永"/></label>
     <label className="text-sm text-slate-400">凸<input aria-label={`${roles[index]} 凸`} className={field} type="number" min="0" max="5" value={warrior.limitBreak} onChange={e=>updateWarrior(index,{limitBreak:Number(e.target.value)})}/></label>
     <label className="text-sm text-slate-400">固有戦法{canonical&&<span className="ml-2 text-xs text-emerald-400">正本DB自動</span>}{canonical?<input aria-label={`${roles[index]} 固有戦法`} className={`${field} opacity-80`} value={warrior.inherentSkill} readOnly/>:<AutocompleteInput label={`${roles[index]} 固有戦法`} className={field} value={warrior.inherentSkill==='未登録'?'':warrior.inherentSkill} options={allSkillOptions} onChange={inherentSkill=>updateWarrior(index,{inherentSkill:inherentSkill||'未登録'})} placeholder="戦法名を一部入力"/>}</label>
     <label className="text-sm text-slate-400">装着戦法1<AutocompleteInput label={`${roles[index]} 装着戦法1`} className={field} value={warrior.equippedSkills[0]} options={equippableSkillOptions} onChange={skill=>updateEquippedSkill(index,0,skill)} placeholder="装着可能戦法のみ"/></label>
     <label className="text-sm text-slate-400">装着戦法2<AutocompleteInput label={`${roles[index]} 装着戦法2`} className={field} value={warrior.equippedSkills[1]} options={equippableSkillOptions} onChange={skill=>updateEquippedSkill(index,1,skill)} placeholder="装着可能戦法のみ"/></label>
    </div>
   </section>;
  })}
  {error&&<p role="alert" className="text-red-400">{error}</p>}
  <div className="grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={onCancel}>キャンセル</Button><Button type="submit">保存</Button></div>
  {warning&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5" role="alertdialog" aria-modal="true" aria-labelledby="formation-warning-title" aria-describedby="formation-warning-message">
   <div className="w-full max-w-sm rounded-2xl border border-amber-500 bg-slate-900 p-5 shadow-2xl">
    <h2 id="formation-warning-title" className="text-lg font-bold text-amber-400">{warning.title}</h2>
    <p id="formation-warning-message" className="mt-3 text-sm leading-6 text-slate-200">{warning.message}</p>
    <Button type="button" className="mt-5 w-full" onClick={()=>setWarning(null)}>確認</Button>
   </div>
  </div>}
 </form>;
}

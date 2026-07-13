import {useEffect,useMemo,useState} from 'react';
import {formationSchema,troopTypes,type Formation,type SkillRecord,type WarriorRecord} from '../domain/schemas';
import {findCanonicalOfficer,loadCanonicalOfficerCatalog,type CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import {loadCanonicalSkillCatalog,type CanonicalSkill} from '../services/canonicalSkillCatalog';
import {AutocompleteInput,type AutocompleteOption} from './ui/AutocompleteInput';
import {Button} from './ui/button';

const roles=['大将','副将1','副将2'] as const;

type Props={
 initial?:Formation;
 warriors?:WarriorRecord[];
 skills?:SkillRecord[];
 canonicalOfficers?:CanonicalOfficer[];
 canonicalSkills?:CanonicalSkill[];
 onSave:(value:Formation)=>Promise<void>|void;
 onCancel:()=>void;
};

export function createEmptyFormation(kind:'ally'|'enemy'='ally'):Formation{
 const now=new Date().toISOString();
 const warrior=()=>({id:crypto.randomUUID(),name:'',limitBreak:0,inherentSkill:'未登録',equippedSkills:['',''] as [string,string]});
 return {id:crypto.randomUUID(),name:'',kind,troopType:'騎馬',troopLevel:10,troops:10000,warriors:[warrior(),warrior(),warrior()],createdAt:now,updatedAt:now};
}

export function FormationEditor({initial,warriors=[],skills=[],canonicalOfficers,canonicalSkills,onSave,onCancel}:Props){
 const [value,setValue]=useState<Formation>(()=>structuredClone(initial??createEmptyFormation()));
 const [officerCatalog,setOfficerCatalog]=useState<CanonicalOfficer[]>(canonicalOfficers??[]);
 const [skillCatalog,setSkillCatalog]=useState<CanonicalSkill[]>(canonicalSkills??[]);
 const [officerCatalogError,setOfficerCatalogError]=useState('');
 const [skillCatalogError,setSkillCatalogError]=useState('');
 const [error,setError]=useState('');
 const field='w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white';
 const canonicalByName=useMemo(()=>new Map(officerCatalog.map(officer=>[officer.name,officer])),[officerCatalog]);
 const canonicalSkillByName=useMemo(()=>new Map(skillCatalog.map(skill=>[skill.name,skill])),[skillCatalog]);

 const warriorOptions=useMemo<AutocompleteOption[]>(()=>{
  const byName=new Map<string,AutocompleteOption>();
  for(const officer of officerCatalog)byName.set(officer.name,{value:officer.name,detail:officer.inherentSkill,keywords:[officer.id]});
  for(const warrior of warriors){
   const canonical=canonicalByName.get(warrior.name);
   byName.set(warrior.name,{value:warrior.name,detail:canonical?`所有 ${warrior.limitBreak}凸・${canonical.inherentSkill}`:`登録武将 ${warrior.limitBreak}凸`,priority:10});
  }
  return Array.from(byName.values());
 },[canonicalByName,officerCatalog,warriors]);

 const skillOptions=useMemo<AutocompleteOption[]>(()=>{
  const byName=new Map<string,AutocompleteOption>();
  for(const skill of skillCatalog)byName.set(skill.name,{value:skill.name,detail:[skill.type,skill.attachable?'装着可':''].filter(Boolean).join('・'),keywords:[skill.id]});
  for(const skill of skills){
   const canonical=canonicalSkillByName.get(skill.name);
   byName.set(skill.name,{value:skill.name,detail:`所有・${canonical?.type||skill.category}`,priority:10});
  }
  return Array.from(byName.values());
 },[canonicalSkillByName,skillCatalog,skills]);

 useEffect(()=>{
  if(canonicalOfficers){setOfficerCatalog(canonicalOfficers);setOfficerCatalogError('');return;}
  let active=true;
  void loadCanonicalOfficerCatalog().then(result=>{if(active){setOfficerCatalog(result.officers);setOfficerCatalogError('');}}).catch(reason=>{if(active)setOfficerCatalogError(reason instanceof Error?reason.message:'正本武将カタログを読み込めませんでした');});
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

 function updateWarrior(index:number,patch:Partial<Formation['warriors'][number]>){
  const next=structuredClone(value.warriors);const current=next[index];if(!current)return;
  next[index]={...current,...patch};setValue({...value,warriors:next});
 }

 function updateWarriorName(index:number,name:string){
  const match=canonicalByName.get(name.trim());
  updateWarrior(index,{name,inherentSkill:match?.inherentSkill??'未登録'});
 }

 async function submit(e:React.FormEvent){
  e.preventDefault();
  const normalized={
   ...value,
   warriors:value.warriors.map(warrior=>{
    const match=canonicalByName.get(warrior.name.trim());
    return match?{...warrior,name:match.name,inherentSkill:match.inherentSkill}:warrior;
   }) as Formation['warriors'],
   updatedAt:new Date().toISOString(),
  };
  const parsed=formationSchema.safeParse(normalized);
  if(!parsed.success){setError(parsed.error.issues[0]?.message||'入力を確認してください');return;}
  await onSave(parsed.data);
 }

 return <form onSubmit={e=>void submit(e)} className="space-y-4">
  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
   <h2 className="mb-4 text-lg font-bold">編成編集</h2>
   <div className="grid grid-cols-2 gap-3">
    <label className="col-span-2 text-sm text-slate-400">編成名<input aria-label="編成名" className={field} value={value.name} onChange={e=>setValue({...value,name:e.target.value})}/></label>
    <label className="text-sm text-slate-400">区分<select aria-label="区分" className={field} value={value.kind} onChange={e=>setValue({...value,kind:e.target.value as 'ally'|'enemy'})}><option value="ally">自軍</option><option value="enemy">敵軍</option></select></label>
    <label className="text-sm text-slate-400">兵種<select aria-label="兵種" className={field} value={value.troopType} onChange={e=>setValue({...value,troopType:e.target.value as Formation['troopType']})}>{troopTypes.map(type=><option key={type}>{type}</option>)}</select></label>
    <label className="text-sm text-slate-400">兵種Lv<input aria-label="兵種Lv" className={field} type="number" min="1" max="10" value={value.troopLevel} onChange={e=>setValue({...value,troopLevel:Number(e.target.value)})}/></label>
    <label className="text-sm text-slate-400">兵力<input aria-label="兵力" className={`${field} opacity-75`} type="number" value={10000} readOnly aria-describedby="troops-help"/></label>
    <p id="troops-help" className="col-span-2 text-xs text-slate-400">b223正式評価仕様に従い、兵力は各武将10,000固定です。</p>
    <p className="col-span-2 text-xs text-emerald-400">武将名・戦法名は一部を入力すると、正本DB候補から選択できます。</p>
   </div>
  </section>
  {officerCatalogError&&<p role="alert" className="rounded-xl bg-red-950 p-3 text-sm text-red-300">{officerCatalogError}。未登録武将は固有戦法を手入力できます。</p>}
  {skillCatalogError&&<p role="alert" className="rounded-xl bg-red-950 p-3 text-sm text-red-300">{skillCatalogError}。登録済み戦法は引き続き入力できます。</p>}
  {value.warriors.map((warrior,index)=>{
   const canonical=canonicalByName.get(warrior.name.trim());
   return <section key={warrior.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
    <h3 className="mb-3 font-bold text-amber-400">{roles[index]}</h3>
    <div className="grid grid-cols-2 gap-3">
     <label className="col-span-2 text-sm text-slate-400">武将名<AutocompleteInput label={`${roles[index]} 武将名`} className={field} value={warrior.name} options={warriorOptions} onChange={name=>updateWarriorName(index,name)} placeholder="例：松永"/></label>
     <label className="text-sm text-slate-400">凸<input aria-label={`${roles[index]} 凸`} className={field} type="number" min="0" max="5" value={warrior.limitBreak} onChange={e=>updateWarrior(index,{limitBreak:Number(e.target.value)})}/></label>
     <label className="text-sm text-slate-400">固有戦法{canonical&&<span className="ml-2 text-xs text-emerald-400">正本DB自動</span>}{canonical?<input aria-label={`${roles[index]} 固有戦法`} className={`${field} opacity-80`} value={warrior.inherentSkill} readOnly/>:<AutocompleteInput label={`${roles[index]} 固有戦法`} className={field} value={warrior.inherentSkill==='未登録'?'':warrior.inherentSkill} options={skillOptions} onChange={inherentSkill=>updateWarrior(index,{inherentSkill:inherentSkill||'未登録'})} placeholder="戦法名を一部入力"/>}</label>
     <label className="text-sm text-slate-400">装着戦法1<AutocompleteInput label={`${roles[index]} 装着戦法1`} className={field} value={warrior.equippedSkills[0]} options={skillOptions} onChange={skill=>updateWarrior(index,{equippedSkills:[skill,warrior.equippedSkills[1]]})} placeholder="戦法名を一部入力"/></label>
     <label className="text-sm text-slate-400">装着戦法2<AutocompleteInput label={`${roles[index]} 装着戦法2`} className={field} value={warrior.equippedSkills[1]} options={skillOptions} onChange={skill=>updateWarrior(index,{equippedSkills:[warrior.equippedSkills[0],skill]})} placeholder="戦法名を一部入力"/></label>
    </div>
   </section>;
  })}
  {error&&<p role="alert" className="text-red-400">{error}</p>}
  <div className="grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={onCancel}>キャンセル</Button><Button type="submit">保存</Button></div>
 </form>;
}

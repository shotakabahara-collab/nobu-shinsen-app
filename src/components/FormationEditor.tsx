import {useEffect,useMemo,useState} from 'react';
import {formationSchema,troopTypes,type Formation,type SkillRecord,type WarriorRecord} from '../domain/schemas';
import {findCanonicalOfficer,loadCanonicalOfficerCatalog,type CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import {Button} from './ui/button';

const roles=['大将','副将1','副将2'] as const;

type Props={
 initial?:Formation;
 warriors?:WarriorRecord[];
 skills?:SkillRecord[];
 canonicalOfficers?:CanonicalOfficer[];
 onSave:(value:Formation)=>Promise<void>|void;
 onCancel:()=>void;
};

export function createEmptyFormation(kind:'ally'|'enemy'='ally'):Formation{
 const now=new Date().toISOString();
 const warrior=()=>({id:crypto.randomUUID(),name:'',limitBreak:0,inherentSkill:'未登録',equippedSkills:['',''] as [string,string]});
 return {id:crypto.randomUUID(),name:'',kind,troopType:'騎馬',troopLevel:10,troops:10000,warriors:[warrior(),warrior(),warrior()],createdAt:now,updatedAt:now};
}

export function FormationEditor({initial,warriors=[],skills=[],canonicalOfficers,onSave,onCancel}:Props){
 const [value,setValue]=useState<Formation>(()=>structuredClone(initial??createEmptyFormation()));
 const [catalog,setCatalog]=useState<CanonicalOfficer[]>(canonicalOfficers??[]);
 const [catalogError,setCatalogError]=useState('');
 const [error,setError]=useState('');
 const field='w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white';
 const canonicalByName=useMemo(()=>new Map(catalog.map(officer=>[officer.name,officer])),[catalog]);
 const warriorNames=useMemo(()=>Array.from(new Set([...catalog.map(officer=>officer.name),...warriors.map(warrior=>warrior.name)])).sort((a,b)=>a.localeCompare(b,'ja')),[catalog,warriors]);

 useEffect(()=>{
  if(canonicalOfficers){setCatalog(canonicalOfficers);setCatalogError('');return;}
  let active=true;
  void loadCanonicalOfficerCatalog().then(result=>{if(active){setCatalog(result.officers);setCatalogError('');}}).catch(reason=>{if(active)setCatalogError(reason instanceof Error?reason.message:'正本武将カタログを読み込めませんでした');});
  return()=>{active=false;};
 },[canonicalOfficers]);

 useEffect(()=>{
  if(!catalog.length)return;
  setValue(current=>{
   let changed=false;
   const next=current.warriors.map(warrior=>{
    const match=findCanonicalOfficer(catalog,warrior.name);
    if(match&&warrior.inherentSkill!==match.inherentSkill){changed=true;return {...warrior,inherentSkill:match.inherentSkill};}
    return warrior;
   }) as Formation['warriors'];
   return changed?{...current,warriors:next}:current;
  });
 },[catalog]);

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
  <datalist id="warrior-catalog">{warriorNames.map(name=><option key={name} value={name}/>)}</datalist>
  <datalist id="skill-catalog">{skills.map(skill=><option key={skill.id} value={skill.name}/>)}</datalist>
  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
   <h2 className="mb-4 text-lg font-bold">編成編集</h2>
   <div className="grid grid-cols-2 gap-3">
    <label className="col-span-2 text-sm text-slate-400">編成名<input aria-label="編成名" className={field} value={value.name} onChange={e=>setValue({...value,name:e.target.value})}/></label>
    <label className="text-sm text-slate-400">区分<select aria-label="区分" className={field} value={value.kind} onChange={e=>setValue({...value,kind:e.target.value as 'ally'|'enemy'})}><option value="ally">自軍</option><option value="enemy">敵軍</option></select></label>
    <label className="text-sm text-slate-400">兵種<select aria-label="兵種" className={field} value={value.troopType} onChange={e=>setValue({...value,troopType:e.target.value as Formation['troopType']})}>{troopTypes.map(type=><option key={type}>{type}</option>)}</select></label>
    <label className="text-sm text-slate-400">兵種Lv<input aria-label="兵種Lv" className={field} type="number" min="1" max="10" value={value.troopLevel} onChange={e=>setValue({...value,troopLevel:Number(e.target.value)})}/></label>
    <label className="text-sm text-slate-400">兵力<input aria-label="兵力" className={`${field} opacity-75`} type="number" value={10000} readOnly aria-describedby="troops-help"/></label>
    <p id="troops-help" className="col-span-2 text-xs text-slate-400">b223正式評価仕様に従い、兵力は各武将10,000固定です。</p>
   </div>
  </section>
  {catalogError&&<p role="alert" className="rounded-xl bg-red-950 p-3 text-sm text-red-300">{catalogError}。未登録武将は固有戦法を手入力できます。</p>}
  {value.warriors.map((warrior,index)=>{
   const canonical=canonicalByName.get(warrior.name.trim());
   return <section key={warrior.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
    <h3 className="mb-3 font-bold text-amber-400">{roles[index]}</h3>
    <div className="grid grid-cols-2 gap-3">
     <label className="col-span-2 text-sm text-slate-400">武将名<input list="warrior-catalog" aria-label={`${roles[index]} 武将名`} className={field} value={warrior.name} onChange={e=>updateWarriorName(index,e.target.value)} autoComplete="off"/></label>
     <label className="text-sm text-slate-400">凸<input aria-label={`${roles[index]} 凸`} className={field} type="number" min="0" max="5" value={warrior.limitBreak} onChange={e=>updateWarrior(index,{limitBreak:Number(e.target.value)})}/></label>
     <label className="text-sm text-slate-400">固有戦法{canonical&&<span className="ml-2 text-xs text-emerald-400">正本DB自動</span>}<input list={canonical?undefined:'skill-catalog'} aria-label={`${roles[index]} 固有戦法`} className={`${field} ${canonical?'opacity-80':''}`} value={warrior.inherentSkill} readOnly={Boolean(canonical)} onChange={e=>updateWarrior(index,{inherentSkill:e.target.value})}/></label>
     <label className="text-sm text-slate-400">装着戦法1<input list="skill-catalog" aria-label={`${roles[index]} 装着戦法1`} className={field} value={warrior.equippedSkills[0]} onChange={e=>updateWarrior(index,{equippedSkills:[e.target.value,warrior.equippedSkills[1]]})}/></label>
     <label className="text-sm text-slate-400">装着戦法2<input list="skill-catalog" aria-label={`${roles[index]} 装着戦法2`} className={field} value={warrior.equippedSkills[1]} onChange={e=>updateWarrior(index,{equippedSkills:[warrior.equippedSkills[0],e.target.value]})}/></label>
    </div>
   </section>;
  })}
  {error&&<p role="alert" className="text-red-400">{error}</p>}
  <div className="grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={onCancel}>キャンセル</Button><Button type="submit">保存</Button></div>
 </form>;
}

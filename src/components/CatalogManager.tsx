import {useState} from 'react';
import {Pencil,Plus,Trash2,X} from 'lucide-react';
import type {SkillRecord,WarriorRecord} from '../domain/schemas';
import {Button} from './ui/button';

type Props={
 warriors:WarriorRecord[];
 skills:SkillRecord[];
 onSaveWarrior:(value:WarriorRecord)=>Promise<void>;
 onRemoveWarrior:(id:string)=>Promise<void>;
 onSaveSkill:(value:SkillRecord)=>Promise<void>;
 onRemoveSkill:(id:string)=>Promise<void>;
};

export function CatalogManager({warriors,skills,onSaveWarrior,onRemoveWarrior,onSaveSkill,onRemoveSkill}:Props){
 const [warriorName,setWarriorName]=useState('');
 const [limitBreak,setLimitBreak]=useState(0);
 const [editingWarrior,setEditingWarrior]=useState<WarriorRecord|null>(null);
 const [skillName,setSkillName]=useState('');
 const [category,setCategory]=useState<SkillRecord['category']>('装着');
 const [editingSkill,setEditingSkill]=useState<SkillRecord|null>(null);
 const [error,setError]=useState('');
 const field='w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white';

 function resetWarrior(){setEditingWarrior(null);setWarriorName('');setLimitBreak(0);}
 function resetSkill(){setEditingSkill(null);setSkillName('');setCategory('装着');}
 function beginWarrior(value:WarriorRecord){setEditingWarrior(value);setWarriorName(value.name);setLimitBreak(value.limitBreak);setError('');}
 function beginSkill(value:SkillRecord){setEditingSkill(value);setSkillName(value.name);setCategory(value.category);setError('');}

 async function saveWarrior(){
  const name=warriorName.trim();if(!name)return;
  const now=new Date().toISOString();
  try{await onSaveWarrior(editingWarrior?{...editingWarrior,name,limitBreak,updatedAt:now}:{id:crypto.randomUUID(),name,limitBreak,notes:'',createdAt:now,updatedAt:now});resetWarrior();setError('');}
  catch(e){setError(e instanceof Error?e.message:'武将を保存できませんでした');}
 }
 async function saveSkill(){
  const name=skillName.trim();if(!name)return;
  const now=new Date().toISOString();
  try{await onSaveSkill(editingSkill?{...editingSkill,name,category,updatedAt:now}:{id:crypto.randomUUID(),name,category,owned:true,description:'',createdAt:now,updatedAt:now});resetSkill();setError('');}
  catch(e){setError(e instanceof Error?e.message:'戦法を保存できませんでした');}
 }

 return <div className="space-y-4">
  {error&&<p role="alert" className="rounded-xl bg-red-950 p-3 text-sm text-red-300">{error}</p>}
  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
   <h3 className="mb-3 font-bold">武将管理</h3>
   <div className="grid grid-cols-[1fr_5rem_auto] gap-2">
    <input aria-label="登録する武将名" className={field} value={warriorName} onChange={e=>setWarriorName(e.target.value)} placeholder="武将名"/>
    <input aria-label="所有凸" className={field} type="number" min="0" max="5" value={limitBreak} onChange={e=>setLimitBreak(Number(e.target.value))}/>
    <Button aria-label={editingWarrior?'武将の変更を保存':'武将を追加'} onClick={()=>void saveWarrior()}>{editingWarrior?<Pencil className="size-4"/>:<Plus className="size-4"/>}</Button>
   </div>
   {editingWarrior&&<Button className="mt-2 w-full" variant="secondary" onClick={resetWarrior}><X className="mr-2 size-4"/>編集を取消</Button>}
   {warriors.map(value=><div key={value.id} className="mt-2 flex min-h-12 items-center justify-between rounded-lg bg-slate-950 px-3"><span>{value.name}<small className="ml-2 text-slate-500">{value.limitBreak}凸</small></span><div className="flex gap-2"><Button variant="secondary" aria-label={`${value.name}を編集`} onClick={()=>beginWarrior(value)}><Pencil className="size-4"/></Button><Button variant="danger" aria-label={`${value.name}を削除`} onClick={()=>{if(window.confirm(`${value.name}を削除しますか？`))void onRemoveWarrior(value.id).catch(()=>{});}}><Trash2 className="size-4"/></Button></div></div>)}
  </section>
  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
   <h3 className="mb-3 font-bold">戦法管理</h3>
   <div className="grid grid-cols-[1fr_auto] gap-2">
    <input aria-label="登録する戦法名" className={field} value={skillName} onChange={e=>setSkillName(e.target.value)} placeholder="戦法名"/>
    <select aria-label="戦法区分" className={field} value={category} onChange={e=>setCategory(e.target.value as SkillRecord['category'])}><option>固有</option><option>装着</option><option>兵種</option><option>その他</option></select>
    <Button className="col-span-2" onClick={()=>void saveSkill()}>{editingSkill?<Pencil className="mr-2 size-4"/>:<Plus className="mr-2 size-4"/>}{editingSkill?'戦法の変更を保存':'所有戦法を追加'}</Button>
   </div>
   {editingSkill&&<Button className="mt-2 w-full" variant="secondary" onClick={resetSkill}><X className="mr-2 size-4"/>編集を取消</Button>}
   {skills.map(value=><div key={value.id} className="mt-2 flex min-h-12 items-center justify-between rounded-lg bg-slate-950 px-3"><span>{value.name}<small className="ml-2 text-slate-500">所有・{value.category}</small></span><div className="flex gap-2"><Button variant="secondary" aria-label={`${value.name}を編集`} onClick={()=>beginSkill(value)}><Pencil className="size-4"/></Button><Button variant="danger" aria-label={`${value.name}を削除`} onClick={()=>{if(window.confirm(`${value.name}を削除しますか？`))void onRemoveSkill(value.id).catch(()=>{});}}><Trash2 className="size-4"/></Button></div></div>)}
  </section>
 </div>;
}

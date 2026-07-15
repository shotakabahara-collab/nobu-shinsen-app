import {create} from 'zustand';
import {db} from '../db/database';
import type {BattleResult,CompanionExport,Formation,SkillRecord,WarriorRecord} from '../domain/schemas';

type State={formations:Formation[];warriors:WarriorRecord[];skills:SkillRecord[];battleResults:BattleResult[];loading:boolean;error:string|null;clearError:()=>void;load:()=>Promise<void>;save:(value:Formation)=>Promise<void>;remove:(id:string)=>Promise<void>;saveWarrior:(value:WarriorRecord)=>Promise<void>;removeWarrior:(id:string)=>Promise<void>;saveSkill:(value:SkillRecord)=>Promise<void>;removeSkill:(id:string)=>Promise<void>;saveBattleResult:(value:BattleResult)=>Promise<void>;replaceAll:(value:CompanionExport)=>Promise<void>};

export function storageErrorMessage(error:unknown,operation:string){return `${operation}に失敗しました${error instanceof Error&&error.message?`: ${error.message}`:''}`;}

function completedBattleCount(value:BattleResult):number{
 const evaluation=value.payload.battle_evaluation;
 if(!evaluation||typeof evaluation!=='object'||Array.isArray(evaluation))return value.trials;
 const summary=(evaluation as Record<string,unknown>).summary;
 if(!summary||typeof summary!=='object'||Array.isArray(summary))return value.trials;
 const completed=(summary as Record<string,unknown>).completedBattles;
 return typeof completed==='number'&&Number.isInteger(completed)&&completed>0?completed:value.trials;
}

export const useAppStore=create<State>((set,get)=>{
 async function mutate(operation:string,action:()=>Promise<unknown>){
  set({error:null});
  try{await action();await get().load();}
  catch(error){set({error:storageErrorMessage(error,operation),loading:false});throw error;}
 }
 return {
  formations:[],warriors:[],skills:[],battleResults:[],loading:false,error:null,
  clearError:()=>set({error:null}),
  load:async()=>{set({loading:true,error:null});try{const [formations,warriors,skills,battleResults]=await Promise.all([db.formations.orderBy('updatedAt').reverse().toArray(),db.warriors.orderBy('name').toArray(),db.skills.orderBy('name').toArray(),db.battleResults.orderBy('createdAt').reverse().toArray()]);set({formations,warriors,skills,battleResults,loading:false});}catch(error){set({error:storageErrorMessage(error,'データの読込'),loading:false});}},
  save:value=>mutate('編成の保存',()=>db.formations.put(value)),
  remove:id=>mutate('編成の削除',()=>db.formations.delete(id)),
  saveWarrior:value=>mutate('武将の保存',()=>db.warriors.put(value)),
  removeWarrior:id=>mutate('武将の削除',()=>db.warriors.delete(id)),
  saveSkill:value=>mutate('戦法の保存',()=>db.skills.put(value)),
  removeSkill:id=>mutate('戦法の削除',()=>db.skills.delete(id)),
  saveBattleResult:value=>mutate('Battle Logの保存',()=>db.battleResults.put({...value,trials:completedBattleCount(value)})),
  replaceAll:value=>mutate('バックアップの復元',()=>db.transaction('rw',db.formations,db.warriors,db.skills,db.battleResults,async()=>{await Promise.all([db.formations.clear(),db.warriors.clear(),db.skills.clear(),db.battleResults.clear()]);await db.formations.bulkPut(value.formations);await db.warriors.bulkPut(value.warriors);await db.skills.bulkPut(value.skills);await db.battleResults.bulkPut(value.battleResults);})),
 };
});

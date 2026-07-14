import type {Formation,SkillRecord,WarriorRecord} from '../domain/schemas';
import {toRuntimeFormation} from './formationAdapter';

export function buildTargetOptimizationRequest(target:Formation,formations:Formation[],warriors:WarriorRecord[],skills:SkillRecord[]){
 const owned_pool=warriors.map(value=>({name:value.name,awaken:value.limitBreak??0}));
 const skill_pool=skills.filter(value=>value.owned!==false&&value.category!=='固有').map(value=>({name:value.name}));
 const registeredSeeds=formations.filter(value=>value.id!==target.id);
 const seeds=(registeredSeeds.length?registeredSeeds:[target]).map(toRuntimeFormation);
 return {
  search_mode:'counter',
  seeds,
  owned_pool,
  swap_depth:owned_pool.length>=3?3:owned_pool.length?1:0,
  skill_pool,
  skill_swap_depth:skill_pool.length>=6?3:skill_pool.length?1:0,
  skill_beam_width:96,
  structural_budget:1200,
  targets:[{id:target.id,spec:toRuntimeFormation(target)}],
  units:['足軽','騎馬','鉄砲','弓'],
  trials:2,
  blocks:1,
  shortlist:8,
  seed:1326237000,
 };
}

export function buildOwnedSearchRequest(base:Formation,target:Formation,warriors:WarriorRecord[],skills:SkillRecord[]){
 return buildTargetOptimizationRequest(target,[base],warriors,skills);
}

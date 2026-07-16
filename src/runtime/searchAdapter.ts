import type {Formation,SkillRecord,WarriorRecord} from '../domain/schemas';
import {toRuntimeFormation} from './formationAdapter';

export type OptimizationCatalogScope='canonical_all'|'owned_only';

export function buildTargetOptimizationRequest(target:Formation,formations:Formation[],warriors:WarriorRecord[],skills:SkillRecord[],catalogScope:OptimizationCatalogScope='canonical_all'){
 const owned_pool=warriors.map(value=>({name:value.name,awaken:value.limitBreak??0}));
 const skill_pool=skills.filter(value=>value.owned!==false&&value.category!=='固有').map(value=>({name:value.name}));
 const registeredSeeds=formations.filter(value=>value.id!==target.id);
 const seeds=(registeredSeeds.length?registeredSeeds:[target]).map(toRuntimeFormation);
 return {
  catalog_scope:catalogScope,
  search_mode:'counter',
  seeds,
  owned_pool,
  known_awaken_overrides:owned_pool,
  swap_depth:owned_pool.length>=3?3:owned_pool.length?1:0,
  skill_pool,
  skill_swap_depth:skill_pool.length>=6?3:skill_pool.length?1:0,
  skill_beam_width:96,
  structural_budget:catalogScope==='canonical_all'?4800:1200,
  targets:[{id:target.id,spec:toRuntimeFormation(target)}],
  units:['足軽','騎馬','鉄砲','弓'],
  trials:catalogScope==='canonical_all'?2:4,
  blocks:1,
  shortlist:8,
  role_family_shortlist:catalogScope==='canonical_all'?4:2,
  seed:1326237000,
 };
}

export function buildOwnedSearchRequest(base:Formation,target:Formation,warriors:WarriorRecord[],skills:SkillRecord[]){
 return buildTargetOptimizationRequest(target,[base],warriors,skills,'owned_only');
}

import {describe,expect,it} from 'vitest';
import type {Formation} from '../domain/schemas';
import {buildTargetOptimizationRequest} from './searchAdapter';

const now=new Date().toISOString();
const warrior=(name:string)=>({id:crypto.randomUUID(),name,limitBreak:0,inherentSkill:'固有',equippedSkills:['A','B'] as [string,string]});
const formation=(name:string,kind:'ally'|'enemy'='ally')=>({id:crypto.randomUUID(),name,kind,troopType:'騎馬',troopLevel:10,troops:10000,warriors:[warrior(`${name}1`),warrior(`${name}2`),warrior(`${name}3`)],createdAt:now,updatedAt:now}) satisfies Formation;

describe('buildTargetOptimizationRequest',()=>{
 it('uses every registered non-target formation as a seed regardless of legacy kind',()=>{
  const target=formation('対象','enemy'),first=formation('候補A','ally'),second=formation('候補B','enemy');
  const base={id:crypto.randomUUID(),createdAt:now,updatedAt:now};
  const request=buildTargetOptimizationRequest(target,[target,first,second],[{...base,name:'追加武将',limitBreak:5,notes:''}],[{...base,name:'固有X',category:'固有',owned:true,description:''},{...base,id:crypto.randomUUID(),name:'装着X',category:'装着',owned:true,description:''}]);
  expect(request.seeds).toHaveLength(2);
  expect(request.seeds.map(seed=>seed.officers[0])).toEqual(['候補A1','候補B1']);
  expect(request.targets[0]?.id).toBe(target.id);
  expect(request.owned_pool).toEqual([{name:'追加武将',awaken:5}]);
  expect(request.skill_pool).toEqual([{name:'装着X'}]);
  expect(request.units).toEqual(['足軽','騎馬','鉄砲','弓']);
  expect(request.role_family_shortlist).toBe(2);
  expect(request.trials).toBe(4);
 });

 it('falls back to the target as a seed when it is the only registered formation',()=>{
  const target=formation('対象');
  expect(buildTargetOptimizationRequest(target,[target],[],[]).seeds).toHaveLength(1);
 });
});

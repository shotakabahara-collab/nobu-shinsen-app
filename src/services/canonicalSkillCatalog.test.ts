import {describe,expect,it} from 'vitest';
import {loadCanonicalSkillCatalog} from './canonicalSkillCatalog';

const payload={
 schemaVersion:1 as const,
 canonicalVersion:'v1326p15e2b223',
 canonicalArchiveSha256:'f'.repeat(64),
 skillCount:2,
 skills:[
  {id:'KNY_0001',name:'紅蓮の炎',type:'能動',attachable:true,unitLevelEffects:[]},
  {id:'KNY_0002',name:'兵種覚醒',type:'兵種',attachable:true,allowedUnitTypes:['騎馬' as const],unitLevelEffects:[{name:'兵種覚醒',unitTypes:['騎馬' as const],levelBonus:0,capUnlock:true}]},
 ],
};

describe('loadCanonicalSkillCatalog',()=>{
 it('loads a valid catalog with optional unit-level effects',async()=>{
  const fetcher=async()=>new Response(JSON.stringify(payload),{status:200});
  const result=await loadCanonicalSkillCatalog(fetcher as typeof fetch,'/catalog.json');
  expect(result.skills[0]).toMatchObject({slotType:'normal',allowedUnitTypes:[]});
  expect(result.skills[1]).toMatchObject({slotType:'unitType',allowedUnitTypes:['騎馬']});
  expect(result.skills[1]?.unitLevelEffects[0]).toEqual({name:'兵種覚醒',unitTypes:['騎馬'],levelBonus:0,capUnlock:true});
 });

 it('rejects duplicate skill names',async()=>{
  const first=payload.skills[0]!;
  const second=payload.skills[1]!;
  const duplicate={...payload,skills:[first,{...second,name:first.name}]};
  const fetcher=async()=>new Response(JSON.stringify(duplicate),{status:200});
  await expect(loadCanonicalSkillCatalog(fetcher as typeof fetch,'/catalog.json')).rejects.toThrow(/重複/);
 });
});

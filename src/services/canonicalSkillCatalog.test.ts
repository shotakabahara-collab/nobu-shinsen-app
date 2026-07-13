import {describe,expect,it} from 'vitest';
import {loadCanonicalSkillCatalog} from './canonicalSkillCatalog';

const payload={
 schemaVersion:1 as const,
 canonicalVersion:'v1326p15e2b223',
 canonicalArchiveSha256:'f'.repeat(64),
 skillCount:2,
 skills:[
  {id:'KNY_0001',name:'紅蓮の炎',type:'能動',attachable:true},
  {id:'KNY_0002',name:'七十二の計',type:'能動',attachable:true},
 ],
};

describe('loadCanonicalSkillCatalog',()=>{
 it('loads a valid catalog',async()=>{
  const fetcher=async()=>new Response(JSON.stringify(payload),{status:200});
  await expect(loadCanonicalSkillCatalog(fetcher as typeof fetch,'/catalog.json')).resolves.toEqual(payload);
 });

 it('rejects duplicate skill names',async()=>{
  const first=payload.skills[0]!;
  const second=payload.skills[1]!;
  const duplicate={...payload,skills:[first,{...second,name:first.name}]};
  const fetcher=async()=>new Response(JSON.stringify(duplicate),{status:200});
  await expect(loadCanonicalSkillCatalog(fetcher as typeof fetch,'/catalog.json')).rejects.toThrow(/重複/);
 });
});

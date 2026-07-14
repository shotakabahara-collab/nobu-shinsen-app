import {describe,expect,it,vi} from 'vitest';
import {findCanonicalOfficer,loadCanonicalOfficerCatalog,type CanonicalOfficer} from './canonicalOfficerCatalog';

const officers:CanonicalOfficer[]=[
 {id:'A',name:'松永久秀',inherentSkill:'梟雄の計',unitLevelTraits:[{name:'砲術Ⅲ',unlockedAt:3,unitTypes:['鉄砲'],levelBonus:3,capBonus:0}]},
 {id:'B',name:'黒田官兵衛',inherentSkill:'七十二の計',unitLevelTraits:[]},
];
const valid={schemaVersion:1 as const,canonicalVersion:'v1326p15e2b223',canonicalArchiveSha256:'f'.repeat(64),unitLevelRule:{baseLevel:5 as const,defaultCap:10 as const,generalTraitCap:11 as const},officerCount:2,officers};

describe('canonicalOfficerCatalog',()=>{
 it('loads and validates a canonical catalog with unit level traits',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify(valid),{status:200,headers:{'content-type':'application/json'}}));
  const result=await loadCanonicalOfficerCatalog(fetcher as typeof fetch,'/catalog.json');
  expect(result.officerCount).toBe(2);
  expect(result.officers[0]?.inherentSkill).toBe('梟雄の計');
  expect(result.officers[0]?.unitLevelTraits[0]).toMatchObject({name:'砲術Ⅲ',unlockedAt:3,levelBonus:3});
  expect(result.unitLevelRule).toEqual({baseLevel:5,defaultCap:10,generalTraitCap:11});
 });

 it('rejects duplicate officer names',async()=>{
  const invalid={...valid,officers:[valid.officers[0],{...valid.officers[1],name:'松永久秀'}]};
  const fetcher=vi.fn(async()=>new Response(JSON.stringify(invalid),{status:200,headers:{'content-type':'application/json'}}));
  await expect(loadCanonicalOfficerCatalog(fetcher as typeof fetch,'/catalog.json')).rejects.toThrow('重複');
 });

 it('finds a canonical officer after trimming the entered name',()=>{
  expect(findCanonicalOfficer(officers,'  黒田官兵衛  ')?.inherentSkill).toBe('七十二の計');
  expect(findCanonicalOfficer(officers,'未登録')).toBeUndefined();
 });
});

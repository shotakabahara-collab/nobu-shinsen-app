import {describe,expect,it,vi} from 'vitest';
import {findCanonicalOfficer,loadCanonicalOfficerCatalog} from './canonicalOfficerCatalog';

const valid={schemaVersion:1 as const,canonicalVersion:'v1326p15e2b223',canonicalArchiveSha256:'f'.repeat(64),officerCount:2,officers:[{id:'A',name:'松永久秀',inherentSkill:'梟雄の計'},{id:'B',name:'黒田官兵衛',inherentSkill:'七十二の計'}]};

describe('canonicalOfficerCatalog',()=>{
 it('loads and validates a canonical catalog',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify(valid),{status:200,headers:{'content-type':'application/json'}}));
  const result=await loadCanonicalOfficerCatalog(fetcher as typeof fetch,'/catalog.json');
  expect(result.officerCount).toBe(2);
  expect(result.officers[0]?.inherentSkill).toBe('梟雄の計');
 });

 it('rejects duplicate officer names',async()=>{
  const invalid={...valid,officers:[valid.officers[0],{...valid.officers[1],name:'松永久秀'}]};
  const fetcher=vi.fn(async()=>new Response(JSON.stringify(invalid),{status:200,headers:{'content-type':'application/json'}}));
  await expect(loadCanonicalOfficerCatalog(fetcher as typeof fetch,'/catalog.json')).rejects.toThrow('重複');
 });

 it('finds a canonical officer after trimming the entered name',()=>{
  expect(findCanonicalOfficer(valid.officers,'  黒田官兵衛  ')?.inherentSkill).toBe('七十二の計');
  expect(findCanonicalOfficer(valid.officers,'未登録')).toBeUndefined();
 });
});

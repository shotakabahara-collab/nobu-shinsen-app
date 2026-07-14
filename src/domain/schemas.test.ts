import {describe,expect,it} from 'vitest';
import {formationSchema} from './schemas';

const warrior=(id:string,name:string,index=0)=>({id,name,limitBreak:0,inherentSkill:'固有',equippedSkills:[`戦法${index*2+1}`,`戦法${index*2+2}`]});
const valid=()=>{
 const now=new Date().toISOString();
 return {
  id:crypto.randomUUID(),name:'黒田弓',kind:'enemy',troopType:'弓',troopLevel:10,troops:10000,
  warriors:[warrior(crypto.randomUUID(),'黒田',0),warrior(crypto.randomUUID(),'秀吉',1),warrior(crypto.randomUUID(),'ねね',2)],
  createdAt:now,updatedAt:now,
 };
};

describe('formationSchema',()=>{
 it('accepts a valid formation with six unique equipped skills',()=>expect(formationSchema.safeParse(valid()).success).toBe(true));
 it('rejects duplicate warriors',()=>{
  const value=valid(),id=crypto.randomUUID();
  value.warriors=[warrior(id,'A',0),warrior(id,'A',1),warrior(crypto.randomUUID(),'B',2)];
  expect(formationSchema.safeParse(value).success).toBe(false);
 });
 it('rejects duplicate equipped skills across officers',()=>{
  const value=valid();
  const first=value.warriors[0]!;
  const third=value.warriors[2]!;
  third.equippedSkills[1]=first.equippedSkills[0]!;
  const result=formationSchema.safeParse(value);
  expect(result.success).toBe(false);
  if(!result.success)expect(result.error.issues[0]?.message).toContain('装着戦法');
 });
 it('accepts troop levels above eleven when the cap has been unlocked',()=>expect(formationSchema.safeParse({...valid(),troopLevel:14}).success).toBe(true));
 it('rejects zero or negative troop levels',()=>expect(formationSchema.safeParse({...valid(),troopLevel:0}).success).toBe(false));
 it('rejects non-canonical troop counts at JSON boundaries',()=>expect(formationSchema.safeParse({...valid(),troops:9000}).success).toBe(false));
});

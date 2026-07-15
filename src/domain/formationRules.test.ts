import {describe,expect,it} from 'vitest';
import {calculateTroopLevel,findDuplicateEquippedSkill,validateFormalFormationSkills} from './formationRules';

const warrior=(name:string,limitBreak:number,inherentSkill='未登録',equippedSkills:[string,string]=['',''])=>({name,limitBreak,inherentSkill,equippedSkills});

describe('findDuplicateEquippedSkill',()=>{
 it('finds a duplicate across different officers and normalizes full-width text',()=>{
  const result=findDuplicateEquippedSkill([
   warrior('武将1',0,'固有1',['紅蓮の炎','回天転運']),
   warrior('武将2',0,'固有2',['一行三昧','紅蓮の炎　']),
  ]);
  expect(result).toEqual({name:'紅蓮の炎',first:{warriorIndex:0,skillIndex:0},duplicate:{warriorIndex:1,skillIndex:1}});
 });

 it('allows six unique equipped skills',()=>{
  expect(findDuplicateEquippedSkill([
   warrior('武将1',0,'固有1',['A','B']),
   warrior('武将2',0,'固有2',['C','D']),
   warrior('武将3',0,'固有3',['E','F']),
  ])).toBeUndefined();
 });
});

describe('validateFormalFormationSkills',()=>{
 it('reports the submitted 僧兵 and 鉄砲僧兵 combination before runtime starts',()=>{
  const warriors=[
   warrior('鈴木佐大夫',0,'弾嵐雨霞',['有備無患','破天の轟']),
   warrior('本願寺顕如',0,'一向一揆',['僧兵','攻其不備']),
   warrior('妻木煕子',0,'内助の賢',['大智不智','鉄砲僧兵']),
  ];
  const normal=(name:string)=>({name,type:'能動',attachable:true,slotType:'normal' as const,allowedUnitTypes:[]});
  const skills=[
   ...['有備無患','破天の轟','攻其不備','大智不智'].map(normal),
   {name:'僧兵',type:'兵種',attachable:true,slotType:'unitType' as const,allowedUnitTypes:['足軽' as const]},
   {name:'鉄砲僧兵',type:'兵種',attachable:true,slotType:'unitType' as const,allowedUnitTypes:['鉄砲' as const]},
  ];
  const issues=validateFormalFormationSkills('鉄砲',warriors,skills);
  expect(issues.map(issue=>issue.code)).toEqual(['unit-type-skill-limit','unit-type-mismatch']);
  expect(issues[0]?.message).toContain('「僧兵」・「鉄砲僧兵」');
  expect(issues[1]?.message).toBe('「僧兵」は足軽専用のため、鉄砲編成では使用できません。');
 });

 it('allows one unit-type skill matching the formation unit',()=>{
  const issues=validateFormalFormationSkills('鉄砲',[warrior('武将',0,'固有',['鉄砲僧兵','通常戦法'])],[
   {name:'鉄砲僧兵',type:'兵種',attachable:true,slotType:'unitType',allowedUnitTypes:['鉄砲']},
   {name:'通常戦法',type:'能動',attachable:true,slotType:'normal',allowedUnitTypes:[]},
  ]);
  expect(issues).toEqual([]);
 });
});

describe('calculateTroopLevel',()=>{
 const officers=[
  {name:'柿崎景家',unitLevelTraits:[{name:'騎兵大将',unlockedAt:0,unitTypes:['騎馬' as const],levelBonus:3,capUnlock:true,capBonus:1}]},
  {name:'北条綱成',unitLevelTraits:[{name:'騎兵大将',unlockedAt:0,unitTypes:['騎馬' as const],levelBonus:3,capUnlock:true,capBonus:1}]},
  {name:'榊原康政',unitLevelTraits:[{name:'馬術Ⅲ',unlockedAt:0,unitTypes:['騎馬' as const],levelBonus:3,capUnlock:false,capBonus:0}]},
  {name:'山内一豊',unitLevelTraits:[{name:'馬術Ⅱ',unlockedAt:0,unitTypes:['騎馬' as const],levelBonus:2,capUnlock:false,capBonus:0}]},
  {name:'松永久秀',unitLevelTraits:[{name:'砲術Ⅲ',unlockedAt:3,unitTypes:['鉄砲' as const],levelBonus:3,capUnlock:false,capBonus:0}]},
 ];

 it('starts at barracks level 5 and adds traits unlocked by current limit break',()=>{
  const result=calculateTroopLevel('鉄砲',[warrior('松永久秀',2)],officers);
  expect(result.level).toBe(5);
  expect(result.sources).toEqual([]);

  const unlocked=calculateTroopLevel('鉄砲',[warrior('松永久秀',3)],officers);
  expect(unlocked.level).toBe(8);
  expect(unlocked.sources[0]?.sourceName).toBe('砲術Ⅲ');
  expect(unlocked.capUnlocked).toBe(false);
 });

 it('uses cap 10 when no cap-unlock effect is active',()=>{
  const normal=calculateTroopLevel('騎馬',[
   warrior('山内一豊',0),warrior('山内一豊',0),warrior('山内一豊',0),
  ],officers);
  expect(normal.level).toBe(10);
  expect(normal.cap).toBe(10);
  expect(normal.capUnlocked).toBe(false);
 });

 it('removes the ceiling entirely when a trait unlocks the cap',()=>{
  const general=calculateTroopLevel('騎馬',[
   warrior('柿崎景家',0),warrior('北条綱成',0),warrior('榊原康政',0),
  ],officers);
  expect(general.level).toBe(14);
  expect(general.cap).toBeNull();
  expect(general.capUnlocked).toBe(true);
 });

 it('removes the ceiling when an inherent or equipped skill unlocks the cap',()=>{
  const skills=[{name:'兵種覚醒',unitLevelEffects:[{name:'兵種覚醒',unitTypes:['騎馬' as const],levelBonus:0,capUnlock:true}]}];
  const bySkill=calculateTroopLevel('騎馬',[
   warrior('山内一豊',0,'兵種覚醒'),warrior('山内一豊',0),warrior('山内一豊',0),
  ],officers,skills);
  expect(bySkill.level).toBe(11);
  expect(bySkill.cap).toBeNull();
  expect(bySkill.sources).toContainEqual(expect.objectContaining({sourceType:'skill',sourceName:'兵種覚醒',capUnlock:true}));
 });
});

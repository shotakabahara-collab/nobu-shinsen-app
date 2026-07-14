import {describe,expect,it} from 'vitest';
import {calculateTroopLevel,findDuplicateEquippedSkill} from './formationRules';

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

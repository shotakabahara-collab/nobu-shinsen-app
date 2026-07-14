import {describe,expect,it} from 'vitest';
import {calculateTroopLevel,findDuplicateEquippedSkill} from './formationRules';

describe('findDuplicateEquippedSkill',()=>{
 it('finds a duplicate across different officers and normalizes full-width text',()=>{
  const result=findDuplicateEquippedSkill([
   {name:'武将1',limitBreak:0,equippedSkills:['紅蓮の炎','回天転運']},
   {name:'武将2',limitBreak:0,equippedSkills:['一行三昧','紅蓮の炎　']},
  ]);
  expect(result).toEqual({name:'紅蓮の炎',first:{warriorIndex:0,skillIndex:0},duplicate:{warriorIndex:1,skillIndex:1}});
 });

 it('allows six unique equipped skills',()=>{
  expect(findDuplicateEquippedSkill([
   {name:'武将1',limitBreak:0,equippedSkills:['A','B']},
   {name:'武将2',limitBreak:0,equippedSkills:['C','D']},
   {name:'武将3',limitBreak:0,equippedSkills:['E','F']},
  ])).toBeUndefined();
 });
});

describe('calculateTroopLevel',()=>{
 const officers=[
  {name:'柿崎景家',unitLevelTraits:[{name:'騎兵大将',unlockedAt:0,unitTypes:['騎馬' as const],levelBonus:3,capBonus:1}]},
  {name:'山内一豊',unitLevelTraits:[{name:'馬術Ⅱ',unlockedAt:0,unitTypes:['騎馬' as const],levelBonus:2,capBonus:0}]},
  {name:'松永久秀',unitLevelTraits:[{name:'砲術Ⅲ',unlockedAt:3,unitTypes:['鉄砲' as const],levelBonus:3,capBonus:0}]},
 ];

 it('starts at barracks level 5 and adds traits unlocked by current limit break',()=>{
  const result=calculateTroopLevel('鉄砲',[{name:'松永久秀',limitBreak:2}],officers);
  expect(result.level).toBe(5);
  expect(result.sources).toEqual([]);

  const unlocked=calculateTroopLevel('鉄砲',[{name:'松永久秀',limitBreak:3}],officers);
  expect(unlocked.level).toBe(8);
  expect(unlocked.sources[0]?.traitName).toBe('砲術Ⅲ');
 });

 it('uses the normal cap 10 unless a general trait unlocks cap 11',()=>{
  const normal=calculateTroopLevel('騎馬',[
   {name:'山内一豊',limitBreak:0},
   {name:'山内一豊',limitBreak:0},
   {name:'山内一豊',limitBreak:0},
  ],officers);
  expect(normal.level).toBe(10);
  expect(normal.cap).toBe(10);

  const general=calculateTroopLevel('騎馬',[
   {name:'柿崎景家',limitBreak:0},
   {name:'柿崎景家',limitBreak:0},
  ],officers);
  expect(general.level).toBe(11);
  expect(general.cap).toBe(11);
 });
});

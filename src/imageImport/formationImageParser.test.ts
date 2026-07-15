import {describe,expect,it} from 'vitest';
import type {WarriorRecord} from '../domain/schemas';
import type {CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import type {CanonicalSkill} from '../services/canonicalSkillCatalog';
import {parseFormationImages} from './formationImageParser';

const officers:CanonicalOfficer[]=[
 {id:'1',name:'山本勘助',inherentSkill:'啄木鳥戦法',unitLevelTraits:[]},
 {id:'2',name:'柴田勝家',inherentSkill:'瓶割り柴田',unitLevelTraits:[]},
 {id:'3',name:'柿崎景家',inherentSkill:'越後二天',unitLevelTraits:[]},
];
const skill=(id:string,name:string,attachable=true):CanonicalSkill=>({id,name,type:attachable?'能動':'固有',attachable,unitLevelEffects:[]});
const skills=[skill('a','一行三昧'),skill('b','回天転運'),skill('c','会盟の陣'),skill('d','以戦養戦'),skill('e','乗勝追撃'),skill('f','縦横馳突'),skill('g','越後二天',false)];

describe('parseFormationImages',()=>{
 it('extracts troop type, three officers, limit breaks and six attachable skills',()=>{
  const draft=parseFormationImages([{text:`騎馬編成\n山本勘助 2凸\n一行三昧\n回天転運\n柴田勝家 1凸\n会盟の陣\n以戦養戦\n柿崎景家 3凸\n乗勝追撃\n縦横馳突`}],officers,skills);
  expect(draft.troopType.value).toBe('騎馬');
  expect(draft.warriors.map(warrior=>warrior.name.value)).toEqual(['山本勘助','柴田勝家','柿崎景家']);
  expect(draft.warriors.map(warrior=>warrior.limitBreak.value)).toEqual([2,1,3]);
  expect(draft.warriors[0].equippedSkills.map(value=>value.value)).toEqual(['一行三昧','回天転運']);
  expect(draft.warriors[1].equippedSkills.map(value=>value.value)).toEqual(['会盟の陣','以戦養戦']);
  expect(draft.warriors[2].equippedSkills.map(value=>value.value)).toEqual(['乗勝追撃','縦横馳突']);
  expect(draft.warnings).toEqual([]);
 });

 it('recovers the supplied firearm formation from its observed OCR variants',()=>{
  const cardOfficers:CanonicalOfficer[]=[
   {id:'h',name:'本願寺顕如',inherentSkill:'一切皆空',unitLevelTraits:[]},
   {id:'s',name:'鈴木佐大夫',inherentSkill:'弾嵐雨霰',unitLevelTraits:[]},
   {id:'t',name:'妻木熙子',inherentSkill:'内助の賢',unitLevelTraits:[]},
  ];
  const cardSkills=[skill('i1','一切皆空',false),skill('i2','弾嵐雨霰',false),skill('i3','内助の賢',false),skill('p','破天の轟'),skill('c','城盗り'),skill('y','有備無患'),skill('g','草木皆兵'),skill('e','姻戚同盟'),skill('m','鉄砲僧兵')];
  const page=(slot:0|1|2,row:'card'|'inherent'|'equipped1'|'equipped2',text:string,limitBreak?:number)=>({slot,row,layout:'three-card' as const,text,...(limitBreak===undefined?{}:{limitBreak,limitBreakConfidence:'high' as const,limitBreakEvidence:`赤い凸マーク${limitBreak}個を画像から検出`})});
  const draft=parseFormationImages([
   page(0,'card','鉄怒 WO',2),page(0,'inherent','S 一切皆空'),page(0,'equipped1','A 破天の尋'),page(0,'equipped2','S 城凌り'),
   page(1,'card','LV3',5),page(1,'inherent','S 弾履雨敏'),page(1,'equipped1','A 有備無足'),page(1,'equipped2','S 昔木皆兵'),
   page(2,'card','鉄砲 3',5),page(2,'inherent','S 内助の賢'),page(2,'equipped1','S 類成同盟'),page(2,'equipped2','S 鉄砲僧兵'),
  ],cardOfficers,cardSkills);
  expect(draft.troopType).toMatchObject({value:'鉄砲',confidence:'high'});
  expect(draft.warriors.map(warrior=>warrior.name.value)).toEqual(['本願寺顕如','鈴木佐大夫','妻木熙子']);
  expect(draft.warriors.map(warrior=>warrior.limitBreak.value)).toEqual([2,5,5]);
  expect(draft.warriors[0].equippedSkills.map(value=>value.value)).toEqual(['破天の轟','城盗り']);
  expect(draft.warriors[1].equippedSkills.map(value=>value.value)).toEqual(['有備無患','草木皆兵']);
  expect(draft.warriors[2].equippedSkills.map(value=>value.value)).toEqual(['姻戚同盟','鉄砲僧兵']);
  expect(draft.warriors.flatMap(warrior=>warrior.equippedSkills).map(value=>value.value)).not.toContain('一切皆空');
  expect(draft.warnings).toEqual([]);
 });

 it('never treats inherent skills as equipped-skill candidates',()=>{
  const draft=parseFormationImages([{text:'騎馬 山本勘助 柴田勝家 柿崎景家 越後二天 一行三昧 回天転運'}],officers,skills);
  expect(draft.warriors.flatMap(warrior=>warrior.equippedSkills).map(value=>value.value)).not.toContain('越後二天');
 });

 it('uses saved ownership only when the screenshot does not expose a limit break',()=>{
  const owned:WarriorRecord={id:crypto.randomUUID(),name:'山本勘助',limitBreak:4,notes:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const draft=parseFormationImages([{text:'騎馬 山本勘助 柴田勝家 柿崎景家'}],officers,skills,[owned]);
  expect(draft.warriors[0].limitBreak).toMatchObject({value:4,confidence:'medium'});
  expect(draft.warriors[1].limitBreak.value).toBeNull();
  expect(draft.warnings.join(' ')).toContain('凸');
 });

 it('normalizes common OCR variants for the firearm troop type',()=>{
  expect(parseFormationImages([{text:'鉄炮兵'}],officers,skills).troopType.value).toBe('鉄砲');
 });
});

import {describe,expect,it,vi} from 'vitest';
import type {RuntimeResult} from '../runtime/contracts';
import type {CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import type {CanonicalSkill} from '../services/canonicalSkillCatalog';
import {buildRecommendationReasons,getRankedRecommendations,nextRecommendationName,recommendationToFormation} from './recommendation';

const candidate={officers:['柿崎景家','北条綱成','榊原康政'],awaken:[0,0,0],unit:'騎馬',skills:['A','B','C','D','E','F']};
const result={type:'branch_optimizer',version:'adapter-v1',runtime:'B223',search_scope:{generated:120,budget:500,budget_cut:true,shortlist_simulated:4},ranked:[{candidate,min_win_rate:.7,avg_win_rate:.7,win_rates:{target:.7},hp_diffs:{target:123.4},structural_score:99,formal_status:'FORMAL_EVAL_READY'}]} satisfies RuntimeResult;

const officers:CanonicalOfficer[]=[
 {id:'1',name:'柿崎景家',inherentSkill:'越後二天',unitLevelTraits:[{name:'騎兵大将',unlockedAt:0,unitTypes:['騎馬'],levelBonus:3,capUnlock:true,capBonus:1}]},
 {id:'2',name:'北条綱成',inherentSkill:'地黄八幡',unitLevelTraits:[{name:'騎兵大将',unlockedAt:0,unitTypes:['騎馬'],levelBonus:3,capUnlock:true,capBonus:1}]},
 {id:'3',name:'榊原康政',inherentSkill:'無傷の誇',unitLevelTraits:[{name:'馬術Ⅲ',unlockedAt:0,unitTypes:['騎馬'],levelBonus:3,capUnlock:false,capBonus:0}]},
];
const skills:CanonicalSkill[]=candidate.skills.map((name,index)=>({id:String(index),name,type:'能動',attachable:true,unitLevelEffects:[]}));

describe('recommendation',()=>{
 it('parses ranked runtime candidates and produces grounded reasons',()=>{
  const ranked=getRankedRecommendations(result);
  expect(ranked).toHaveLength(1);
  const reasons=buildRecommendationReasons(ranked[0]!,0,'target',result.search_scope as Record<string,unknown>);
  const text=reasons.join(' ');
  expect(text).toContain('正本準拠エンジン');
  expect(text).not.toMatch(/b223/i);
  expect(text).toContain('70.0%');
  expect(text).toContain('+123.4');
  expect(text).toContain('大域的な絶対最適を保証');
 });

 it('converts the selected recommendation into a valid registered formation',()=>{
  vi.stubGlobal('crypto',{randomUUID:()=>`00000000-0000-4000-8000-${Math.random().toString().slice(2,14).padEnd(12,'0')}`});
  const formation=recommendationToFormation(getRankedRecommendations(result)[0]!,'山県騎馬',0,[],officers,skills);
  expect(formation.name).toBe('対山県騎馬 推奨編成1');
  expect(formation.troopLevel).toBe(14);
  expect(formation.warriors[0]).toMatchObject({name:'柿崎景家',inherentSkill:'越後二天',equippedSkills:['A','B']});
  vi.unstubAllGlobals();
 });

 it('creates a unique recommendation name',()=>{
  expect(nextRecommendationName('黒田弓',['対黒田弓 推奨編成1','対黒田弓 推奨編成1 (2)'],0)).toBe('対黒田弓 推奨編成1 (3)');
 });
});

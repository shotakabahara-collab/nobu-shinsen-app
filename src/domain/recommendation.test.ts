import {describe,expect,it,vi} from 'vitest';
import type {RuntimeResult} from '../runtime/contracts';
import type {CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import type {CanonicalSkill} from '../services/canonicalSkillCatalog';
import {buildRecommendationReasons,getRankedRecommendations,nextRecommendationName,recommendationForRoleOrder,recommendationToFormation,swapCandidateRoles} from './recommendation';

const candidate={officers:['柿崎景家','北条綱成','榊原康政'],awaken:[1,2,3],unit:'騎馬',skills:['A','B','C','D','E','F']};
const deputyAsCommander={officers:['榊原康政','北条綱成','柿崎景家'],awaken:[3,2,1],unit:'騎馬',skills:['E','F','C','D','A','B']};
const result={type:'branch_optimizer',version:'adapter-v2-role-complete',runtime:'B223',search_scope:{generated:120,budget:500,budget_cut:true,shortlist_simulated:6,role_placements_simulated:6},ranked:[{candidate,min_win_rate:.7,avg_win_rate:.7,win_rates:{target:.7},hp_diffs:{target:123.4},structural_score:99,formal_status:'FORMAL_EVAL_READY',role_comparison:{complete:true,placements_simulated:6,expected_placements:6,selected_rank:1},role_variants:[{candidate,min_win_rate:.7,avg_win_rate:.7,win_rates:{target:.7}},{candidate:deputyAsCommander,min_win_rate:.6,avg_win_rate:.6,win_rates:{target:.6}}]}]} satisfies RuntimeResult;

const officers:CanonicalOfficer[]=[
 {id:'1',name:'柿崎景家',inherentSkill:'越後二天',unitLevelTraits:[{name:'騎兵大将',unlockedAt:0,unitTypes:['騎馬'],levelBonus:3,capUnlock:true,capBonus:1}]},
 {id:'2',name:'北条綱成',inherentSkill:'地黄八幡',unitLevelTraits:[{name:'騎兵大将',unlockedAt:0,unitTypes:['騎馬'],levelBonus:3,capUnlock:true,capBonus:1}]},
 {id:'3',name:'榊原康政',inherentSkill:'無傷の誇',unitLevelTraits:[{name:'馬術Ⅲ',unlockedAt:0,unitTypes:['騎馬'],levelBonus:3,capUnlock:false,capBonus:0}]},
];
const skills:CanonicalSkill[]=candidate.skills.map((name,index)=>({id:String(index),name,type:'能動',attachable:true,slotType:'normal',allowedUnitTypes:[],unitLevelEffects:[]}));

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
  expect(text).toContain('大将・副将全6配置');
 expect(text).toContain('大域的な絶対最適を保証');
 });

 it('explains complete catalog prefilter coverage without claiming an exhaustive optimum',()=>{
  const ranked=getRankedRecommendations(result)[0]!;
  const reasons=buildRecommendationReasons(ranked,0,'target',{catalog_scope:'canonical_all',canonical_officer_count:146,canonical_skill_count:236,formal_attachable_skill_count:112,prefilter_coverage_complete:true,officer_formal_admission_count:136,skill_formal_admission_count:99,generated:358,shortlist_simulated:24});
  const text=reasons.join(' ');
  expect(text).toContain('全146武将・全236戦法');
  expect(text).toContain('武将136名・戦法99件');
  expect(text).toContain('直積総当たり');
  expect(text).not.toContain('未登録の武将・戦法は探索対象外');
 });

 it('swaps the complete officer package and reuses that role variant evaluation',()=>{
  const ranked=getRankedRecommendations(result)[0]!;
  const swapped=swapCandidateRoles(ranked.candidate,0,2);
  expect(swapped.officers).toEqual(['榊原康政','北条綱成','柿崎景家']);
  expect(swapped.awaken).toEqual([3,2,1]);
  expect(swapped.skills).toEqual(['E','F','C','D','A','B']);
  const selected=recommendationForRoleOrder(ranked,swapped);
  expect(selected.win_rates?.target).toBe(.6);
  expect(selected.role_comparison?.complete).toBe(true);
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

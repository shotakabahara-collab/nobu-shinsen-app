import {describe,expect,it,vi} from 'vitest';
import type {RuntimeResult} from '../runtime/contracts';
import type {CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import type {CanonicalSkill} from '../services/canonicalSkillCatalog';
import {applyFinalRecommendationEvaluations,buildRecommendationReasons,candidateToRuntimeFormation,getRankedRecommendations,nextRecommendationName,rankCompletedRecommendationEvaluations,recommendationForRoleOrder,recommendationToFormation,swapCandidateRoles,type CandidateSpec} from './recommendation';

const candidate:CandidateSpec={officers:['柿崎景家','北条綱成','榊原康政'],awaken:[1,2,3],unit:'騎馬',skills:['A','B','C','D','E','F']};
const deputyAsCommander:CandidateSpec={officers:['榊原康政','北条綱成','柿崎景家'],awaken:[3,2,1],unit:'騎馬',skills:['E','F','C','D','A','B']};
const result={type:'branch_optimizer',version:'adapter-v2-role-complete',runtime:'B223',search_scope:{generated:120,budget:500,budget_cut:true,shortlist_simulated:6,role_placements_simulated:6},ranked:[{candidate,min_win_rate:.7,avg_win_rate:.7,win_rates:{target:.7},hp_diffs:{target:123.4},battle_evidence:{target:{status:'COMPLETE',measurement_stage:'FINAL',requested_battles:100,completed_battles:100,wins:70,losses:25,draws:5}},structural_score:99,formal_status:'FORMAL_EVAL_READY',role_comparison:{complete:true,placements_simulated:6,expected_placements:6,selected_rank:1},role_variants:[{candidate,min_win_rate:.7,avg_win_rate:.7,win_rates:{target:.7}},{candidate:deputyAsCommander,min_win_rate:.6,avg_win_rate:.6,win_rates:{target:.6}}]}]} satisfies RuntimeResult;

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
  expect(text).toContain('70勝・25敗・5引分');
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

 it('builds the same complete runtime formation used for final 100-battle verification',()=>{
  const runtime=candidateToRuntimeFormation(candidate,officers,skills);
  expect(runtime).toMatchObject({officers:candidate.officers,awaken:candidate.awaken,skills:candidate.skills,unit:'騎馬',unit_level:14,troops:10000,fixed_placement:true});
 });

 it('keeps only candidates backed by a complete and internally consistent 100-battle result',()=>{
  const completed={type:'simulation',version:'v',runtime:'B223',win_rate:.62,hp_diff:-345.6,battle_evaluation:{summary:{requestedBattles:100,completedBattles:100,wins:62,losses:33,draws:5,winRate:.62},examples:[]}} satisfies RuntimeResult;
  const finalized=applyFinalRecommendationEvaluations(result,'target',[{candidate,result:completed}],{requested:4,completed:4,failed:0,battlesPerCandidate:20,finalistLimit:2,finalRequested:1});
  const ranked=getRankedRecommendations(finalized);
  expect(ranked).toHaveLength(1);expect(ranked[0]).toMatchObject({win_rates:{target:.62},hp_diffs:{target:-345.6},battle_evidence:{target:{measurement_stage:'FINAL',completed_battles:100,wins:62,losses:33,draws:5}}});
  expect(finalized.search_scope).toMatchObject({tournament_screen_requested:4,tournament_screen_completed:4,tournament_screen_failed:0,tournament_screen_battles_per_candidate:20,tournament_finalist_limit:2,final_evaluation_requested:1,final_evaluation_completed:1,final_evaluation_failed:0,final_battles_per_candidate:100,ranking_measurement_policy:'COMPLETED_20_BATTLE_TOURNAMENT_SCREEN_THEN_COMPLETED_100_BATTLE_FINALISTS_ONLY'});
  expect(buildRecommendationReasons(ranked[0]!,0,'target',finalized.search_scope as Record<string,unknown>).join(' ')).toContain('事前候補4件を各20戦で再比較し、その上位1件を各100戦で確定評価');
  const incomplete={...completed,battle_evaluation:{summary:{requestedBattles:100,completedBattles:0,wins:0,losses:0,draws:0,winRate:0},examples:[]},win_rate:0,hp_diff:0};
  const rejected=applyFinalRecommendationEvaluations(result,'target',[{candidate,result:incomplete}]);
  expect(getRankedRecommendations(rejected)).toEqual([]);expect(rejected.search_status).toBe('NO_VALID_FINAL_100_MEASUREMENTS');
 });

 it('ranks only complete 20-battle tournament measurements by win rate and then HP difference',()=>{
  const third=swapCandidateRoles(candidate,0,1);
  const measurement=(wins:number,hp:number,completed=20)=>({type:'simulation',version:'v',runtime:'B223',win_rate:completed?wins/completed:0,hp_diff:hp,battle_evaluation:{summary:{requestedBattles:20,completedBattles:completed,wins,losses:completed-wins,draws:0,winRate:completed?wins/completed:0},examples:[]}} satisfies RuntimeResult);
  const ranked=rankCompletedRecommendationEvaluations([
   {candidate,result:measurement(11,900)},
   {candidate:deputyAsCommander,result:measurement(12,-100)},
   {candidate:third,result:measurement(12,50)},
   {candidate:swapCandidateRoles(candidate,1,2),result:measurement(6,9999,10)},
  ],20);
  expect(ranked.map(row=>row.candidate)).toEqual([third,deputyAsCommander,candidate]);
 });

 it('creates a unique recommendation name',()=>{
  expect(nextRecommendationName('黒田弓',['対黒田弓 推奨編成1','対黒田弓 推奨編成1 (2)'],0)).toBe('対黒田弓 推奨編成1 (3)');
 });
});

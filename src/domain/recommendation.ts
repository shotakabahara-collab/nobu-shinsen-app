import {formationSchema,troopTypes,type Formation} from './schemas';
import {calculateTroopLevel,type UnitLevelRule,type UnitType} from './formationRules';
import type {CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import type {CanonicalSkill} from '../services/canonicalSkillCatalog';
import type {RuntimeFormation,RuntimeResult} from '../runtime/contracts';
import {ENGINE_DISPLAY_NAME} from './engineBrand';

export type CandidateSpec={
 officers:[string,string,string];
 awaken:[number,number,number];
 unit:UnitType;
 skills:[string,string,string,string,string,string];
 unit_level?:number;
};

export type RoleComparison={
 policy?:string;
 expected_placements?:number;
 placements_simulated?:number;
 complete?:boolean;
 selected_rank?:number;
};

export type BattleEvidence={
 status?:string;
 measurement_stage?:string;
 requested_battles?:number;
 completed_battles?:number;
 wins?:number;
 losses?:number;
 draws?:number;
 runtime_failure_count?:number;
 reasons?:string[];
};

export type RoleVariant={
 candidate:CandidateSpec;
 min_win_rate?:number;
 avg_win_rate?:number;
 win_rates?:Record<string,number>;
 hp_diffs?:Record<string,number>;
 battle_evidence?:Record<string,BattleEvidence>;
 structural_score?:number;
 formal_status?:string;
 assignment?:unknown[];
};

export type RankedRecommendation=RoleVariant&{
 role_comparison?:RoleComparison;
 role_variants?:RoleVariant[];
};

export type SearchScope={
 catalog_scope?:'canonical_all'|'owned_only';
 generated?:number;
 budget?:number;
 budget_cut?:boolean;
 formal_ready?:number;
 shortlist_simulated?:number;
 role_atomic_budget?:boolean;
 role_families_generated?:number;
 role_families_complete?:number;
 role_families_shortlisted?:number;
 role_placements_simulated?:number;
 role_placements_expected_per_family?:number;
 canonical_officer_count?:number;
 canonical_skill_count?:number;
 catalog_attachable_skill_count?:number;
 formal_attachable_skill_count?:number;
 formal_attachable_excluded_count?:number;
 non_attachable_skill_count?:number;
 canonical_officer_skill_pair_count?:number;
 formal_officer_skill_pair_count?:number;
 officer_prefilter_coverage_count?:number;
 skill_prefilter_coverage_count?:number;
 prefilter_coverage_complete?:boolean;
 officer_formal_admission_count?:number;
 skill_formal_admission_count?:number;
 known_awaken_override_count?:number;
 formal_attachable_exclusions?:Array<{name?:string;reasons?:string[]}>;
 combination_policy?:string;
 screening_battles_per_placement?:number;
 screening_invalid_count?:number;
 screening_invalid_reasons?:Record<string,number>;
 target_formal_stops?:Array<{target_id?:string;reason?:string;detail?:string}>;
 tournament_screen_requested?:number;
 tournament_screen_completed?:number;
 tournament_screen_failed?:number;
 tournament_screen_battles_per_candidate?:number;
 tournament_finalist_limit?:number;
 final_evaluation_requested?:number;
 final_evaluation_completed?:number;
 final_evaluation_failed?:number;
 final_battles_per_candidate?:number;
 ranking_measurement_policy?:string;
};

export const roleLabels=['大将','副将1','副将2'] as const;

function tupleOfStrings(value:unknown,length:number):string[]|null{
 if(!Array.isArray(value)||value.length!==length||value.some(item=>typeof item!=='string'||!item.trim()))return null;
 return value.map(item=>(item as string).trim());
}

function tupleOfAwaken(value:unknown):[number,number,number]|null{
 if(!Array.isArray(value)||value.length!==3)return null;
 const parsed=value.map(item=>Number(item));
 if(parsed.some(item=>!Number.isInteger(item)||item<0||item>5))return null;
 return parsed as [number,number,number];
}

function finiteNumber(value:unknown):number|undefined{return typeof value==='number'&&Number.isFinite(value)?value:undefined;}
function finiteNumberRecord(value:unknown):Record<string,number>|undefined{
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 const rows=Object.entries(value).flatMap(([key,item])=>{const parsed=finiteNumber(item);return parsed===undefined?[]:[[key,parsed] as const];});
 return rows.length?Object.fromEntries(rows):undefined;
}
function battleEvidenceRecord(value:unknown):Record<string,BattleEvidence>|undefined{
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 const rows=Object.entries(value).flatMap(([key,item])=>item&&typeof item==='object'&&!Array.isArray(item)?[[key,item as BattleEvidence] as const]:[]);
 return rows.length?Object.fromEntries(rows):undefined;
}

export function parseCandidateSpec(value:unknown):CandidateSpec|null{
 if(!value||typeof value!=='object')return null;
 const row=value as Record<string,unknown>;
 const officers=tupleOfStrings(row.officers,3);
 const awaken=tupleOfAwaken(row.awaken);
 const skills=tupleOfStrings(row.skills,6);
 const unit=typeof row.unit==='string'&&troopTypes.includes(row.unit as UnitType)?row.unit as UnitType:null;
 if(!officers||!awaken||!skills||!unit)return null;
 const unitLevel=Number(row.unit_level);
 return {
  officers:officers as CandidateSpec['officers'],
  awaken,
  unit,
  skills:skills as CandidateSpec['skills'],
  ...(Number.isInteger(unitLevel)&&unitLevel>0?{unit_level:unitLevel}:{}),
 };
}

export function getRankedRecommendations(result:RuntimeResult|null):RankedRecommendation[]{
 if(!result||!Array.isArray(result.ranked))return [];
 const recommendations:RankedRecommendation[]=[];
 for(const raw of result.ranked){
  const item=parseRoleVariant(raw);
  if(!item)continue;
  const row=raw as Record<string,unknown>;
  const comparison=row.role_comparison&&typeof row.role_comparison==='object'?row.role_comparison as RoleComparison:undefined;
  const roleVariants=Array.isArray(row.role_variants)?row.role_variants.map(parseRoleVariant).filter((value):value is RoleVariant=>Boolean(value)):undefined;
  recommendations.push({...item,role_comparison:comparison,role_variants:roleVariants});
 }
 return recommendations;
}

function parseRoleVariant(raw:unknown):RoleVariant|null{
 if(!raw||typeof raw!=='object')return null;
 const row=raw as Record<string,unknown>;
 const candidate=parseCandidateSpec(row.candidate);
 if(!candidate)return null;
 return {
  candidate,
  min_win_rate:finiteNumber(row.min_win_rate),
  avg_win_rate:finiteNumber(row.avg_win_rate),
  win_rates:finiteNumberRecord(row.win_rates),
  hp_diffs:finiteNumberRecord(row.hp_diffs),
  battle_evidence:battleEvidenceRecord(row.battle_evidence),
  structural_score:finiteNumber(row.structural_score),
  formal_status:typeof row.formal_status==='string'?row.formal_status:undefined,
  assignment:Array.isArray(row.assignment)?row.assignment:undefined,
 };
}

export function getSearchScope(result:RuntimeResult|null):SearchScope{
 return result?.search_scope&&typeof result.search_scope==='object'?result.search_scope as SearchScope:{};
}

function percent(value:number):string{return `${(value*100).toFixed(1)}%`;}

export function buildRecommendationReasons(item:RankedRecommendation,index:number,targetId:string,scope:SearchScope):string[]{
 const reasons:string[]=[];
 const targetRate=item.win_rates?.[targetId];
 const measured=typeof targetRate==='number'?targetRate:item.avg_win_rate??item.min_win_rate;
 reasons.push(`${ENGINE_DISPLAY_NAME}の対象勝率・平均勝率・残存兵力差・構造スコアによる順位付けで、評価済み候補中${index+1}位です。`);
 const evidence=item.battle_evidence?.[targetId];
 const final100=evidence?.status==='COMPLETE'&&evidence.measurement_stage==='FINAL'&&evidence.completed_battles===100;
 if(typeof measured==='number')reasons.push(final100?`選択した編成に対する100戦の実測勝率は${percent(measured)}です。`:`選択した編成に対する事前選別勝率は${percent(measured)}です。`);
 const hp=item.hp_diffs?.[targetId];
 if(typeof hp==='number')reasons.push(`${final100?'100戦の':'事前選別の'}平均HP差は${hp>=0?'+':''}${hp.toFixed(1)}です。`);
 if(final100)reasons.push(`内訳は${evidence.wins??0}勝・${evidence.losses??0}敗・${evidence.draws??0}引分で、完了100戦だけを集計しています。`);
 if(final100&&typeof scope.tournament_screen_completed==='number')reasons.push(`事前候補${scope.tournament_screen_completed}件を各${scope.tournament_screen_battles_per_candidate??20}戦で再比較し、その上位${scope.final_evaluation_requested??2}件を各100戦で確定評価しています。`);
 if(item.formal_status?.startsWith('FORMAL_EVAL_READY'))reasons.push('正本データとの整合性確認を通過した候補です。');
 if(item.role_comparison?.complete)reasons.push(`同じ3武将の大将・副将全${item.role_comparison.placements_simulated??6}配置を同一乱数条件で比較し、最良の役割順を選定しています。`);
 else if(typeof item.role_comparison?.placements_simulated==='number')reasons.push(`役割配置は${item.role_comparison.placements_simulated}件を比較しましたが、正本条件を満たさない配置は除外しています。`);
 if(typeof scope.generated==='number')reasons.push(`${scope.generated}件を生成し、${scope.shortlist_simulated??0}件を実戦シミュレーションした範囲から選定しています。`);
 if(scope.catalog_scope==='canonical_all'){
  if(scope.prefilter_coverage_complete)reasons.push(`正本の全${scope.canonical_officer_count??0}武将・全${scope.canonical_skill_count??0}戦法を事前評価し、正式候補${scope.formal_attachable_skill_count??0}戦法をすべて探索レーンへ投入しています。`);
  if(typeof scope.officer_formal_admission_count==='number'&&typeof scope.skill_formal_admission_count==='number')reasons.push(`正本の安全ゲートを通過した武将${scope.officer_formal_admission_count}名・戦法${scope.skill_formal_admission_count}件から実戦候補を比較しています。未確認効果は推測で補いません。`);
  reasons.push('全カタログを母集団にした段階探索であり、全3武将×全6戦法の直積総当たりや大域的な絶対最適を保証するものではありません。');
 }else if(scope.budget_cut)reasons.push('探索予算で打ち切っているため、大域的な絶対最適を保証するものではありません。');
 else reasons.push('設定された所有範囲は完走していますが、未登録の武将・戦法は探索対象外です。');
 return reasons;
}

export function candidateSkillLines(candidate:CandidateSpec):string[]{
 return candidate.officers.map((officer,index)=>`${roleLabels[index]} ${officer}：${candidate.skills[index*2]}／${candidate.skills[index*2+1]}`);
}

export function swapCandidateRoles(candidate:CandidateSpec,first:number,second:number):CandidateSpec{
 if(first===second||first<0||first>2||second<0||second>2)return candidate;
 const officers=[...candidate.officers] as CandidateSpec['officers'];
 const awaken=[...candidate.awaken] as CandidateSpec['awaken'];
 const skillPairs=[candidate.skills.slice(0,2),candidate.skills.slice(2,4),candidate.skills.slice(4,6)];
 [officers[first],officers[second]]=[officers[second]!,officers[first]!];
 [awaken[first],awaken[second]]=[awaken[second]!,awaken[first]!];
 [skillPairs[first],skillPairs[second]]=[skillPairs[second]!,skillPairs[first]!];
 return {...candidate,officers,awaken,skills:skillPairs.flat() as CandidateSpec['skills']};
}

export function recommendationForRoleOrder(item:RankedRecommendation,candidate:CandidateSpec):RankedRecommendation{
 const key=JSON.stringify([candidate.officers,candidate.awaken,candidate.skills,candidate.unit]);
 const match=item.role_variants?.find(variant=>JSON.stringify([variant.candidate.officers,variant.candidate.awaken,variant.candidate.skills,variant.candidate.unit])===key);
 return match?{...match,role_comparison:item.role_comparison,role_variants:item.role_variants}:{candidate,role_comparison:item.role_comparison,role_variants:item.role_variants};
}

export function nextRecommendationName(targetName:string,existingNames:readonly string[],rank:number):string{
 const base=`対${targetName} 推奨編成${rank+1}`;
 if(!existingNames.includes(base))return base;
 let suffix=2;
 while(existingNames.includes(`${base} (${suffix})`))suffix+=1;
 return `${base} (${suffix})`;
}

export function recommendationToFormation(
 item:RankedRecommendation,
 targetName:string,
 rank:number,
 existingNames:readonly string[],
 officers:readonly CanonicalOfficer[],
 skills:readonly CanonicalSkill[],
 rule:UnitLevelRule={baseLevel:5,defaultCap:10,capUnlockMode:'unbounded'},
 now=new Date().toISOString(),
):Formation{
 const byName=new Map(officers.map(officer=>[officer.name,officer]));
 const warriors=item.candidate.officers.map((name,index)=>({
  id:crypto.randomUUID(),
  name,
  limitBreak:item.candidate.awaken[index],
  inherentSkill:byName.get(name)?.inherentSkill??'未登録',
  equippedSkills:[item.candidate.skills[index*2],item.candidate.skills[index*2+1]] as [string,string],
 })) as Formation['warriors'];
 const troopLevel=calculateTroopLevel(item.candidate.unit,warriors,officers,skills,rule).level;
 return formationSchema.parse({
  id:crypto.randomUUID(),
  name:nextRecommendationName(targetName,existingNames,rank),
  kind:'ally',
  troopType:item.candidate.unit,
  troopLevel,
  troops:10000,
  warriors,
  createdAt:now,
  updatedAt:now,
 });
}

export function candidateToRuntimeFormation(
 candidate:CandidateSpec,
 officers:readonly CanonicalOfficer[],
 skills:readonly CanonicalSkill[],
 rule:UnitLevelRule={baseLevel:5,defaultCap:10,capUnlockMode:'unbounded'},
):RuntimeFormation{
 const byName=new Map(officers.map(officer=>[officer.name,officer]));
 const warriors=candidate.officers.map((name,index)=>({
  id:`runtime-${index}`,
  name,
  limitBreak:candidate.awaken[index],
  inherentSkill:byName.get(name)?.inherentSkill??'未確認',
  equippedSkills:[candidate.skills[index*2],candidate.skills[index*2+1]] as [string,string],
 })) as Formation['warriors'];
 const unitLevel=candidate.unit_level??calculateTroopLevel(candidate.unit,warriors,officers,skills,rule).level;
 return {officers:candidate.officers,awaken:candidate.awaken,unit:candidate.unit,unit_level:unitLevel,troops:10000,skills:candidate.skills,fixed_placement:true,ignore_formal_overlap:true};
}

export type FinalRecommendationEvaluation={candidate:CandidateSpec;result:RuntimeResult};
export type RecommendationTournamentAudit={requested:number;completed:number;failed:number;battlesPerCandidate:number;finalistLimit:number;finalRequested:number};

function candidateKey(candidate:CandidateSpec):string{return JSON.stringify([candidate.officers,candidate.awaken,candidate.skills,candidate.unit]);}
function record(value:unknown):Record<string,unknown>|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}

function completedEvidence(result:RuntimeResult,battles:number,stage:string):BattleEvidence|null{
 const evaluation=record(result.battle_evaluation),summary=record(evaluation?.summary);
 const requested=finiteNumber(summary?.requestedBattles),completed=finiteNumber(summary?.completedBattles),wins=finiteNumber(summary?.wins),losses=finiteNumber(summary?.losses),draws=finiteNumber(summary?.draws);
 const rate=finiteNumber(result.win_rate),hp=finiteNumber(result.hp_diff);
 if(requested!==battles||completed!==battles||wins===undefined||losses===undefined||draws===undefined||wins+losses+draws!==battles||rate===undefined||rate<0||rate>1||hp===undefined)return null;
 if(Math.abs(rate-wins/battles)>1e-9)return null;
 return {status:'COMPLETE',measurement_stage:stage,requested_battles:battles,completed_battles:battles,wins,losses,draws,runtime_failure_count:0,reasons:[]};
}

function finalEvidence(result:RuntimeResult):BattleEvidence|null{return completedEvidence(result,100,'FINAL');}

export function rankCompletedRecommendationEvaluations(evaluations:FinalRecommendationEvaluation[],battles:number):FinalRecommendationEvaluation[]{
 return evaluations.filter(row=>completedEvidence(row.result,battles,'TOURNAMENT_SCREEN')).sort((a,b)=>{
  const rateDiff=(b.result.win_rate??-1)-(a.result.win_rate??-1);if(rateDiff)return rateDiff;
  const hpDiff=(b.result.hp_diff??Number.NEGATIVE_INFINITY)-(a.result.hp_diff??Number.NEGATIVE_INFINITY);if(hpDiff)return hpDiff;
  return candidateKey(a.candidate).localeCompare(candidateKey(b.candidate),'ja');
 });
}

export function applyFinalRecommendationEvaluations(result:RuntimeResult,targetId:string,evaluations:FinalRecommendationEvaluation[],tournament?:RecommendationTournamentAudit):RuntimeResult{
 const byCandidate=new Map(evaluations.map(row=>[candidateKey(row.candidate),row.result]));
 const rawRanked=Array.isArray(result.ranked)?result.ranked:[];
 const finalized=rawRanked.flatMap(raw=>{
  const parsed=parseRoleVariant(raw),source=record(raw);
  if(!parsed||!source)return [];
  const measurement=byCandidate.get(candidateKey(parsed.candidate)),evidence=measurement&&finalEvidence(measurement);
  if(!measurement||!evidence)return [];
  const rate=measurement.win_rate!,hp=measurement.hp_diff!;
  const patched:Record<string,unknown>={...source,win_rates:{...(finiteNumberRecord(source.win_rates)??{}),[targetId]:rate},hp_diffs:{...(finiteNumberRecord(source.hp_diffs)??{}),[targetId]:hp},min_win_rate:rate,avg_win_rate:rate,battle_evidence:{...(battleEvidenceRecord(source.battle_evidence)??{}),[targetId]:evidence}};
  if(Array.isArray(source.role_variants))patched.role_variants=source.role_variants.map(variant=>{
   const parsedVariant=parseRoleVariant(variant),variantRow=record(variant);
   if(!parsedVariant||!variantRow||candidateKey(parsedVariant.candidate)!==candidateKey(parsed.candidate))return variant;
   return {...variantRow,win_rates:{...(finiteNumberRecord(variantRow.win_rates)??{}),[targetId]:rate},hp_diffs:{...(finiteNumberRecord(variantRow.hp_diffs)??{}),[targetId]:hp},min_win_rate:rate,avg_win_rate:rate,battle_evidence:{...(battleEvidenceRecord(variantRow.battle_evidence)??{}),[targetId]:evidence}};
  });
  return [patched];
 });
 finalized.sort((a,b)=>{
  const ar=finiteNumber((a as Record<string,unknown>).min_win_rate)??-1,br=finiteNumber((b as Record<string,unknown>).min_win_rate)??-1;
  if(br!==ar)return br-ar;
  const ah=finiteNumberRecord((a as Record<string,unknown>).hp_diffs)?.[targetId]??Number.NEGATIVE_INFINITY,bh=finiteNumberRecord((b as Record<string,unknown>).hp_diffs)?.[targetId]??Number.NEGATIVE_INFINITY;
  return bh-ah;
 });
 const requested=tournament?.finalRequested??evaluations.length;
 const tournamentScope=tournament?{tournament_screen_requested:tournament.requested,tournament_screen_completed:tournament.completed,tournament_screen_failed:tournament.failed,tournament_screen_battles_per_candidate:tournament.battlesPerCandidate,tournament_finalist_limit:tournament.finalistLimit}:{};
 const scope={...(record(result.search_scope)??{}),...tournamentScope,preliminary_candidate_count:rawRanked.length,final_evaluation_requested:requested,final_evaluation_completed:finalized.length,final_evaluation_failed:Math.max(0,requested-finalized.length),final_battles_per_candidate:100,ranking_measurement_policy:tournament?'COMPLETED_20_BATTLE_TOURNAMENT_SCREEN_THEN_COMPLETED_100_BATTLE_FINALISTS_ONLY':'ONLY_THE_SCREENING_WINNER_IS_DISPLAYED_AFTER_A_COMPLETED_BROWSER_STREAMED_100_BATTLE_RESULT'};
 return {...result,search_status:finalized.length?'FINAL_100_COMPLETE':'NO_VALID_FINAL_100_MEASUREMENTS',search_scope:scope,ranked:finalized};
}

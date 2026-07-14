import {formationSchema,troopTypes,type Formation} from './schemas';
import {calculateTroopLevel,type UnitLevelRule,type UnitType} from './formationRules';
import type {CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import type {CanonicalSkill} from '../services/canonicalSkillCatalog';
import type {RuntimeResult} from '../runtime/contracts';

export type CandidateSpec={
 officers:[string,string,string];
 awaken:[number,number,number];
 unit:UnitType;
 skills:[string,string,string,string,string,string];
 unit_level?:number;
};

export type RankedRecommendation={
 candidate:CandidateSpec;
 min_win_rate?:number;
 avg_win_rate?:number;
 win_rates?:Record<string,number>;
 hp_diffs?:Record<string,number>;
 structural_score?:number;
 formal_status?:string;
 assignment?:unknown[];
};

export type SearchScope={
 generated?:number;
 budget?:number;
 budget_cut?:boolean;
 formal_ready?:number;
 shortlist_simulated?:number;
};

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
  if(!raw||typeof raw!=='object')continue;
  const row=raw as Record<string,unknown>;
  const candidate=parseCandidateSpec(row.candidate);
  if(!candidate)continue;
  recommendations.push({
   candidate,
   min_win_rate:typeof row.min_win_rate==='number'?row.min_win_rate:undefined,
   avg_win_rate:typeof row.avg_win_rate==='number'?row.avg_win_rate:undefined,
   win_rates:row.win_rates&&typeof row.win_rates==='object'?row.win_rates as Record<string,number>:undefined,
   hp_diffs:row.hp_diffs&&typeof row.hp_diffs==='object'?row.hp_diffs as Record<string,number>:undefined,
   structural_score:typeof row.structural_score==='number'?row.structural_score:undefined,
   formal_status:typeof row.formal_status==='string'?row.formal_status:undefined,
   assignment:Array.isArray(row.assignment)?row.assignment:undefined,
  });
 }
 return recommendations;
}

export function getSearchScope(result:RuntimeResult|null):SearchScope{
 return result?.search_scope&&typeof result.search_scope==='object'?result.search_scope as SearchScope:{};
}

function percent(value:number):string{return `${(value*100).toFixed(1)}%`;}

export function buildRecommendationReasons(item:RankedRecommendation,index:number,targetId:string,scope:SearchScope):string[]{
 const reasons:string[]=[];
 const targetRate=item.win_rates?.[targetId];
 const measured=typeof targetRate==='number'?targetRate:item.avg_win_rate??item.min_win_rate;
 reasons.push(`b223の対象勝率・平均勝率・構造スコアによる順位付けで、評価済み候補中${index+1}位です。`);
 if(typeof measured==='number')reasons.push(`選択した編成に対する計測勝率は${percent(measured)}です。`);
 const hp=item.hp_diffs?.[targetId];
 if(typeof hp==='number')reasons.push(`平均HP差は${hp>=0?'+':''}${hp.toFixed(1)}で、勝敗だけでなく残存兵力差も評価しています。`);
 if(item.formal_status?.startsWith('FORMAL_EVAL_READY'))reasons.push('正本runtimeの合法性確認を通過した候補です。');
 if(typeof scope.generated==='number')reasons.push(`${scope.generated}件を生成し、${scope.shortlist_simulated??0}件を実戦シミュレーションした範囲から選定しています。`);
 if(scope.budget_cut)reasons.push('探索予算で打ち切っているため、大域的な絶対最適を保証するものではありません。');
 else reasons.push('設定された探索範囲は完走していますが、未登録の武将・戦法は探索対象外です。');
 return reasons;
}

export function candidateSkillLines(candidate:CandidateSpec):string[]{
 return candidate.officers.map((officer,index)=>`${officer}：${candidate.skills[index*2]}／${candidate.skills[index*2+1]}`);
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

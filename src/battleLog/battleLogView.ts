import type {BattleResult,Formation} from '../domain/schemas';
import type {CanonicalOfficerStatsCatalog} from '../services/canonicalOfficerStatsCatalog';
import {findCanonicalOfficerStat} from '../services/canonicalOfficerStatsCatalog';

export type BattleSide='A'|'B';
export type BattleDirection='forward'|'reverse';
export type StatValues={force:number|null;intel:number|null;lead:number|null;speed:number|null};
export type BattleOfficerSnapshot={
 side:BattleSide;formationName:string;troopType:string;troopLevel:number;role:'大将'|'副将1'|'副将2';slot:0|1|2;name:string;limitBreak:number;troops:number;
 inherentSkill:string;equippedSkills:[string,string];allocationPoints:number|null;base:StatValues;allocated:StatValues;actionOrderSpeed:number|null;statState:string;
};
export type BattleSideSnapshot={side:BattleSide;formationId:string;formationName:string;troopType:string;troopLevel:number;officers:[BattleOfficerSnapshot,BattleOfficerSnapshot,BattleOfficerSnapshot]};
export type BattleSnapshot={schemaVersion:1;source:'canonical_officer_stats_catalog';sides:{A:BattleSideSnapshot;B:BattleSideSnapshot}};
export type ActionOrderEntry={rank:number;side:BattleSide;rawSide:'A'|'B';officer:string;role:string;effectiveSpeed:number|null;baseSpeed:number|null;timedSpeedBonus:number;persistentSpeedBonus:number};
export type ActionOrderTurn={turn:number;entries:ActionOrderEntry[]};
export type RepresentativeTrace={source:'runtime_trace'|'initial_speed_snapshot';direction:BattleDirection;seed:number|null;winner:BattleSide|null;winReason:string;hpDiff:number|null;turns:ActionOrderTurn[];keyEvents:Record<string,unknown>[]};
export type BattleEvaluationSummary={requestedBattles:number;completedBattles:number;wins:number;losses:number;draws:number;winRate:number};
export type BattleExampleOutcome='win'|'loss'|'draw';
export type BattleExampleRequest={direction:BattleDirection;seed:number;outcome:BattleExampleOutcome};
export type StoredBattleExample=BattleExampleRequest&{schemaVersion:1;detail:Record<string,unknown>};
export type TroopRow={side:BattleSide;officer:string;role:string;hp:number;maxHp:number};
export type BattleTimelineEvent={id:string;index:number;turn:number;kind:'damage'|'heal'|'control'|'activation'|'blocked'|'action'|'reconcile';side?:BattleSide;actor?:string;targetSide?:BattleSide;target?:string;source:string;description:string;delta?:number;before?:number;after?:number};
export type BattleTurnView={turn:number;status:'played'|'not_reached';actionOrder:ActionOrderEntry[];startTroops:TroopRow[];endTroops:TroopRow[];events:BattleTimelineEvent[]};
export type BattleExampleView={id:string;outcome:BattleExampleOutcome;direction:BattleDirection;seed:number;winner:BattleSide|null;winReason:string;hpDiff:number|null;endedTurn:number;turns:BattleTurnView[]};

const roles=['大将','副将1','副将2'] as const;
const emptyStats=():StatValues=>({force:null,intel:null,lead:null,speed:null});
const record=(value:unknown):Record<string,unknown>|undefined=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const array=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const numberOrNull=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:null;
const numberOr=(value:unknown,fallback=0):number=>numberOrNull(value)??fallback;
const stringOr=(value:unknown,fallback=''):string=>typeof value==='string'?value:fallback;
const troopKey=(side:BattleSide,name:string)=>`${side}|${name}`;

function sideSnapshot(side:BattleSide,formation:Formation,catalog:CanonicalOfficerStatsCatalog):BattleSideSnapshot{
 const officers=formation.warriors.map((warrior,index)=>{
  const stats=findCanonicalOfficerStat(catalog,warrior.name,warrior.limitBreak);
  return {
   side,formationName:formation.name,troopType:formation.troopType,troopLevel:formation.troopLevel,role:roles[index]!,slot:index as 0|1|2,name:warrior.name,limitBreak:warrior.limitBreak,troops:formation.troops,
   inherentSkill:stats?.inherentSkill??warrior.inherentSkill,equippedSkills:warrior.equippedSkills,allocationPoints:stats?.allocationPoints??null,
   base:stats?.base??emptyStats(),allocated:stats?.allocated??emptyStats(),actionOrderSpeed:stats?.actionOrderSpeed??stats?.allocated.speed??null,statState:stats?.statState??'未確認',
  } satisfies BattleOfficerSnapshot;
 }) as [BattleOfficerSnapshot,BattleOfficerSnapshot,BattleOfficerSnapshot];
 return {side,formationId:formation.id,formationName:formation.name,troopType:formation.troopType,troopLevel:formation.troopLevel,officers};
}

export function buildBattleSnapshot(formationA:Formation,formationB:Formation,catalog:CanonicalOfficerStatsCatalog):BattleSnapshot{
 return {schemaVersion:1,source:'canonical_officer_stats_catalog',sides:{A:sideSnapshot('A',formationA,catalog),B:sideSnapshot('B',formationB,catalog)}};
}

export function attachBattleSnapshot<T extends Record<string,unknown>>(payload:T,snapshot:BattleSnapshot):T&{battle_snapshot:BattleSnapshot}{return {...payload,battle_snapshot:snapshot};}

export function parseBattleSnapshot(payload:Record<string,unknown>):BattleSnapshot|undefined{
 const candidate=record(payload.battle_snapshot);if(!candidate||candidate.schemaVersion!==1||candidate.source!=='canonical_officer_stats_catalog')return undefined;
 const sides=record(candidate.sides),a=record(sides?.A),b=record(sides?.B);if(!a||!b||array(a.officers).length!==3||array(b.officers).length!==3)return undefined;
 return candidate as unknown as BattleSnapshot;
}

function canonicalSide(direction:BattleDirection,raw:'A'|'B'):BattleSide{return direction==='forward'?raw:raw==='A'?'B':'A';}
function rawSide(direction:BattleDirection,canonical:BattleSide):'A'|'B'{return direction==='forward'?canonical:canonical==='A'?'B':'A';}
function canonicalWinner(direction:BattleDirection,raw:unknown):BattleSide|null{return raw==='A'||raw==='B'?canonicalSide(direction,raw):null;}
function candidateOutcome(direction:BattleDirection,winner:unknown):BattleExampleOutcome{
 if(winner!=='A'&&winner!=='B')return 'draw';
 const candidateRaw=direction==='forward'?'A':'B';return winner===candidateRaw?'win':'loss';
}

export function buildBattleEvaluationSummary(payload:Record<string,unknown>):BattleEvaluationSummary{
 const sim=record(payload.sim);let requested=0,completed=0,wins=0,losses=0,draws=0;
 for(const direction of ['forward','reverse'] as const){
  for(const blockValue of array(sim?.[direction])){
   const block=record(blockValue)??{};requested+=numberOr(block.trials);completed+=numberOr(block.completed_trials);
   if(direction==='forward'){wins+=numberOr(block.left_wins);losses+=numberOr(block.right_wins);}else{wins+=numberOr(block.right_wins);losses+=numberOr(block.left_wins);}
   draws+=numberOr(block.draws);
  }
 }
 if(!requested){const perDirection=numberOr(sim?.trials_per_direction);requested=perDirection*2;}
 if(!completed)completed=wins+losses+draws;
 const fallback=numberOrNull(payload.win_rate)??0;
 return {requestedBattles:requested,completedBattles:completed,wins,losses,draws,winRate:completed?wins/completed:fallback};
}

function representativeRows(payload:Record<string,unknown>):BattleExampleRequest[]{
 const sim=record(payload.sim),traceBlocks=record(sim?.timeline_trace_blocks),rows:BattleExampleRequest[]=[];const seen=new Set<string>();
 for(const direction of ['forward','reverse'] as const){
  for(const blockValue of array(traceBlocks?.[direction])){
   const block=record(blockValue)??{};
   for(const traceValue of array(block.representative_traces)){
    const trace=record(traceValue)??{};const seed=numberOrNull(trace.seed);if(seed===null||trace.trace_rerun_failed)continue;
    const key=`${direction}:${seed}`;if(seen.has(key))continue;seen.add(key);
    rows.push({direction,seed,outcome:candidateOutcome(direction,trace.winner)});
   }
  }
 }
 return rows;
}

function diverseFirst(rows:BattleExampleRequest[],count:number):BattleExampleRequest[]{
 const picked:BattleExampleRequest[]=[];
 for(const direction of ['forward','reverse'] as const){const row=rows.find(value=>value.direction===direction);if(row)picked.push(row);if(picked.length>=count)return picked;}
 for(const row of rows){if(!picked.some(value=>value.direction===row.direction&&value.seed===row.seed))picked.push(row);if(picked.length>=count)break;}
 return picked;
}

export function selectBattleExampleRequests(payload:Record<string,unknown>):BattleExampleRequest[]{
 const summary=buildBattleEvaluationSummary(payload),rows=representativeRows(payload),winRows=rows.filter(row=>row.outcome==='win'),lossRows=rows.filter(row=>row.outcome==='loss');
 if(summary.completedBattles>0&&summary.wins===summary.completedBattles)return diverseFirst(winRows,1);
 return [...diverseFirst(winRows,2),...diverseFirst(lossRows,2)];
}

export function attachBattleEvaluation<T extends Record<string,unknown>>(payload:T,summary:BattleEvaluationSummary,examples:StoredBattleExample[]):T&{battle_evaluation:{schemaVersion:1;summary:BattleEvaluationSummary;examples:StoredBattleExample[]}}{
 return {...payload,battle_evaluation:{schemaVersion:1,summary,examples}};
}

export function parseBattleEvaluation(payload:Record<string,unknown>):{summary:BattleEvaluationSummary;examples:StoredBattleExample[]}|undefined{
 const value=record(payload.battle_evaluation);if(!value||value.schemaVersion!==1)return undefined;
 const summary=record(value.summary);if(!summary)return undefined;
 const parsedSummary:BattleEvaluationSummary={requestedBattles:numberOr(summary.requestedBattles),completedBattles:numberOr(summary.completedBattles),wins:numberOr(summary.wins),losses:numberOr(summary.losses),draws:numberOr(summary.draws),winRate:numberOr(summary.winRate)};
 const examples=array(value.examples).flatMap(exampleValue=>{const example=record(exampleValue);const detail=record(example?.detail);const direction=example?.direction;const outcome=example?.outcome;const seed=numberOrNull(example?.seed);return example?.schemaVersion===1&&detail&&(direction==='forward'||direction==='reverse')&&(outcome==='win'||outcome==='loss'||outcome==='draw')&&seed!==null?[{schemaVersion:1,direction,outcome,seed,detail} as StoredBattleExample]:[];});
 return {summary:parsedSummary,examples};
}

export function extractRepresentativeTrace(payload:Record<string,unknown>,direction:BattleDirection):RepresentativeTrace|undefined{
 const sim=record(payload.sim),blocks=record(sim?.timeline_trace_blocks),directionBlocks=array(blocks?.[direction]);
 const firstBlock=record(directionBlocks[0]),representatives=array(firstBlock?.representative_traces),representative=record(representatives.find(value=>{const row=record(value);return row&&!row.trace_rerun_failed&&record(row.timeline_digest);})??representatives[0]),digest=record(representative?.timeline_digest);
 if(!representative||!digest)return undefined;
 const digestTurns=record(digest.action_order_digest)??{};
 const turns:ActionOrderTurn[]=Object.entries(digestTurns).map(([turnValue,rows])=>({
  turn:Number(turnValue),entries:array(rows).map((rowValue):ActionOrderEntry=>{
   const row=record(rowValue)??{};const raw:'A'|'B'=row.side==='B'?'B':'A';const side=canonicalSide(direction,raw);
   return {rank:numberOrNull(row.rank)??0,side,rawSide:raw,officer:stringOr(row.officer,'未確認'),role:'',effectiveSpeed:numberOrNull(row.effective_speed),baseSpeed:numberOrNull(row.base_speed),timedSpeedBonus:numberOrNull(row.timed_speed_bonus)??0,persistentSpeedBonus:numberOrNull(row.persistent_speed_bonus)??0};
  }).sort((a,b)=>a.rank-b.rank),
 })).filter(row=>Number.isFinite(row.turn)&&row.entries.length>0).sort((a,b)=>a.turn-b.turn);
 if(!turns.length)return undefined;
 return {source:'runtime_trace',direction,seed:numberOrNull(representative.seed),winner:canonicalWinner(direction,representative.winner),winReason:stringOr(representative.win_reason,'未確認'),hpDiff:numberOrNull(representative.hp_diff),turns,keyEvents:array(digest.key_events).map(value=>record(value)??{})};
}

export function buildInitialActionOrderTrace(snapshot:BattleSnapshot,direction:BattleDirection):RepresentativeTrace{
 const entries=[...snapshot.sides.A.officers,...snapshot.sides.B.officers].sort((a,b)=>{
  const speedA=a.actionOrderSpeed??Number.NEGATIVE_INFINITY,speedB=b.actionOrderSpeed??Number.NEGATIVE_INFINITY;
  return speedB-speedA||a.side.localeCompare(b.side)||a.slot-b.slot;
 }).map((officer,index):ActionOrderEntry=>({rank:index+1,side:officer.side,rawSide:rawSide(direction,officer.side),officer:officer.name,role:officer.role,effectiveSpeed:officer.actionOrderSpeed,baseSpeed:officer.allocated.speed,timedSpeedBonus:0,persistentSpeedBonus:0}));
 return {source:'initial_speed_snapshot',direction,seed:null,winner:null,winReason:'代表試行の詳細trace未取得',hpDiff:null,turns:[{turn:1,entries}],keyEvents:[]};
}

export function enrichTraceRoles(trace:RepresentativeTrace,snapshot:BattleSnapshot|undefined):RepresentativeTrace{
 if(!snapshot)return trace;
 return {...trace,turns:trace.turns.map(turn=>({...turn,entries:turn.entries.map(entry=>{const officer=snapshot.sides[entry.side].officers.find(value=>value.name===entry.officer);return {...entry,role:officer?.role??entry.role};})}))};
}

function roleFor(snapshot:BattleSnapshot|undefined,side:BattleSide,name:string):string{return snapshot?.sides[side].officers.find(row=>row.name===name)?.role??'';}

function actionOrderFromTurn(turn:Record<string,unknown>,direction:BattleDirection,snapshot:BattleSnapshot|undefined):ActionOrderEntry[]{
 return array(turn.action_order).map((rowValue):ActionOrderEntry=>{const row=record(rowValue)??{};const raw:'A'|'B'=row.side==='B'?'B':'A';const side=canonicalSide(direction,raw);const officer=stringOr(row.officer,'未確認');return {rank:numberOr(row.rank),side,rawSide:raw,officer,role:roleFor(snapshot,side,officer),effectiveSpeed:numberOrNull(row.effective_speed),baseSpeed:numberOrNull(row.base_speed),timedSpeedBonus:numberOr(row.timed_speed_bonus),persistentSpeedBonus:numberOr(row.persistent_speed_bonus)};}).sort((a,b)=>a.rank-b.rank);
}

function troopRows(scoreboardValue:unknown,direction:BattleDirection,snapshot:BattleSnapshot|undefined):TroopRow[]{
 const scoreboard=record(scoreboardValue);if(!scoreboard)return [];
 const rows:TroopRow[]=[];
 for(const raw of ['A','B'] as const){const side=canonicalSide(direction,raw),value=record(scoreboard[raw]);for(const officerValue of array(value?.officers)){const officer=record(officerValue)??{},name=stringOr(officer.name,'未確認');rows.push({side,officer:name,role:stringOr(officer.role,roleFor(snapshot,side,name)),hp:numberOr(officer.hp),maxHp:numberOr(officer.max_hp,10000)});}}
 return rows.sort((a,b)=>a.side.localeCompare(b.side)||roles.indexOf(a.role as typeof roles[number])-roles.indexOf(b.role as typeof roles[number]));
}

type ParsedLog={index:number;turn:number;rawSide?:'A'|'B';actor?:string;body:string;text:string};
type DamageHint={index:number;turn:number;rawSide:'A'|'B';actor:string;source:string;targetRaw:'A'|'B';target:string;amount:number};
type HealHint={index:number;turn:number;rawSide:'A'|'B';actor:string;source:string;target:string;amount:number};

function parseLogLine(text:string,index:number):ParsedLog|undefined{
 const match=text.match(/^T(\d+)\s+(?:([AB]):([^\s]+)\s+)?(.+)$/);if(!match)return undefined;
 return {index,turn:Number(match[1]),...(match[2]?{rawSide:match[2] as 'A'|'B'}:{}),...(match[3]?{actor:match[3]}:{}),body:match[4]??'',text};
}

function buildHints(lines:ParsedLog[]):{damage:DamageHint[];heal:HealHint[]}{
 const damage:DamageHint[]=[],heal:HealHint[]=[];
 for(const line of lines){if(!line.rawSide||!line.actor)continue;
  const damageMatch=line.body.match(/^(.+?)\s+->\s+([AB]):([^\s]+)\s+([0-9]+(?:\.[0-9]+)?)$/);if(damageMatch)damage.push({index:line.index,turn:line.turn,rawSide:line.rawSide,actor:line.actor,source:damageMatch[1]??'',targetRaw:damageMatch[2] as 'A'|'B',target:damageMatch[3]??'',amount:Number(damageMatch[4])});
  const healMatch=line.body.match(/^(.+?)\s+heal\s+([^\s]+)\s+([0-9]+(?:\.[0-9]+)?)$/);if(healMatch)heal.push({index:line.index,turn:line.turn,rawSide:line.rawSide,actor:line.actor,source:healMatch[1]??'',target:healMatch[2]??'',amount:Number(healMatch[3])});
 }
 return {damage,heal};
}

function closestDamageHint(hints:DamageHint[],line:ParsedLog,source:string,targetRaw:'A'|'B',target:string,amount:number):DamageHint|undefined{
 return hints.filter(hint=>hint.turn===line.turn&&hint.targetRaw===targetRaw&&hint.target===target&&Math.abs(hint.amount-amount)<1&&((hint.source.includes(source)||source.includes(hint.source))||source==='DOT')).sort((a,b)=>Math.abs(a.index-line.index)-Math.abs(b.index-line.index))[0];
}
function closestHealHint(hints:HealHint[],line:ParsedLog,source:string,target:string,amount:number):HealHint|undefined{
 return hints.filter(hint=>hint.turn===line.turn&&hint.target===target&&Math.abs(hint.amount-amount)<1&&(hint.source.includes(source)||source.includes(hint.source))).sort((a,b)=>Math.abs(a.index-line.index)-Math.abs(b.index-line.index))[0];
}

function displayableAction(line:ParsedLog):{kind:BattleTimelineEvent['kind'];description:string;source:string}|undefined{
 const body=line.body;
 if(body.includes('ACTION_ORDER')||body.includes('damage_formula=')||body.includes('損害内訳')||body.includes('負傷兵回復')||body.includes('残兵与ダメージ係数=')||body.includes('damage_derived_recovery')||body.includes('回復蓄積+')||body.includes('wounded_remain=')||body.includes('battle_dead='))return undefined;
 if(/^.+?\s+->\s+[AB]:[^\s]+\s+[0-9]+(?:\.[0-9]+)?$/.test(body)||/^.+?\s+heal\s+[^\s]+\s+[0-9]+(?:\.[0-9]+)?$/.test(body))return undefined;
 if(body.includes('activated rate=')||body.includes('準備開始')||body.includes('準備完了'))return {kind:'activation',description:body,source:line.actor??'戦法'};
 if(body.includes('行動阻害')||body.includes('通常攻撃阻害')||body.includes('skipped(no_normal_attack)'))return {kind:'blocked',description:body,source:line.actor??'行動'};
 if(body.includes('cleanse')||body.includes('浄化'))return {kind:'control',description:body,source:line.actor??'浄化'};
 if(body.includes('->')&&/[無策封撃恐慌混乱威圧挑発麻痺回避不可通常攻撃不可]/.test(body))return {kind:'control',description:body,source:line.actor??'制御'};
 if(body.includes('buff applied')||body.includes('連撃通常攻撃')||body.includes('会心')||body.includes('奇策')||body.includes('DOT')||body.includes('挑発誘導'))return {kind:'action',description:body,source:line.actor??'行動'};
 return undefined;
}

function parseTurnEvents(lines:ParsedLog[],turn:number,direction:BattleDirection,start:TroopRow[],end:TroopRow[]):BattleTimelineEvent[]{
 const state=new Map<string,{hp:number;maxHp:number}>();for(const row of start)state.set(troopKey(row.side,row.officer),{hp:row.hp,maxHp:row.maxHp});
 const hints=buildHints(lines),events:BattleTimelineEvent[]=[];let serial=0;
 for(const line of lines.filter(value=>value.turn===turn)){
  const damage=line.body.match(/^損害内訳 source=(.+?) loss=([0-9]+(?:\.[0-9]+)?)/);
  if(damage&&line.rawSide&&line.actor){const source=damage[1]??'損害',amount=Number(damage[2]),hint=closestDamageHint(hints.damage,line,source,line.rawSide,line.actor,amount),targetSide=canonicalSide(direction,line.rawSide),actorSide=hint?canonicalSide(direction,hint.rawSide):undefined,key=troopKey(targetSide,line.actor),current=state.get(key),before=current?.hp??0,after=Math.max(0,before-amount);if(current)current.hp=after;events.push({id:`${turn}-${serial++}`,index:line.index,turn,kind:'damage',...(actorSide?{side:actorSide}:{}),actor:hint?.actor??source,targetSide,target:line.actor,source,description:`${hint?.actor??source}：${source} → ${line.actor}`,delta:-amount,before,after});continue;}
  const heal=line.body.match(/^負傷兵回復 source=(.+?) heal=([0-9]+(?:\.[0-9]+)?)/);
  if(heal&&line.rawSide&&line.actor){const source=heal[1]??'回復',amount=Number(heal[2]),hint=closestHealHint(hints.heal,line,source,line.actor,amount),targetSide=canonicalSide(direction,line.rawSide),actorSide=hint?canonicalSide(direction,hint.rawSide):targetSide,key=troopKey(targetSide,line.actor),current=state.get(key),before=current?.hp??0,after=Math.min(current?.maxHp??10000,before+amount);if(current)current.hp=after;events.push({id:`${turn}-${serial++}`,index:line.index,turn,kind:'heal',side:actorSide,actor:hint?.actor??source,targetSide,target:line.actor,source,description:`${hint?.actor??source}：${source} → ${line.actor}`,delta:amount,before,after});continue;}
  const action=displayableAction(line);if(action){const side=line.rawSide?canonicalSide(direction,line.rawSide):undefined;events.push({id:`${turn}-${serial++}`,index:line.index,turn,kind:action.kind,...(side?{side}:{}),...(line.actor?{actor:line.actor}:{}),source:action.source,description:action.description});}
 }
 let reconcileIndex=(lines.at(-1)?.index??0)+1;
 for(const row of end){const key=troopKey(row.side,row.officer),current=state.get(key),before=current?.hp??row.hp;if(Math.abs(before-row.hp)>=0.5){events.push({id:`${turn}-reconcile-${serial++}`,index:reconcileIndex++,turn,kind:'reconcile',targetSide:row.side,target:row.officer,source:'runtime確定兵数',description:`${row.officer}の兵数をターン終了時のruntime確定値へ同期`,delta:row.hp-before,before,after:row.hp});if(current)current.hp=row.hp;}}
 return events.sort((a,b)=>a.index-b.index);
}

function finalScoreboardForTurn(detail:Record<string,unknown>,turn:number,endedTurn:number):unknown{return turn===endedTurn?detail.final_scoreboard:undefined;}

function exampleView(example:StoredBattleExample,snapshot:BattleSnapshot|undefined,index:number):BattleExampleView{
 const detail=example.detail,direction=example.direction,turnMap=record(detail.turns)??{},endedTurn=Math.max(0,Math.min(8,numberOr(detail.ended_turn))),logs=array(detail.logs).map(stringOr),parsedLogs=logs.map(parseLogLine).filter((value):value is ParsedLog=>Boolean(value));
 const turns:BattleTurnView[]=[];let previousEnd:TroopRow[]=[];
 for(let turn=1;turn<=8;turn++){
  const value=record(turnMap[String(turn)]);const played=Boolean(value)&&turn<=endedTurn;
  const start=value?troopRows(value.scoreboard_start,direction,snapshot):(previousEnd.length?previousEnd:[]);
  const endValue=value?.scoreboard_end??finalScoreboardForTurn(detail,turn,endedTurn);const end=endValue?troopRows(endValue,direction,snapshot):(start.length?start:previousEnd);
  const actionOrder=value?actionOrderFromTurn(value,direction,snapshot):[];
  const events=played?parseTurnEvents(parsedLogs,turn,direction,start,end):[];
  turns.push({turn,status:played?'played':'not_reached',actionOrder,startTroops:start,endTroops:end,events});if(end.length)previousEnd=end;
 }
 return {id:`${example.outcome}-${example.direction}-${example.seed}-${index}`,outcome:example.outcome,direction,seed:example.seed,winner:canonicalWinner(direction,detail.winner),winReason:stringOr(detail.win_reason,'未確認'),hpDiff:numberOrNull(detail.hp_diff),endedTurn,turns};
}

export function parseBattleExamples(payload:Record<string,unknown>,snapshot:BattleSnapshot|undefined):BattleExampleView[]{
 const evaluation=parseBattleEvaluation(payload);return evaluation?evaluation.examples.map((example,index)=>exampleView(example,snapshot,index)):[];
}

export function formationsForBattleResult(log:BattleResult,formations:readonly Formation[]):[Formation|undefined,Formation|undefined]{return [formations.find(value=>value.id===log.allyId),formations.find(value=>value.id===log.enemyId)];}

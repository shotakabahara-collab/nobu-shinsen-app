import type {BattleResult,Formation} from '../domain/schemas';
import type {CanonicalOfficerStatsCatalog} from '../services/canonicalOfficerStatsCatalog';
import {findCanonicalOfficerStat} from '../services/canonicalOfficerStatsCatalog';

export type BattleSide='A'|'B';
export type StatValues={force:number|null;intel:number|null;lead:number|null;speed:number|null};
export type BattleOfficerSnapshot={
 side:BattleSide;formationName:string;troopType:string;troopLevel:number;role:'大将'|'副将1'|'副将2';slot:0|1|2;name:string;limitBreak:number;troops:number;
 inherentSkill:string;equippedSkills:[string,string];allocationPoints:number|null;base:StatValues;allocated:StatValues;actionOrderSpeed:number|null;statState:string;
};
export type BattleSideSnapshot={side:BattleSide;formationId:string;formationName:string;troopType:string;troopLevel:number;officers:[BattleOfficerSnapshot,BattleOfficerSnapshot,BattleOfficerSnapshot]};
export type BattleSnapshot={schemaVersion:1;source:'canonical_officer_stats_catalog';sides:{A:BattleSideSnapshot;B:BattleSideSnapshot}};
export type ActionOrderEntry={rank:number;side:BattleSide;rawSide:'A'|'B';officer:string;role:string;effectiveSpeed:number|null;baseSpeed:number|null;timedSpeedBonus:number;persistentSpeedBonus:number};
export type ActionOrderTurn={turn:number;entries:ActionOrderEntry[]};
export type RepresentativeTrace={source:'runtime_trace'|'initial_speed_snapshot';direction:'forward'|'reverse';seed:number|null;winner:BattleSide|null;winReason:string;hpDiff:number|null;turns:ActionOrderTurn[];keyEvents:Record<string,unknown>[]};
export type BattleSummary={requestedBattles:number;completedBattles:number;wins:number;losses:number;draws:number;winRate:number;perDirectionBattles:number;runtimeFailures:number};
export type TroopChange={turn:number;side:BattleSide;officer:string;source:string;before:number;after:number;delta:number;kind:'loss'|'recovery'};
export type BattleActionEvent={sequence:number;side:BattleSide;actor:string;type:string;text:string;troopChanges:TroopChange[]};
export type BattleTroopOfficer={side:BattleSide;role:string;name:string;troops:number;maxTroops:number;alive:boolean;isCommander:boolean};
export type BattleTroopTeam={side:BattleSide;totalTroops:number;officers:BattleTroopOfficer[]};
export type BattleTroopBoard={A:BattleTroopTeam;B:BattleTroopTeam};
export type BattleExampleTurn={turn:number;played:boolean;status:'played'|'not_played_battle_ended';actionOrder:ActionOrderEntry[];events:BattleActionEvent[];start:BattleTroopBoard|null;end:BattleTroopBoard|null};
export type BattleExample={schemaVersion:1;direction:'forward'|'reverse';seed:number;outcome:'win'|'loss'|'draw';winner:BattleSide|'draw';winReason:string;endedTurn:number;maxTurns:8;hpDiff:number;turns:BattleExampleTurn[]};

const roles=['大将','副将1','副将2'] as const;
const emptyStats=():StatValues=>({force:null,intel:null,lead:null,speed:null});
const record=(value:unknown):Record<string,unknown>|undefined=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const array=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const numberOrNull=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:null;
const stringOr=(value:unknown,fallback=''):string=>typeof value==='string'?value:fallback;
const sideOrNull=(value:unknown):BattleSide|null=>value==='A'||value==='B'?value:null;

export function parseBattleSummary(payload:Record<string,unknown>):BattleSummary|undefined{
 const row=record(payload.battle_summary);if(!row)return undefined;
 const requestedBattles=numberOrNull(row.requestedBattles),completedBattles=numberOrNull(row.completedBattles),wins=numberOrNull(row.wins),losses=numberOrNull(row.losses),draws=numberOrNull(row.draws),winRate=numberOrNull(row.winRate),perDirectionBattles=numberOrNull(row.perDirectionBattles),runtimeFailures=numberOrNull(row.runtimeFailures);
 if([requestedBattles,completedBattles,wins,losses,draws,winRate,perDirectionBattles,runtimeFailures].some(value=>value===null))return undefined;
 return {requestedBattles:requestedBattles!,completedBattles:completedBattles!,wins:wins!,losses:losses!,draws:draws!,winRate:winRate!,perDirectionBattles:perDirectionBattles!,runtimeFailures:runtimeFailures!};
}

function parseTroopTeam(value:unknown,side:BattleSide):BattleTroopTeam|undefined{
 const row=record(value),totalTroops=numberOrNull(row?.totalTroops);if(!row||totalTroops===null)return undefined;
 const officers=array(row.officers).map(value=>{
  const officer=record(value),troops=numberOrNull(officer?.troops),maxTroops=numberOrNull(officer?.maxTroops);if(!officer||troops===null||maxTroops===null)return undefined;
  return {side,role:stringOr(officer.role),name:stringOr(officer.name,'未確認'),troops,maxTroops,alive:Boolean(officer.alive),isCommander:Boolean(officer.isCommander)} satisfies BattleTroopOfficer;
 }).filter((value):value is BattleTroopOfficer=>Boolean(value));
 return {side,totalTroops,officers};
}

function parseTroopBoard(value:unknown):BattleTroopBoard|null{
 const row=record(value);if(!row)return null;const A=parseTroopTeam(row.A,'A'),B=parseTroopTeam(row.B,'B');return A&&B?{A,B}:null;
}

function parseTroopChange(value:unknown):TroopChange|undefined{
 const row=record(value),turn=numberOrNull(row?.turn),side=sideOrNull(row?.side),before=numberOrNull(row?.before),after=numberOrNull(row?.after),delta=numberOrNull(row?.delta),kind=row?.kind;
 if(!row||turn===null||!side||before===null||after===null||delta===null||(kind!=='loss'&&kind!=='recovery'))return undefined;
 return {turn,side,officer:stringOr(row.officer,'未確認'),source:stringOr(row.source,'未確認'),before,after,delta,kind};
}

function parseActionOrder(value:unknown,direction:'forward'|'reverse'):ActionOrderEntry[]{
 return array(value).map(rowValue=>{
  const row=record(rowValue),side=sideOrNull(row?.side),rank=numberOrNull(row?.rank);if(!row||!side||rank===null)return undefined;
  return {rank,side,rawSide:rawSide(direction,side),officer:stringOr(row.officer,'未確認'),role:stringOr(row.role),effectiveSpeed:numberOrNull(row.effectiveSpeed),baseSpeed:numberOrNull(row.baseSpeed),timedSpeedBonus:numberOrNull(row.timedSpeedBonus)??0,persistentSpeedBonus:numberOrNull(row.persistentSpeedBonus)??0} satisfies ActionOrderEntry;
 }).filter((value):value is ActionOrderEntry=>Boolean(value)).sort((a,b)=>a.rank-b.rank);
}

function parseExampleTurn(value:unknown,direction:'forward'|'reverse'):BattleExampleTurn|undefined{
 const row=record(value),turn=numberOrNull(row?.turn);if(!row||turn===null||turn<1||turn>8)return undefined;
 const events=array(row.events).map(value=>{
  const event=record(value),sequence=numberOrNull(event?.sequence),side=sideOrNull(event?.side);if(!event||sequence===null||!side)return undefined;
  return {sequence,side,actor:stringOr(event.actor,'未確認'),type:stringOr(event.type,'status'),text:stringOr(event.text,'未確認'),troopChanges:array(event.troopChanges).map(parseTroopChange).filter((change):change is TroopChange=>Boolean(change))} satisfies BattleActionEvent;
 }).filter((value):value is BattleActionEvent=>Boolean(value)).sort((a,b)=>a.sequence-b.sequence);
 return {turn,played:Boolean(row.played),status:row.status==='not_played_battle_ended'?'not_played_battle_ended':'played',actionOrder:parseActionOrder(row.actionOrder,direction),events,start:parseTroopBoard(row.start),end:parseTroopBoard(row.end)};
}

export function parseBattleExamples(payload:Record<string,unknown>):BattleExample[]{
 return array(payload.battle_examples).map(value=>{
  const row=record(value),direction=row?.direction,outcome=row?.outcome,winner=row?.winner,seed=numberOrNull(row?.seed),endedTurn=numberOrNull(row?.endedTurn),hpDiff=numberOrNull(row?.hpDiff);
  if(!row||row.schemaVersion!==1||(direction!=='forward'&&direction!=='reverse')||(outcome!=='win'&&outcome!=='loss'&&outcome!=='draw')||(winner!=='A'&&winner!=='B'&&winner!=='draw')||seed===null||endedTurn===null||hpDiff===null)return undefined;
  const turns=array(row.turns).map(value=>parseExampleTurn(value,direction)).filter((turn):turn is BattleExampleTurn=>Boolean(turn)).sort((a,b)=>a.turn-b.turn);
  if(turns.length!==8||turns.some((turn,index)=>turn.turn!==index+1))return undefined;
  return {schemaVersion:1,direction,seed,outcome,winner,winReason:stringOr(row.winReason,'未確認'),endedTurn,maxTurns:8,hpDiff,turns} satisfies BattleExample;
 }).filter((value):value is BattleExample=>Boolean(value));
}

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

function canonicalSide(direction:'forward'|'reverse',raw:'A'|'B'):BattleSide{return direction==='forward'?raw:raw==='A'?'B':'A';}
function rawSide(direction:'forward'|'reverse',canonical:BattleSide):'A'|'B'{return direction==='forward'?canonical:canonical==='A'?'B':'A';}
function canonicalWinner(direction:'forward'|'reverse',raw:unknown):BattleSide|null{return raw==='A'||raw==='B'?canonicalSide(direction,raw):null;}

export function extractRepresentativeTrace(payload:Record<string,unknown>,direction:'forward'|'reverse'):RepresentativeTrace|undefined{
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

export function buildInitialActionOrderTrace(snapshot:BattleSnapshot,direction:'forward'|'reverse'):RepresentativeTrace{
 const entries=[...snapshot.sides.A.officers,...snapshot.sides.B.officers].sort((a,b)=>{
  const speedA=a.actionOrderSpeed??Number.NEGATIVE_INFINITY,speedB=b.actionOrderSpeed??Number.NEGATIVE_INFINITY;
  return speedB-speedA||a.side.localeCompare(b.side)||a.slot-b.slot;
 }).map((officer,index):ActionOrderEntry=>({rank:index+1,side:officer.side,rawSide:rawSide(direction,officer.side),officer:officer.name,role:officer.role,effectiveSpeed:officer.actionOrderSpeed,baseSpeed:officer.allocated.speed,timedSpeedBonus:0,persistentSpeedBonus:0}));
 return {source:'initial_speed_snapshot',direction,seed:null,winner:null,winReason:'代表試行の詳細trace未取得',hpDiff:null,turns:[{turn:1,entries}],keyEvents:[]};
}

export function enrichTraceRoles(trace:RepresentativeTrace,snapshot:BattleSnapshot|undefined):RepresentativeTrace{
 if(!snapshot)return trace;
 return {...trace,turns:trace.turns.map(turn=>({...turn,entries:turn.entries.map(entry=>{
  const officer=snapshot.sides[entry.side].officers.find(value=>value.name===entry.officer);return {...entry,role:officer?.role??entry.role};
 })}))};
}

export function formationsForBattleResult(log:BattleResult,formations:readonly Formation[]):[Formation|undefined,Formation|undefined]{return [formations.find(value=>value.id===log.allyId),formations.find(value=>value.id===log.enemyId)];}

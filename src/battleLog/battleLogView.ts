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
export type TroopPoint={side:BattleSide;officer:string;troops:number};
export type TroopChange={side:BattleSide;officer:string;before:number;after:number;delta:number;kind:'troops'|'reserve';source:string};
export type BattleExampleAction=ActionOrderEntry&{events:string[];troopChanges:TroopChange[]};
export type BattleExampleTurn={turn:number;status:'active'|'battle_ended';startTroops:TroopPoint[];endTroops:TroopPoint[];turnStartChanges:TroopChange[];actions:BattleExampleAction[];turnEndChanges:TroopChange[]};
export type BattleExample={outcome:'win'|'loss';direction:'forward'|'reverse';seed:number;winner:BattleSide|'draw';winReason:string;endedTurn:number;maxTurns:8;hpDiff:number|null;turns:BattleExampleTurn[];error?:string};
export type BattleExampleSet={schemaVersion:1;trialsPerDirection:number;directions:2;completedTrials:number;candidateWins:number;candidateLosses:number;draws:number;selectionPolicy:string;examples:BattleExample[]};

const roles=['大将','副将1','副将2'] as const;
const emptyStats=():StatValues=>({force:null,intel:null,lead:null,speed:null});
const record=(value:unknown):Record<string,unknown>|undefined=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const array=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const numberOrNull=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:null;
const stringOr=(value:unknown,fallback=''):string=>typeof value==='string'?value:fallback;

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

export function parseBattleExamples(payload:Record<string,unknown>):BattleExampleSet|undefined{
 const candidate=record(payload.battle_examples);if(!candidate||candidate.schemaVersion!==1||candidate.directions!==2)return undefined;
 const examples=array(candidate.examples);if(!examples.every(value=>record(value)&&Array.isArray(record(value)?.turns)))return undefined;
 return candidate as unknown as BattleExampleSet;
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

export function enrichExampleRoles(example:BattleExample,snapshot:BattleSnapshot|undefined):BattleExample{
 if(!snapshot)return example;
 return {...example,turns:example.turns.map(turn=>({...turn,actions:turn.actions.map(action=>{
  const officer=snapshot.sides[action.side].officers.find(value=>value.name===action.officer);return {...action,role:officer?.role??action.role};
 })}))};
}

export function formationsForBattleResult(log:BattleResult,formations:readonly Formation[]):[Formation|undefined,Formation|undefined]{return [formations.find(value=>value.id===log.allyId),formations.find(value=>value.id===log.enemyId)];}

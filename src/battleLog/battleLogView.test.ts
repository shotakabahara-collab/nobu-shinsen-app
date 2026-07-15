import {describe,expect,it} from 'vitest';
import type {Formation} from '../domain/schemas';
import type {CanonicalOfficerStatsCatalog} from '../services/canonicalOfficerStatsCatalog';
import {buildBattleSnapshot,enrichTraceRoles,extractRepresentativeTrace,parseBattleExamples,parseBattleSummary} from './battleLogView';

const now='2026-07-15T00:00:00.000Z';
const warrior=(index:number,name:string,limitBreak:number,skills:[string,string])=>({id:`00000000-0000-4000-8000-0000000000${String(index).padStart(2,'0')}`,name,limitBreak,inherentSkill:`${name}固有`,equippedSkills:skills});
const formation=(id:string,name:string,names:[string,string,string]):Formation=>({id,name,kind:'ally',troopType:'騎馬',troopLevel:10,troops:10000,createdAt:now,updatedAt:now,warriors:[warrior(Number(id.slice(-2))+1,names[0],2,['戦法1','戦法2']),warrior(Number(id.slice(-2))+2,names[1],1,['戦法3','戦法4']),warrior(Number(id.slice(-2))+3,names[2],3,['戦法5','戦法6'])]});
const A=formation('00000000-0000-4000-8000-000000000010','編成A',['甲','乙','丙']);
const B=formation('00000000-0000-4000-8000-000000000020','編成B',['丁','戊','己']);
const records=[...A.warriors,...B.warriors].map((row,index)=>({id:String(index+1),name:row.name,awaken:row.limitBreak,inherentSkill:`${row.name}正本固有`,allocationPoints:50+row.limitBreak*10,base:{force:100+index,intel:110+index,lead:120+index,speed:130+index},allocated:{force:150+index,intel:160+index,lead:170+index,speed:180+index},actionOrderSpeed:180+index,statState:'VERIFIED'}));
const catalog:CanonicalOfficerStatsCatalog={schemaVersion:1,canonicalVersion:'test',canonicalArchiveSha256:'a'.repeat(64),recordCount:records.length,records};

const action=(rank:number,side:'A'|'B',officer:string,speed:number)=>({rank,side,idx:0,officer,effective_speed:speed,base_speed:speed-5,timed_speed_bonus:3,persistent_speed_bonus:2});
const payload={sim:{timeline_trace_blocks:{
 forward:[{representative_traces:[{seed:10,winner:'A',win_reason:'enemy_defeated',hp_diff:120,timeline_digest:{action_order_digest:{'1':[action(1,'B','丁',210),action(2,'A','甲',205),action(3,'B','戊',200),action(4,'A','乙',195),action(5,'B','己',190),action(6,'A','丙',185)]},key_events:[]}}]}],
 reverse:[{representative_traces:[{seed:11,winner:'A',win_reason:'enemy_defeated',hp_diff:80,timeline_digest:{action_order_digest:{'1':[action(1,'A','丁',210),action(2,'B','甲',205),action(3,'A','戊',200),action(4,'B','乙',195),action(5,'A','己',190),action(6,'B','丙',185)]},key_events:[]}}]}],
}}};

describe('battleLogView',()=>{
 it('stores all six officers with canonical allocated stats',()=>{
  const snapshot=buildBattleSnapshot(A,B,catalog);
  expect(snapshot.sides.A.officers).toHaveLength(3);expect(snapshot.sides.B.officers).toHaveLength(3);
  expect(snapshot.sides.A.officers[0]).toMatchObject({name:'甲',role:'大将',limitBreak:2,allocated:{force:150,intel:160,lead:170,speed:180},actionOrderSpeed:180,inherentSkill:'甲正本固有'});
  expect(snapshot.sides.B.officers[2]).toMatchObject({name:'己',role:'副将2',allocated:{speed:185}});
 });

 it('returns the actual six-officer forward order by runtime rank',()=>{
  const snapshot=buildBattleSnapshot(A,B,catalog),trace=enrichTraceRoles(extractRepresentativeTrace(payload,'forward')!,snapshot);
  expect(trace.winner).toBe('A');expect(trace.turns[0]?.entries).toHaveLength(6);
  expect(trace.turns[0]?.entries.map(row=>`${row.rank}:${row.side}:${row.officer}:${row.role}`)).toEqual(['1:B:丁:大将','2:A:甲:大将','3:B:戊:副将1','4:A:乙:副将1','5:B:己:副将2','6:A:丙:副将2']);
  expect(trace.turns[0]?.entries[0]).toMatchObject({effectiveSpeed:210,baseSpeed:205,timedSpeedBonus:3,persistentSpeedBonus:2});
 });

 it('normalizes reverse raw sides back to the registered A and B formations',()=>{
  const snapshot=buildBattleSnapshot(A,B,catalog),trace=enrichTraceRoles(extractRepresentativeTrace(payload,'reverse')!,snapshot);
  expect(trace.winner).toBe('B');
  expect(trace.turns[0]?.entries.map(row=>`${row.side}:${row.officer}`)).toEqual(['B:丁','A:甲','B:戊','A:乙','B:己','A:丙']);
 });

 it('parses the 100-battle summary and exactly eight detailed turns',()=>{
  const board={A:{side:'A',totalTroops:30000,officers:[]},B:{side:'B',totalTroops:30000,officers:[]}};
  const turns=Array.from({length:8},(_,index)=>({turn:index+1,played:index<3,status:index<3?'played':'not_played_battle_ended',actionOrder:index<3?[{rank:1,side:'A',officer:'甲',role:'大将',effectiveSpeed:180,baseSpeed:180,timedSpeedBonus:0,persistentSpeedBonus:0}]:[],events:index===0?[{sequence:1,side:'A',actor:'甲',type:'action',text:'通常攻撃 -> B:丁 500',troopChanges:[{turn:1,side:'B',officer:'丁',source:'通常攻撃',before:10000,after:9500,delta:-500,kind:'loss'}]}]:[],start:index<3?board:null,end:index<3?board:null}));
  const detailed={battle_summary:{requestedBattles:100,completedBattles:100,wins:60,losses:40,draws:0,winRate:.6,perDirectionBattles:50,runtimeFailures:0},battle_examples:[{schemaVersion:1,direction:'forward',seed:1,outcome:'win',winner:'A',winReason:'commander_kill',endedTurn:3,maxTurns:8,hpDiff:100,turns}]};
  expect(parseBattleSummary(detailed)).toEqual({requestedBattles:100,completedBattles:100,wins:60,losses:40,draws:0,winRate:.6,perDirectionBattles:50,runtimeFailures:0});
  const examples=parseBattleExamples(detailed);expect(examples).toHaveLength(1);expect(examples[0]?.turns).toHaveLength(8);expect(examples[0]?.turns[0]?.events[0]?.troopChanges[0]).toMatchObject({officer:'丁',before:10000,after:9500,delta:-500});expect(examples[0]?.turns[7]?.played).toBe(false);
 });
});

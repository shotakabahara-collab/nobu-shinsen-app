import {describe,expect,it} from 'vitest';
import type {Formation} from '../domain/schemas';
import type {CanonicalOfficerStatsCatalog} from '../services/canonicalOfficerStatsCatalog';
import {buildBattleEvaluationSummary,buildBattleSnapshot,enrichTraceRoles,extractRepresentativeTrace,parseBattleExamples,selectBattleExampleRequests} from './battleLogView';

const now='2026-07-15T00:00:00.000Z';
const warrior=(index:number,name:string,limitBreak:number,skills:[string,string])=>({id:`00000000-0000-4000-8000-0000000000${String(index).padStart(2,'0')}`,name,limitBreak,inherentSkill:`${name}固有`,equippedSkills:skills});
const formation=(id:string,name:string,names:[string,string,string]):Formation=>({id,name,kind:'ally',troopType:'騎馬',troopLevel:10,troops:10000,createdAt:now,updatedAt:now,warriors:[warrior(Number(id.slice(-2))+1,names[0],2,['戦法1','戦法2']),warrior(Number(id.slice(-2))+2,names[1],1,['戦法3','戦法4']),warrior(Number(id.slice(-2))+3,names[2],3,['戦法5','戦法6'])]});
const A=formation('00000000-0000-4000-8000-000000000010','編成A',['甲','乙','丙']);
const B=formation('00000000-0000-4000-8000-000000000020','編成B',['丁','戊','己']);
const records=[...A.warriors,...B.warriors].map((row,index)=>({id:String(index+1),name:row.name,awaken:row.limitBreak,inherentSkill:`${row.name}正本固有`,allocationPoints:50+row.limitBreak*10,base:{force:100+index,intel:110+index,lead:120+index,speed:130+index},allocated:{force:150+index,intel:160+index,lead:170+index,speed:180+index},actionOrderSpeed:180+index,statState:'VERIFIED'}));
const catalog:CanonicalOfficerStatsCatalog={schemaVersion:1,canonicalVersion:'test',canonicalArchiveSha256:'a'.repeat(64),recordCount:records.length,records};

const action=(rank:number,side:'A'|'B',officer:string,speed:number)=>({rank,side,idx:0,officer,effective_speed:speed,base_speed:speed-5,timed_speed_bonus:3,persistent_speed_bonus:2});
const forwardTrace={seed:10,winner:'A',win_reason:'enemy_defeated',hp_diff:120,timeline_digest:{action_order_digest:{'1':[action(1,'B','丁',210),action(2,'A','甲',205),action(3,'B','戊',200),action(4,'A','乙',195),action(5,'B','己',190),action(6,'A','丙',185)]},key_events:[]}};
const reverseTrace={seed:11,winner:'A',win_reason:'enemy_defeated',hp_diff:80,timeline_digest:{action_order_digest:{'1':[action(1,'A','丁',210),action(2,'B','甲',205),action(3,'A','戊',200),action(4,'B','乙',195),action(5,'A','己',190),action(6,'B','丙',185)]},key_events:[]}};
const payload={win_rate:.58,sim:{
 forward:[{trials:50,completed_trials:50,left_wins:30,right_wins:18,draws:2}],
 reverse:[{trials:50,completed_trials:50,left_wins:20,right_wins:28,draws:2}],
 timeline_trace_blocks:{forward:[{representative_traces:[forwardTrace]}],reverse:[{representative_traces:[reverseTrace]}]},
}};

const board=(aHp=10000,bHp=10000)=>({
 A:{officers:[{role:'大将',name:'甲',hp:aHp,max_hp:10000},{role:'副将1',name:'乙',hp:10000,max_hp:10000},{role:'副将2',name:'丙',hp:10000,max_hp:10000}]},
 B:{officers:[{role:'大将',name:'丁',hp:bHp,max_hp:10000},{role:'副将1',name:'戊',hp:10000,max_hp:10000},{role:'副将2',name:'己',hp:10000,max_hp:10000}]},
});
const examplePayload={battle_evaluation:{schemaVersion:1,summary:{requestedBattles:100,completedBattles:100,wins:58,losses:38,draws:4,winRate:.58},examples:[
 {schemaVersion:1,direction:'forward',seed:10,outcome:'win',detail:{winner:'A',win_reason:'commander_kill',ended_turn:2,hp_diff:100,turns:{'1':{action_order:forwardTrace.timeline_digest.action_order_digest['1'],scoreboard_start:board(),scoreboard_end:board(9900,10000)},'2':{action_order:forwardTrace.timeline_digest.action_order_digest['1'],scoreboard_start:board(9900,10000),scoreboard_end:board(9950,9000)}},final_scoreboard:board(9950,9000),logs:['T1 B:丁 通常攻撃 -> A:甲 100','T1 A:甲 損害内訳 source=通常攻撃 loss=100 wounded+=100 battle_dead+0 wounded=100','T2 A:乙 回復 heal 甲 50','T2 A:甲 負傷兵回復 source=回復 heal=50 wounded_remain=50']}},
 {schemaVersion:1,direction:'reverse',seed:11,outcome:'loss',detail:{winner:'A',win_reason:'commander_kill',ended_turn:1,hp_diff:-500,turns:{'1':{action_order:reverseTrace.timeline_digest.action_order_digest['1'],scoreboard_start:board(),scoreboard_end:board(9500,10000)}},final_scoreboard:board(9500,10000),logs:['T1 A:丁 通常攻撃 -> B:甲 500','T1 B:甲 損害内訳 source=通常攻撃 loss=500 wounded+=500 battle_dead+0 wounded=500']}},
]}};

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

 it('counts 50 forward and 50 reverse battles and selects one win and one loss example',()=>{
  expect(buildBattleEvaluationSummary(payload)).toEqual({requestedBattles:100,completedBattles:100,wins:58,losses:38,draws:4,winRate:.58});
  expect(selectBattleExampleRequests(payload)).toEqual([{direction:'forward',seed:10,outcome:'win'},{direction:'reverse',seed:11,outcome:'loss'}]);
 });

 it('shows eight turn slots and follows damage and recovery troop changes',()=>{
  const examples=parseBattleExamples(examplePayload,buildBattleSnapshot(A,B,catalog));
  expect(examples).toHaveLength(2);expect(examples[0]?.turns).toHaveLength(8);
  expect(examples[0]?.turns[0]?.events.find(event=>event.kind==='damage')).toMatchObject({target:'甲',delta:-100,before:10000,after:9900});
  expect(examples[0]?.turns[1]?.events.find(event=>event.kind==='heal')).toMatchObject({target:'甲',delta:50,before:9900,after:9950});
  expect(examples[0]?.turns[2]?.status).toBe('not_reached');expect(examples[0]?.turns[7]?.turn).toBe(8);
 });
});

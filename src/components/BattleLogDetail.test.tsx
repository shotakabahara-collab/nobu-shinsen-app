import {fireEvent,render,screen,within} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import type {BattleResult} from '../domain/schemas';
import type {BattleSnapshot} from '../battleLog/battleLogView';
import {BattleLogDetail} from './BattleLogDetail';

const stats=(value:number)=>({force:value,intel:value+1,lead:value+2,speed:value+3});
const officer=(side:'A'|'B',slot:0|1|2,name:string,value:number)=>({side,formationName:`編成${side}`,troopType:'騎馬',troopLevel:10,role:(slot===0?'大将':slot===1?'副将1':'副将2') as '大将'|'副将1'|'副将2',slot,name,limitBreak:slot+1,troops:10000,inherentSkill:`${name}固有`,equippedSkills:[`${name}戦法1`,`${name}戦法2`] as [string,string],allocationPoints:60,base:stats(value-10),allocated:stats(value),actionOrderSpeed:value+3,statState:'VERIFIED'});
const snapshot:BattleSnapshot={schemaVersion:1,source:'canonical_officer_stats_catalog',sides:{
 A:{side:'A',formationId:'00000000-0000-4000-8000-000000000001',formationName:'編成A',troopType:'騎馬',troopLevel:10,officers:[officer('A',0,'甲',150),officer('A',1,'乙',140),officer('A',2,'丙',130)]},
 B:{side:'B',formationId:'00000000-0000-4000-8000-000000000002',formationName:'編成B',troopType:'弓',troopLevel:10,officers:[officer('B',0,'丁',160),officer('B',1,'戊',145),officer('B',2,'己',135)]},
}};
const entry=(rank:number,side:'A'|'B',name:string,speed:number)=>({rank,side,idx:0,officer:name,effective_speed:speed,base_speed:speed-4,timed_speed_bonus:2,persistent_speed_bonus:2});
const order=[entry(1,'B','丁',163),entry(2,'A','甲',153),entry(3,'B','戊',148),entry(4,'A','乙',143),entry(5,'B','己',138),entry(6,'A','丙',133)];
const board=(aHp=10000,bHp=10000)=>({A:{officers:[{role:'大将',name:'甲',hp:aHp,max_hp:10000},{role:'副将1',name:'乙',hp:10000,max_hp:10000},{role:'副将2',name:'丙',hp:10000,max_hp:10000}]},B:{officers:[{role:'大将',name:'丁',hp:bHp,max_hp:10000},{role:'副将1',name:'戊',hp:10000,max_hp:10000},{role:'副将2',name:'己',hp:10000,max_hp:10000}]}});
const oldPayload={battle_snapshot:snapshot,sim:{timeline_trace_blocks:{forward:[{representative_traces:[{seed:100,winner:'A',win_reason:'enemy_defeated',hp_diff:50,timeline_digest:{action_order_digest:{'1':order},key_events:[]}}]}],reverse:[{representative_traces:[{seed:101,winner:'B',win_reason:'enemy_defeated',hp_diff:-20,timeline_digest:{action_order_digest:{'1':order.map(row=>({...row,side:row.side==='A'?'B':'A'}))},key_events:[]}}]}]}}};
const detail=(winner:'A'|'B',ended:number,hpDiff:number,damage:number)=>({winner,win_reason:'commander_kill',ended_turn:ended,hp_diff:hpDiff,turns:{'1':{action_order:order,scoreboard_start:board(),scoreboard_end:board(10000-damage,10000)}},final_scoreboard:board(10000-damage,10000),logs:[`T1 B:丁 通常攻撃 -> A:甲 ${damage}`,`T1 A:甲 損害内訳 source=通常攻撃 loss=${damage} wounded+=${damage} battle_dead+0 wounded=${damage}`]});
const payload={battle_snapshot:snapshot,battle_evaluation:{schemaVersion:1,summary:{requestedBattles:100,completedBattles:100,wins:58,losses:38,draws:4,winRate:.58},examples:[{schemaVersion:1,direction:'forward',seed:100,outcome:'win',detail:detail('A',1,50,100)},{schemaVersion:1,direction:'reverse',seed:101,outcome:'loss',detail:detail('A',1,-20,200)}]}};
const baseLog={id:'00000000-0000-4000-8000-000000000003',allyId:snapshot.sides.A.formationId,enemyId:snapshot.sides.B.formationId,createdAt:'2026-07-15T00:00:00.000Z',status:'completed' as const,winRate:.6,hpDiff:50,trials:100,blocks:1,runtime:'runtime'};

describe('BattleLogDetail',()=>{
 it('shows all six officer stats and the legacy six-officer runtime action order',()=>{
  const log:BattleResult={...baseLog,trials:10,payload:oldPayload};render(<BattleLogDetail log={log} formations={[]} onClose={()=>{}}/>);
  const status=screen.getByRole('region',{name:'6武将ステータス'});expect(within(status).getAllByLabelText(/ステータス$/)).toHaveLength(6);
  expect(within(status).getByText('甲')).toBeVisible();expect(within(status).getByText('丁')).toBeVisible();
  const orderRegion=screen.getByRole('region',{name:'6武将 行動順'});expect(within(orderRegion).getByText('T1 行動順（6名）')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'逆方向 B左／A右'}));expect(within(orderRegion).getAllByRole('listitem')[0]).toHaveTextContent('B');
 });

 it('shows the 100-battle result, one win example, one loss example and T1 through T8',()=>{
  const log:BattleResult={...baseLog,payload};render(<BattleLogDetail log={log} formations={[]} onClose={()=>{}}/>);
  const summary=screen.getByRole('region',{name:'100戦結果'});expect(within(summary).getByText('100戦の勝率')).toBeVisible();expect(within(summary).getByText('58.0%')).toBeVisible();expect(within(summary).getByText('58')).toBeVisible();expect(within(summary).getByText('38')).toBeVisible();
  const examples=screen.getByRole('region',{name:'戦闘例'});expect(within(examples).getAllByText('勝ち例')).toHaveLength(1);expect(within(examples).getAllByText('負け例')).toHaveLength(1);
  expect(within(examples).getAllByText(/^T8.*戦闘終了済み$/)).toHaveLength(2);expect(within(examples).getByText('兵数 -100　10,000 → 9,900')).toBeVisible();
 });
});

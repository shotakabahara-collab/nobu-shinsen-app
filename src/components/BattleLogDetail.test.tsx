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
const oldPayload={battle_snapshot:snapshot,sim:{timeline_trace_blocks:{forward:[{representative_traces:[{seed:100,winner:'A',win_reason:'enemy_defeated',hp_diff:50,timeline_digest:{action_order_digest:{'1':[entry(1,'B','丁',163),entry(2,'A','甲',153),entry(3,'B','戊',148),entry(4,'A','乙',143),entry(5,'B','己',138),entry(6,'A','丙',133)]},key_events:[]}}]}],reverse:[{representative_traces:[{seed:101,winner:'B',win_reason:'enemy_defeated',hp_diff:-20,timeline_digest:{action_order_digest:{'1':[entry(1,'A','丁',163),entry(2,'B','甲',153),entry(3,'A','戊',148),entry(4,'B','乙',143),entry(5,'A','己',138),entry(6,'B','丙',133)]},key_events:[]}}]}]}}};
const oldLog:BattleResult={id:'00000000-0000-4000-8000-000000000003',allyId:snapshot.sides.A.formationId,enemyId:snapshot.sides.B.formationId,createdAt:'2026-07-15T00:00:00.000Z',status:'completed',winRate:.6,hpDiff:50,trials:10,blocks:1,runtime:'runtime',payload:oldPayload};

function detailedLog():BattleResult{
 const start=[{side:'A',officer:'甲',troops:10000},{side:'A',officer:'乙',troops:10000},{side:'A',officer:'丙',troops:10000},{side:'B',officer:'丁',troops:10000},{side:'B',officer:'戊',troops:10000},{side:'B',officer:'己',troops:10000}];
 const end=start.map(row=>row.officer==='丁'?{...row,troops:9000}:row);
 const active={turn:1,status:'active',startTroops:start,endTroops:end,turnStartEvents:['B:丁 水の如し -> A:甲 0'],turnStartChanges:[],actions:[{rank:1,side:'A',rawSide:'A',officer:'甲',role:'大将',effectiveSpeed:153,baseSpeed:153,timedSpeedBonus:0,persistentSpeedBonus:0,events:['A:甲 通常攻撃 -> B:丁 1000'],troopChanges:[{side:'B',officer:'丁',before:10000,after:9000,delta:-1000,kind:'troops',source:'通常攻撃'}]}],turnEndChanges:[]};
 const ended=(turn:number)=>({turn,status:'battle_ended',startTroops:end,endTroops:end,turnStartEvents:[],turnStartChanges:[],actions:[],turnEndChanges:[]});
 const example=(outcome:'win'|'loss',seed:number)=>({outcome,direction:'forward',seed,winner:outcome==='win'?'A':'B',winReason:'commander_kill',endedTurn:1,maxTurns:8,hpDiff:outcome==='win'?1000:-1000,turns:[active,...[2,3,4,5,6,7,8].map(ended)]});
 const payload={battle_snapshot:snapshot,battle_examples:{schemaVersion:1,trialsPerDirection:100,directions:2,completedTrials:200,candidateWins:120,candidateLosses:80,draws:0,selectionPolicy:'test',examples:[example('win',100),example('loss',200)]}};
 return {...oldLog,id:'00000000-0000-4000-8000-000000000004',trials:100,payload};
}

describe('BattleLogDetail',()=>{
 it('shows all six officer stats and the six-officer runtime action order for old logs',()=>{
  render(<BattleLogDetail log={oldLog} formations={[]} onClose={()=>{}}/>);
  const status=screen.getByRole('region',{name:'6武将ステータス'});expect(within(status).getAllByLabelText(/ステータス$/)).toHaveLength(6);
  expect(within(status).getByText('甲')).toBeVisible();expect(within(status).getByText('丁')).toBeVisible();
  const order=screen.getByRole('region',{name:'6武将 行動順'});expect(within(order).getByText('T1 行動順（6名）')).toBeVisible();
  const rows=within(order).getAllByRole('listitem');expect(rows).toHaveLength(6);expect(rows[0]).toHaveTextContent('丁');expect(rows[1]).toHaveTextContent('甲');
 });

 it('maps the reverse direction back to registered formation labels',()=>{
  render(<BattleLogDetail log={oldLog} formations={[]} onClose={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'逆方向 B左／A右'}));
  const rows=within(screen.getByRole('region',{name:'6武将 行動順'})).getAllByRole('listitem');expect(rows[0]).toHaveTextContent('B');expect(rows[0]).toHaveTextContent('丁');expect(rows[1]).toHaveTextContent('A');expect(rows[1]).toHaveTextContent('甲');
 });

 it('shows 100-run counts, one win and one loss example, T1-T8 actions and troop changes',()=>{
  render(<BattleLogDetail log={detailedLog()} formations={[]} onClose={()=>{}}/>);
  const rate=screen.getByRole('region',{name:'100戦勝率'});expect(rate).toHaveTextContent('60.0%');expect(rate).toHaveTextContent('完了200試行');expect(rate).toHaveTextContent('120');expect(rate).toHaveTextContent('80');
  const examples=screen.getByRole('region',{name:'勝敗別戦闘例'});
  expect(within(examples).getByRole('button',{name:'勝ち例1'})).toBeVisible();expect(within(examples).getByRole('button',{name:'負け例1'})).toBeVisible();expect(within(examples).queryByRole('button',{name:'勝ち例2'})).not.toBeInTheDocument();expect(within(examples).queryByRole('button',{name:'負け例2'})).not.toBeInTheDocument();
  expect(within(examples).getByText('T1',{exact:true})).toBeVisible();expect(within(examples).getByText('T8',{exact:true})).toBeVisible();expect(within(examples).getByText(/水の如し/)).toBeVisible();expect(within(examples).getByText(/通常攻撃 -> B:丁 1000/)).toBeVisible();expect(within(examples).getByText(/10,000 → 9,000/)).toBeVisible();
  fireEvent.click(within(examples).getByRole('button',{name:'負け例1'}));expect(within(examples).getByText(/seed 200/)).toBeVisible();
 });
});

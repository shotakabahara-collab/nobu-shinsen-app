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
const payload={battle_snapshot:snapshot,sim:{timeline_trace_blocks:{forward:[{representative_traces:[{seed:100,winner:'A',win_reason:'enemy_defeated',hp_diff:50,timeline_digest:{action_order_digest:{'1':[entry(1,'B','丁',163),entry(2,'A','甲',153),entry(3,'B','戊',148),entry(4,'A','乙',143),entry(5,'B','己',138),entry(6,'A','丙',133)]},key_events:[]}}]}],reverse:[{representative_traces:[{seed:101,winner:'B',win_reason:'enemy_defeated',hp_diff:-20,timeline_digest:{action_order_digest:{'1':[entry(1,'A','丁',163),entry(2,'B','甲',153),entry(3,'A','戊',148),entry(4,'B','乙',143),entry(5,'A','己',138),entry(6,'B','丙',133)]},key_events:[]}}]}]}}};
const log:BattleResult={id:'00000000-0000-4000-8000-000000000003',allyId:snapshot.sides.A.formationId,enemyId:snapshot.sides.B.formationId,createdAt:'2026-07-15T00:00:00.000Z',status:'completed',winRate:.6,hpDiff:50,trials:10,blocks:1,runtime:'runtime',payload};

describe('BattleLogDetail',()=>{
 it('shows all six officer stats and the six-officer runtime action order',()=>{
  render(<BattleLogDetail log={log} formations={[]} onClose={()=>{}}/>);
  const status=screen.getByRole('region',{name:'6武将ステータス'});expect(within(status).getAllByLabelText(/ステータス$/)).toHaveLength(6);
  expect(within(status).getByText('甲')).toBeVisible();expect(within(status).getByText('丁')).toBeVisible();
  expect(within(status).getAllByText('武勇')).toHaveLength(6);expect(within(status).getByText('150')).toBeVisible();expect(within(status).getByText('160')).toBeVisible();
  const order=screen.getByRole('region',{name:'6武将 行動順'});expect(within(order).getByText('T1 行動順（6名）')).toBeVisible();
  const rows=within(order).getAllByRole('listitem');expect(rows).toHaveLength(6);expect(rows[0]).toHaveTextContent('丁');expect(rows[1]).toHaveTextContent('甲');expect(rows[0]).toHaveTextContent('実効速度 163');
 });

 it('maps the reverse direction back to registered formation labels',()=>{
  render(<BattleLogDetail log={log} formations={[]} onClose={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'逆方向 B左／A右'}));
  const rows=within(screen.getByRole('region',{name:'6武将 行動順'})).getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent('B');expect(rows[0]).toHaveTextContent('丁');expect(rows[1]).toHaveTextContent('A');expect(rows[1]).toHaveTextContent('甲');
 });
});

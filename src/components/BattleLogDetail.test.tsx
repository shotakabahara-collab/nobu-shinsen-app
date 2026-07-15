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
const troopTeam=(side:'A'|'B',totalTroops:number)=>({side,totalTroops,officers:snapshot.sides[side].officers.map((row,index)=>({side,role:row.role,name:row.name,troops:Math.max(0,10000-(30000-totalTroops)/3-index),maxTroops:10000,alive:true,isCommander:index===0}))});
const board=(a:number,b:number)=>({A:troopTeam('A',a),B:troopTeam('B',b)});
const actionOrder=[
 {rank:1,side:'B',officer:'丁',role:'大将',effectiveSpeed:163,baseSpeed:159,timedSpeedBonus:2,persistentSpeedBonus:2},
 {rank:2,side:'A',officer:'甲',role:'大将',effectiveSpeed:153,baseSpeed:149,timedSpeedBonus:2,persistentSpeedBonus:2},
 {rank:3,side:'B',officer:'戊',role:'副将1',effectiveSpeed:148,baseSpeed:144,timedSpeedBonus:2,persistentSpeedBonus:2},
 {rank:4,side:'A',officer:'乙',role:'副将1',effectiveSpeed:143,baseSpeed:139,timedSpeedBonus:2,persistentSpeedBonus:2},
 {rank:5,side:'B',officer:'己',role:'副将2',effectiveSpeed:138,baseSpeed:134,timedSpeedBonus:2,persistentSpeedBonus:2},
 {rank:6,side:'A',officer:'丙',role:'副将2',effectiveSpeed:133,baseSpeed:129,timedSpeedBonus:2,persistentSpeedBonus:2},
];
const turns=(endedTurn:number)=>Array.from({length:8},(_,index)=>{const turn=index+1,played=turn<=endedTurn;return {turn,played,status:played?'played':'not_played_battle_ended',actionOrder:played?actionOrder:[],events:played?[{sequence:turn,side:'A',actor:'甲',type:'action',text:'通常攻撃 -> B:丁 500',troopChanges:[{turn,side:'B',officer:'丁',source:'通常攻撃',before:10000-(turn-1)*500,after:10000-turn*500,delta:-500,kind:'loss'}]}]:[],start:played?board(30000-(turn-1)*300,30000-(turn-1)*500):null,end:played?board(30000-turn*300,30000-turn*500):null};});
const payload={battle_snapshot:snapshot,battle_summary:{requestedBattles:100,completedBattles:100,wins:60,losses:40,draws:0,winRate:.6,perDirectionBattles:50,runtimeFailures:0},battle_examples:[
 {schemaVersion:1,direction:'forward',seed:100,outcome:'win',winner:'A',winReason:'commander_kill',endedTurn:4,maxTurns:8,hpDiff:5000,turns:turns(4)},
 {schemaVersion:1,direction:'reverse',seed:101,outcome:'loss',winner:'B',winReason:'commander_kill',endedTurn:3,maxTurns:8,hpDiff:-6000,turns:turns(3)},
]};
const log:BattleResult={id:'00000000-0000-4000-8000-000000000003',allyId:snapshot.sides.A.formationId,enemyId:snapshot.sides.B.formationId,createdAt:'2026-07-15T00:00:00.000Z',status:'completed',winRate:.6,hpDiff:50,trials:100,blocks:1,runtime:'runtime',payload};

describe('BattleLogDetail',()=>{
 it('shows the 100-battle result, all six stats and T1 through T8 with action-linked troop changes',()=>{
  render(<BattleLogDetail log={log} formations={[]} onClose={()=>{}}/>);
  const result=screen.getByRole('region',{name:'対戦結果'});expect(within(result).getByText('100戦結果')).toBeVisible();expect(within(result).getByText('A勝率 60.0%')).toBeVisible();expect(within(result).getByText('完走 100/100戦',{exact:false})).toBeVisible();
  const status=screen.getByRole('region',{name:'6武将ステータス'});expect(within(status).getAllByLabelText(/ステータス$/)).toHaveLength(6);expect(within(status).getByText('甲')).toBeVisible();expect(within(status).getByText('丁')).toBeVisible();
  const battle=screen.getByRole('region',{name:'6武将 行動順'});expect(within(battle).getByText('T1〜T8 行動・兵数ログ')).toBeVisible();
  for(let turn=1;turn<=8;turn++)expect(within(battle).getByText(`T${turn}`,{exact:true})).toBeVisible();
  expect(within(battle).getByRole('list',{name:'T1 行動順'})).toBeVisible();const actions=within(battle).getByRole('list',{name:'T1 行動内容'});expect(actions).toHaveTextContent('通常攻撃 -> B:丁 500');expect(actions).toHaveTextContent(/B 丁\s*兵数 10,000 → 9,500（-500）/);
  expect(within(battle).getAllByText('T4で決着済み・実行なし',{exact:true})).toHaveLength(4);
 });

 it('switches between one winning and one losing representative battle',()=>{
  render(<BattleLogDetail log={log} formations={[]} onClose={()=>{}}/>);
  expect(screen.getByText('A勝利例・順方向 A左／B右')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'A敗北例'}));
  expect(screen.getByText('A敗北例・逆方向 B左／A右')).toBeVisible();expect(screen.getByText(/seed 101・T3決着/)).toBeVisible();
 });

 it('shows only one representative example when the 100-battle win rate is 100 percent',()=>{
  const perfectPayload={...payload,battle_summary:{...payload.battle_summary,wins:100,losses:0,winRate:1},battle_examples:[payload.battle_examples[0]]};
  render(<BattleLogDetail log={{...log,winRate:1,payload:perfectPayload}} formations={[]} onClose={()=>{}}/>);
  expect(screen.getByRole('region',{name:'対戦結果'})).toHaveTextContent('A勝率 100.0%');expect(screen.getByText('A勝利例のみ')).toBeVisible();expect(screen.queryByRole('button',{name:'A敗北例'})).not.toBeInTheDocument();
 });
});

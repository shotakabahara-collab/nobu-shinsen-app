import {useEffect,useMemo,useState} from 'react';
import {Activity,ChevronDown,Gauge,HeartPulse,Swords,Trophy} from 'lucide-react';
import type {BattleResult,Formation} from '../domain/schemas';
import {toPublicRuntimePayload} from '../domain/engineBrand';
import {
 buildBattleSnapshot,buildInitialActionOrderTrace,enrichTraceRoles,extractRepresentativeTrace,formationsForBattleResult,
 parseBattleExamples,parseBattleSnapshot,parseBattleSummary,type ActionOrderEntry,type BattleActionEvent,type BattleExample,
 type BattleExampleTurn,type BattleOfficerSnapshot,type BattleSide,type BattleSnapshot,type BattleSummary,type BattleTroopBoard,type StatValues,
} from '../battleLog/battleLogView';
import {loadCanonicalOfficerStatsCatalog} from '../services/canonicalOfficerStatsCatalog';
import {Button} from './ui/button';

type Props={log:BattleResult;formations:readonly Formation[];onClose:()=>void};
const statLabels:[keyof StatValues,string][]=[['force','武勇'],['intel','知略'],['lead','統率'],['speed','速度']];
const number=(value:number|null)=>value===null?'未確認':Number.isInteger(value)?String(value):value.toFixed(1);
const troops=(value:number)=>Math.round(value).toLocaleString('ja-JP');
const signed=(value:number)=>`${value>0?'+':''}${Math.round(value).toLocaleString('ja-JP')}`;
const sideTone=(side:BattleSide)=>side==='A'?'bg-cyan-950 text-cyan-300':'bg-fuchsia-950 text-fuchsia-300';

function OfficerCard({officer}:{officer:BattleOfficerSnapshot}){
 return <article className="rounded-xl border border-slate-700 bg-slate-950 p-3" aria-label={`${officer.side} ${officer.name} ステータス`}>
  <div className="flex items-start justify-between gap-2"><div><p className="text-xs text-slate-500">{officer.role}・{officer.limitBreak}凸</p><h6 className="font-bold">{officer.name}</h6></div><span className={`rounded px-2 py-1 text-xs font-bold ${sideTone(officer.side)}`}>{officer.side}</span></div>
  <div className="mt-3 grid grid-cols-2 gap-2">{statLabels.map(([key,label])=><div key={key} className="rounded-lg bg-slate-900 p-2"><p className="text-[10px] text-slate-500">{label}</p><p className="text-lg font-black text-amber-300">{number(officer.allocated[key])}</p><p className="text-[10px] text-slate-500">基礎 {number(officer.base[key])}</p></div>)}</div>
  <div className="mt-3 space-y-1 text-xs text-slate-400"><p>行動順用速度：<strong className="text-slate-200">{number(officer.actionOrderSpeed)}</strong></p><p>配分pt：{officer.allocationPoints??'未確認'}・兵力：{officer.troops.toLocaleString('ja-JP')}</p><p>固有：{officer.inherentSkill}</p><p>装着1：{officer.equippedSkills[0]}</p><p>装着2：{officer.equippedSkills[1]}</p></div>
 </article>;
}

function StatusSide({side,snapshot}:{side:BattleSide;snapshot:BattleSnapshot}){
 const value=snapshot.sides[side];return <section className="space-y-2"><div className="flex items-center justify-between"><h5 className="font-bold">編成{side}：{value.formationName}</h5><span className="text-xs text-slate-400">{value.troopType} Lv{value.troopLevel}</span></div><div className="grid gap-2 md:grid-cols-3">{value.officers.map(officer=><OfficerCard key={`${side}-${officer.slot}`} officer={officer}/>)}</div></section>;
}

function BattleSummaryPanel({summary,log}:{summary:BattleSummary|undefined;log:BattleResult}){
 const requested=summary?.requestedBattles??log.trials,completed=summary?.completedBattles??log.trials,rate=summary?.winRate??log.winRate;
 return <section aria-label="対戦結果" className="rounded-xl border border-amber-700 bg-amber-950/30 p-4">
  <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-wider text-amber-300">{requested}戦結果</p><p className="mt-1 text-3xl font-black text-amber-300">A勝率 {(rate*100).toFixed(1)}%</p></div><Trophy className="size-7 shrink-0 text-amber-300"/></div>
  {summary&&<div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-emerald-950 p-2"><p className="text-[10px] text-emerald-400">勝利</p><strong>{summary.wins}</strong></div><div className="rounded-lg bg-red-950 p-2"><p className="text-[10px] text-red-400">敗北</p><strong>{summary.losses}</strong></div><div className="rounded-lg bg-slate-800 p-2"><p className="text-[10px] text-slate-400">引分</p><strong>{summary.draws}</strong></div></div>}
  <p className="mt-2 text-xs text-slate-400">順方向 {summary?.perDirectionBattles??'—'}戦＋逆方向 {summary?.perDirectionBattles??'—'}戦・完走 {completed}/{requested}戦</p>
  {summary&&summary.runtimeFailures>0&&<p role="alert" className="mt-2 rounded-lg bg-red-950 p-2 text-xs text-red-300">未完走 {summary.runtimeFailures}戦は勝率の分母から除外されています。</p>}
 </section>;
}

function TeamTroopDelta({side,start,end}:{side:BattleSide;start:BattleTroopBoard;end:BattleTroopBoard}){
 const from=start[side],to=end[side],teamDelta=to.totalTroops-from.totalTroops;
 return <section className="rounded-lg bg-slate-900 p-2" aria-label={`編成${side} 兵数推移`}>
  <div className="flex items-center justify-between gap-2"><p className="font-bold"><span className={`mr-2 rounded px-2 py-0.5 text-xs ${sideTone(side)}`}>{side}</span>合計</p><p className="text-xs">{troops(from.totalTroops)} → <strong>{troops(to.totalTroops)}</strong> <span className={teamDelta>0?'text-emerald-300':teamDelta<0?'text-red-300':'text-slate-400'}>({signed(teamDelta)})</span></p></div>
  <div className="mt-2 space-y-1">{from.officers.map(officer=>{const after=to.officers.find(value=>value.name===officer.name);const next=after?.troops??officer.troops,delta=next-officer.troops;return <div key={`${side}-${officer.name}`} className="flex items-center justify-between gap-2 text-xs text-slate-400"><span className="min-w-0 truncate">{officer.role} {officer.name}</span><span className="shrink-0">{troops(officer.troops)} → {troops(next)} <strong className={delta>0?'text-emerald-300':delta<0?'text-red-300':'text-slate-400'}>({signed(delta)})</strong></span></div>;})}</div>
 </section>;
}

function TurnTroopDelta({turn}:{turn:BattleExampleTurn}){
 if(!turn.start||!turn.end)return <p className="text-xs text-slate-500">このターンの開始・終了兵数は取得できませんでした。</p>;
 return <div className="space-y-2"><p className="flex items-center text-xs font-bold text-slate-300"><HeartPulse className="mr-1 size-4 text-emerald-300"/>ターン開始 → 終了の兵数</p><TeamTroopDelta side="A" start={turn.start} end={turn.end}/><TeamTroopDelta side="B" start={turn.start} end={turn.end}/></div>;
}

function ActionOrderList({turn}:{turn:BattleExampleTurn}){
 if(!turn.actionOrder.length)return <p className="text-xs text-slate-500">このターンは行動順確定前に決着しました。</p>;
 return <div><p className="mb-2 flex items-center text-xs font-bold text-slate-300"><Activity className="mr-1 size-4 text-emerald-300"/>6武将の実行動順</p><ol aria-label={`T${turn.turn} 行動順`} className="grid gap-1 sm:grid-cols-2">{turn.actionOrder.map(entry=><ActionOrderRow key={`${entry.rank}-${entry.side}-${entry.officer}`} entry={entry}/>)}</ol></div>;
}

function ActionOrderRow({entry}:{entry:ActionOrderEntry}){
 const bonus=entry.timedSpeedBonus+entry.persistentSpeedBonus;
 return <li className="flex items-center gap-2 rounded-lg bg-slate-900 p-2"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-slate-950">{entry.rank}</span><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${sideTone(entry.side)}`}>{entry.side}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{entry.officer}<span className="ml-1 text-[10px] font-normal text-slate-500">{entry.role}</span></p><p className="text-[10px] text-slate-400">実効 {number(entry.effectiveSpeed)}・基礎 {number(entry.baseSpeed)}{bonus!==0?`・補正 ${bonus>0?'+':''}${bonus.toFixed(1)}`:''}</p></div></li>;
}

function EventRow({event}:{event:BattleActionEvent}){
 return <li className="rounded-lg border border-slate-800 bg-slate-900 p-2"><div className="flex items-start gap-2"><span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${sideTone(event.side)}`}>{event.side}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-300">{event.actor}</p><p className="break-words text-xs leading-5 text-slate-400">{event.text}</p></div></div>{event.troopChanges.map((change,index)=><p key={`${event.sequence}-${change.officer}-${index}`} className={`mt-2 rounded-md px-2 py-1 text-xs font-bold ${change.delta<0?'bg-red-950 text-red-300':'bg-emerald-950 text-emerald-300'}`}>{change.side} {change.officer}　兵数 {troops(change.before)} → {troops(change.after)}（{signed(change.delta)}）</p>)}</li>;
}

function TurnDetail({turn,endedTurn}:{turn:BattleExampleTurn;endedTurn:number}){
 const totalStart=turn.start?turn.start.A.totalTroops+turn.start.B.totalTroops:null,totalEnd=turn.end?turn.end.A.totalTroops+turn.end.B.totalTroops:null;
 return <details open={turn.turn===1} className={`rounded-xl border ${turn.played?'border-slate-700 bg-slate-950':'border-slate-800 bg-slate-950/50'}`}>
  <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 p-3"><span className={`font-black ${turn.played?'text-amber-300':'text-slate-500'}`}>T{turn.turn}</span>{turn.played?<span className="text-right text-xs text-slate-400">{totalStart!==null&&totalEnd!==null?`両軍合計 ${troops(totalStart)} → ${troops(totalEnd)}`:`実行済み・T${endedTurn}決着`}</span>:<span className="text-xs text-slate-600">T{endedTurn}で決着済み・実行なし</span>}</summary>
  {turn.played&&<div className="space-y-4 border-t border-slate-800 p-3"><TurnTroopDelta turn={turn}/><ActionOrderList turn={turn}/><div><p className="mb-2 flex items-center text-xs font-bold text-slate-300"><Swords className="mr-1 size-4 text-amber-300"/>行動内容と兵数増減</p>{turn.events.length?<ol aria-label={`T${turn.turn} 行動内容`} className="space-y-2">{turn.events.map(event=><EventRow key={`${turn.turn}-${event.sequence}`} event={event}/>)}</ol>:<p className="text-xs text-slate-500">表示対象となる行動イベントはありません。</p>}</div></div>}
 </details>;
}

const outcomeLabel=(example:BattleExample)=>example.outcome==='win'?'A勝利例':example.outcome==='loss'?'A敗北例':'引分例';
const directionLabel=(direction:BattleExample['direction'])=>direction==='forward'?'順方向 A左／B右':'逆方向 B左／A右';

function BattleExamples({examples,logId}:{examples:BattleExample[];logId:string}){
 const [selectedIndex,setSelectedIndex]=useState(0);useEffect(()=>setSelectedIndex(0),[logId]);const example=examples[selectedIndex]??examples[0];
 if(!example)return null;
 return <section aria-label="6武将 行動順" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
  <div><h5 className="flex items-center font-bold"><Activity className="mr-2 size-5 text-emerald-300"/>T1〜T8 行動・兵数ログ</h5><p className="mt-1 text-xs text-slate-400">100戦から勝敗別の代表例を抽出し、実行動順・行動内容・実際の兵数増減を表示します。</p></div>
  {examples.length>1?<div className={`grid gap-2 ${examples.length===2?'grid-cols-2':'grid-cols-3'}`}>{examples.map((value,index)=><Button key={`${value.outcome}-${value.seed}`} variant={index===selectedIndex?'default':'secondary'} onClick={()=>setSelectedIndex(index)}>{outcomeLabel(value)}</Button>)}</div>:<p className="rounded-lg bg-slate-950 p-2 text-center text-sm font-bold">{outcomeLabel(example)}のみ</p>}
  <div className={`rounded-lg p-3 ${example.outcome==='win'?'bg-emerald-950':example.outcome==='loss'?'bg-red-950':'bg-slate-800'}`}><p className="font-bold">{outcomeLabel(example)}・{directionLabel(example.direction)}</p><p className="mt-1 text-xs text-slate-300">seed {example.seed}・T{example.endedTurn}決着・勝者 {example.winner==='draw'?'引分':example.winner}・HP差 {signed(example.hpDiff)}</p></div>
  <div className="space-y-2">{example.turns.map(turn=><TurnDetail key={turn.turn} turn={turn} endedTurn={example.endedTurn}/>)}</div>
 </section>;
}

function LegacyTrace({payload,snapshot}:{payload:Record<string,unknown>;snapshot:BattleSnapshot|undefined}){
 const [direction,setDirection]=useState<'forward'|'reverse'>('forward');
 const trace=useMemo(()=>{const runtime=extractRepresentativeTrace(payload,direction);if(runtime)return enrichTraceRoles(runtime,snapshot);return snapshot?buildInitialActionOrderTrace(snapshot,direction):undefined;},[direction,payload,snapshot]);
 return <section aria-label="6武将 行動順" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><div><h5 className="flex items-center font-bold"><Activity className="mr-2 size-5 text-emerald-300"/>6武将 行動順</h5><p className="mt-1 text-xs text-slate-400">この旧ログには行動別兵数traceがありません。T1〜T8の詳細を確認するには100戦で再計算してください。</p></div>
  <div className="grid grid-cols-2 gap-2"><Button variant={direction==='forward'?'default':'secondary'} onClick={()=>setDirection('forward')}>順方向 A左／B右</Button><Button variant={direction==='reverse'?'default':'secondary'} onClick={()=>setDirection('reverse')}>逆方向 B左／A右</Button></div>
  {trace?<>{trace.source==='initial_speed_snapshot'&&<p className="rounded-lg bg-amber-950 p-2 text-xs text-amber-300">代表試行の詳細traceは未取得です。以下は戦闘開始時の速度順です。</p>}<div className="space-y-3">{trace.turns.map(turn=><section key={turn.turn} className="rounded-xl bg-slate-950 p-3"><h6 className="mb-2 font-bold text-amber-300">T{turn.turn} 行動順（{turn.entries.length}名）</h6><ol className="space-y-2">{turn.entries.map(entry=><ActionOrderRow key={`${turn.turn}-${entry.rank}-${entry.side}-${entry.officer}`} entry={entry}/>)}</ol></section>)}</div></>:<p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">行動順を表示するための6武将スナップショットを確認できませんでした。</p>}
 </section>;
}

export function BattleLogDetail({log,formations,onClose}:Props){
 const payload=log.payload;const stored=useMemo(()=>parseBattleSnapshot(payload),[payload]);const summary=useMemo(()=>parseBattleSummary(payload),[payload]);const examples=useMemo(()=>parseBattleExamples(payload),[payload]);
 const [snapshot,setSnapshot]=useState<BattleSnapshot|undefined>(stored);const [fallback,setFallback]=useState(false);const [statusError,setStatusError]=useState('');
 useEffect(()=>{
  setSnapshot(stored);setFallback(false);setStatusError('');if(stored)return;
  const [formationA,formationB]=formationsForBattleResult(log,formations);if(!formationA||!formationB){setStatusError('保存当時の編成スナップショットがなく、現在の登録編成も確認できません。');return;}
  let active=true;void loadCanonicalOfficerStatsCatalog().then(catalog=>{if(active){setSnapshot(buildBattleSnapshot(formationA,formationB,catalog));setFallback(true);}}).catch(error=>{if(active)setStatusError(error instanceof Error?error.message:'武将ステータスを読み込めませんでした');});return()=>{active=false;};
 },[formations,log,stored]);
 const names=snapshot?`${snapshot.sides.A.formationName} vs ${snapshot.sides.B.formationName}`:'編成A vs 編成B';
 return <section aria-label="Battle Log詳細" className="space-y-4 rounded-2xl border border-amber-700 bg-slate-950 p-3 sm:p-4">
  <div className="flex items-start justify-between gap-3"><div><h4 className="font-bold">Battle Log詳細</h4><p className="mt-1 text-sm text-slate-400">{names}</p></div><Button variant="secondary" onClick={onClose}>閉じる</Button></div>
  <BattleSummaryPanel summary={summary} log={log}/>
  <section aria-label="6武将ステータス" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><h5 className="flex items-center font-bold"><Gauge className="mr-2 size-5 text-amber-300"/>6武将ステータス</h5>{fallback&&<p className="rounded-lg bg-amber-950 p-2 text-xs text-amber-300">この過去ログには保存時スナップショットがないため、現在の登録編成から表示しています。</p>}{statusError&&<p role="alert" className="rounded-lg bg-red-950 p-2 text-xs text-red-300">{statusError}</p>}{snapshot&&<><StatusSide side="A" snapshot={snapshot}/><StatusSide side="B" snapshot={snapshot}/></>}</section>
  {examples.length
   ?<BattleExamples examples={examples} logId={log.id}/>
   :<LegacyTrace payload={payload} snapshot={snapshot}/>}
  <details className="rounded-xl border border-slate-700 bg-slate-900 p-3"><summary className="flex cursor-pointer items-center font-bold"><ChevronDown className="mr-2 size-4"/>生データを確認</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">{JSON.stringify(toPublicRuntimePayload(payload),null,2)}</pre></details>
 </section>;
}

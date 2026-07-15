import {useEffect,useMemo,useState} from 'react';
import {Activity,ChevronDown,Gauge} from 'lucide-react';
import type {BattleResult,Formation} from '../domain/schemas';
import {toPublicRuntimePayload} from '../domain/engineBrand';
import {buildBattleEvaluationSummary,buildBattleSnapshot,buildInitialActionOrderTrace,enrichTraceRoles,extractRepresentativeTrace,formationsForBattleResult,parseBattleEvaluation,parseBattleExamples,parseBattleSnapshot,type ActionOrderEntry,type BattleExampleView,type BattleOfficerSnapshot,type BattleSide,type BattleSnapshot,type BattleTimelineEvent,type BattleTurnView,type StatValues,type TroopRow} from '../battleLog/battleLogView';
import {loadCanonicalOfficerStatsCatalog} from '../services/canonicalOfficerStatsCatalog';
import {Button} from './ui/button';

type Props={log:BattleResult;formations:readonly Formation[];onClose:()=>void};
const statLabels:[keyof StatValues,string][]=[['force','武勇'],['intel','知略'],['lead','統率'],['speed','速度']];
const number=(value:number|null)=>value===null?'未確認':Number.isInteger(value)?String(value):value.toFixed(1);
const troops=(value:number)=>Math.round(value).toLocaleString('ja-JP');
const signed=(value:number)=>`${value>=0?'+':''}${Math.round(value).toLocaleString('ja-JP')}`;

function OfficerCard({officer}:{officer:BattleOfficerSnapshot}){
 return <article className="rounded-xl border border-slate-700 bg-slate-950 p-3" aria-label={`${officer.side} ${officer.name} ステータス`}>
  <div className="flex items-start justify-between gap-2"><div><p className="text-xs text-slate-500">{officer.role}・{officer.limitBreak}凸</p><h6 className="font-bold">{officer.name}</h6></div><SideBadge side={officer.side}/></div>
  <div className="mt-3 grid grid-cols-2 gap-2">{statLabels.map(([key,label])=><div key={key} className="rounded-lg bg-slate-900 p-2"><p className="text-[10px] text-slate-500">{label}</p><p className="text-lg font-black text-amber-300">{number(officer.allocated[key])}</p><p className="text-[10px] text-slate-500">基礎 {number(officer.base[key])}</p></div>)}</div>
  <div className="mt-3 space-y-1 text-xs text-slate-400"><p>行動順用速度：<strong className="text-slate-200">{number(officer.actionOrderSpeed)}</strong></p><p>配分pt：{officer.allocationPoints??'未確認'}・兵力：{officer.troops.toLocaleString('ja-JP')}</p><p>固有：{officer.inherentSkill}</p><p>装着1：{officer.equippedSkills[0]}</p><p>装着2：{officer.equippedSkills[1]}</p></div>
 </article>;
}

function SideBadge({side}:{side:BattleSide}){return <span className={`rounded px-2 py-1 text-xs font-bold ${side==='A'?'bg-cyan-950 text-cyan-300':'bg-fuchsia-950 text-fuchsia-300'}`}>{side}</span>;}

function StatusSide({side,snapshot}:{side:BattleSide;snapshot:BattleSnapshot}){
 const value=snapshot.sides[side];return <section className="space-y-2"><div className="flex items-center justify-between"><h5 className="font-bold">編成{side}：{value.formationName}</h5><span className="text-xs text-slate-400">{value.troopType} Lv{value.troopLevel}</span></div><div className="grid gap-2 md:grid-cols-3">{value.officers.map(officer=><OfficerCard key={`${side}-${officer.slot}`} officer={officer}/>)}</div></section>;
}

function ActionOrder({entries}:{entries:ActionOrderEntry[]}){
 if(!entries.length)return <p className="text-xs text-slate-500">行動順データなし</p>;
 return <ol className="space-y-1">{entries.map(entry=><li key={`${entry.rank}-${entry.side}-${entry.officer}`} className="flex items-center gap-2 rounded-lg bg-slate-900 p-2"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-slate-950">{entry.rank}</span><SideBadge side={entry.side}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{entry.officer}<span className="ml-2 text-xs font-normal text-slate-500">{entry.role}</span></p><p className="text-[11px] text-slate-400">実効速度 {number(entry.effectiveSpeed)}・基礎 {number(entry.baseSpeed)}</p></div></li>)}</ol>;
}

function TroopGrid({rows,label}:{rows:TroopRow[];label:string}){
 return <div><p className="mb-1 text-xs font-bold text-slate-400">{label}</p><div className="grid grid-cols-2 gap-1 sm:grid-cols-3">{rows.map(row=><div key={`${label}-${row.side}-${row.officer}`} className="rounded-lg bg-slate-900 p-2"><div className="flex items-center gap-1"><SideBadge side={row.side}/><span className="truncate text-xs font-bold">{row.officer}</span></div><p className="mt-1 text-sm font-black text-slate-200">{troops(row.hp)}<span className="text-[10px] font-normal text-slate-500"> / {troops(row.maxHp)}</span></p></div>)}</div></div>;
}

function EventRow({event}:{event:BattleTimelineEvent}){
 const tone=event.kind==='damage'?'border-red-900 bg-red-950/30':event.kind==='heal'?'border-emerald-900 bg-emerald-950/30':event.kind==='reconcile'?'border-amber-900 bg-amber-950/30':'border-slate-700 bg-slate-900';
 return <li className={`rounded-lg border p-2 ${tone}`}>
  <div className="flex items-start gap-2">{event.side&&<SideBadge side={event.side}/>}<div className="min-w-0 flex-1"><p className="text-sm text-slate-200">{event.description}</p>{event.delta!==undefined&&event.before!==undefined&&event.after!==undefined&&<p className={`mt-1 text-xs font-bold ${event.delta<0?'text-red-300':'text-emerald-300'}`}>兵数 {signed(event.delta)}　{troops(event.before)} → {troops(event.after)}</p>}</div></div>
 </li>;
}

function teamTotal(rows:TroopRow[],side:BattleSide){return rows.filter(row=>row.side===side).reduce((sum,row)=>sum+row.hp,0);}

function TurnCard({turn}:{turn:BattleTurnView}){
 const startA=teamTotal(turn.startTroops,'A'),endA=teamTotal(turn.endTroops,'A'),startB=teamTotal(turn.startTroops,'B'),endB=teamTotal(turn.endTroops,'B');
 return <details className="rounded-xl border border-slate-700 bg-slate-950 p-3" open={turn.turn===1}>
  <summary className="cursor-pointer font-bold text-amber-300">T{turn.turn}　{turn.status==='not_reached'?'戦闘終了済み':`A ${troops(startA)}→${troops(endA)} ／ B ${troops(startB)}→${troops(endB)}`}</summary>
  {turn.status==='not_reached'?<p className="mt-3 text-sm text-slate-500">大将撃破またはT8判定により、このターンの行動はありません。</p>:<div className="mt-3 space-y-3">
   <TroopGrid rows={turn.startTroops} label="ターン開始兵数"/>
   <div><p className="mb-1 text-xs font-bold text-slate-400">6武将の行動順</p><ActionOrder entries={turn.actionOrder}/></div>
   <div><p className="mb-1 text-xs font-bold text-slate-400">行動内容・兵数増減</p>{turn.events.length?<ol className="space-y-1">{turn.events.map(event=><EventRow key={event.id} event={event}/>)}</ol>:<p className="rounded-lg bg-slate-900 p-2 text-xs text-slate-500">表示対象となる行動イベントはありません。</p>}</div>
   <TroopGrid rows={turn.endTroops} label="ターン終了兵数（runtime確定値）"/>
  </div>}
 </details>;
}

function ExampleCard({example,index}:{example:BattleExampleView;index:number}){
 const outcomeLabel=example.outcome==='win'?'勝ち例':example.outcome==='loss'?'負け例':'引分例';const outcomeTone=example.outcome==='win'?'text-emerald-300':example.outcome==='loss'?'text-red-300':'text-slate-300';
 return <details className="rounded-xl border border-slate-700 bg-slate-900 p-3" open={index===0}>
  <summary className="cursor-pointer"><span className={`font-bold ${outcomeTone}`}>{outcomeLabel}</span><span className="ml-2 text-xs text-slate-400">seed {example.seed}・{example.direction==='forward'?'順方向':'逆方向'}・T{example.endedTurn}終了・HP差 {number(example.hpDiff)}</span></summary>
  <div className="mt-3 space-y-2">{example.turns.map(turn=><TurnCard key={turn.turn} turn={turn}/>)}</div>
 </details>;
}

export function BattleLogDetail({log,formations,onClose}:Props){
 const payload=log.payload;const stored=useMemo(()=>parseBattleSnapshot(payload),[payload]);
 const [snapshot,setSnapshot]=useState<BattleSnapshot|undefined>(stored);const [fallback,setFallback]=useState(false);const [statusError,setStatusError]=useState('');const [direction,setDirection]=useState<'forward'|'reverse'>('forward');
 useEffect(()=>{
  setSnapshot(stored);setFallback(false);setStatusError('');if(stored)return;
  const [formationA,formationB]=formationsForBattleResult(log,formations);if(!formationA||!formationB){setStatusError('保存当時の編成スナップショットがなく、現在の登録編成も確認できません。');return;}
  let active=true;void loadCanonicalOfficerStatsCatalog().then(catalog=>{if(active){setSnapshot(buildBattleSnapshot(formationA,formationB,catalog));setFallback(true);}}).catch(error=>{if(active)setStatusError(error instanceof Error?error.message:'武将ステータスを読み込めませんでした');});return()=>{active=false;};
 },[formations,log,stored]);
 const evaluation=useMemo(()=>parseBattleEvaluation(payload)??{summary:buildBattleEvaluationSummary(payload),examples:[]},[payload]);
 const examples=useMemo(()=>parseBattleExamples(payload,snapshot),[payload,snapshot]);
 const trace=useMemo(()=>{const runtime=extractRepresentativeTrace(payload,direction);if(runtime)return enrichTraceRoles(runtime,snapshot);return snapshot?buildInitialActionOrderTrace(snapshot,direction):undefined;},[direction,payload,snapshot]);
 const names=snapshot?`${snapshot.sides.A.formationName} vs ${snapshot.sides.B.formationName}`:'編成A vs 編成B';
 return <section aria-label="Battle Log詳細" className="space-y-4 rounded-2xl border border-amber-700 bg-slate-950 p-4">
  <div className="flex items-start justify-between gap-3"><div><h4 className="font-bold">Battle Log詳細</h4><p className="mt-1 text-sm text-slate-400">{names}</p></div><Button variant="secondary" onClick={onClose}>閉じる</Button></div>

  <section aria-label="100戦結果" className="rounded-xl border border-amber-800 bg-slate-900 p-3"><p className="text-xs text-slate-400">{evaluation.summary.completedBattles}戦の勝率</p><p className="text-3xl font-black text-amber-300">{(evaluation.summary.winRate*100).toFixed(1)}%</p><div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-emerald-950 p-2 text-emerald-300">勝ち<br/><strong className="text-lg">{evaluation.summary.wins}</strong></div><div className="rounded-lg bg-red-950 p-2 text-red-300">負け<br/><strong className="text-lg">{evaluation.summary.losses}</strong></div><div className="rounded-lg bg-slate-800 p-2 text-slate-300">引分<br/><strong className="text-lg">{evaluation.summary.draws}</strong></div></div>{evaluation.summary.completedBattles!==evaluation.summary.requestedBattles&&<p className="mt-2 text-xs text-amber-300">要求{evaluation.summary.requestedBattles}戦のうち、runtime完了は{evaluation.summary.completedBattles}戦です。</p>}</section>

  <section aria-label="6武将ステータス" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><h5 className="flex items-center font-bold"><Gauge className="mr-2 size-5 text-amber-300"/>6武将ステータス</h5>{fallback&&<p className="rounded-lg bg-amber-950 p-2 text-xs text-amber-300">この過去ログには保存時スナップショットがないため、現在の登録編成から表示しています。</p>}{statusError&&<p role="alert" className="rounded-lg bg-red-950 p-2 text-xs text-red-300">{statusError}</p>}{snapshot&&<><StatusSide side="A" snapshot={snapshot}/><StatusSide side="B" snapshot={snapshot}/></>}</section>

  {examples.length>0?<section aria-label="戦闘例" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><div><h5 className="flex items-center font-bold"><Activity className="mr-2 size-5 text-emerald-300"/>勝敗別の戦闘例</h5><p className="mt-1 text-xs text-slate-400">勝ち例1件・負け例1件を表示します。勝率100%の場合は勝ち例1件のみです。各例はT1〜T8を並べ、実際に終了した後のターンも「戦闘終了済み」と表示します。</p></div>{examples.map((example,index)=><ExampleCard key={example.id} example={example} index={index}/>)}</section>:<section aria-label="6武将 行動順" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><div><h5 className="flex items-center font-bold"><Activity className="mr-2 size-5 text-emerald-300"/>6武将 行動順</h5><p className="mt-1 text-xs text-slate-400">この旧形式ログには行動内容と兵数推移の詳細例がありません。新しく100戦計算すると勝敗別のT1〜T8ログが保存されます。</p></div><div className="grid grid-cols-2 gap-2"><Button variant={direction==='forward'?'default':'secondary'} onClick={()=>setDirection('forward')}>順方向 A左／B右</Button><Button variant={direction==='reverse'?'default':'secondary'} onClick={()=>setDirection('reverse')}>逆方向 B左／A右</Button></div>{trace?<div className="space-y-3">{trace.turns.map(turn=><section key={turn.turn} className="rounded-xl bg-slate-950 p-3"><h6 className="mb-2 font-bold text-amber-300">T{turn.turn} 行動順（{turn.entries.length}名）</h6><ActionOrder entries={turn.entries}/></section>)}</div>:<p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">行動順を表示するためのデータを確認できませんでした。</p>}</section>}

  <details className="rounded-xl border border-slate-700 bg-slate-900 p-3"><summary className="flex cursor-pointer items-center font-bold"><ChevronDown className="mr-2 size-4"/>生データを確認</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">{JSON.stringify(toPublicRuntimePayload(payload),null,2)}</pre></details>
 </section>;
}

import {useEffect,useMemo,useState} from 'react';
import {Activity,ChevronDown,Gauge} from 'lucide-react';
import type {BattleResult,Formation} from '../domain/schemas';
import {toPublicRuntimePayload} from '../domain/engineBrand';
import {buildBattleSnapshot,enrichTraceRoles,extractRepresentativeTrace,formationsForBattleResult,parseBattleSnapshot,type BattleOfficerSnapshot,type BattleSide,type BattleSnapshot,type StatValues} from '../battleLog/battleLogView';
import {loadCanonicalOfficerStatsCatalog} from '../services/canonicalOfficerStatsCatalog';
import {Button} from './ui/button';

type Props={log:BattleResult;formations:readonly Formation[];onClose:()=>void};
const statLabels:[keyof StatValues,string][]=[['force','武勇'],['intel','知略'],['lead','統率'],['speed','速度']];
const number=(value:number|null)=>value===null?'未確認':Number.isInteger(value)?String(value):value.toFixed(1);

function OfficerCard({officer}:{officer:BattleOfficerSnapshot}){
 return <article className="rounded-xl border border-slate-700 bg-slate-950 p-3" aria-label={`${officer.side} ${officer.name} ステータス`}>
  <div className="flex items-start justify-between gap-2"><div><p className="text-xs text-slate-500">{officer.role}・{officer.limitBreak}凸</p><h6 className="font-bold">{officer.name}</h6></div><span className={`rounded px-2 py-1 text-xs font-bold ${officer.side==='A'?'bg-cyan-950 text-cyan-300':'bg-fuchsia-950 text-fuchsia-300'}`}>{officer.side}</span></div>
  <div className="mt-3 grid grid-cols-2 gap-2">{statLabels.map(([key,label])=><div key={key} className="rounded-lg bg-slate-900 p-2"><p className="text-[10px] text-slate-500">{label}</p><p className="text-lg font-black text-amber-300">{number(officer.allocated[key])}</p><p className="text-[10px] text-slate-500">基礎 {number(officer.base[key])}</p></div>)}</div>
  <div className="mt-3 space-y-1 text-xs text-slate-400"><p>行動順用速度：<strong className="text-slate-200">{number(officer.actionOrderSpeed)}</strong></p><p>配分pt：{officer.allocationPoints??'未確認'}・兵力：{officer.troops.toLocaleString('ja-JP')}</p><p>固有：{officer.inherentSkill}</p><p>装着1：{officer.equippedSkills[0]}</p><p>装着2：{officer.equippedSkills[1]}</p></div>
 </article>;
}

function StatusSide({side,snapshot}:{side:BattleSide;snapshot:BattleSnapshot}){
 const value=snapshot.sides[side];return <section className="space-y-2"><div className="flex items-center justify-between"><h5 className="font-bold">編成{side}：{value.formationName}</h5><span className="text-xs text-slate-400">{value.troopType} Lv{value.troopLevel}</span></div><div className="grid gap-2 md:grid-cols-3">{value.officers.map(officer=><OfficerCard key={`${side}-${officer.slot}`} officer={officer}/>)}</div></section>;
}

export function BattleLogDetail({log,formations,onClose}:Props){
 const payload=log.payload;const stored=useMemo(()=>parseBattleSnapshot(payload),[payload]);
 const [snapshot,setSnapshot]=useState<BattleSnapshot|undefined>(stored);const [fallback,setFallback]=useState(false);const [statusError,setStatusError]=useState('');const [direction,setDirection]=useState<'forward'|'reverse'>('forward');
 useEffect(()=>{
  setSnapshot(stored);setFallback(false);setStatusError('');if(stored)return;
  const [formationA,formationB]=formationsForBattleResult(log,formations);if(!formationA||!formationB){setStatusError('保存当時の編成スナップショットがなく、現在の登録編成も確認できません。');return;}
  let active=true;void loadCanonicalOfficerStatsCatalog().then(catalog=>{if(active){setSnapshot(buildBattleSnapshot(formationA,formationB,catalog));setFallback(true);}}).catch(error=>{if(active)setStatusError(error instanceof Error?error.message:'武将ステータスを読み込めませんでした');});return()=>{active=false;};
 },[formations,log,stored]);
 const trace=useMemo(()=>{const value=extractRepresentativeTrace(payload,direction);return value?enrichTraceRoles(value,snapshot):undefined;},[direction,payload,snapshot]);
 const names=snapshot?`${snapshot.sides.A.formationName} vs ${snapshot.sides.B.formationName}`:'編成A vs 編成B';
 return <section aria-label="Battle Log詳細" className="space-y-4 rounded-2xl border border-amber-700 bg-slate-950 p-4">
  <div className="flex items-start justify-between gap-3"><div><h4 className="font-bold">Battle Log詳細</h4><p className="mt-1 text-sm text-slate-400">{names}</p></div><Button variant="secondary" onClick={onClose}>閉じる</Button></div>

  <section aria-label="6武将ステータス" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><h5 className="flex items-center font-bold"><Gauge className="mr-2 size-5 text-amber-300"/>6武将ステータス</h5>{fallback&&<p className="rounded-lg bg-amber-950 p-2 text-xs text-amber-300">この過去ログには保存時スナップショットがないため、現在の登録編成から表示しています。</p>}{statusError&&<p role="alert" className="rounded-lg bg-red-950 p-2 text-xs text-red-300">{statusError}</p>}{snapshot&&<><StatusSide side="A" snapshot={snapshot}/><StatusSide side="B" snapshot={snapshot}/></>}</section>

  <section aria-label="6武将 行動順" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><div><h5 className="flex items-center font-bold"><Activity className="mr-2 size-5 text-emerald-300"/>6武将 行動順</h5><p className="mt-1 text-xs text-slate-400">代表試行の各ターンで、実際にruntimeが並べた順番です。戦闘不能者は次ターン以降の一覧から外れます。</p></div>
   <div className="grid grid-cols-2 gap-2"><Button variant={direction==='forward'?'default':'secondary'} onClick={()=>setDirection('forward')}>順方向 A左／B右</Button><Button variant={direction==='reverse'?'default':'secondary'} onClick={()=>setDirection('reverse')}>逆方向 B左／A右</Button></div>
   {trace?<><p className="text-xs text-slate-400">seed {trace.seed??'未確認'}・勝者 {trace.winner??'引分'}・{trace.winReason}・HP差 {trace.hpDiff??'—'}</p><div className="space-y-3">{trace.turns.map(turn=><section key={turn.turn} className="rounded-xl bg-slate-950 p-3"><h6 className="mb-2 font-bold text-amber-300">T{turn.turn} 行動順（{turn.entries.length}名）</h6><ol className="space-y-2">{turn.entries.map(entry=>{const bonus=entry.timedSpeedBonus+entry.persistentSpeedBonus;return <li key={`${turn.turn}-${entry.rank}-${entry.side}-${entry.officer}`} className="flex items-center gap-3 rounded-lg bg-slate-900 p-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500 font-black text-slate-950">{entry.rank}</span><span className={`rounded px-2 py-1 text-xs font-bold ${entry.side==='A'?'bg-cyan-950 text-cyan-300':'bg-fuchsia-950 text-fuchsia-300'}`}>{entry.side}</span><div className="min-w-0 flex-1"><p className="truncate font-bold">{entry.officer}<span className="ml-2 text-xs font-normal text-slate-500">{entry.role}</span></p><p className="text-xs text-slate-400">実効速度 {number(entry.effectiveSpeed)}・基礎 {number(entry.baseSpeed)}{bonus!==0?`・速度補正 ${bonus>0?'+':''}${bonus.toFixed(1)}`:''}</p></div></li>;})}</ol></section>)}</div></>:<p className="rounded-lg bg-amber-950 p-3 text-sm text-amber-300">このログには代表試行の行動順データがありません。新しく対戦計算するとT1〜T8の実行動順が保存されます。</p>}
  </section>

  <details className="rounded-xl border border-slate-700 bg-slate-900 p-3"><summary className="flex cursor-pointer items-center font-bold"><ChevronDown className="mr-2 size-4"/>生データを確認</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">{JSON.stringify(toPublicRuntimePayload(payload),null,2)}</pre></details>
 </section>;
}

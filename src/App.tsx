import {useEffect,useRef,useState} from 'react';
import {Download,Upload,ShieldCheck,Trash2,Swords,Square} from 'lucide-react';
import {Button} from './components/ui/button';
import {useAppStore} from './store/appStore';
import {createExport,downloadExport,parseImport} from './services/transfer';
import {toRuntimeFormation} from './runtime/formationAdapter';
import {runtimeClient} from './runtime/runtimeClient';
import type {RuntimeResult} from './runtime/contracts';

export default function App(){
  const {formations,loading,error,load,remove,replaceAll}=useAppStore();
  const input=useRef<HTMLInputElement>(null);
  const [notice,setNotice]=useState('');
  const [running,setRunning]=useState(false);
  const [result,setResult]=useState<RuntimeResult|null>(null);
  useEffect(()=>{void load();},[load]);
  const ally=formations.find(f=>f.kind==='ally');
  const enemy=formations.find(f=>f.kind==='enemy');
  async function importFile(file?:File){if(!file)return;try{const value=parseImport(await file.text());await replaceAll(value.formations);setNotice(`${value.formations.length}件を読み込みました`);}catch{setNotice('形式が正しくないため読み込めません');}}
  async function calculate(){if(!ally||!enemy)return;setRunning(true);setNotice('b223 runtimeを起動中…');try{const value=await runtimeClient.calculate({candidate:toRuntimeFormation(ally),target:enemy.id,target_spec:toRuntimeFormation(enemy),trials:10,blocks:1,seed:1326230000,include_detail:false});setResult(value);setNotice('計算が完了しました');}catch(e){setNotice(e instanceof Error?e.message:'計算に失敗しました');}finally{setRunning(false);}}
  function cancel(){runtimeClient.cancel();setRunning(false);setNotice('計算を中止しました');}
  return <div className="mx-auto min-h-screen max-w-3xl px-4 safe-top safe-bottom">
    <header className="py-5"><p className="text-xs tracking-[.3em] text-amber-400">SHINSEN TOOLKIT</p><h1 className="text-3xl font-black">NOBU Companion</h1><p className="mt-2 text-sm text-slate-400">b223 canonical runtime</p></header>
    <main className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><div className="grid grid-cols-2 gap-3"><Button onClick={()=>downloadExport(createExport(formations))} disabled={!formations.length}><Download className="mr-2 size-4"/>Export</Button><Button variant="secondary" onClick={()=>input.current?.click()}><Upload className="mr-2 size-4"/>Import</Button></div><input ref={input} className="hidden" type="file" accept="application/json,.json" onChange={e=>void importFile(e.target.files?.[0])}/>{notice&&<p role="status" className="mt-3 text-sm text-amber-300">{notice}</p>}</section>
      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold">保存済み編成</h2><span className="text-sm text-slate-400">{formations.length}件</span></div>{loading&&<p>読込中...</p>}{error&&<p className="text-red-400">{error}</p>}{!loading&&!formations.length&&<p className="py-8 text-center text-slate-500">編成はまだありません</p>}{formations.map(f=><article key={f.id} className="mb-2 flex items-center justify-between rounded-xl bg-slate-800 p-3"><div><strong>{f.name}</strong><p className="text-xs text-slate-400">{f.kind==='enemy'?'敵軍':'自軍'}・{f.troopType} Lv{f.troopLevel}</p></div><Button aria-label={`${f.name}を削除`} variant="danger" onClick={()=>void remove(f.id)}><Trash2 className="size-4"/></Button></article>)}</section>
      <section className="rounded-2xl border border-amber-800 bg-amber-950/20 p-4"><div className="flex gap-3"><ShieldCheck className="shrink-0 text-amber-400"/><div><h2 className="font-bold">Direct Calculate</h2><p className="mt-1 text-sm text-slate-400">{ally?.name||'自軍未選択'} vs {enemy?.name||'敵軍未選択'} / b223固定</p></div></div><div className="mt-4">{running?<Button variant="danger" className="w-full" onClick={cancel}><Square className="mr-2 size-4"/>中止</Button>:<Button className="w-full" disabled={!ally||!enemy} onClick={()=>void calculate()}><Swords className="mr-2 size-4"/>10×1で計算</Button>}</div>{result&&<div className="mt-4 rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-400">勝率</p><p className="text-3xl font-black text-amber-400">{typeof result.win_rate==='number'?`${(result.win_rate*100).toFixed(1)}%`:'—'}</p><p className="mt-2 text-xs text-slate-500">{result.runtime} / {result.version}</p></div>}</section>
    </main>
  </div>;
}

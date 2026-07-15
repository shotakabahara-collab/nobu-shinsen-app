import {useEffect,useMemo,useRef,useState} from 'react';
import {Download,Upload,Trash2,Swords,Square,Plus,Pencil,Target,Save,CheckCircle2,ImagePlus} from 'lucide-react';
import {Button} from './components/ui/button';
import {FormationEditor} from './components/FormationEditor';
import {CatalogManager} from './components/CatalogManager';
import {PwaStatus} from './components/PwaStatus';
import {InstallGuide} from './components/InstallGuide';
import {PwaDiagnostics} from './components/PwaDiagnostics';
import {BattleLogDetail} from './components/BattleLogDetail';
import {useAppStore} from './store/appStore';
import {createExport,downloadExport,parseImport} from './services/transfer';
import {toRuntimeFormation} from './runtime/formationAdapter';
import {RuntimeCancelledError,runtimeClient} from './runtime/runtimeClient';
import type {BattleResult,Formation} from './domain/schemas';
import type {RuntimeResult} from './runtime/contracts';
import {buildTargetOptimizationRequest} from './runtime/searchAdapter';
import {resolveFormationPair,resolveFormationSelection} from './domain/formationSelection';
import {buildRecommendationReasons,candidateSkillLines,getRankedRecommendations,getSearchScope,recommendationToFormation,type RankedRecommendation} from './domain/recommendation';
import {loadCanonicalOfficerCatalog} from './services/canonicalOfficerCatalog';
import {loadCanonicalOfficerStatsCatalog} from './services/canonicalOfficerStatsCatalog';
import {loadCanonicalSkillCatalog} from './services/canonicalSkillCatalog';
import {attachBattleSnapshot,buildBattleSnapshot} from './battleLog/battleLogView';
import {ENGINE_DISPLAY_NAME,ENGINE_DISPLAY_SUBTITLE,ENGINE_RESULT_LABEL} from './domain/engineBrand';

type Page='formations'|'battle'|'data';
type EditingState=Formation|'new'|'image'|null;

export default function App(){
 const store=useAppStore();
 const input=useRef<HTMLInputElement>(null);
 const [page,setPage]=useState<Page>('formations');
 const [editing,setEditing]=useState<EditingState>(null);
 const [notice,setNotice]=useState('');
 const [running,setRunning]=useState(false);
 const [result,setResult]=useState<RuntimeResult|null>(null);
 const [selectedLog,setSelectedLog]=useState<BattleResult|null>(null);
 const [searchResult,setSearchResult]=useState<RuntimeResult|null>(null);
 const [formalResult,setFormalResult]=useState<RuntimeResult|null>(null);
 const [formationAId,setFormationAId]=useState('');
 const [formationBId,setFormationBId]=useState('');
 const [optimizationTargetId,setOptimizationTargetId]=useState('');
 const [selectedRecommendationIndex,setSelectedRecommendationIndex]=useState(0);

 useEffect(()=>{void store.load();},[store.load]);
 useEffect(()=>{
  const [nextA,nextB]=resolveFormationPair(store.formations,formationAId,formationBId);
  if(nextA!==formationAId)setFormationAId(nextA);
  if(nextB!==formationBId)setFormationBId(nextB);
  const nextTarget=resolveFormationSelection(store.formations,optimizationTargetId);
  if(nextTarget!==optimizationTargetId)setOptimizationTargetId(nextTarget);
 },[store.formations,formationAId,formationBId,optimizationTargetId]);

 const formationA=store.formations.find(value=>value.id===formationAId);
 const formationB=store.formations.find(value=>value.id===formationBId);
 const optimizationTarget=store.formations.find(value=>value.id===optimizationTargetId);
 const recommendations=useMemo(()=>getRankedRecommendations(searchResult),[searchResult]);
 const selectedRecommendation=recommendations[selectedRecommendationIndex]??recommendations[0];
 const searchScope=useMemo(()=>getSearchScope(searchResult),[searchResult]);

 useEffect(()=>{setResult(null);},[formationAId,formationBId,formationA?.updatedAt,formationB?.updatedAt]);
 useEffect(()=>{setSearchResult(null);setFormalResult(null);setSelectedRecommendationIndex(0);},[optimizationTargetId,optimizationTarget?.updatedAt]);

 async function importFile(file?:File){
  if(!file)return;
  try{
   const value=parseImport(await file.text());
   const hasData=store.formations.length+store.warriors.length+store.skills.length+store.battleResults.length>0;
   if(hasData&&!window.confirm('現在の全データをバックアップ内容で置き換えますか？')){setNotice('Importをキャンセルしました');return;}
   await store.replaceAll(value);
   setNotice(`バックアップを復元しました（編成${value.formations.length}件）`);
  }catch{setNotice('形式が正しくないため読み込めません');}
 }

 function cancelRuntime(message='処理を中止しました'){
  runtimeClient.cancel();setRunning(false);setNotice(message);
 }

 async function calculate(){
  if(!formationA||!formationB||formationA.id===formationB.id)return;
  setRunning(true);setNotice(`${ENGINE_DISPLAY_NAME}で100戦／方向の勝率と勝敗例を計算中…`);
  try{
   const raw=await runtimeClient.calculate({candidate:toRuntimeFormation(formationA),target:formationB.id,target_spec:toRuntimeFormation(formationB),trials:100,blocks:1,seed:1326230000,include_detail:true,include_examples:true});
   if(typeof raw.win_rate!=='number')throw new Error('勝率が返されませんでした');
   let value:RuntimeResult=raw;
   try{const catalog=await loadCanonicalOfficerStatsCatalog();value=attachBattleSnapshot(raw,buildBattleSnapshot(formationA,formationB,catalog));}catch{/* battle calculation remains valid; detail view explains missing snapshot */}
   setResult(value);
   await store.saveBattleResult({id:crypto.randomUUID(),allyId:formationA.id,enemyId:formationB.id,createdAt:new Date().toISOString(),status:'completed',winRate:value.win_rate!,hpDiff:typeof value.hp_diff==='number'?value.hp_diff:null,trials:100,blocks:1,runtime:value.runtime,payload:value});
   setNotice(`${formationA.name}と${formationB.name}の100戦／方向計算が完了しました`);
  }catch(error){if(!(error instanceof RuntimeCancelledError))setNotice(error instanceof Error?error.message:'計算に失敗しました');}
  finally{setRunning(false);}
 }

 async function optimize(){
  if(!optimizationTarget)return;
  setRunning(true);setFormalResult(null);setSelectedRecommendationIndex(0);setNotice(`${optimizationTarget.name}への最適候補を探索中…`);
  try{const value=await runtimeClient.search(buildTargetOptimizationRequest(optimizationTarget,store.formations,store.warriors,store.skills));setSearchResult(value);setNotice('探索が完了しました。評価済み範囲の最適候補を表示します');}
  catch(error){if(!(error instanceof RuntimeCancelledError))setNotice(error instanceof Error?error.message:'探索に失敗しました');}
  finally{setRunning(false);}
 }

 async function formalize(){
  if(!optimizationTarget||!selectedRecommendation)return;
  setRunning(true);setNotice('選択候補を30×3で正式再評価中…');
  try{const value=await runtimeClient.formal({candidate:selectedRecommendation.candidate,targets:[{id:optimizationTarget.id,spec:toRuntimeFormation(optimizationTarget)}],trials:30,blocks:3,seed:1326247000});setFormalResult(value);setNotice('正式再評価が完了しました');}
  catch(error){if(!(error instanceof RuntimeCancelledError))setNotice(error instanceof Error?error.message:'正式再評価に失敗しました');}
  finally{setRunning(false);}
 }

 async function registerRecommendation(){
  if(!optimizationTarget||!selectedRecommendation)return;
  setRunning(true);setNotice('推奨編成を正本DBと照合して登録中…');
  try{
   const [officerCatalog,skillCatalog]=await Promise.all([loadCanonicalOfficerCatalog(),loadCanonicalSkillCatalog()]);
   const formation=recommendationToFormation(selectedRecommendation,optimizationTarget.name,selectedRecommendationIndex,store.formations.map(value=>value.name),officerCatalog.officers,skillCatalog.skills,officerCatalog.unitLevelRule);
   await store.save(formation);setFormationAId(formation.id);setNotice(`「${formation.name}」を編成登録しました。対戦候補として選択できます`);
  }catch(error){setNotice(error instanceof Error?error.message:'推奨編成の登録に失敗しました');}
  finally{setRunning(false);}
 }

 if(editing)return <Shell>{store.error&&<StorageError message={store.error} onClose={store.clearError}/>}<FormationEditor initial={editing==='new'||editing==='image'?undefined:editing} initialImageImportOpen={editing==='image'} warriors={store.warriors} skills={store.skills} onCancel={()=>setEditing(null)} onSave={async value=>{try{await store.save(value);setEditing(null);setNotice('編成を保存しました');}catch{/* store error remains visible */}}}/></Shell>;

 return <Shell>
  <PwaStatus/><InstallGuide/>
  <main className="space-y-4 pb-24">
   {store.error&&<StorageError message={store.error} onClose={store.clearError}/>} 
   {notice&&<p role="status" className="rounded-xl bg-amber-950 p-3 text-sm text-amber-300">{notice}</p>}

   {page==='formations'&&<>
    <div><h2 className="text-xl font-bold">編成</h2><p className="mt-1 text-sm text-slate-400">画像から読み込むか、手入力で登録します。</p></div>
    <section className="rounded-2xl border border-cyan-700 bg-cyan-950/30 p-4"><div className="flex items-start gap-3"><ImagePlus className="mt-1 size-6 shrink-0 text-cyan-300"/><div><h3 className="font-bold text-cyan-200">スクリーンショットから登録</h3><p className="mt-1 text-xs leading-5 text-slate-300">ゲームの編成画像から、兵種・武将・凸・装着戦法を読み取ります。解析結果を確認してから保存できます。</p></div></div><Button className="mt-4 w-full" onClick={()=>setEditing('image')}><ImagePlus className="mr-2 size-5"/>画像から編成登録</Button></section>
    <div className="flex items-center justify-between"><h3 className="font-bold">登録済み編成</h3><Button variant="secondary" onClick={()=>setEditing('new')}><Plus className="mr-2 size-4"/>手入力で新規</Button></div>
    {store.loading&&<p>読込中...</p>}
    {!store.loading&&!store.formations.length&&<p className="rounded-2xl border border-slate-700 bg-slate-900 py-12 text-center text-slate-500">編成を登録してください</p>}
    {store.formations.map(formation=><article key={formation.id} className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900 p-4"><div><strong>{formation.name}</strong><p className="text-xs text-slate-400">{formation.troopType} Lv{formation.troopLevel}・兵力{formation.troops}</p><p className="mt-1 text-xs text-slate-500">{formation.warriors.map(value=>value.name).join('・')}</p></div><div className="flex gap-2"><Button aria-label={`${formation.name}を編集`} variant="secondary" onClick={()=>setEditing(formation)}><Pencil className="size-4"/></Button><Button aria-label={`${formation.name}を削除`} variant="danger" onClick={()=>{if(window.confirm(`${formation.name}を削除しますか？`))void store.remove(formation.id).catch(()=>{});}}><Trash2 className="size-4"/></Button></div></article>)}
   </>}

   {page==='battle'&&<>
    <div><h2 className="text-xl font-bold">対戦・最適編成</h2><p className="mt-1 text-sm text-slate-400">登録した編成を自由にぶつけるか、1つの編成を対象に最適候補を探索します。</p></div>
    <section className="space-y-3 rounded-2xl border border-amber-800 bg-slate-900 p-4"><h3 className="font-bold">登録編成同士を対戦</h3><label className="block text-sm text-slate-400">編成A<select aria-label="編成A" className="mt-1 w-full rounded-lg bg-slate-950 p-3" value={formationAId} onChange={event=>setFormationAId(event.target.value)}><option value="">選択</option>{store.formations.map(formation=><option key={formation.id} value={formation.id} disabled={formation.id===formationBId}>{formation.name}</option>)}</select></label><label className="block text-sm text-slate-400">編成B<select aria-label="編成B" className="mt-1 w-full rounded-lg bg-slate-950 p-3" value={formationBId} onChange={event=>setFormationBId(event.target.value)}><option value="">選択</option>{store.formations.map(formation=><option key={formation.id} value={formation.id} disabled={formation.id===formationAId}>{formation.name}</option>)}</select></label>{running?<Button variant="danger" className="w-full" onClick={()=>cancelRuntime('計算を中止しました')}><Square className="mr-2 size-4"/>中止</Button>:<Button className="w-full" disabled={!formationA||!formationB||formationA.id===formationB.id} onClick={()=>void calculate()}><Swords className="mr-2 size-4"/>100戦／方向で対戦</Button>}{result&&<ResultCard result={result} label={`${formationA?.name??'編成A'}の勝率`}/>}</section>

    <section className="space-y-3 rounded-2xl border border-emerald-800 bg-slate-900 p-4"><div><h3 className="flex items-center font-bold"><Target className="mr-2 size-5 text-emerald-400"/>選択編成への最適候補</h3><p className="mt-1 text-sm text-slate-400">登録編成と所有武将・所有戦法を起点に、対象編成へ最も高い評価を得た候補を提示します。</p></div><label className="block text-sm text-slate-400">最適化する対象編成<select aria-label="最適化対象" className="mt-1 w-full rounded-lg bg-slate-950 p-3" value={optimizationTargetId} onChange={event=>setOptimizationTargetId(event.target.value)}><option value="">選択</option>{store.formations.map(formation=><option key={formation.id} value={formation.id}>{formation.name}</option>)}</select></label>{running?<Button variant="danger" className="w-full" onClick={()=>cancelRuntime('探索を中止しました')}><Square className="mr-2 size-4"/>中止</Button>:<Button className="w-full" disabled={!optimizationTarget} onClick={()=>void optimize()}>最適編成を探索</Button>}{searchResult&&<RecommendationPanel recommendations={recommendations} selectedIndex={selectedRecommendationIndex} onSelect={index=>{setSelectedRecommendationIndex(index);setFormalResult(null);}} targetId={optimizationTargetId} scope={searchScope}/>} {selectedRecommendation&&<div className="grid gap-3 sm:grid-cols-2"><Button variant="secondary" disabled={running} onClick={()=>void formalize()}>選択候補を30×3再評価</Button><Button disabled={running} onClick={()=>void registerRecommendation()}><Save className="mr-2 size-4"/>選択候補を編成登録</Button></div>}{formalResult&&<FormalCard result={formalResult}/>}</section>

    <h3 className="font-bold">Battle Log</h3>
    {store.battleResults.slice(0,10).map(log=>{const a=store.formations.find(value=>value.id===log.allyId)?.name??'編成A';const b=store.formations.find(value=>value.id===log.enemyId)?.name??'編成B';return <button key={log.id} className="w-full rounded-xl bg-slate-900 p-3 text-left" onClick={()=>setSelectedLog(log)}><strong>{a} vs {b}</strong><span className="ml-3 text-xs text-slate-400">A勝率 {(log.winRate*100).toFixed(1)}%・{log.trials}戦／方向・HP差 {log.hpDiff?.toFixed(1)??'—'}・{new Date(log.createdAt).toLocaleString('ja-JP')}</span></button>;})}
    {selectedLog&&<BattleLogDetail log={selectedLog} formations={store.formations} onClose={()=>setSelectedLog(null)}/>} 
   </>}

   {page==='data'&&<><h2 className="text-xl font-bold">データ</h2><PwaDiagnostics/><CatalogManager warriors={store.warriors} skills={store.skills} onSaveWarrior={store.saveWarrior} onRemoveWarrior={store.removeWarrior} onSaveSkill={store.saveSkill} onRemoveSkill={store.removeSkill}/><section className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><h3 className="mb-3 font-bold">完全バックアップ</h3><div className="grid grid-cols-2 gap-3"><Button onClick={()=>downloadExport(createExport(store.formations,store.warriors,store.skills,store.battleResults))}><Download className="mr-2 size-4"/>Export</Button><Button variant="secondary" onClick={()=>input.current?.click()}><Upload className="mr-2 size-4"/>Import</Button></div><p className="mt-2 text-xs text-slate-500">編成・武将・戦法・Battle Logを一括保存／復元します。</p><input ref={input} className="hidden" type="file" accept="application/json,.json" onChange={event=>void importFile(event.target.files?.[0])}/></section></>}
  </main>
  <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto grid max-w-3xl grid-cols-3 border-t border-slate-700 bg-slate-950/95 p-2 safe-bottom">{([['formations','編成'],['battle','対戦・提案'],['data','データ']] as const).map(([id,label])=><button key={id} className={`min-h-12 rounded-lg ${page===id?'bg-amber-500 text-slate-950':'text-slate-400'}`} onClick={()=>setPage(id)}>{label}</button>)}</nav>
 </Shell>;
}

function RecommendationPanel({recommendations,selectedIndex,onSelect,targetId,scope}:{recommendations:RankedRecommendation[];selectedIndex:number;onSelect:(index:number)=>void;targetId:string;scope:ReturnType<typeof getSearchScope>}){
 if(!recommendations.length)return <p role="alert" className="rounded-xl bg-red-950 p-3 text-sm text-red-300">合法な推奨候補を生成できませんでした。登録武将・戦法・編成内容を確認してください。</p>;
 return <div className="space-y-3" aria-label="最適編成候補"><p className="rounded-lg bg-slate-950 p-3 text-xs text-slate-400">評価 {scope.generated??0}/{scope.budget??0}・{scope.budget_cut?'予算打切り':'設定範囲完了'}。表示順位は評価済み範囲内であり、大域的な絶対最適を保証しません。</p>{recommendations.map((item,index)=>{const selected=index===selectedIndex;const rate=item.win_rates?.[targetId]??item.avg_win_rate??item.min_win_rate;const hp=item.hp_diffs?.[targetId];return <button type="button" key={`${item.candidate.officers.join('-')}-${index}`} aria-pressed={selected} onClick={()=>onSelect(index)} className={`w-full rounded-xl border p-4 text-left ${selected?'border-emerald-400 bg-emerald-950/40':'border-slate-700 bg-slate-950'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-emerald-300">候補{index+1} {selected&&<span className="ml-1 text-xs">選択中</span>}</p><p className="mt-1">{item.candidate.officers.join('・')}／{item.candidate.unit}</p></div>{selected&&<CheckCircle2 className="size-5 shrink-0 text-emerald-400"/>}</div><p className="mt-2 text-sm text-slate-300">計測勝率 {typeof rate==='number'?`${(rate*100).toFixed(1)}%`:'—'}・HP差 {typeof hp==='number'?`${hp>=0?'+':''}${hp.toFixed(1)}`:'—'}</p><div className="mt-3 space-y-1 text-xs text-slate-400">{candidateSkillLines(item.candidate).map(line=><p key={line}>{line}</p>)}</div><div className="mt-3 border-t border-slate-700 pt-3"><p className="text-xs font-bold text-amber-300">推奨理由</p><ul className="mt-1 space-y-1 text-xs text-slate-400">{buildRecommendationReasons(item,index,targetId,scope).map(reason=><li key={reason}>・{reason}</li>)}</ul></div></button>;})}</div>;
}

function Shell({children}:{children:React.ReactNode}){return <div className="mx-auto min-h-screen max-w-3xl px-4 safe-top safe-bottom"><header className="py-5"><p className="text-xs tracking-[.3em] text-amber-400">SHINSEN TOOLKIT</p><h1 className="text-3xl font-black">NOBU Companion</h1><p className="mt-2 text-sm text-slate-400">{ENGINE_DISPLAY_SUBTITLE}</p></header>{children}</div>}
function StorageError({message,onClose}:{message:string;onClose:()=>void}){return <aside role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-red-950 p-3 text-sm text-red-200"><span>{message}</span><Button variant="secondary" onClick={onClose}>閉じる</Button></aside>}
function ResultCard({result,label}:{result:RuntimeResult;label:string}){return <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-400">{label}</p><p className="text-3xl font-black text-amber-400">{typeof result.win_rate==='number'?`${(result.win_rate*100).toFixed(1)}%`:'—'}</p><p className="text-sm text-slate-400">100戦／方向 × 正逆2方向・HP差 {typeof result.hp_diff==='number'?result.hp_diff.toFixed(1):'—'}</p><p className="mt-2 text-xs text-slate-500">{ENGINE_RESULT_LABEL}</p></div>}
function FormalCard({result}:{result:RuntimeResult}){return <div className="rounded-xl border border-amber-700 bg-slate-950 p-4"><p className="font-bold">30×3正式再評価</p><p className="text-3xl font-black text-amber-400">{typeof result.min_win_rate==='number'?`${(result.min_win_rate*100).toFixed(1)}%`:'—'}</p><p className="text-xs text-slate-500">{String(result.verification_level||'')}</p></div>}

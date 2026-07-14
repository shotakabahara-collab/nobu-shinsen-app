import {useCallback,useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Circle,Play,RefreshCw,RotateCcw} from 'lucide-react';
import {collectPwaDiagnostics,requestPersistentStorage,type PwaDiagnostics as DiagnosticResult} from '../pwa/diagnostics';
import {runtimeClient} from '../runtime/runtimeClient';
import {
 DEVICE_RELEASE_STORAGE_KEY,
 assessDeviceRelease,
 deviceReleaseRequest,
 emptyDeviceRuntimeEvidence,
 parseDeviceRuntimeEvidence,
 recordDeviceRuntimeEvidence,
 type DeviceRuntimeEvidence,
} from '../release/deviceReleaseCheck';
import {ENGINE_DISPLAY_NAME,ENGINE_RESULT_LABEL} from '../domain/engineBrand';
import {Button} from './ui/button';

const initial:DiagnosticResult={standalone:false,online:navigator.onLine,serviceWorker:false,offlineCache:false,persistedStorage:null};

const labels={
 standalone:'ホーム画面からstandalone起動',
 serviceWorker:'Service Worker登録',
 offlineCache:'オフライン資産準備',
 storage:'端末ストレージ保持',
 onlineRuntime:'オンラインで正本準拠計算',
 offlineRuntime:'機内モードで正本準拠計算',
};

export function PwaDiagnostics(){
 const [value,setValue]=useState(initial),[loading,setLoading]=useState(true),[running,setRunning]=useState(false),[message,setMessage]=useState('');
 const [evidence,setEvidence]=useState<DeviceRuntimeEvidence>(()=>parseDeviceRuntimeEvidence(localStorage.getItem(DEVICE_RELEASE_STORAGE_KEY)));
 const refresh=useCallback(async()=>{setLoading(true);try{setValue(await collectPwaDiagnostics());}finally{setLoading(false);}},[]);
 const persist=useCallback(async()=>{setLoading(true);try{await requestPersistentStorage();setValue(await collectPwaDiagnostics());}finally{setLoading(false);}},[]);
 const assessment=useMemo(()=>assessDeviceRelease(value,evidence),[value,evidence]);
 useEffect(()=>{void refresh();const update=()=>void refresh();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[refresh]);
 async function runSelfTest(){
  const connection=navigator.onLine?'オンライン':'オフライン';
  setRunning(true);setMessage(`${connection}で${ENGINE_DISPLAY_NAME}を確認中…`);
  try{
   const result=await runtimeClient.calculate(deviceReleaseRequest),next=recordDeviceRuntimeEvidence(evidence,result,navigator.onLine);
   setEvidence(next);localStorage.setItem(DEVICE_RELEASE_STORAGE_KEY,JSON.stringify(next));setMessage(`${connection}実計算に成功しました`);
  }catch(error){
   const next={...evidence,lastError:error instanceof Error?error.message:'実計算に失敗しました'};setEvidence(next);localStorage.setItem(DEVICE_RELEASE_STORAGE_KEY,JSON.stringify(next));setMessage(next.lastError!);
  }finally{setRunning(false);await refresh();}
 }
 function reset(){localStorage.removeItem(DEVICE_RELEASE_STORAGE_KEY);setEvidence(emptyDeviceRuntimeEvidence);setMessage('実機診断の計算証跡をリセットしました');}
 return <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4" aria-label="PWA実機診断">
  <div className="flex items-center justify-between"><div><h3 className="font-bold">PWA実機診断</h3><p className="text-xs text-slate-400">リリースゲート {assessment.passed}/{assessment.total}</p></div><Button variant="secondary" aria-label="診断を更新" onClick={()=>void refresh()} disabled={loading||running}><RefreshCw className={`size-4 ${loading?'animate-spin':''}`}/></Button></div>
  <div className={`mt-3 rounded-xl p-3 text-sm ${assessment.ready?'bg-emerald-950 text-emerald-200':'bg-slate-950 text-slate-300'}`}><strong>{assessment.ready?'物理iPhoneリリース診断 PASS':'物理iPhoneリリース診断 未完了'}</strong><p className="mt-1 text-xs">オンラインで一度実行し、ホーム画面へ追加後に機内モードで再起動してもう一度実行します。</p></div>
  <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
   <dt className="text-slate-400">起動方法</dt><dd>{value.standalone?'ホーム画面':'ブラウザ'}</dd>
   <dt className="text-slate-400">ネットワーク</dt><dd>{value.online?'オンライン':'オフライン'}</dd>
   <dt className="text-slate-400">Service Worker</dt><dd>{value.serviceWorker?'登録済み':'未登録'}</dd>
   <dt className="text-slate-400">オフラインキャッシュ</dt><dd>{value.offlineCache?'準備済み':'未準備'}</dd>
   <dt className="text-slate-400">ストレージ保持</dt><dd>{value.persistedStorage===true?'永続化済み':value.persistedStorage===false?'ブラウザ管理':'判定非対応'}</dd>
  </dl>
  <ul className="mt-4 space-y-2" aria-label="リリース診断項目">{Object.entries(assessment.checks).map(([key,passed])=><li key={key} className="flex items-center gap-2 text-sm">{passed?<CheckCircle2 className="size-4 text-emerald-400"/>:<Circle className="size-4 text-slate-600"/>}<span>{labels[key as keyof typeof labels]}</span></li>)}</ul>
  {evidence.lastRuntime&&<div className="mt-3 rounded-xl bg-slate-950 p-3 text-xs text-slate-400"><p>{ENGINE_RESULT_LABEL}</p><p>実勝率 {evidence.lastWinRate===null?'—':`${(evidence.lastWinRate*100).toFixed(1)}%`} / HP差 {evidence.lastHpDiff?.toFixed(1)??'—'}</p>{evidence.onlinePassedAt&&<p>オンラインPASS {new Date(evidence.onlinePassedAt).toLocaleString('ja-JP')}</p>}{evidence.offlinePassedAt&&<p>オフラインPASS {new Date(evidence.offlinePassedAt).toLocaleString('ja-JP')}</p>}</div>}
  {message&&<p className="mt-3 text-sm text-amber-300">{message}</p>}
  <Button className="mt-3 w-full" onClick={()=>void runSelfTest()} disabled={loading||running}>{running?<RefreshCw className="mr-2 size-4 animate-spin"/>:<Play className="mr-2 size-4"/>}{navigator.onLine?'オンライン':'オフライン'}正本準拠診断</Button>
  {value.persistedStorage===false&&<Button className="mt-2 w-full" variant="secondary" onClick={()=>void persist()} disabled={loading||running}>データ保持を要求</Button>}
  {(evidence.onlinePassedAt||evidence.offlinePassedAt||evidence.lastError)&&<Button className="mt-2 w-full" variant="secondary" onClick={reset} disabled={running}><RotateCcw className="mr-2 size-4"/>診断履歴をリセット</Button>}
 </section>;
}

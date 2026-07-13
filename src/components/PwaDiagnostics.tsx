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
import {Button} from './ui/button';

const initial:DiagnosticResult={standalone:false,online:navigator.onLine,serviceWorker:false,offlineCache:false,persistedStorage:null};

const labels={
 standalone:'ホーム画面からstandalone起動',
 serviceWorker:'Service Worker登録',
 offlineCache:'オフライン資産準備',
 storage:'端末ストレージ再起動保持',
 onlineRuntime:'オンラインで実b223計算',
 offlineRuntime:'機内モードで実b223計算',
};

export function PwaDiagnostics(){
 const bootId=useMemo(()=>crypto.randomUUID(),[]);
 const [value,setValue]=useState(initial),[loading,setLoading]=useState(true),[running,setRunning]=useState(false),[message,setMessage]=useState('');
 const [evidence,setEvidence]=useState<DeviceRuntimeEvidence>(()=>parseDeviceRuntimeEvidence(localStorage.getItem(DEVICE_RELEASE_STORAGE_KEY)));
 const refresh=useCallback(async()=>{setLoading(true);try{setValue(await collectPwaDiagnostics());}finally{setLoading(false);}},[]);
 const persist=useCallback(async()=>{setLoading(true);try{const result=await requestPersistentStorage();setMessage(result===true?'OSの永続化許可を確認しました':result===false?'OS管理のため、再起動後の保存証跡で確認します':'永続化API非対応のため、再起動後の保存証跡で確認します');setValue(await collectPwaDiagnostics());}finally{setLoading(false);}},[]);
 const assessment=useMemo(()=>assessDeviceRelease(value,evidence),[value,evidence]);
 const storageLabel=value.persistedStorage===true?'永続化済み':assessment.checks.storage?'再起動保持確認済み':value.persistedStorage===false?'ブラウザ管理・再起動確認待ち':'再起動確認待ち';
 useEffect(()=>{void refresh();const update=()=>void refresh();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[refresh]);
 async function runSelfTest(){
  const online=navigator.onLine;
  setRunning(true);setMessage(`${online?'オンライン':'オフライン'}でcanonical b223を確認中…`);
  try{
   const result=await runtimeClient.calculate(deviceReleaseRequest),next=recordDeviceRuntimeEvidence(evidence,result,online,bootId);
   setEvidence(next);localStorage.setItem(DEVICE_RELEASE_STORAGE_KEY,JSON.stringify(next));
   if(online)setMessage('オンライン実計算に成功しました。アプリを閉じ、機内モードでホーム画面から再起動してください');
   else if(next.storageVerifiedAt)setMessage('オフライン実計算と再起動後のデータ保持を確認しました');
   else setMessage('オフライン実計算に成功しました。保存確認のため、アプリを閉じてホーム画面から再起動後にもう一度実行してください');
  }catch(error){
   const next={...evidence,lastError:error instanceof Error?error.message:'実計算に失敗しました'};setEvidence(next);localStorage.setItem(DEVICE_RELEASE_STORAGE_KEY,JSON.stringify(next));setMessage(next.lastError!);
  }finally{setRunning(false);await refresh();}
 }
 function reset(){localStorage.removeItem(DEVICE_RELEASE_STORAGE_KEY);setEvidence(emptyDeviceRuntimeEvidence);setMessage('実機診断の計算証跡をリセットしました');}
 return <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4" aria-label="PWA実機診断">
  <div className="flex items-center justify-between"><div><h3 className="font-bold">PWA実機診断</h3><p className="text-xs text-slate-400">リリースゲート {assessment.passed}/{assessment.total}</p></div><Button variant="secondary" aria-label="診断を更新" onClick={()=>void refresh()} disabled={loading||running}><RefreshCw className={`size-4 ${loading?'animate-spin':''}`}/></Button></div>
  <div className={`mt-3 rounded-xl p-3 text-sm ${assessment.ready?'bg-emerald-950 text-emerald-200':'bg-slate-950 text-slate-300'}`}><strong>{assessment.ready?'物理iPhoneリリース診断 PASS':'物理iPhoneリリース診断 未完了'}</strong><p className="mt-1 text-xs">オンライン診断後にアプリを閉じ、ホーム画面から機内モードで再起動してオフライン診断を実行します。</p></div>
  <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
   <dt className="text-slate-400">起動方法</dt><dd>{value.standalone?'ホーム画面':'ブラウザ'}</dd>
   <dt className="text-slate-400">ネットワーク</dt><dd>{value.online?'オンライン':'オフライン'}</dd>
   <dt className="text-slate-400">Service Worker</dt><dd>{value.serviceWorker?'登録済み':'未登録'}</dd>
   <dt className="text-slate-400">オフラインキャッシュ</dt><dd>{value.offlineCache?'準備済み':'未準備'}</dd>
   <dt className="text-slate-400">ストレージ保持</dt><dd>{storageLabel}</dd>
  </dl>
  <ul className="mt-4 space-y-2" aria-label="リリース診断項目">{Object.entries(assessment.checks).map(([key,passed])=><li key={key} className="flex items-center gap-2 text-sm">{passed?<CheckCircle2 className="size-4 text-emerald-400"/>:<Circle className="size-4 text-slate-600"/>}<span>{labels[key as keyof typeof labels]}</span></li>)}</ul>
  {evidence.lastRuntime&&<div className="mt-3 rounded-xl bg-slate-950 p-3 text-xs text-slate-400"><p>{evidence.lastRuntime}</p><p>実勝率 {evidence.lastWinRate===null?'—':`${(evidence.lastWinRate*100).toFixed(1)}%`} / HP差 {evidence.lastHpDiff?.toFixed(1)??'—'}</p>{evidence.onlinePassedAt&&<p>オンラインPASS {new Date(evidence.onlinePassedAt).toLocaleString('ja-JP')}</p>}{evidence.offlinePassedAt&&<p>オフラインPASS {new Date(evidence.offlinePassedAt).toLocaleString('ja-JP')}</p>}{evidence.storageVerifiedAt&&<p>再起動保持PASS {new Date(evidence.storageVerifiedAt).toLocaleString('ja-JP')}</p>}</div>}
  {message&&<p className="mt-3 text-sm text-amber-300">{message}</p>}
  <Button className="mt-3 w-full" onClick={()=>void runSelfTest()} disabled={loading||running}>{running?<RefreshCw className="mr-2 size-4 animate-spin"/>:<Play className="mr-2 size-4"/>}{navigator.onLine?'オンライン':'オフライン'}実b223自己診断</Button>
  {value.persistedStorage===false&&!assessment.checks.storage&&<Button className="mt-2 w-full" variant="secondary" onClick={()=>void persist()} disabled={loading||running}>OSへデータ保持を要求（任意）</Button>}
  {(evidence.onlinePassedAt||evidence.offlinePassedAt||evidence.lastError)&&<Button className="mt-2 w-full" variant="secondary" onClick={reset} disabled={running}><RotateCcw className="mr-2 size-4"/>診断履歴をリセット</Button>}
 </section>;
}
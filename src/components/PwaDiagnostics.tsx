import {useCallback,useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {collectPwaDiagnostics,type PwaDiagnostics as DiagnosticResult} from '../pwa/diagnostics';
import {Button} from './ui/button';

const initial:DiagnosticResult={standalone:false,online:navigator.onLine,serviceWorker:false,offlineCache:false,persistedStorage:null};

export function PwaDiagnostics(){
 const [value,setValue]=useState(initial),[loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{setLoading(true);try{setValue(await collectPwaDiagnostics());}finally{setLoading(false);}},[]);
 useEffect(()=>{void refresh();const update=()=>void refresh();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[refresh]);
 return <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4" aria-label="PWA実機診断">
  <div className="flex items-center justify-between"><h3 className="font-bold">PWA実機診断</h3><Button variant="secondary" aria-label="診断を更新" onClick={()=>void refresh()} disabled={loading}><RefreshCw className={`size-4 ${loading?'animate-spin':''}`}/></Button></div>
  <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
   <dt className="text-slate-400">起動方法</dt><dd>{value.standalone?'ホーム画面':'ブラウザ'}</dd>
   <dt className="text-slate-400">ネットワーク</dt><dd>{value.online?'オンライン':'オフライン'}</dd>
   <dt className="text-slate-400">Service Worker</dt><dd>{value.serviceWorker?'登録済み':'未登録'}</dd>
   <dt className="text-slate-400">オフラインキャッシュ</dt><dd>{value.offlineCache?'準備済み':'未準備'}</dd>
   <dt className="text-slate-400">ストレージ保持</dt><dd>{value.persistedStorage===true?'永続化済み':value.persistedStorage===false?'ブラウザ管理':'判定非対応'}</dd>
  </dl>
 </section>;
}

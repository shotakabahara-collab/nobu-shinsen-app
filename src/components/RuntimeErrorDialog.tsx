import {AlertTriangle,RefreshCw} from 'lucide-react';
import type {RuntimeErrorPresentation} from '../runtime/runtimeErrors';
import {Button} from './ui/button';

type Props={
 error:RuntimeErrorPresentation;
 onClose:()=>void;
 onReload:()=>void;
};

export function RuntimeErrorDialog({error,onClose,onReload}:Props){
 return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-5" role="alertdialog" aria-modal="true" aria-labelledby="runtime-error-title" aria-describedby="runtime-error-message">
  <section className="w-full max-w-md rounded-2xl border border-red-500 bg-slate-900 p-5 shadow-2xl">
   <div className="flex items-start gap-3">
    <AlertTriangle className="mt-0.5 size-6 shrink-0 text-red-400"/>
    <div>
     <p className="text-xs font-bold tracking-wider text-red-300">{error.code}</p>
     <h2 id="runtime-error-title" className="mt-1 text-lg font-bold text-white">{error.title}</h2>
    </div>
   </div>
   <p id="runtime-error-message" className="mt-4 text-sm leading-6 text-slate-200">{error.message}</p>
   <div className="mt-4 rounded-xl bg-slate-950 p-3">
    <p className="text-xs font-bold text-amber-300">対処方法</p>
    <p className="mt-1 text-sm leading-6 text-slate-300">{error.action}</p>
   </div>
   <p className="mt-3 text-xs text-slate-500">英語の内部スタックは画面に表示せず、エラー番号だけを残しています。</p>
   <div className={`mt-5 grid gap-3 ${error.reloadRecommended?'grid-cols-2':'grid-cols-1'}`}>
    <Button type="button" variant="secondary" onClick={onClose}>閉じる</Button>
    {error.reloadRecommended&&<Button type="button" onClick={onReload}><RefreshCw className="mr-2 size-4"/>再読み込み</Button>}
   </div>
  </section>
 </div>;
}

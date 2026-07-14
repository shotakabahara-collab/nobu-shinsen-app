import {useState} from 'react';
import {AlertTriangle,ChevronDown,ChevronUp,Copy,RotateCcw,X} from 'lucide-react';
import type {RuntimeErrorInfo} from '../domain/runtimeError';
import {Button} from './ui/button';

export function RuntimeErrorDialog({error,onClose,onRetry}:{error:RuntimeErrorInfo;onClose:()=>void;onRetry?:()=>void}){
 const [showDetail,setShowDetail]=useState(false);const [copied,setCopied]=useState(false);
 async function copyDetail(){
  const text=[`エラーコード: ${error.code}`,`タイトル: ${error.title}`,`メッセージ: ${error.message}`,'','開発者向け詳細:',error.detail].join('\n');
  try{await navigator.clipboard.writeText(text);setCopied(true);}catch{setCopied(false);}
 }
 return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4" role="alertdialog" aria-modal="true" aria-labelledby="runtime-error-title" aria-describedby="runtime-error-message">
  <section className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl border border-red-500 bg-slate-900 p-5 shadow-2xl">
   <div className="flex items-start gap-3"><AlertTriangle className="mt-1 size-6 shrink-0 text-red-400"/><div className="min-w-0 flex-1"><p className="text-xs font-bold tracking-wider text-red-300">{error.code}</p><h2 id="runtime-error-title" className="mt-1 text-xl font-bold text-white">{error.title}</h2></div><button type="button" aria-label="エラーを閉じる" className="rounded-lg p-2 text-slate-400" onClick={onClose}><X className="size-5"/></button></div>
   <p id="runtime-error-message" className="mt-4 leading-7 text-slate-200">{error.message}</p>
   <div className="mt-4 rounded-xl bg-slate-950 p-4"><p className="text-sm font-bold text-amber-300">確認してください</p><ul className="mt-2 space-y-2 text-sm text-slate-300">{error.guidance.map(item=><li key={item}>・{item}</li>)}</ul></div>
   <div className="mt-5 grid gap-3">
    {error.retryable&&onRetry&&<Button onClick={onRetry}><RotateCcw className="mr-2 size-4"/>もう一度実行</Button>}
    <Button variant="secondary" onClick={()=>setShowDetail(value=>!value)}>{showDetail?<ChevronUp className="mr-2 size-4"/>:<ChevronDown className="mr-2 size-4"/>}{showDetail?'詳細を閉じる':'開発者向け詳細を見る'}</Button>
    <Button variant="secondary" onClick={()=>void copyDetail()}><Copy className="mr-2 size-4"/>{copied?'コピーしました':'詳細をコピー'}</Button>
    <Button variant="secondary" onClick={onClose}>閉じる</Button>
   </div>
   {showDetail&&<pre aria-label="開発者向けエラー詳細" className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-black p-3 text-xs text-slate-300">{error.detail}</pre>}
  </section>
 </div>;
}

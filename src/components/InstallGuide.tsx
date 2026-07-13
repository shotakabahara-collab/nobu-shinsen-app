import {Share} from 'lucide-react';
import {readAppleInstallState} from '../pwa/install';

export function InstallGuide(){
 if(readAppleInstallState()!=='browser')return null;
 return <aside className="mb-3 rounded-xl border border-amber-800 bg-slate-900 p-3 text-sm">
  <details>
   <summary className="min-h-11 cursor-pointer content-center font-semibold text-amber-300">iPhoneホーム画面に追加</summary>
   <ol className="ml-5 list-decimal space-y-2 pb-1 text-slate-300">
    <li>Safari下部の共有 <Share aria-label="共有アイコン" className="inline size-4"/> を開く</li>
    <li>「ホーム画面に追加」を選ぶ</li>
    <li>右上の「追加」を押す</li>
   </ol>
   <p className="mt-2 text-xs text-slate-500">初回オンライン起動で「オフライン利用の準備が完了しました」と表示された後に追加してください。</p>
  </details>
 </aside>;
}

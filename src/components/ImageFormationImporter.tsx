import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,Camera,CheckCircle2,ChevronLeft,ChevronRight,ClipboardPaste,Eye,EyeOff,ImagePlus,Images,Loader2,Maximize2,Minimize2,RotateCcw,X} from 'lucide-react';
import type {UnitType} from '../domain/formationRules';
import type {WarriorRecord} from '../domain/schemas';
import {recognizeFormationImages} from '../imageImport/browserOcr';
import {parseFormationImages,type FormationImageDraft,type ImportedField,type OcrPage} from '../imageImport/formationImageParser';
import type {CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import type {CanonicalSkill} from '../services/canonicalSkillCatalog';
import {Button} from './ui/button';

export type ImageFormationImportValue={
 troopType?:UnitType;
 warriors:{name?:string;limitBreak?:number;equippedSkills:[string,string]}[];
};

type Props={
 officers:CanonicalOfficer[];
 skills:CanonicalSkill[];
 ownedWarriors:WarriorRecord[];
 onApply:(value:ImageFormationImportValue)=>void;
 recognize?:typeof recognizeFormationImages;
 initialOpen?:boolean;
};

const confidenceLabel={high:'確定度 高',medium:'要確認',low:'候補',missing:'未確認'} as const;
const confidenceStyle={high:'bg-emerald-950 text-emerald-300',medium:'bg-amber-950 text-amber-300',low:'bg-orange-950 text-orange-300',missing:'bg-red-950 text-red-300'} as const;

function FieldView<T>({label,field,format=String}:{label:string;field:ImportedField<T>;format?:(value:T)=>string}){
 return <div className="rounded-lg bg-slate-950 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-400">{label}</span><span className={`rounded-full px-2 py-1 text-[10px] ${confidenceStyle[field.confidence]}`}>{confidenceLabel[field.confidence]}</span></div><p className="mt-1 font-medium">{field.value===null?'未確認':format(field.value)}</p><p className="mt-1 line-clamp-2 text-[10px] text-slate-500">{field.evidence}</p></div>;
}

function toApplyValue(draft:FormationImageDraft):ImageFormationImportValue{
 return {
  ...(draft.troopType.value?{troopType:draft.troopType.value}:{}),
  warriors:draft.warriors.map(warrior=>({
   ...(warrior.name.value?{name:warrior.name.value}:{}),
   ...(warrior.limitBreak.value!==null?{limitBreak:warrior.limitBreak.value}:{}),
   equippedSkills:[warrior.equippedSkills[0].value??'',warrior.equippedSkills[1].value??''],
  })),
 };
}

export function ImageFormationImporter({officers,skills,ownedWarriors,onApply,recognize=recognizeFormationImages,initialOpen=false}:Props){
 const libraryInput=useRef<HTMLInputElement>(null);
 const cameraInput=useRef<HTMLInputElement>(null);
 const pasteZone=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(initialOpen);const [files,setFiles]=useState<File[]>([]);const [previews,setPreviews]=useState<string[]>([]);
 const [running,setRunning]=useState(false);const [progress,setProgress]=useState(0);const [status,setStatus]=useState('');const [error,setError]=useState('');const [draft,setDraft]=useState<FormationImageDraft|null>(null);
 const [referenceMode,setReferenceMode]=useState(false);const [activePreview,setActivePreview]=useState(0);const [compactReference,setCompactReference]=useState(false);const [zoomOpen,setZoomOpen]=useState(false);

 useEffect(()=>{const urls=files.map(file=>URL.createObjectURL(file));setPreviews(urls);return()=>urls.forEach(URL.revokeObjectURL);},[files]);

 function acceptFiles(next:File[]){
  const images=next.filter(file=>file.type.startsWith('image/')).slice(0,4);
  if(!images.length){setError('画像ファイルを選択してください');return;}
  setFiles(images);setDraft(null);setError('');setStatus('');setProgress(0);setReferenceMode(false);setActivePreview(0);setCompactReference(false);setZoomOpen(false);
 }

 function handlePaste(event:React.ClipboardEvent<HTMLDivElement>){
  const images=Array.from(event.clipboardData.items).filter(item=>item.type.startsWith('image/')).map(item=>item.getAsFile()).filter((file):file is File=>Boolean(file));
  if(images.length){event.preventDefault();acceptFiles(images);}
 }

 async function analyze(){
  if(!files.length||!officers.length||!skills.length)return;
  setRunning(true);setError('');setDraft(null);
  try{
   const pages:OcrPage[]=await recognize(files,(message,value)=>{setStatus(message);setProgress(value);});
   const parsed=parseFormationImages(pages,officers,skills,ownedWarriors);setDraft(parsed);setStatus('解析結果を確認してください');setProgress(1);
  }catch(reason){setError(reason instanceof Error?reason.message:'画像解析に失敗しました');setStatus('');}
  finally{setRunning(false);}
 }

 function reset(){
  setFiles([]);setDraft(null);setError('');setStatus('');setProgress(0);setReferenceMode(false);setActivePreview(0);setCompactReference(false);setZoomOpen(false);
  if(libraryInput.current)libraryInput.current.value='';
  if(cameraInput.current)cameraInput.current.value='';
 }

 const keepReferenceVisible=referenceMode&&open&&previews.length>0;
 const activePreviewUrl=previews[activePreview]??previews[0];
 const activePreviewNumber=Math.min(activePreview+1,previews.length);
 const toggleLabel=referenceMode?(open?'画像を隠す':'元画像を表示'):(open?'閉じる':'開く');

 return <section className={`rounded-2xl border bg-slate-900 p-4 ${keepReferenceVisible?'sticky z-20 border-cyan-400 bg-slate-900/95 shadow-2xl shadow-black/60 backdrop-blur':'border-cyan-800'}`} style={keepReferenceVisible?{top:'calc(env(safe-area-inset-top) + 0.5rem)'}:undefined} aria-label="画像から編成を読み込む">
  <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center font-bold text-cyan-300">{referenceMode?<Eye className="mr-2 size-5"/>:<ImagePlus className="mr-2 size-5"/>}{referenceMode?'元画像を見ながら編集中':'画像から編成を読み込む'}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{referenceMode?'武将や戦法を入れ替え・編集しても、元画像はこの編集画面を閉じるまで保持されます。画像自体は保存されません。':'スクリーンショットを最大4枚選択し、武将・兵種・装着戦法・凸を正本DBと照合します。3武将が横並びの画面はカードごとに自動分割します。'}</p></div><Button type="button" variant="secondary" onClick={()=>{setOpen(value=>!value);setZoomOpen(false);}}>{open?<EyeOff className="mr-2 size-4"/>:<Eye className="mr-2 size-4"/>}{toggleLabel}</Button></div>
  {open&&<div className="mt-4 space-y-4">
   {referenceMode&&activePreviewUrl?<div role="region" aria-label="編集中の元画像" className="space-y-3">
    <button type="button" aria-label={`元画像${activePreviewNumber}を拡大表示`} onClick={()=>setZoomOpen(true)} className="block w-full overflow-hidden rounded-xl border border-cyan-700 bg-black p-1">
     <img src={activePreviewUrl} alt={`編集中の元画像${activePreviewNumber}`} className={`w-full object-contain transition-[max-height] ${compactReference?'max-h-24':'max-h-[32vh]'}`}/>
    </button>
    {previews.length>1&&<div className="flex items-center justify-between gap-2" aria-label="元画像の切り替え">
     <Button type="button" variant="secondary" aria-label="前の元画像" onClick={()=>setActivePreview(index=>(index-1+previews.length)%previews.length)}><ChevronLeft className="size-4"/></Button>
     <div className="flex min-w-0 flex-1 justify-center gap-2">{previews.map((url,index)=><button type="button" key={url} aria-label={`元画像${index+1}を表示`} aria-pressed={index===activePreview} onClick={()=>setActivePreview(index)} className={`h-2.5 rounded-full transition-all ${index===activePreview?'w-8 bg-cyan-300':'w-2.5 bg-slate-600'}`}/>)}</div>
     <Button type="button" variant="secondary" aria-label="次の元画像" onClick={()=>setActivePreview(index=>(index+1)%previews.length)}><ChevronRight className="size-4"/></Button>
    </div>}
    <div className="grid grid-cols-2 gap-2">
     <Button type="button" variant="secondary" onClick={()=>setCompactReference(value=>!value)}>{compactReference?<Maximize2 className="mr-2 size-4"/>:<Minimize2 className="mr-2 size-4"/>}{compactReference?'画像を大きく':'画像を小さく'}</Button>
     <Button type="button" variant="secondary" onClick={()=>setReferenceMode(false)}>解析結果を再確認</Button>
     <Button type="button" variant="secondary" className="col-span-2" onClick={reset}><RotateCcw className="mr-2 size-4"/>別の画像を読み込む</Button>
    </div>
   </div>:<>
   <div ref={pasteZone} tabIndex={0} onPaste={handlePaste} className="rounded-xl border border-dashed border-slate-600 bg-slate-950 p-4 text-center outline-none focus:border-cyan-400">
    <div className="flex justify-center gap-3"><Images className="size-5 text-cyan-300"/><Camera className="size-5 text-cyan-300"/><ClipboardPaste className="size-5 text-cyan-300"/></div>
    <p className="mt-2 text-sm">写真ライブラリ・カメラ・画像の貼り付けに対応</p>
    <p className="mt-1 text-xs text-slate-500">画像は端末内で解析され、サーバーへ保存されません。赤い菱形の個数から凸を判定します。青い数字、武将Lv、兵種欄のLVは凸に含めません。初回のみ画像認識エンジンの読込に通信が必要です。</p>
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
     <Button type="button" variant="secondary" onClick={()=>libraryInput.current?.click()} disabled={running}><Images className="mr-2 size-4"/>写真ライブラリから選ぶ</Button>
     <Button type="button" onClick={()=>cameraInput.current?.click()} disabled={running}><Camera className="mr-2 size-4"/>カメラで撮影</Button>
    </div>
    <p className="mt-3 text-xs text-slate-500">クリップボードの画像は、この枠を選択して貼り付けても読み込めます。</p>
    <input ref={libraryInput} aria-label="写真ライブラリから画像を選択" className="hidden" type="file" accept="image/*" multiple onChange={event=>acceptFiles(Array.from(event.target.files??[]))}/>
    <input ref={cameraInput} aria-label="カメラで画像を撮影" className="hidden" type="file" accept="image/*" capture="environment" onChange={event=>acceptFiles(Array.from(event.target.files??[]))}/>
   </div>
   {previews.length>0&&<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{previews.map((url,index)=><div key={url} className="relative overflow-hidden rounded-lg border border-slate-700 bg-black"><img src={url} alt={`読込画像${index+1}`} className="aspect-video w-full object-contain"/><span className="absolute left-1 top-1 rounded bg-black/70 px-2 py-1 text-[10px]">{index+1}</span></div>)}</div>}
   {files.length>0&&<div className="grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={reset} disabled={running}><RotateCcw className="mr-2 size-4"/>選び直す</Button><Button type="button" onClick={()=>void analyze()} disabled={running||!officers.length||!skills.length}>{running?<Loader2 className="mr-2 size-4 animate-spin"/>:<ImagePlus className="mr-2 size-4"/>}自動解析</Button></div>}
   {(running||status)&&<div className="rounded-xl bg-slate-950 p-3"><div className="flex items-center justify-between text-xs text-slate-400"><span>{status}</span><span>{Math.round(progress*100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-cyan-400 transition-all" style={{width:`${Math.round(progress*100)}%`}}/></div></div>}
   {error&&<p role="alert" className="rounded-xl bg-red-950 p-3 text-sm text-red-300">{error}</p>}
   {draft&&<div className="space-y-3" aria-label="画像解析結果">
    <div className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="size-4"/>解析結果はまだ保存されていません。内容を確認して編成画面へ反映してください。</div>
    <FieldView label="兵種" field={draft.troopType}/>
    {draft.warriors.map((warrior,index)=><section key={index} className="rounded-xl border border-slate-700 p-3"><h4 className="mb-2 font-bold text-amber-300">{index===0?'大将':`副将${index}`}</h4><div className="grid grid-cols-2 gap-2"><div className="col-span-2"><FieldView label="武将名" field={warrior.name}/></div><FieldView label="凸" field={warrior.limitBreak} format={value=>`${value}凸`}/><div/><FieldView label="装着戦法1" field={warrior.equippedSkills[0]}/><FieldView label="装着戦法2" field={warrior.equippedSkills[1]}/></div></section>)}
    {draft.warnings.length>0&&<div className="rounded-xl bg-amber-950 p-3 text-sm text-amber-200"><p className="flex items-center font-bold"><AlertTriangle className="mr-2 size-4"/>確認が必要です</p><ul className="mt-2 space-y-1 text-xs">{draft.warnings.map(warning=><li key={warning}>・{warning}</li>)}</ul></div>}
    <Button type="button" className="w-full" onClick={()=>{onApply(toApplyValue(draft));setReferenceMode(true);setOpen(true);}}>解析結果を編成へ反映して元画像を表示</Button>
    <details className="rounded-xl bg-slate-950 p-3 text-xs text-slate-500"><summary>読み取った文字を確認</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">{draft.rawText}</pre></details>
   </div>}
   </>}
  </div>}
  {zoomOpen&&activePreviewUrl&&<div className="fixed inset-0 z-[120] flex flex-col bg-black/95 p-3 safe-top safe-bottom" role="dialog" aria-modal="true" aria-label={`元画像${activePreviewNumber}の拡大表示`}>
   <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3"><p className="font-bold text-cyan-200">元画像 {activePreviewNumber}/{previews.length}</p><Button type="button" variant="secondary" onClick={()=>setZoomOpen(false)}><X className="mr-2 size-4"/>拡大表示を閉じる</Button></div>
   <div className="mt-3 flex min-h-0 flex-1 items-center justify-center overflow-auto"><img src={activePreviewUrl} alt={`拡大した元画像${activePreviewNumber}`} className="max-h-full max-w-full object-contain"/></div>
  </div>}
 </section>;
}

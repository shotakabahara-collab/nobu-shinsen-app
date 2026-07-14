import type {OcrPage} from './formationImageParser';

const TESSERACT_SCRIPT='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

type OcrProgress={status?:string;progress?:number};
type TesseractWorker={recognize:(image:File|Blob,options?:Record<string,unknown>,output?:Record<string,boolean>)=>Promise<{data:{text:string;confidence?:number}}>;terminate:()=>Promise<void>};
type TesseractGlobal={OEM:{LSTM_ONLY:number};createWorker:(languages:string,oem:number,options:{logger?:(message:OcrProgress)=>void})=>Promise<TesseractWorker>};

declare global{interface Window{Tesseract?:TesseractGlobal}}

let loader:Promise<TesseractGlobal>|null=null;

function loadTesseract():Promise<TesseractGlobal>{
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(loader)return loader;
 loader=new Promise((resolve,reject)=>{
  const existing=document.querySelector<HTMLScriptElement>(`script[src="${TESSERACT_SCRIPT}"]`);
  const script=existing??document.createElement('script');
  const finish=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('画像認識エンジンを初期化できませんでした'));
  script.addEventListener('load',finish,{once:true});
  script.addEventListener('error',()=>reject(new Error('画像認識エンジンを読み込めませんでした。通信状態を確認してください。')),{once:true});
  if(!existing){script.src=TESSERACT_SCRIPT;script.crossOrigin='anonymous';script.defer=true;document.head.appendChild(script);}
 }).catch(error=>{loader=null;throw error;});
 return loader;
}

async function downscale(file:File):Promise<File|Blob>{
 if(typeof createImageBitmap!=='function')return file;
 try{
  const bitmap=await createImageBitmap(file);const maxSide=2400;const ratio=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  if(ratio===1){bitmap.close();return file;}
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const context=canvas.getContext('2d',{alpha:false});if(!context){bitmap.close();return file;}
  context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画像の前処理に失敗しました')),'image/jpeg',.94));
 }catch{return file;}
}

export async function recognizeFormationImages(files:readonly File[],onProgress?:(message:string,progress:number)=>void):Promise<OcrPage[]>{
 if(!files.length)throw new Error('画像を選択してください');
 const Tesseract=await loadTesseract();
 onProgress?.('日本語OCRを準備しています',.02);
 const worker=await Tesseract.createWorker('jpn',Tesseract.OEM.LSTM_ONLY,{logger:message=>{
  if(typeof message.progress==='number')onProgress?.(message.status||'画像を解析しています',Math.min(.95,message.progress));
 }});
 try{
  const pages:OcrPage[]=[];
  for(let index=0;index<files.length;index++){
   onProgress?.(`画像${index+1}/${files.length}を解析しています`,index/files.length);
   const image=await downscale(files[index]!);
   const result=await worker.recognize(image,{}, {text:true});
   pages.push({text:result.data.text,confidence:result.data.confidence});
  }
  onProgress?.('正本DBと照合しています',1);
  return pages;
 }finally{await worker.terminate();}
}

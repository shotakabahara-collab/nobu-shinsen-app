import type {OcrPage} from './formationImageParser';
import {estimateLimitBreakFromPixels,looksLikeThreeCardFormation} from './formationScreenshotLayout';

const TESSERACT_SCRIPT='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

type OcrProgress={status?:string;progress?:number};
type TesseractWorker={recognize:(image:File|Blob,options?:Record<string,unknown>,output?:Record<string,boolean>)=>Promise<{data:{text:string;confidence?:number}}>;terminate:()=>Promise<void>};
type TesseractGlobal={OEM:{LSTM_ONLY:number};createWorker:(languages:string,oem:number,options:{logger?:(message:OcrProgress)=>void})=>Promise<TesseractWorker>};
type OcrRow='card'|'inherent'|'equipped1'|'equipped2';
type PreparedImage={image:File|Blob;slot?:0|1|2;row?:OcrRow;limitBreak?:number;limitBreakConfidence?:'high'|'medium';limitBreakEvidence?:string;layout?:'three-card'};

declare global{interface Window{Tesseract?:TesseractGlobal}}

let loader:Promise<TesseractGlobal>|null=null;

function loadTesseract():Promise<TesseractGlobal>{
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(loader)return loader;
 const pending=new Promise<TesseractGlobal>((resolve,reject)=>{
  const existing=document.querySelector<HTMLScriptElement>(`script[src="${TESSERACT_SCRIPT}"]`);
  const script=existing??document.createElement('script');
  const finish=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('画像認識エンジンを初期化できませんでした'));
  script.addEventListener('load',finish,{once:true});
  script.addEventListener('error',()=>reject(new Error('画像認識エンジンを読み込めませんでした。通信状態を確認してください。')),{once:true});
  if(!existing){script.src=TESSERACT_SCRIPT;script.crossOrigin='anonymous';script.defer=true;document.head.appendChild(script);}
 });
 const cached=pending.catch((error:unknown)=>{loader=null;throw error;});
 loader=cached;
 return cached;
}

function canvasToBlob(canvas:HTMLCanvasElement,type='image/jpeg',quality=.94):Promise<Blob>{
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画像の前処理に失敗しました')),type,quality));
}

function renderCrop(bitmap:ImageBitmap,sourceX:number,sourceY:number,sourceWidth:number,sourceHeight:number,scale:number,contrast:number):HTMLCanvasElement|undefined{
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sourceWidth*scale));canvas.height=Math.max(1,Math.round(sourceHeight*scale));
 const context=canvas.getContext('2d',{alpha:false});if(!context)return undefined;
 context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.filter=`grayscale(1) contrast(${contrast})`;
 context.drawImage(bitmap,sourceX,sourceY,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);context.filter='none';
 return canvas;
}

async function prepareWholeImage(file:File,bitmap:ImageBitmap):Promise<PreparedImage>{
 const maxSide=2400;const ratio=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
 if(ratio===1)return {image:file};
 const canvas=renderCrop(bitmap,0,0,bitmap.width,bitmap.height,ratio,1);return canvas?{image:await canvasToBlob(canvas)}:{image:file};
}

async function prepareOcrImages(file:File):Promise<PreparedImage[]>{
 if(typeof createImageBitmap!=='function')return [{image:file}];
 try{
  const bitmap=await createImageBitmap(file);
  try{
   if(!looksLikeThreeCardFormation(bitmap.width,bitmap.height))return [await prepareWholeImage(file,bitmap)];
   const prepared:PreparedImage[]=[];const third=bitmap.width/3;
   for(const slot of [0,1,2] as const){
    const exactX=Math.floor(slot*third);const exactEnd=slot===2?bitmap.width:Math.floor((slot+1)*third);const exactWidth=Math.max(1,exactEnd-exactX);
    const sample=document.createElement('canvas');sample.width=exactWidth;sample.height=bitmap.height;
    const sampleContext=sample.getContext('2d',{alpha:false});let detection:ReturnType<typeof estimateLimitBreakFromPixels>;
    if(sampleContext){sampleContext.drawImage(bitmap,exactX,0,exactWidth,bitmap.height,0,0,exactWidth,bitmap.height);detection=estimateLimitBreakFromPixels(sampleContext.getImageData(0,0,exactWidth,bitmap.height));}

    const center=bitmap.width*(2/9+slot*5/18);const cardWidth=Math.min(bitmap.width*.27,bitmap.width);const sourceX=Math.max(0,Math.round(center-cardWidth/2));const sourceEnd=Math.min(bitmap.width,Math.round(center+cardWidth/2));const sourceWidth=Math.max(1,sourceEnd-sourceX);
    const cardTop=Math.floor(bitmap.height*.47);const cardHeight=bitmap.height-cardTop;const cardScale=Math.min(2.4,900/sourceWidth);
    const cardCanvas=renderCrop(bitmap,sourceX,cardTop,sourceWidth,cardHeight,cardScale,1.45);
    if(cardCanvas)prepared.push({image:await canvasToBlob(cardCanvas,'image/png'),slot,row:'card',layout:'three-card',...(detection?{limitBreak:detection.value,limitBreakConfidence:detection.confidence,limitBreakEvidence:detection.evidence}:{})});

    const rows:{row:Exclude<OcrRow,'card'>;start:number;end:number}[]=[
     {row:'inherent',start:.745,end:.835},
     {row:'equipped1',start:.835,end:.918},
     {row:'equipped2',start:.918,end:1},
    ];
    for(const row of rows){
     const y=Math.floor(bitmap.height*row.start);const height=Math.max(1,Math.ceil(bitmap.height*row.end)-y);const scale=Math.min(3.2,1040/sourceWidth);
     const rowCanvas=renderCrop(bitmap,sourceX,y,sourceWidth,height,scale,1.8);if(!rowCanvas)continue;
     prepared.push({image:await canvasToBlob(rowCanvas,'image/png'),slot,row:row.row,layout:'three-card'});
    }
   }
   return prepared.length>=9?prepared:[await prepareWholeImage(file,bitmap)];
  }finally{bitmap.close();}
 }catch{return [{image:file}];}
}

export async function recognizeFormationImages(files:readonly File[],onProgress?:(message:string,progress:number)=>void):Promise<OcrPage[]>{
 if(!files.length)throw new Error('画像を選択してください');
 const prepared:PreparedImage[]=[];
 for(let index=0;index<files.length;index++){
  onProgress?.(`画像${index+1}/${files.length}を前処理しています`,index/Math.max(1,files.length)*.08);
  prepared.push(...await prepareOcrImages(files[index]!));
 }
 const Tesseract=await loadTesseract();let activeJob=0;const totalJobs=Math.max(1,prepared.length);
 onProgress?.('日本語OCRを準備しています',.08);
 const worker=await Tesseract.createWorker('jpn',Tesseract.OEM.LSTM_ONLY,{logger:message=>{
  if(typeof message.progress==='number')onProgress?.(message.status||'画像を解析しています',Math.min(.96,.08+((activeJob+message.progress)/totalJobs)*.86));
 }});
 try{
  const pages:OcrPage[]=[];
  for(activeJob=0;activeJob<prepared.length;activeJob++){
   const item=prepared[activeJob]!;const role=item.slot===undefined?'画像':item.slot===0?'大将':`副将${item.slot}`;const rowLabel=item.row==='inherent'?'固有戦法':item.row==='equipped1'?'装着戦法1':item.row==='equipped2'?'装着戦法2':'カード全体';
   onProgress?.(`${role}${item.row?`・${rowLabel}`:''}を解析しています`,.08+(activeJob/totalJobs)*.86);
   const result=await worker.recognize(item.image,{}, {text:true});
   pages.push({text:result.data.text,confidence:result.data.confidence,...(item.slot===undefined?{}:{slot:item.slot}),...(item.row?{row:item.row}:{}),...(item.layout?{layout:item.layout}:{}),...(item.limitBreak===undefined?{}:{limitBreak:item.limitBreak,limitBreakConfidence:item.limitBreakConfidence,limitBreakEvidence:item.limitBreakEvidence})});
  }
  onProgress?.('正本DBと照合しています',1);
  return pages;
 }finally{await worker.terminate();}
}

import type {OcrPage,OcrRow,OcrVariant} from './formationImageParser';
import {estimateLimitBreakFromPixels,looksLikeThreeCardFormation} from './formationScreenshotLayout';

const TESSERACT_SCRIPT='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

type OcrProgress={status?:string;progress?:number};
type RecognizeResult={data:{text:string;confidence?:number}};
type TesseractWorker={recognize:(image:File|Blob,options?:Record<string,unknown>,output?:Record<string,boolean>)=>Promise<RecognizeResult>;setParameters?:(parameters:Record<string,string>)=>Promise<void>;terminate:()=>Promise<void>};
type TesseractGlobal={OEM:{LSTM_ONLY:number};createWorker:(languages:string,oem:number,options:{logger?:(message:OcrProgress)=>void})=>Promise<TesseractWorker>};
type PreparedImage={image:File|Blob;fallbackImage?:Blob;slot?:0|1|2;row?:OcrRow;variant:OcrVariant;pageSegMode:'6'|'7'|'11';retryThreshold:number;limitBreak?:number;limitBreakConfidence?:'high'|'medium';limitBreakEvidence?:string;layout?:'three-card'};

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
 const cached=pending.catch((error:unknown)=>{loader=null;throw error;});loader=cached;return cached;
}

function canvasToBlob(canvas:HTMLCanvasElement,type='image/png',quality=.96):Promise<Blob>{
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画像の前処理に失敗しました')),type,quality));
}

function renderCrop(bitmap:ImageBitmap,sourceX:number,sourceY:number,sourceWidth:number,sourceHeight:number,scale:number,contrast:number,padding:number):HTMLCanvasElement|undefined{
 const drawnWidth=Math.max(1,Math.round(sourceWidth*scale)),drawnHeight=Math.max(1,Math.round(sourceHeight*scale));
 const canvas=document.createElement('canvas');canvas.width=drawnWidth+padding*2;canvas.height=drawnHeight+padding*2;
 const context=canvas.getContext('2d',{alpha:false});if(!context)return undefined;
 context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
 context.filter=`grayscale(1) contrast(${contrast})`;
 context.drawImage(bitmap,sourceX,sourceY,sourceWidth,sourceHeight,padding,padding,drawnWidth,drawnHeight);context.filter='none';
 return canvas;
}

export function otsuThreshold(histogram:readonly number[],total:number):number{
 let weightedTotal=0;for(let index=0;index<256;index++)weightedTotal+=index*(histogram[index]??0);
 let backgroundWeight=0,backgroundSum=0,bestVariance=-1,bestThreshold=150;
 for(let threshold=0;threshold<256;threshold++){
  const count=histogram[threshold]??0;backgroundWeight+=count;if(backgroundWeight===0)continue;
  const foregroundWeight=total-backgroundWeight;if(foregroundWeight===0)break;
  backgroundSum+=threshold*count;
  const backgroundMean=backgroundSum/backgroundWeight,foregroundMean=(weightedTotal-backgroundSum)/foregroundWeight;
  const variance=backgroundWeight*foregroundWeight*(backgroundMean-foregroundMean)**2;
  if(variance>bestVariance){bestVariance=variance;bestThreshold=threshold;}
 }
 return bestThreshold;
}

function binaryVariant(source:HTMLCanvasElement):HTMLCanvasElement|undefined{
 const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
 const context=canvas.getContext('2d',{alpha:false});if(!context)return undefined;
 context.drawImage(source,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height),histogram=Array.from({length:256},()=>0);
 for(let index=0;index<pixels.data.length;index+=4){const luminance=Math.round((pixels.data[index]??0)*.299+(pixels.data[index+1]??0)*.587+(pixels.data[index+2]??0)*.114);histogram[luminance]++;}
 const threshold=Math.max(80,Math.min(215,otsuThreshold(histogram,canvas.width*canvas.height)+6));
 for(let index=0;index<pixels.data.length;index+=4){const luminance=(pixels.data[index]??0)*.299+(pixels.data[index+1]??0)*.587+(pixels.data[index+2]??0)*.114,value=luminance<threshold?0:255;pixels.data[index]=pixels.data[index+1]=pixels.data[index+2]=value;pixels.data[index+3]=255;}
 context.putImageData(pixels,0,0);return canvas;
}

async function preparedFromCanvas(canvas:HTMLCanvasElement,metadata:Omit<PreparedImage,'image'|'fallbackImage'|'variant'>):Promise<PreparedImage>{
 const fallback=binaryVariant(canvas);
 return {image:await canvasToBlob(canvas),...(fallback?{fallbackImage:await canvasToBlob(fallback)}:{}),variant:'grayscale',...metadata};
}

async function prepareWholeImage(file:File,bitmap:ImageBitmap):Promise<PreparedImage>{
 const maxSide=2600,ratio=Math.min(1.35,maxSide/Math.max(bitmap.width,bitmap.height));
 const canvas=renderCrop(bitmap,0,0,bitmap.width,bitmap.height,ratio,1.25,24);
 return canvas?preparedFromCanvas(canvas,{pageSegMode:'11',retryThreshold:72}):{image:file,variant:'original',pageSegMode:'11',retryThreshold:72};
}

async function prepareOcrImages(file:File):Promise<PreparedImage[]>{
 if(typeof createImageBitmap!=='function')return [{image:file,variant:'original',pageSegMode:'11',retryThreshold:72}];
 try{
  const bitmap=await createImageBitmap(file);
  try{
   if(!looksLikeThreeCardFormation(bitmap.width,bitmap.height))return [await prepareWholeImage(file,bitmap)];
   const prepared:PreparedImage[]=[],third=bitmap.width/3;
   for(const slot of [0,1,2] as const){
    const exactX=Math.floor(slot*third),exactEnd=slot===2?bitmap.width:Math.floor((slot+1)*third),exactWidth=Math.max(1,exactEnd-exactX);
    const sample=document.createElement('canvas');sample.width=exactWidth;sample.height=bitmap.height;
    const sampleContext=sample.getContext('2d',{alpha:false});let detection:ReturnType<typeof estimateLimitBreakFromPixels>;
    if(sampleContext){sampleContext.drawImage(bitmap,exactX,0,exactWidth,bitmap.height,0,0,exactWidth,bitmap.height);detection=estimateLimitBreakFromPixels(sampleContext.getImageData(0,0,exactWidth,bitmap.height));}

    const center=bitmap.width*(2/9+slot*5/18),cardWidth=Math.min(bitmap.width*.275,bitmap.width),sourceX=Math.max(0,Math.round(center-cardWidth/2)),sourceEnd=Math.min(bitmap.width,Math.round(center+cardWidth/2)),sourceWidth=Math.max(1,sourceEnd-sourceX);
    const cardTop=Math.floor(bitmap.height*.465),cardBottom=Math.ceil(bitmap.height*.752),cardHeight=Math.max(1,cardBottom-cardTop),cardScale=Math.min(3.4,1180/sourceWidth);
    const cardCanvas=renderCrop(bitmap,sourceX,cardTop,sourceWidth,cardHeight,cardScale,1.5,28);
    if(cardCanvas)prepared.push(await preparedFromCanvas(cardCanvas,{slot,row:'card',layout:'three-card',pageSegMode:'6',retryThreshold:70,...(detection?{limitBreak:detection.value,limitBreakConfidence:detection.confidence,limitBreakEvidence:detection.evidence}:{})}));

    const rows:{row:Exclude<OcrRow,'card'>;start:number;end:number}[]=[
     {row:'inherent',start:.738,end:.838},
     {row:'equipped1',start:.827,end:.922},
     {row:'equipped2',start:.91,end:.998},
    ];
    for(const row of rows){
     const y=Math.max(0,Math.floor(bitmap.height*row.start)),end=Math.min(bitmap.height,Math.ceil(bitmap.height*row.end)),height=Math.max(1,end-y),scale=Math.min(4.2,1480/sourceWidth);
     const rowCanvas=renderCrop(bitmap,sourceX,y,sourceWidth,height,scale,1.7,34);if(!rowCanvas)continue;
     prepared.push(await preparedFromCanvas(rowCanvas,{slot,row:row.row,layout:'three-card',pageSegMode:'7',retryThreshold:84}));
    }
   }
   return prepared.length>=9?prepared:[await prepareWholeImage(file,bitmap)];
  }finally{bitmap.close();}
 }catch{return [{image:file,variant:'original',pageSegMode:'11',retryThreshold:72}];}
}

function meaningfulLength(text:string):number{return Array.from(text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'')).length;}
export function shouldRetryOcr(text:string,confidence:number|undefined,row:OcrRow|undefined,threshold:number):boolean{
 const minimum=row==='card'?4:row?2:8;
 return meaningfulLength(text)<minimum||typeof confidence!=='number'||confidence<threshold||/[�□]/u.test(text);
}

export async function recognizeFormationImages(files:readonly File[],onProgress?:(message:string,progress:number)=>void):Promise<OcrPage[]>{
 if(!files.length)throw new Error('画像を選択してください');
 const prepared:PreparedImage[]=[];
 for(let index=0;index<files.length;index++){
  onProgress?.(`画像${index+1}/${files.length}を高精度前処理しています`,index/Math.max(1,files.length)*.07);
  prepared.push(...await prepareOcrImages(files[index]!));
 }
 const Tesseract=await loadTesseract();let completedPasses=0,activeProgress=0;const maximumPasses=Math.max(1,prepared.length*2);
 onProgress?.('日本語OCRを準備しています',.07);
 const worker=await Tesseract.createWorker('jpn',Tesseract.OEM.LSTM_ONLY,{logger:message=>{
  if(typeof message.progress==='number'){activeProgress=message.progress;onProgress?.(message.status||'画像を解析しています',Math.min(.97,.07+((completedPasses+activeProgress)/maximumPasses)*.89));}
 }});
 let currentPsm='';
 async function recognize(item:PreparedImage,image:File|Blob,variant:OcrVariant):Promise<OcrPage>{
  if(worker.setParameters&&currentPsm!==item.pageSegMode){
   try{await worker.setParameters({tessedit_pageseg_mode:item.pageSegMode,preserve_interword_spaces:'1',user_defined_dpi:'300'});currentPsm=item.pageSegMode;}catch{currentPsm='';}
  }
  const result=await worker.recognize(image,{}, {text:true});completedPasses++;activeProgress=0;
  return {text:result.data.text,confidence:result.data.confidence,variant,...(item.slot===undefined?{}:{slot:item.slot}),...(item.row?{row:item.row}:{}),...(item.layout?{layout:item.layout}:{}),...(item.limitBreak===undefined?{}:{limitBreak:item.limitBreak,limitBreakConfidence:item.limitBreakConfidence,limitBreakEvidence:item.limitBreakEvidence})};
 }
 try{
  const pages:OcrPage[]=[];
  for(const item of prepared){
   const role=item.slot===undefined?'画像':item.slot===0?'大将':`副将${item.slot}`,rowLabel=item.row==='inherent'?'固有戦法':item.row==='equipped1'?'装着戦法1':item.row==='equipped2'?'装着戦法2':'武将カード';
   onProgress?.(`${role}${item.row?`・${rowLabel}`:''}を解析しています`,.07+(completedPasses/maximumPasses)*.89);
   const primary=await recognize(item,item.image,item.variant);pages.push(primary);
   if(item.fallbackImage&&shouldRetryOcr(primary.text,primary.confidence,item.row,item.retryThreshold)){
    onProgress?.(`${role}${item.row?`・${rowLabel}`:''}を別処理で再解析しています`,.07+(completedPasses/maximumPasses)*.89);
    pages.push(await recognize(item,item.fallbackImage,'binary'));
   }
  }
  onProgress?.('複数OCR結果を正本DBと照合しています',1);return pages;
 }finally{await worker.terminate();}
}

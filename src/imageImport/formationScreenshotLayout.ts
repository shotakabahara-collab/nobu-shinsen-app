export type PixelBuffer={width:number;height:number;data:Uint8ClampedArray};
export type LimitBreakDetection={value:number;confidence:'high'|'medium';evidence:string};

export function looksLikeThreeCardFormation(width:number,height:number):boolean{
 const ratio=width/Math.max(1,height);
 return width>=600&&height>=320&&ratio>=1.45&&ratio<=2.15;
}

function hueDegrees(red:number,green:number,blue:number):{hue:number;saturation:number;value:number}{
 const r=red/255,g=green/255,b=blue/255;const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
 if(delta===0)return {hue:0,saturation:0,value:max};
 let hue=0;
 if(max===r)hue=60*(((g-b)/delta)%6);
 else if(max===g)hue=60*((b-r)/delta+2);
 else hue=60*((r-g)/delta+4);
 if(hue<0)hue+=360;
 return {hue,saturation:max===0?0:delta/max,value:max};
}

export function estimateLimitBreakFromPixels(buffer:PixelBuffer):LimitBreakDetection|undefined{
 const {width,height,data}=buffer;if(width<120||height<180||data.length<width*height*4)return undefined;
 const yStart=Math.max(0,Math.floor(height*.59));const yEnd=Math.min(height,Math.ceil(height*.635));
 const score=Array.from({length:width},()=>0);
 for(let y=yStart;y<yEnd;y++)for(let x=0;x<width;x++){
  const offset=(y*width+x)*4;const color=hueDegrees(data[offset]??0,data[offset+1]??0,data[offset+2]??0);
  if((color.hue<=28||color.hue>=345)&&color.saturation>=.35&&color.value>=.31)score[x]!++;
 }
 const smooth=score.map((value,index)=>value+(score[index-1]??0)+(score[index+1]??0));
 const threshold=Math.max(4,(yEnd-yStart)*.18);const active:number[]=[];
 smooth.forEach((value,index)=>{if(value>=threshold)active.push(index);});
 if(!active.length)return undefined;
 const groups:{start:number;end:number;strength:number}[]=[];let start=active[0]!,previous=start;
 for(const current of active.slice(1)){
  if(current-previous>3){groups.push({start,end:previous,strength:smooth.slice(start,previous+1).reduce((sum,value)=>sum+value,0)});start=current;}
  previous=current;
 }
 groups.push({start,end:previous,strength:smooth.slice(start,previous+1).reduce((sum,value)=>sum+value,0)});
 const candidates=groups.map(group=>{
  const runWidth=group.end-group.start+1;const value=Math.round(runWidth/(width*.051));
  const expected=value*width*.051;const error=Math.abs(runWidth-expected)/Math.max(1,expected);
  return {...group,runWidth,value,error};
 }).filter(group=>group.runWidth>=width*.04&&group.runWidth<=width*.3&&group.value>=1&&group.value<=5&&group.error<=.38)
  .sort((a,b)=>b.strength-a.strength||a.error-b.error);
 const best=candidates[0];if(!best)return undefined;
 return {value:best.value,confidence:best.error<=.18?'high':'medium',evidence:`赤い凸マーク${best.value}個を画像から検出`};
}

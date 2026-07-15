import {describe,expect,it} from 'vitest';
import {estimateLimitBreakFromPixels,looksLikeThreeCardFormation,type PixelBuffer} from './formationScreenshotLayout';

function syntheticGemRow(count:number):PixelBuffer{
 const width=390,height=679,data=new Uint8ClampedArray(width*height*4);data.fill(255);
 const yStart=Math.floor(height*.59),yEnd=Math.ceil(height*.635);const runWidth=Math.round(count*width*.051);const xStart=180;
 for(let y=yStart;y<yEnd;y++)for(let x=xStart;x<xStart+runWidth;x++){
  const offset=(y*width+x)*4;data[offset]=210;data[offset+1]=42;data[offset+2]=28;data[offset+3]=255;
 }
 return {width,height,data};
}

describe('formation screenshot layout',()=>{
 it('recognizes the landscape three-card formation screen',()=>{
  expect(looksLikeThreeCardFormation(1170,679)).toBe(true);
  expect(looksLikeThreeCardFormation(390,844)).toBe(false);
 });

 it.each([[1],[2],[3],[4],[5]])('counts %i filled red limit-break gems',count=>{
  expect(estimateLimitBreakFromPixels(syntheticGemRow(count))?.value).toBe(count);
 });

 it('does not mistake blue cost badges or neutral pixels for limit breaks',()=>{
  const width=390,height=679,data=new Uint8ClampedArray(width*height*4);data.fill(255);
  const yStart=Math.floor(height*.59),yEnd=Math.ceil(height*.635);
  for(let y=yStart;y<yEnd;y++)for(let x=180;x<280;x++){
   const offset=(y*width+x)*4;data[offset]=28;data[offset+1]=116;data[offset+2]=230;data[offset+3]=255;
  }
  expect(estimateLimitBreakFromPixels({width,height,data})).toBeUndefined();
 });
});

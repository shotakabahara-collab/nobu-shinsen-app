import {describe,expect,it} from 'vitest';
import {otsuThreshold,shouldRetryOcr} from './browserOcr';

describe('high accuracy browser OCR',()=>{
 it('calculates a stable threshold for a two-peak grayscale histogram',()=>{
  const histogram=Array.from({length:256},()=>0);histogram[20]=500;histogram[220]=500;
  expect(otsuThreshold(histogram,1000)).toBeGreaterThanOrEqual(20);
  expect(otsuThreshold(histogram,1000)).toBeLessThan(220);
 });

 it('retries low-confidence or nearly empty rows with the binary image',()=>{
  expect(shouldRetryOcr('S 有備無患',92,'equipped1',84)).toBe(false);
  expect(shouldRetryOcr('S 有備無患',60,'equipped1',84)).toBe(true);
  expect(shouldRetryOcr('',99,'equipped1',84)).toBe(true);
  expect(shouldRetryOcr('鉄砲',95,'card',70)).toBe(true);
 });
});

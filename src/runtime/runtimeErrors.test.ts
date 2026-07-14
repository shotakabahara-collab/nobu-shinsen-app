import {describe,expect,it} from 'vitest';
import {RuntimeCancelledError,RuntimeEngineError} from './runtimeClient';
import {presentRuntimeError} from './runtimeErrors';

describe('presentRuntimeError',()=>{
 it('converts a Pyodide wasm stack into a Japanese engine error',()=>{
  const error=new RuntimeEngineError('PythonError','new_error@https://example.test/pyodide.asm.js:10:977 308@wasm-function[308]');
  const result=presentRuntimeError(error,'calculate');
  expect(result).toMatchObject({code:'NOBU-R006',title:'対戦計算を計算エンジンが完了できませんでした',reloadRecommended:true});
  expect(result?.message).not.toContain('wasm-function');
 });

 it('identifies an unknown officer',()=>{
  const result=presentRuntimeError(new RuntimeEngineError('ValueError: officer not found: テスト武将'),'calculate');
  expect(result).toMatchObject({code:'NOBU-R003',title:'正本DBで確認できない武将があります'});
  expect(result?.action).toContain('武将名');
 });

 it('identifies an unknown skill',()=>{
  const result=presentRuntimeError(new RuntimeEngineError('ValueError: skill not found: テスト戦法'),'search');
  expect(result).toMatchObject({code:'NOBU-R004',title:'正本DBで確認できない戦法があります'});
 });

 it('identifies network and memory failures',()=>{
  expect(presentRuntimeError(new Error('Failed to fetch runtime bundle'),'calculate')?.code).toBe('NOBU-R001');
  expect(presentRuntimeError(new Error('WebAssembly.Memory(): out of memory'),'formal')?.code).toBe('NOBU-R002');
 });

 it('identifies invalid formation requests',()=>{
  const result=presentRuntimeError(new Error('ZodError: invalid_type expected tuple'),'calculate');
  expect(result).toMatchObject({code:'NOBU-R005',title:'編成データを計算に使用できません'});
 });

 it('does not show a popup for cancellation',()=>{
  expect(presentRuntimeError(new RuntimeCancelledError(),'calculate')).toBeNull();
 });
});

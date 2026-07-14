import {describe,expect,it} from 'vitest';
import {classifyRuntimeError} from './runtimeError';

describe('classifyRuntimeError',()=>{
 it('maps Pyodide wasm traces to a Japanese engine error',()=>{
  const result=classifyRuntimeError(new Error('new_error@pyodide.asm.js wasm-function[308] B223_CANONICAL_PYTHON_VIA_PYODIDE'));
  expect(result.code).toBe('RUNTIME-001');
  expect(result.title).toBe('対戦エンジンでエラーが発生しました');
  expect(result.message).toContain('正本準拠エンジン');
  expect(result.detail).toContain('wasm-function');
  expect(result.detail).not.toMatch(/b223/i);
 });
 it('maps missing skills to a data error',()=>expect(classifyRuntimeError(new Error('resolve_skills unknown skill')).code).toBe('DATA-003'));
 it('maps network failures to a retryable network error',()=>{
  const result=classifyRuntimeError(new Error('Failed to fetch runtime bundle'));
  expect(result.code).toBe('NETWORK-001');
  expect(result.retryable).toBe(true);
 });
});

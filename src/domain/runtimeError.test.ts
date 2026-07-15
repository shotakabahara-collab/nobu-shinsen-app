import {describe,expect,it} from 'vitest';
import {classifyRuntimeError} from './runtimeError';

describe('classifyRuntimeError',()=>{
 it('maps a bare Pyodide wasm crash to an iPhone resource error',()=>{
  const result=classifyRuntimeError(new Error('new_error@pyodide.asm.js wasm-function[308] B223_CANONICAL_PYTHON_VIA_PYODIDE'));
  expect(result.code).toBe('RUNTIME-002');
  expect(result.title).toBe('端末上で対戦エンジンが停止しました');
  expect(result.message).toContain('100戦を分割');
  expect(result.detail).toContain('wasm-function');
  expect(result.detail).not.toMatch(/b223/i);
 });
 it('keeps a Python traceback classified as an engine error',()=>expect(classifyRuntimeError(new Error('PythonError: Traceback pyodide wasm-function')).code).toBe('RUNTIME-001'));
 it('maps missing skills to a data error',()=>expect(classifyRuntimeError(new Error('resolve_skills unknown skill')).code).toBe('DATA-003'));
 it('maps network failures to a retryable network error',()=>{
  const result=classifyRuntimeError(new Error('Failed to fetch runtime bundle'));
  expect(result.code).toBe('NETWORK-001');
  expect(result.retryable).toBe(true);
 });
});

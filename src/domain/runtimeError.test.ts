import {describe,expect,it} from 'vitest';
import {classifyRuntimeError} from './runtimeError';

describe('classifyRuntimeError',()=>{
 it('maps a bare Pyodide wasm crash to an iPhone resource error',()=>{
  const result=classifyRuntimeError(new Error('new_error@pyodide.asm.js wasm-function[308] B223_CANONICAL_PYTHON_VIA_PYODIDE'));
  expect(result.code).toBe('RUNTIME-002');
  expect(result.title).toBe('端末上で対戦エンジンが停止しました');
  expect(result.message).toContain('完了済みの戦闘を保持');
  expect(result.detail).toContain('wasm-function');
  expect(result.detail).not.toMatch(/b223/i);
 });
 it('keeps a Python traceback classified as an engine error',()=>expect(classifyRuntimeError(new Error('PythonError: Traceback pyodide wasm-function')).code).toBe('RUNTIME-001'));
 it('keeps the structured Safari Python error classified as an engine error even when request context names formations',()=>{
  const result=classifyRuntimeError(new Error('request_context={"formationA":["甲"]}\npython_error_type=RuntimeError\npython_traceback=Traceback\nnew_error@pyodide.asm.js wasm-function[308]'));
  expect(result.code).toBe('RUNTIME-001');expect(result.detail).toContain('python_error_type=RuntimeError');
 });
 it('maps missing skills to a data error',()=>expect(classifyRuntimeError(new Error('resolve_skills unknown skill')).code).toBe('DATA-003'));
 it('maps the reported double unit-type formal stop to a non-retryable data error',()=>{
  const result=classifyRuntimeError(new Error('FORMAL_BATTLE_INPUT_CONTRACT_STOP ["left: formal_status_stop:STOP_UNIT_TYPE_LIMIT"] 兵種戦法は1枚まで'));
  expect(result.code).toBe('DATA-003');expect(result.title).toContain('兵種戦法');expect(result.retryable).toBe(false);
 });
 it('maps network failures to a retryable network error',()=>{
  const result=classifyRuntimeError(new Error('Failed to fetch runtime bundle'));
  expect(result.code).toBe('NETWORK-001');
  expect(result.retryable).toBe(true);
 });
});

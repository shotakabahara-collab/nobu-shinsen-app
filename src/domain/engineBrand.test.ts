import {describe,expect,it} from 'vitest';
import {ENGINE_DISPLAY_NAME,ENGINE_DISPLAY_SUBTITLE,sanitizeInternalEngineText,toPublicRuntimePayload} from './engineBrand';

describe('public engine labels',()=>{
 it('uses an abstract user-facing name',()=>{
  expect(ENGINE_DISPLAY_NAME).toBe('正本準拠エンジン');
  expect(ENGINE_DISPLAY_SUBTITLE).toBe('正本準拠シミュレーション');
 });

 it('removes internal version labels from visible text',()=>{
  const value=sanitizeInternalEngineText('B223_CANONICAL_PYTHON_VIA_PYODIDE / runtime_bundle_b223.tgz / canonical runtime');
  expect(value).not.toMatch(/b223/i);
  expect(value).toContain('正本準拠エンジン');
 });

 it('replaces runtime metadata in public battle logs',()=>{
  const value=toPublicRuntimePayload({runtime:'B223_CANONICAL_PYTHON_VIA_PYODIDE',version:'v1326p15e2b223',nested:{message:'b223 runtime'}}) as Record<string,unknown>;
  expect(value.runtime).toBe('正本準拠エンジン');
  expect(value.version).toBe('内部管理');
  expect(JSON.stringify(value)).not.toMatch(/b223/i);
 });
});

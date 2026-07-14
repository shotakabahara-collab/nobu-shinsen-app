import {describe,expect,it} from 'vitest';
import type {PwaDiagnostics} from '../pwa/diagnostics';
import type {RuntimeResult} from '../runtime/contracts';
import {
 assessDeviceRelease,
 emptyDeviceRuntimeEvidence,
 parseDeviceRuntimeEvidence,
 recordDeviceRuntimeEvidence,
 validateDeviceRuntimeResult,
} from './deviceReleaseCheck';

const diagnostics=(patch:Partial<PwaDiagnostics>={}):PwaDiagnostics=>({standalone:true,online:false,serviceWorker:true,offlineCache:true,persistedStorage:true,...patch});
const result=(patch:Partial<RuntimeResult>={}):RuntimeResult=>({type:'battle',version:'v1326p15e2b223',runtime:'B223_CANONICAL_PYTHON_VIA_PYODIDE',win_rate:0.5,hp_diff:12,...patch});

describe('physical iPhone release gate',()=>{
 it('requires both online and offline real-runtime evidence',()=>{
  const online=recordDeviceRuntimeEvidence(emptyDeviceRuntimeEvidence,result(),true,'2026-07-13T01:00:00.000Z');
  expect(assessDeviceRelease(diagnostics(),online)).toMatchObject({ready:false,passed:5,total:6});
  const complete=recordDeviceRuntimeEvidence(online,result({win_rate:0.25,hp_diff:-10}),false,'2026-07-13T02:00:00.000Z');
  expect(assessDeviceRelease(diagnostics(),complete)).toMatchObject({ready:true,passed:6,total:6});
 });

 it('does not claim success for a non-canonical or incomplete runtime result',()=>{
  expect(()=>validateDeviceRuntimeResult(result({runtime:'mock'}))).toThrow('正本準拠エンジン');
  expect(()=>validateDeviceRuntimeResult(result({win_rate:undefined}))).toThrow('実勝率');
  expect(()=>validateDeviceRuntimeResult(result({hp_diff:undefined}))).toThrow('HP差');
 });

 it('keeps unsupported storage persistence distinct from a denied request',()=>{
  expect(assessDeviceRelease(diagnostics({persistedStorage:null}),emptyDeviceRuntimeEvidence).checks.storage).toBe(true);
  expect(assessDeviceRelease(diagnostics({persistedStorage:false}),emptyDeviceRuntimeEvidence).checks.storage).toBe(false);
 });

 it('recovers safely from malformed stored evidence',()=>{
  expect(parseDeviceRuntimeEvidence('{broken')).toEqual(emptyDeviceRuntimeEvidence);
  expect(parseDeviceRuntimeEvidence(JSON.stringify({onlinePassedAt:'2026-07-13',lastWinRate:0.5}))).toMatchObject({onlinePassedAt:'2026-07-13',offlinePassedAt:null,lastWinRate:0.5});
 });
});

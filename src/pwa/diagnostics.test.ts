import {describe,expect,it,vi} from 'vitest';
import {collectPwaDiagnostics,type DiagnosticSources} from './diagnostics';

const sources=(patch:Partial<DiagnosticSources>={}):DiagnosticSources=>({standalone:()=>true,online:()=>false,serviceWorker:async()=>true,offlineCache:async()=>true,persistedStorage:async()=>true,...patch});

describe('collectPwaDiagnostics',()=>{
 it('reports a home-screen app ready for offline use',async()=>expect(await collectPwaDiagnostics(sources())).toEqual({standalone:true,online:false,serviceWorker:true,offlineCache:true,persistedStorage:true}));
 it('keeps unsupported storage persistence distinct from failure',async()=>expect((await collectPwaDiagnostics(sources({persistedStorage:async()=>null}))).persistedStorage).toBeNull());
 it('waits for every asynchronous browser check',async()=>{const serviceWorker=vi.fn().mockResolvedValue(false);const result=await collectPwaDiagnostics(sources({serviceWorker}));expect(serviceWorker).toHaveBeenCalledOnce();expect(result.serviceWorker).toBe(false);});
});

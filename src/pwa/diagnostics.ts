export type PwaDiagnostics={standalone:boolean;online:boolean;serviceWorker:boolean;offlineCache:boolean;persistedStorage:boolean|null};
export type DiagnosticSources={standalone:()=>boolean;online:()=>boolean;serviceWorker:()=>Promise<boolean>;offlineCache:()=>Promise<boolean>;persistedStorage:()=>Promise<boolean|null>};

const browserSources:DiagnosticSources={
 standalone:()=>window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true,
 online:()=>navigator.onLine,
 serviceWorker:async()=>Boolean(await navigator.serviceWorker?.getRegistration()),
 offlineCache:async()=>typeof caches!=='undefined'&&(await caches.keys()).length>0,
 persistedStorage:async()=>navigator.storage?.persisted?await navigator.storage.persisted():null,
};

export async function collectPwaDiagnostics(sources:DiagnosticSources=browserSources):Promise<PwaDiagnostics>{
 const [serviceWorker,offlineCache,persistedStorage]=await Promise.all([sources.serviceWorker(),sources.offlineCache(),sources.persistedStorage()]);
 return {standalone:sources.standalone(),online:sources.online(),serviceWorker,offlineCache,persistedStorage};
}

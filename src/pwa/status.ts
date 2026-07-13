import {registerSW} from 'virtual:pwa-register';
export type PwaState={offlineReady:boolean;updateReady:boolean;online:boolean};
let state:PwaState={offlineReady:false,updateReady:false,online:navigator.onLine};const listeners=new Set<(value:PwaState)=>void>();let update:((reloadPage?:boolean)=>Promise<void>)|null=null;
function emit(patch:Partial<PwaState>){state={...state,...patch};for(const listener of listeners)listener(state);}
export function initializePwa(){update=registerSW({immediate:true,onOfflineReady:()=>emit({offlineReady:true}),onNeedRefresh:()=>emit({updateReady:true}),onRegisterError:error=>console.error('service worker registration failed',error)});window.addEventListener('online',()=>emit({online:true}));window.addEventListener('offline',()=>emit({online:false}));}
export function subscribePwa(listener:(value:PwaState)=>void){listeners.add(listener);listener(state);return()=>{listeners.delete(listener);};}
export async function applyPwaUpdate(){if(update)await update(true);}

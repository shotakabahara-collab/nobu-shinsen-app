import type {PwaDiagnostics} from '../pwa/diagnostics';
import type {CalculateRequest,RuntimeResult} from '../runtime/contracts';

export const DEVICE_RELEASE_STORAGE_KEY='nobu-device-release-check-v1';

export type DeviceRuntimeEvidence={
 onlinePassedAt:string|null;
 offlinePassedAt:string|null;
 lastRuntime:string|null;
 lastWinRate:number|null;
 lastHpDiff:number|null;
 lastError:string|null;
};

export type DeviceReleaseAssessment={
 ready:boolean;
 passed:number;
 total:number;
 checks:{
  standalone:boolean;
  serviceWorker:boolean;
  offlineCache:boolean;
  storage:boolean;
  onlineRuntime:boolean;
  offlineRuntime:boolean;
 };
};

export const emptyDeviceRuntimeEvidence:DeviceRuntimeEvidence={
 onlinePassedAt:null,
 offlinePassedAt:null,
 lastRuntime:null,
 lastWinRate:null,
 lastHpDiff:null,
 lastError:null,
};

const candidate={
 officers:['山本勘助','柴田勝家','柿崎景家'] as [string,string,string],
 awaken:[2,1,2] as [number,number,number],
 unit:'騎馬' as const,
 unit_level:10,
 troops:10000 as const,
 skills:['一行三昧','回天転運','会盟の陣','以戦養戦','乗勝追撃','縦横馳突'] as [string,string,string,string,string,string],
 fixed_placement:true,
 ignore_formal_overlap:true,
};

const target={
 officers:['黒田官兵衛','豊臣秀吉','ねね'] as [string,string,string],
 awaken:[3,1,3] as [number,number,number],
 unit:'弓' as const,
 unit_level:10,
 troops:10000 as const,
 skills:['七十二の計','紅蓮の炎','三河弓兵隊','嚢沙之計','罵詈雑言','沈魚落雁'] as [string,string,string,string,string,string],
 fixed_placement:true,
 ignore_formal_overlap:true,
};

export const deviceReleaseRequest:CalculateRequest={
 candidate,
 target:'DEVICE_RELEASE_KURODA',
 target_spec:target,
 trials:1,
 blocks:1,
 seed:1326257000,
 include_detail:false,
 include_examples:false,
};

export function validateDeviceRuntimeResult(result:RuntimeResult){
 if(result.runtime!=='B223_CANONICAL_PYTHON_VIA_PYODIDE')throw new Error('正本準拠エンジンを確認できませんでした');
 if(typeof result.win_rate!=='number'||!Number.isFinite(result.win_rate))throw new Error('実勝率が返されませんでした');
 if(typeof result.hp_diff!=='number'||!Number.isFinite(result.hp_diff))throw new Error('HP差が返されませんでした');
 return result;
}

export function recordDeviceRuntimeEvidence(previous:DeviceRuntimeEvidence,result:RuntimeResult,online:boolean,now=new Date().toISOString()):DeviceRuntimeEvidence{
 validateDeviceRuntimeResult(result);
 return {
  ...previous,
  onlinePassedAt:online?now:previous.onlinePassedAt,
  offlinePassedAt:online?previous.offlinePassedAt:now,
  lastRuntime:result.runtime,
  lastWinRate:result.win_rate!,
  lastHpDiff:result.hp_diff!,
  lastError:null,
 };
}

export function assessDeviceRelease(diagnostics:PwaDiagnostics,evidence:DeviceRuntimeEvidence):DeviceReleaseAssessment{
 const checks={
  standalone:diagnostics.standalone,
  serviceWorker:diagnostics.serviceWorker,
  offlineCache:diagnostics.offlineCache,
  storage:diagnostics.persistedStorage!==false,
  onlineRuntime:Boolean(evidence.onlinePassedAt),
  offlineRuntime:Boolean(evidence.offlinePassedAt),
 };
 const passed=Object.values(checks).filter(Boolean).length,total=Object.keys(checks).length;
 return {ready:passed===total,passed,total,checks};
}

export function parseDeviceRuntimeEvidence(raw:string|null):DeviceRuntimeEvidence{
 if(!raw)return emptyDeviceRuntimeEvidence;
 try{
  const value=JSON.parse(raw) as Partial<DeviceRuntimeEvidence>;
  return {
   onlinePassedAt:typeof value.onlinePassedAt==='string'?value.onlinePassedAt:null,
   offlinePassedAt:typeof value.offlinePassedAt==='string'?value.offlinePassedAt:null,
   lastRuntime:typeof value.lastRuntime==='string'?value.lastRuntime:null,
   lastWinRate:typeof value.lastWinRate==='number'?value.lastWinRate:null,
   lastHpDiff:typeof value.lastHpDiff==='number'?value.lastHpDiff:null,
   lastError:typeof value.lastError==='string'?value.lastError:null,
  };
 }catch{return emptyDeviceRuntimeEvidence;}
}

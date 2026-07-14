export const ENGINE_DISPLAY_NAME='正本準拠エンジン';
export const ENGINE_DISPLAY_SUBTITLE='正本準拠シミュレーション';
export const ENGINE_RESULT_LABEL=`${ENGINE_DISPLAY_NAME}で計算済み`;

export function sanitizeInternalEngineText(value:string):string{
 return value
  .replace(/B223_CANONICAL_PYTHON_VIA_PYODIDE/gi,'[内部エンジン識別子]')
  .replace(/b223/gi,'[内部バージョン]')
  .replace(/canonical runtime/gi,ENGINE_DISPLAY_NAME);
}

export function toPublicRuntimePayload(value:unknown):unknown{
 if(typeof value==='string')return sanitizeInternalEngineText(value);
 if(Array.isArray(value))return value.map(toPublicRuntimePayload);
 if(value&&typeof value==='object'){
  return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>{
   if(key==='runtime')return [key,ENGINE_DISPLAY_NAME];
   if(key==='version')return [key,'内部管理'];
   return [key,toPublicRuntimePayload(item)];
  }));
 }
 return value;
}

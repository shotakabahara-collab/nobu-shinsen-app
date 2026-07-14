import {useEffect,useState} from 'react';
import type {RuntimeErrorInfo} from '../domain/runtimeError';
import {RuntimeErrorDialog} from './RuntimeErrorDialog';

export const RUNTIME_ERROR_EVENT='nobu-runtime-error';
export type RuntimeErrorEventDetail={error:RuntimeErrorInfo;retry?:()=>void};

export function RuntimeErrorHost(){
 const [current,setCurrent]=useState<RuntimeErrorEventDetail|null>(null);
 useEffect(()=>{
  const listener=(event:Event)=>setCurrent((event as CustomEvent<RuntimeErrorEventDetail>).detail);
  window.addEventListener(RUNTIME_ERROR_EVENT,listener);
  return()=>window.removeEventListener(RUNTIME_ERROR_EVENT,listener);
 },[]);
 if(!current)return null;
 return <RuntimeErrorDialog error={current.error} onClose={()=>setCurrent(null)} onRetry={current.retry?()=>{const retry=current.retry;setCurrent(null);retry?.();}:undefined}/>;
}

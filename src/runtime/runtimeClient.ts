import {calculateRequestSchema,formalRequestSchema,searchRequestSchema,type CalculateRequest,type RuntimeOperation,type RuntimeResult} from './contracts';
import {classifyRuntimeError} from '../domain/runtimeError';
import {RUNTIME_ERROR_EVENT,type RuntimeErrorEventDetail} from '../components/RuntimeErrorHost';

type Pending={resolve:(value:RuntimeResult)=>void;reject:(reason:Error)=>void;retry:()=>void};

export class RuntimeCancelledError extends Error{
 constructor(){super('計算を中止しました');this.name='RuntimeCancelledError';}
}

function notifyRuntimeError(error:unknown,retry?:()=>void):Error{
 const classified=classifyRuntimeError(error);
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent<RuntimeErrorEventDetail>(RUNTIME_ERROR_EVENT,{detail:{error:classified,retry}}));
 const publicError=new Error(`${classified.title}（${classified.code}）`);
 publicError.name='RuntimeUserError';
 return publicError;
}

export class RuntimeClient{
 private worker:Worker|null=null;
 private pending=new Map<string,Pending>();

 private failAll(error:Error,worker?:Worker){
  if(worker&&this.worker!==worker)return;
  for(const pending of this.pending.values())pending.reject(error instanceof RuntimeCancelledError?error:notifyRuntimeError(error,pending.retry));
  this.pending.clear();this.worker?.terminate();this.worker=null;
 }

 private ensureWorker(){
  if(this.worker)return this.worker;
  const worker=new Worker(`${import.meta.env.BASE_URL}runtime-worker.js`);
  worker.onmessage=(event:MessageEvent)=>{
   const message=event.data as {type:string;requestId?:string;result?:RuntimeResult;message?:string};
   if(!message.requestId)return;
   const pending=this.pending.get(message.requestId);if(!pending)return;
   if(message.type==='result')pending.resolve(message.result!);
   else if(message.type==='error')pending.reject(notifyRuntimeError(new Error(message.message||'b223 runtimeでエラーが発生しました'),pending.retry));
   else return;
   this.pending.delete(message.requestId);
  };
  worker.onerror=event=>this.failAll(new Error(event.message||'b223 runtimeを起動できませんでした'),worker);
  worker.onmessageerror=()=>this.failAll(new Error('b223 runtimeの応答を読み取れませんでした'),worker);
  this.worker=worker;return worker;
 }

 private run(operation:RuntimeOperation,request:unknown){
  const schemas={calculate:calculateRequestSchema,search:searchRequestSchema,formal:formalRequestSchema};
  let payload:unknown;
  try{payload=schemas[operation].parse(request);}catch(error){return Promise.reject(notifyRuntimeError(error,()=>{void this.run(operation,request);}));}
  const requestId=crypto.randomUUID();
  const retry=()=>{void this.run(operation,request);};
  return new Promise<RuntimeResult>((resolve,reject)=>{
   this.pending.set(requestId,{resolve,reject,retry});
   try{this.ensureWorker().postMessage({type:operation,requestId,bundleUrl:`${import.meta.env.BASE_URL}runtime_bundle_b223.tgz`,request:payload});}
   catch(error){this.pending.delete(requestId);reject(notifyRuntimeError(error,retry));}
  });
 }

 calculate(request:CalculateRequest){return this.run('calculate',request);}
 search(request:unknown){return this.run('search',request);}
 formal(request:unknown){return this.run('formal',request);}
 cancel(){this.failAll(new RuntimeCancelledError());}
}

export const runtimeClient=new RuntimeClient();

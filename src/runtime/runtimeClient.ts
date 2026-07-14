import {calculateRequestSchema,formalRequestSchema,searchRequestSchema,type CalculateRequest,type RuntimeOperation,type RuntimeResult} from './contracts';

type Pending={resolve:(value:RuntimeResult)=>void;reject:(reason:Error)=>void};

export class RuntimeCancelledError extends Error{
 constructor(){super('計算を中止しました');this.name='RuntimeCancelledError';}
}

export class RuntimeEngineError extends Error{
 readonly technicalDetails:string;
 constructor(message:string,technicalDetails=''){
  super(message||'b223 runtimeでエラーが発生しました');
  this.name='RuntimeEngineError';
  this.technicalDetails=technicalDetails;
 }
}

export class RuntimeClient{
 private worker:Worker|null=null;
 private pending=new Map<string,Pending>();

 private failAll(error:Error,worker?:Worker){
  if(worker&&this.worker!==worker)return;
  for(const pending of this.pending.values())pending.reject(error);
  this.pending.clear();
  this.worker?.terminate();
  this.worker=null;
 }

 private ensureWorker(){
  if(this.worker)return this.worker;
  const worker=new Worker(`${import.meta.env.BASE_URL}runtime-worker.js`);
  worker.onmessage=(event:MessageEvent)=>{
   const message=event.data as {type:string;requestId?:string;result?:RuntimeResult;message?:string;details?:string};
   if(!message.requestId)return;
   const pending=this.pending.get(message.requestId);if(!pending)return;
   if(message.type==='result')pending.resolve(message.result!);
   else if(message.type==='error')pending.reject(new RuntimeEngineError(message.message||'b223 runtimeでエラーが発生しました',message.details||''));
   else return;
   this.pending.delete(message.requestId);
  };
  worker.onerror=event=>this.failAll(new RuntimeEngineError('b223 runtimeを起動できませんでした',event.message||''),worker);
  worker.onmessageerror=()=>this.failAll(new RuntimeEngineError('b223 runtimeの応答を読み取れませんでした'),worker);
  this.worker=worker;
  return worker;
 }

 private run(operation:RuntimeOperation,request:unknown){
  const schemas={calculate:calculateRequestSchema,search:searchRequestSchema,formal:formalRequestSchema};
  const payload=schemas[operation].parse(request),requestId=crypto.randomUUID();
  return new Promise<RuntimeResult>((resolve,reject)=>{
   this.pending.set(requestId,{resolve,reject});
   try{this.ensureWorker().postMessage({type:operation,requestId,bundleUrl:`${import.meta.env.BASE_URL}runtime_bundle_b223.tgz`,request:payload});}
   catch(error){this.pending.delete(requestId);reject(error instanceof Error?error:new RuntimeEngineError('b223 runtimeへ要求を送信できませんでした'));}
  });
 }

 calculate(request:CalculateRequest){return this.run('calculate',request);}
 search(request:unknown){return this.run('search',request);}
 formal(request:unknown){return this.run('formal',request);}
 cancel(){this.failAll(new RuntimeCancelledError());}
}

export const runtimeClient=new RuntimeClient();

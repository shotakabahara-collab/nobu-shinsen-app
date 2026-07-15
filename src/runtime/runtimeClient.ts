import {
 battleDetailRequestSchema,
 calculateBatchRequestSchema,
 calculateBatchResultSchema,
 calculateRequestSchema,
 formalRequestSchema,
 searchRequestSchema,
 type BattleDetailRequest,
 type CalculateBatchResult,
 type CalculateRequest,
 type RuntimeOperation,
 type RuntimeResult,
} from './contracts';
import {classifyRuntimeError} from '../domain/runtimeError';
import {RUNTIME_ERROR_EVENT,type RuntimeErrorEventDetail} from '../components/RuntimeErrorHost';

type Pending={resolve:(value:RuntimeResult)=>void;reject:(reason:Error)=>void};
type Outcome='win'|'loss'|'draw';
type Sample=CalculateBatchResult['forward']['samples'][number];
type DirectionBatch=CalculateBatchResult['forward'];
type Aggregate={leftWins:number;rightWins:number;draws:number;candidateHpSum:number;rawHpSum:number;samples:Sample[];runtimeFailures:Record<string,unknown>[]};

export type BattleCalculationProgress={stage:'battles'|'examples';completedBattles:number;totalBattles:100;completedExamples:number;totalExamples:number};

const TOTAL_PER_DIRECTION=50;
const INITIAL_BATCH_PER_DIRECTION=10;

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

function isRecoverableWasmCrash(error:unknown):boolean{
 const text=error instanceof Error?`${error.message}\n${error.stack??''}`:String(error);const normalized=text.toLowerCase();
 if(normalized.includes('memoryerror')||normalized.includes('out of memory')||normalized.includes('allocation failed'))return true;
 return (normalized.includes('new_error@')||normalized.includes('wasm-function'))&&!normalized.includes('python_error_type=')&&!normalized.includes('python_traceback=')&&!normalized.includes('pythonerror')&&!normalized.includes('traceback');
}

function contextualError(error:unknown,context:Record<string,string|number>):Error{
 const cause=error instanceof Error?error:new Error(String(error));
 const lines=Object.entries(context).map(([key,value])=>`${key}=${value}`);
 const result=new Error([...lines,`cause_name=${cause.name}`,`cause_message=${cause.message}`].join('\n'));
 result.name='RuntimeOperationError';return result;
}

function workerEventError(event:ErrorEvent):Error{
 const source=event.error instanceof Error?event.error:undefined;
 return new Error([
  `worker_event_message=${event.message||'計算エンジンを起動できませんでした'}`,
  event.filename&&`worker_event_file=${event.filename}:${event.lineno}:${event.colno}`,
  source&&`worker_error_name=${source.name}`,
  source?.message&&`worker_error_message=${source.message}`,
  source?.stack&&`worker_error_stack=${source.stack}`,
 ].filter(Boolean).join('\n'));
}

function emptyAggregate():Aggregate{return {leftWins:0,rightWins:0,draws:0,candidateHpSum:0,rawHpSum:0,samples:[],runtimeFailures:[]};}
function appendBatch(aggregate:Aggregate,batch:DirectionBatch){aggregate.leftWins+=batch.left_wins;aggregate.rightWins+=batch.right_wins;aggregate.draws+=batch.draws;aggregate.candidateHpSum+=batch.candidate_hp_sum;aggregate.rawHpSum+=batch.raw_hp_sum;aggregate.samples.push(...batch.samples);aggregate.runtimeFailures.push(...batch.runtime_failures);}
function directionBlock(aggregate:Aggregate){return {trials:TOTAL_PER_DIRECTION,completed_trials:TOTAL_PER_DIRECTION,left_wins:aggregate.leftWins,right_wins:aggregate.rightWins,draws:aggregate.draws,left_win_rate:aggregate.leftWins/TOTAL_PER_DIRECTION,right_win_rate:aggregate.rightWins/TOTAL_PER_DIRECTION,avg_hp_diff:aggregate.rawHpSum/TOTAL_PER_DIRECTION,runtime_failures:aggregate.runtimeFailures};}

export class RuntimeClient{
 private worker:Worker|null=null;
 private pending=new Map<string,Pending>();
 private generation=0;

 private disposeWorker(worker:Worker|null){if(!worker)return;worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();if(this.worker===worker)this.worker=null;}

 private failAllRaw(error:Error,worker?:Worker){
  if(worker&&this.worker!==worker)return;
  for(const pending of this.pending.values())pending.reject(error);
  this.pending.clear();this.disposeWorker(this.worker);
 }

 private ensureWorker(){
  if(this.worker)return this.worker;
  const worker=new Worker(`${import.meta.env.BASE_URL}runtime-worker.js`);
  worker.onmessage=(event:MessageEvent)=>{
   const message=event.data as {type:string;requestId?:string;result?:RuntimeResult;message?:string};
   if(!message.requestId)return;
   const pending=this.pending.get(message.requestId);if(!pending)return;
   if(message.type==='result')pending.resolve(message.result!);
   else if(message.type==='error')pending.reject(new Error(message.message||'計算エンジンでエラーが発生しました'));
   else return;
   this.pending.delete(message.requestId);
  };
  worker.onerror=event=>this.failAllRaw(workerEventError(event),worker);
  worker.onmessageerror=()=>this.failAllRaw(new Error('計算エンジンの応答を読み取れませんでした'),worker);
  this.worker=worker;return worker;
 }

 private restartWorker(){this.disposeWorker(this.worker);}
 private async yieldToBrowser(delay=0){await new Promise<void>(resolve=>setTimeout(resolve,delay));}
 private assertActive(generation:number){if(generation!==this.generation)throw new RuntimeCancelledError();}

 private runRaw(operation:RuntimeOperation,request:unknown){
  const schemas={calculate:calculateRequestSchema,calculateBatch:calculateBatchRequestSchema,search:searchRequestSchema,formal:formalRequestSchema,detail:battleDetailRequestSchema};
  let payload:unknown;
  try{payload=schemas[operation].parse(request);}catch(error){return Promise.reject(error instanceof Error?error:new Error(String(error)));}
  const requestId=crypto.randomUUID();
  return new Promise<RuntimeResult>((resolve,reject)=>{
   this.pending.set(requestId,{resolve,reject});
   try{this.ensureWorker().postMessage({type:operation,requestId,bundleUrl:`${import.meta.env.BASE_URL}runtime_bundle_b223.tgz`,request:payload});}
   catch(error){this.pending.delete(requestId);reject(error instanceof Error?error:new Error(String(error)));}
  });
 }

 private runPublic(operation:Exclude<RuntimeOperation,'calculate'|'calculateBatch'>,request:unknown){
  const retry=()=>{void this.runPublic(operation,request);};
  return this.runRaw(operation,request).catch(error=>{if(error instanceof RuntimeCancelledError)throw error;throw notifyRuntimeError(error,retry);});
 }

 private async runBatchOnce(request:CalculateRequest,trials:number,forwardSeed:number,reverseSeed:number,generation:number):Promise<CalculateBatchResult>{
  this.assertActive(generation);
  const raw=await this.runRaw('calculateBatch',{...request,trials,blocks:1,include_detail:false,forward_seed:forwardSeed,reverse_seed:reverseSeed});
  this.assertActive(generation);const parsed=calculateBatchResultSchema.parse(raw);if(parsed.trials_per_direction!==trials)throw new Error(`100戦バッチの要求件数と応答件数が一致しません（要求${trials}／応答${parsed.trials_per_direction}）`);return parsed;
 }

 private async runChunk(request:CalculateRequest,trials:number,forwardSeed:number,reverseSeed:number,generation:number,allowSingleRetry=true):Promise<CalculateBatchResult[]>{
  try{return [await this.runBatchOnce(request,trials,forwardSeed,reverseSeed,generation)];}
  catch(error){
   if(error instanceof RuntimeCancelledError)throw error;
   this.assertActive(generation);
   if(!isRecoverableWasmCrash(error))throw error;
   this.restartWorker();await this.yieldToBrowser(250);
   if(trials>1){
    const firstTrials=Math.floor(trials/2),secondTrials=trials-firstTrials;
    const first=await this.runChunk(request,firstTrials,forwardSeed,reverseSeed,generation,allowSingleRetry);
    const last=first.at(-1)!;
    const second=await this.runChunk(request,secondTrials,last.forward.next_seed,last.reverse.next_seed,generation,allowSingleRetry);
    return [...first,...second];
   }
   if(allowSingleRetry)return this.runChunk(request,trials,forwardSeed,reverseSeed,generation,false);
   throw error;
  }
 }

 private async runDetailRaw(request:CalculateRequest,sample:Sample,generation:number):Promise<RuntimeResult>{
  this.assertActive(generation);
  return this.runRaw('detail',{candidate:request.candidate,target:request.target,target_spec:request.target_spec,seed:sample.seed,direction:sample.direction});
 }

 private async detailForOutcome(request:CalculateRequest,outcome:Exclude<Outcome,'draw'>,samples:Sample[],generation:number):Promise<{schemaVersion:1;direction:Sample['direction'];seed:number;outcome:Exclude<Outcome,'draw'>;detail:RuntimeResult}>{
  const candidates=samples.filter(sample=>sample.outcome===outcome);let lastError:unknown;
  for(const sample of candidates){
   for(let attempt=0;attempt<2;attempt++){
    try{return {schemaVersion:1,direction:sample.direction,seed:sample.seed,outcome,detail:await this.runDetailRaw(request,sample,generation)};}
    catch(error){if(error instanceof RuntimeCancelledError)throw error;lastError=error;if(!isRecoverableWasmCrash(error))break;this.restartWorker();await this.yieldToBrowser(250);}
   }
  }
  throw lastError instanceof Error?lastError:new Error(`${outcome==='win'?'勝ち':'負け'}例の詳細traceを取得できませんでした`);
 }

 private async calculateBatched(requestValue:CalculateRequest,onProgress?:((progress:BattleCalculationProgress)=>void)):Promise<RuntimeResult>{
  const request=calculateRequestSchema.parse(requestValue),generation=this.generation,started=Date.now();
  const forward=emptyAggregate(),reverse=emptyAggregate();let completedPerDirection=0,forwardSeed=request.seed,reverseSeed=request.seed+5003;let firstBatch:CalculateBatchResult|undefined;
  while(completedPerDirection<TOTAL_PER_DIRECTION){
   this.assertActive(generation);
   const trials=Math.min(INITIAL_BATCH_PER_DIRECTION,TOTAL_PER_DIRECTION-completedPerDirection);
   let batches:CalculateBatchResult[];
   try{batches=await this.runChunk(request,trials,forwardSeed,reverseSeed,generation);}
   catch(error){if(error instanceof RuntimeCancelledError)throw error;throw contextualError(error,{runtime_stage:'battles',completed_battles:completedPerDirection*2,requested_batch_battles:trials*2,forward_seed:forwardSeed,reverse_seed:reverseSeed});}
   for(const batch of batches){
    if(batch.forward.completed_trials!==batch.trials_per_direction||batch.reverse.completed_trials!==batch.trials_per_direction)throw new Error('100戦バッチの完了件数が一致しません');
    firstBatch??=batch;appendBatch(forward,batch.forward);appendBatch(reverse,batch.reverse);completedPerDirection+=batch.trials_per_direction;
    forwardSeed=batch.forward.next_seed;reverseSeed=batch.reverse.next_seed;
    onProgress?.({stage:'battles',completedBattles:completedPerDirection*2,totalBattles:100,completedExamples:0,totalExamples:0});
    await this.yieldToBrowser();
   }
  }
  const wins=forward.leftWins+reverse.rightWins,losses=forward.rightWins+reverse.leftWins,draws=forward.draws+reverse.draws,completed=wins+losses+draws;
  if(completed!==100)throw new Error(`100戦の集計件数が一致しません（${completed}戦）`);
  const winRate=wins/completed,hpDiff=(forward.candidateHpSum+reverse.candidateHpSum)/completed;
  const samples=[...forward.samples,...reverse.samples],outcomes:Exclude<Outcome,'draw'>[]=[];if(wins>0)outcomes.push('win');if(losses>0)outcomes.push('loss');
  const examples=[];
  for(const outcome of outcomes){
   try{examples.push(await this.detailForOutcome(request,outcome,samples,generation));}
   catch(error){if(error instanceof RuntimeCancelledError)throw error;throw contextualError(error,{runtime_stage:'battle_example',completed_battles:100,example_outcome:outcome,completed_examples:examples.length,total_examples:outcomes.length});}
   onProgress?.({stage:'examples',completedBattles:100,totalBattles:100,completedExamples:examples.length,totalExamples:outcomes.length});
   await this.yieldToBrowser();
  }
  const summary={requestedBattles:100,completedBattles:completed,wins,losses,draws,winRate};
  return {
   type:'simulation',version:'adapter-v2-browser-100-streaming-batches',runtime:firstBatch?.runtime??'B223_CANONICAL_PYTHON_VIA_PYODIDE',target:request.target,
   trials_per_direction:50,trials_total:completed,blocks:1,win_rate:winRate,hp_diff:hpDiff,elapsed_seconds:Math.round((Date.now()-started)/100)/10,
   ...(firstBatch?.candidate_assignment!==undefined?{candidate_assignment:firstBatch.candidate_assignment}:{}),...(firstBatch?.formal_status!==undefined?{formal_status:firstBatch.formal_status}:{}),
   sim:{trials_per_direction:50,blocks:1,seed:request.seed,forward:[directionBlock(forward)],reverse:[directionBlock(reverse)],left_balanced_win_rate:winRate,avg_hp_diff_balanced:hpDiff,timeline_trace_blocks:{forward:[],reverse:[]},browser_execution_policy:'CANONICAL_SIMULATE_ONCE_50_FORWARD_50_REVERSE_STREAMED_SINGLE_PYODIDE_WORKER'},
   battle_evaluation:{schemaVersion:1,summary,examples},
  };
 }

 calculate(request:CalculateRequest,onProgress?:((progress:BattleCalculationProgress)=>void)){
  const retry=()=>{void this.calculate(request,onProgress);};
  return this.calculateBatched(request,onProgress).catch(error=>{if(error instanceof RuntimeCancelledError)throw error;throw notifyRuntimeError(error,retry);});
 }
 detail(request:BattleDetailRequest){return this.runPublic('detail',request);}
 search(request:unknown){return this.runPublic('search',request);}
 formal(request:unknown){return this.runPublic('formal',request);}
 cancel(){this.generation+=1;this.failAllRaw(new RuntimeCancelledError());}
}

export const runtimeClient=new RuntimeClient();

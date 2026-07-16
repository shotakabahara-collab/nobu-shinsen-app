import {afterEach,describe,expect,it,vi} from 'vitest';
import type {CalculateRequest,RuntimeResult} from './contracts';
import {RuntimeCancelledError,RuntimeClient,type BattleCalculationProgress} from './runtimeClient';

type WorkerMessage={type:string;requestId:string;request:Record<string,unknown>};

class WorkerMock{
 static instances:WorkerMock[]=[];
 static responder:((worker:WorkerMock,message:WorkerMessage)=>void)|null=null;
 onmessage:((event:MessageEvent)=>void)|null=null;
 onerror:((event:ErrorEvent)=>void)|null=null;
 onmessageerror:((event:MessageEvent)=>void)|null=null;
 postMessage=vi.fn((message:WorkerMessage)=>WorkerMock.responder?.(this,message));
 terminate=vi.fn();
 constructor(){WorkerMock.instances.push(this);}
 result(message:WorkerMessage,result:RuntimeResult){queueMicrotask(()=>this.onmessage?.({data:{type:'result',requestId:message.requestId,result}} as MessageEvent));}
 runtimeError(message:WorkerMessage,detail:string){queueMicrotask(()=>this.onmessage?.({data:{type:'error',requestId:message.requestId,message:detail}} as MessageEvent));}
 fail(message:string){queueMicrotask(()=>this.onerror?.(new ErrorEvent('error',{message})));}
}

const request:CalculateRequest={candidate:{officers:['一','二','三'],awaken:[0,0,0],unit:'騎馬',unit_level:10,troops:10000,skills:['A','B','C','D','E','F'],fixed_placement:true,ignore_formal_overlap:true},target:'enemy',target_spec:{officers:['四','五','六'],awaken:[0,0,0],unit:'弓',unit_level:10,troops:10000,skills:['G','H','I','J','K','L'],fixed_placement:true,ignore_formal_overlap:true},trials:50,blocks:1,seed:1326230000,include_detail:true};

function batchResult(message:WorkerMessage):RuntimeResult{
 const trials=message.request.trials as number,forwardSeed=message.request.forward_seed as number,reverseSeed=message.request.reverse_seed as number;
 const leftWins=Math.ceil(trials*.6),rightWins=trials-leftWins;
 const direction=(name:'forward'|'reverse',seed:number,candidateHp:number,rawHp:number)=>({
  trials,completed_trials:trials,left_wins:name==='forward'?leftWins:rightWins,right_wins:name==='forward'?rightWins:leftWins,draws:0,
  left_win_rate:(name==='forward'?leftWins:rightWins)/trials,right_win_rate:(name==='forward'?rightWins:leftWins)/trials,avg_hp_diff:rawHp,
  candidate_hp_sum:candidateHp*trials,raw_hp_sum:rawHp*trials,next_seed:seed+trials,runtime_failures:[],samples:[
   {direction:name,seed,outcome:'win',winner:name==='forward'?'A':'B'},
   {direction:name,seed:seed+1,outcome:'loss',winner:name==='forward'?'B':'A'},
  ],
 });
 return {type:'simulation_batch',version:'batch-v2-streaming-worker',runtime:'B223_CANONICAL_PYTHON_VIA_PYODIDE',trials_per_direction:trials,forward:direction('forward',forwardSeed,100,100),reverse:direction('reverse',reverseSeed,50,-50),candidate_assignment:{ok:true},formal_status:'PASS'};
}

function successfulResponder(worker:WorkerMock,message:WorkerMessage){
 if(message.type==='calculateBatch'){worker.result(message,batchResult(message));return;}
 if(message.type==='detail'){worker.result(message,{type:'battle_detail',version:'detail-v1',runtime:'B223_CANONICAL_PYTHON_VIA_PYODIDE',winner:'A',ended_turn:1,max_turns:8,hp_diff:10,turns:{},logs:[]});return;}
 throw new Error(`unexpected operation: ${message.type}`);
}

describe('RuntimeClient',()=>{
 afterEach(()=>{WorkerMock.instances=[];WorkerMock.responder=null;vi.unstubAllGlobals();});

 it('streams five balanced batches and two details through one persistent Pyodide worker',async()=>{
  vi.stubGlobal('Worker',WorkerMock);WorkerMock.responder=successfulResponder;const progress:BattleCalculationProgress[]=[];
  const result=await new RuntimeClient().calculate(request,value=>progress.push(value));
  const messages=WorkerMock.instances.flatMap(worker=>worker.postMessage.mock.calls.map(call=>call[0] as WorkerMessage));
  const batches=messages.filter(message=>message.type==='calculateBatch'),details=messages.filter(message=>message.type==='detail');
  expect(batches).toHaveLength(5);expect(batches.map(message=>message.request.trials)).toEqual([10,10,10,10,10]);
  expect(batches.map(message=>message.request.forward_seed)).toEqual([1326230000,1326230010,1326230020,1326230030,1326230040]);
  expect(details).toHaveLength(2);expect(WorkerMock.instances).toHaveLength(1);expect(WorkerMock.instances[0]?.terminate).not.toHaveBeenCalled();
  expect(result).toMatchObject({version:'adapter-v2-browser-100-streaming-batches',trials_total:100,win_rate:.6,hp_diff:75});
  expect(result.sim).toMatchObject({browser_execution_policy:'CANONICAL_SIMULATE_ONCE_50_FORWARD_50_REVERSE_STREAMED_SINGLE_PYODIDE_WORKER'});
  expect(result.battle_evaluation).toMatchObject({summary:{requestedBattles:100,completedBattles:100,wins:60,losses:40,draws:0,winRate:.6},examples:[{outcome:'win'},{outcome:'loss'}]});
  expect(progress.filter(value=>value.stage==='battles').map(value=>value.completedBattles)).toEqual([20,40,60,80,100]);
  expect(progress.at(-1)).toMatchObject({stage:'examples',completedExamples:2,totalExamples:2});
 });

 it('streams an exact 100-battle ranking summary without fetching example traces',async()=>{
  vi.stubGlobal('Worker',WorkerMock);WorkerMock.responder=successfulResponder;const progress:BattleCalculationProgress[]=[];
  const result=await new RuntimeClient().calculateSummary({...request,include_detail:false},value=>progress.push(value));
  const messages=WorkerMock.instances.flatMap(worker=>worker.postMessage.mock.calls.map(call=>call[0] as WorkerMessage));
  expect(messages.filter(message=>message.type==='calculateBatch')).toHaveLength(5);
  expect(messages.filter(message=>message.type==='detail')).toHaveLength(0);
  expect(result).toMatchObject({trials_total:100,win_rate:.6,hp_diff:75,battle_evaluation:{summary:{completedBattles:100,wins:60,losses:40,draws:0},examples:[]}});
  expect(progress.at(-1)).toMatchObject({stage:'battles',completedBattles:100});
 });

 it('streams a balanced 20-battle tournament screen through one compact batch',async()=>{
  vi.stubGlobal('Worker',WorkerMock);WorkerMock.responder=successfulResponder;const progress:BattleCalculationProgress[]=[];
  const result=await new RuntimeClient().calculateSummary({...request,include_detail:false},value=>progress.push(value),20);
  const messages=WorkerMock.instances.flatMap(worker=>worker.postMessage.mock.calls.map(call=>call[0] as WorkerMessage));
  expect(messages.filter(message=>message.type==='calculateBatch')).toHaveLength(1);
  expect(messages.filter(message=>message.type==='detail')).toHaveLength(0);
  expect(result).toMatchObject({version:'adapter-v2-browser-20-streaming-batches',trials_per_direction:10,trials_total:20,win_rate:.6,hp_diff:75,battle_evaluation:{summary:{requestedBattles:20,completedBattles:20,wins:12,losses:8,draws:0},examples:[]}});
  expect(progress).toEqual([{stage:'battles',completedBattles:20,totalBattles:20,completedExamples:0,totalExamples:0}]);
 });

 it('restarts and splits only the failed wasm batch without losing any of the 100 battles',async()=>{
  vi.stubGlobal('Worker',WorkerMock);let failed=false;WorkerMock.responder=(worker,message)=>{
   if(message.type==='calculateBatch'&&!failed){failed=true;worker.fail('new_error@pyodide.asm.js:10 wasm-function[308]');return;}
   successfulResponder(worker,message);
  };
  const result=await new RuntimeClient().calculate(request);
  const trials=WorkerMock.instances.flatMap(worker=>worker.postMessage.mock.calls.map(call=>(call[0] as WorkerMessage))).filter(message=>message.type==='calculateBatch').map(message=>message.request.trials);
  expect(trials).toEqual([10,5,5,10,10,10,10]);expect(WorkerMock.instances).toHaveLength(2);expect(WorkerMock.instances[0]?.terminate).toHaveBeenCalledOnce();expect(result).toMatchObject({trials_total:100,win_rate:.6});
 });

 it('preserves a structured Python traceback and does not misread it as a retryable bare Wasm crash',async()=>{
  vi.stubGlobal('Worker',WorkerMock);WorkerMock.responder=(worker,message)=>worker.runtimeError(message,'worker_stage=execute\npython_error_type=RuntimeError\npython_error_message=broken formation lane\npython_traceback=Traceback: exact failure');
  await expect(new RuntimeClient().calculate(request)).rejects.toThrow('対戦エンジンでエラーが発生しました（RUNTIME-001）');
  const batches=WorkerMock.instances.flatMap(worker=>worker.postMessage.mock.calls.map(call=>call[0] as WorkerMessage)).filter(message=>message.type==='calculateBatch');
  expect(batches).toHaveLength(1);expect(WorkerMock.instances).toHaveLength(1);
 });

 it('uses a distinct cancellation error and terminates the active worker',async()=>{
  vi.stubGlobal('Worker',WorkerMock);const client=new RuntimeClient(),result=client.calculate(request),worker=WorkerMock.instances[0]!;client.cancel();
  await expect(result).rejects.toBeInstanceOf(RuntimeCancelledError);expect(worker.terminate).toHaveBeenCalled();
 });

 it('hides raw postMessage failures behind one Japanese public error',async()=>{
  vi.stubGlobal('Worker',WorkerMock);WorkerMock.responder=()=>{throw new Error('clone failed');};
  await expect(new RuntimeClient().calculate(request)).rejects.toThrow('計算を完了できませんでした（UNKNOWN-001）');
 });
});

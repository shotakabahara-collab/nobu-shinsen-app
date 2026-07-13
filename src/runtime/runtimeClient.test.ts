import {afterEach,describe,expect,it,vi} from 'vitest';
import type {CalculateRequest} from './contracts';
import {RuntimeCancelledError,RuntimeClient} from './runtimeClient';

class WorkerMock{
 static instances:WorkerMock[]=[];
 onmessage:((event:MessageEvent)=>void)|null=null;
 onerror:((event:ErrorEvent)=>void)|null=null;
 onmessageerror:((event:MessageEvent)=>void)|null=null;
 postMessage=vi.fn();
 terminate=vi.fn();
 constructor(){WorkerMock.instances.push(this);}
}

const request:CalculateRequest={candidate:{officers:['一','二','三'],awaken:[0,0,0],unit:'騎馬',unit_level:10,troops:10000,skills:['A','B','C','D','E','F'],fixed_placement:true,ignore_formal_overlap:true},target:'enemy',trials:1,blocks:1,seed:1,include_detail:false};

describe('RuntimeClient',()=>{
 afterEach(()=>{WorkerMock.instances=[];vi.unstubAllGlobals();});
 it('rejects every pending operation when the worker fails',async()=>{vi.stubGlobal('Worker',WorkerMock);const client=new RuntimeClient(),result=client.calculate(request),worker=WorkerMock.instances[0]!;worker.onerror?.(new ErrorEvent('error'));await expect(result).rejects.toThrow('起動できませんでした');expect(worker.terminate).toHaveBeenCalled();});
 it('uses a distinct cancellation error and can start a fresh worker',async()=>{vi.stubGlobal('Worker',WorkerMock);const client=new RuntimeClient(),first=client.calculate(request),worker=WorkerMock.instances[0]!;client.cancel();await expect(first).rejects.toBeInstanceOf(RuntimeCancelledError);expect(worker.terminate).toHaveBeenCalled();const second=client.calculate(request);expect(WorkerMock.instances).toHaveLength(2);client.cancel();await expect(second).rejects.toBeInstanceOf(RuntimeCancelledError);});
 it('rejects a request when posting to the worker throws',async()=>{vi.stubGlobal('Worker',WorkerMock);const client=new RuntimeClient();const worker=new WorkerMock();worker.postMessage.mockImplementation(()=>{throw new Error('clone failed');});(client as unknown as {worker:Worker}).worker=worker as unknown as Worker;await expect(client.calculate(request)).rejects.toThrow('clone failed');});
});

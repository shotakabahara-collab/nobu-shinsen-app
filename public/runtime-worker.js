let pyodide=null,ready=false;
const PYODIDE_BASE=new URL('pyodide/',self.location.href).href;
async function init(bundleUrl){if(ready)return;importScripts(PYODIDE_BASE+'pyodide.js');pyodide=await loadPyodide({indexURL:PYODIDE_BASE});const response=await fetch(bundleUrl);if(!response.ok)throw new Error(`runtime bundle HTTP ${response.status}`);pyodide.FS.writeFile('/runtime.tgz',new Uint8Array(await response.arrayBuffer()));await pyodide.runPythonAsync(`
import copy,json,os,sys,tarfile
os.makedirs('/nobu',exist_ok=True)
with tarfile.open('/runtime.tgz','r:gz') as tf: tf.extractall('/nobu')
os.chdir('/nobu/02_ENGINE');sys.path.insert(0,'/nobu/02_ENGINE')
from browser_runtime_api import calculate,search,formal,_ctx,_make,TARGETS
from battle_simulator import simulate_once

def detail(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else request_json
    candidate=_make(req['candidate'])
    target=_make(req.get('target_spec') or TARGETS[req['target']])
    direction=str(req.get('direction') or 'forward')
    left,right=(target,candidate) if direction=='reverse' else (candidate,target)
    result=simulate_once(_ctx(),copy.deepcopy(left),copy.deepcopy(right),seed=int(req['seed']),verbose=True,trace_enabled=True,runtime_mode='full_trace')
    trace=result.get('trace') or {}
    turns={}
    for key,value in (trace.get('turns') or {}).items():
        compact_events=[]
        for event in value.get('events') or []:
            row={k:event.get(k) for k in ('phase','event_type','side','actor_idx','actor') if event.get(k) is not None}
            source=event.get('detail') or {}
            if event.get('event_type')=='actor_begin':
                row['detail']={'hp':source.get('hp'),'controls':source.get('controls'),'speed_breakdown':source.get('speed_breakdown')}
            elif event.get('event_type') in {'activation_roll','blocked','confusion_redirect','prepare_resolve_at_actor_action','after_normal_attack_skipped'}:
                row['detail']=source
            compact_events.append(row)
        turns[str(key)]={
            'action_order':value.get('action_order') or [],
            'scoreboard_start':value.get('scoreboard_start'),
            'scoreboard_end':value.get('scoreboard_end'),
            'events':compact_events,
        }
    payload={
        'type':'battle_detail','version':'detail-v1','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE',
        'direction':direction,'seed':int(req['seed']),'winner':result.get('winner'),'win_reason':result.get('win_reason'),
        'ended_turn':result.get('ended_turn'),'max_turns':8,'hp_diff':result.get('hp_diff'),
        'final_scoreboard':result.get('final_scoreboard'),'turns':turns,'logs':result.get('logs') or [],
    }
    return json.dumps(payload,ensure_ascii=False)
`);ready=true;self.postMessage({type:'ready'});}
self.onmessage=async(event)=>{const msg=event.data||{};try{await init(msg.bundleUrl);pyodide.globals.set('request_json_js',JSON.stringify(msg.request));const fn={calculate:'calculate',search:'search',formal:'formal',detail:'detail'}[msg.type];if(!fn)throw new Error(`unknown operation: ${msg.type}`);const raw=await pyodide.runPythonAsync(`${fn}(request_json_js)`);self.postMessage({type:'result',requestId:msg.requestId,result:JSON.parse(raw)});}catch(error){self.postMessage({type:'error',requestId:msg.requestId,message:error?.stack||String(error)});}};

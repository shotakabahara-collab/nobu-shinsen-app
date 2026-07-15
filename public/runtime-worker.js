let pyodide=null,ready=false;
const PYODIDE_BASE=new URL('pyodide/',self.location.href).href;
async function init(bundleUrl){if(ready)return;importScripts(PYODIDE_BASE+'pyodide.js');pyodide=await loadPyodide({indexURL:PYODIDE_BASE});const response=await fetch(bundleUrl);if(!response.ok)throw new Error(`runtime bundle HTTP ${response.status}`);pyodide.FS.writeFile('/runtime.tgz',new Uint8Array(await response.arrayBuffer()));await pyodide.runPythonAsync(`
import copy,json,os,sys,tarfile,time
os.makedirs('/nobu',exist_ok=True)
with tarfile.open('/runtime.tgz','r:gz') as tf: tf.extractall('/nobu')
os.chdir('/nobu/02_ENGINE');sys.path.insert(0,'/nobu/02_ENGINE')
from browser_runtime_api import calculate,search,formal,_ctx,_make,TARGETS
from battle_simulator import simulate_once

def _detail_payload(req,direction,seed):
    candidate=_make(req['candidate'])
    target=_make(req.get('target_spec') or TARGETS[req['target']])
    left,right=(target,candidate) if direction=='reverse' else (candidate,target)
    result=simulate_once(_ctx(),copy.deepcopy(left),copy.deepcopy(right),seed=int(seed),verbose=True,trace_enabled=True,runtime_mode='full_trace')
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
    return {
        'type':'battle_detail','version':'detail-v1','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE',
        'direction':direction,'seed':int(seed),'winner':result.get('winner'),'win_reason':result.get('win_reason'),
        'ended_turn':result.get('ended_turn'),'max_turns':8,'hp_diff':result.get('hp_diff'),
        'final_scoreboard':result.get('final_scoreboard'),'turns':turns,'logs':result.get('logs') or [],
    }

def detail(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else request_json
    return json.dumps(_detail_payload(req,str(req.get('direction') or 'forward'),int(req['seed'])),ensure_ascii=False)

def _candidate_outcome(direction,winner):
    if winner not in ('A','B'): return 'draw'
    candidate_raw='A' if direction=='forward' else 'B'
    return 'win' if winner==candidate_raw else 'loss'

def _summary(sim,fallback_rate=0):
    requested=completed=wins=losses=draws=0
    for direction in ('forward','reverse'):
        for block in sim.get(direction) or []:
            requested+=int(block.get('trials') or 0)
            completed+=int(block.get('completed_trials') or 0)
            if direction=='forward':
                wins+=int(block.get('left_wins') or 0);losses+=int(block.get('right_wins') or 0)
            else:
                wins+=int(block.get('right_wins') or 0);losses+=int(block.get('left_wins') or 0)
            draws+=int(block.get('draws') or 0)
    if not completed: completed=wins+losses+draws
    return {'requestedBattles':requested,'completedBattles':completed,'wins':wins,'losses':losses,'draws':draws,'winRate':wins/completed if completed else float(fallback_rate or 0)}

def _completed(sim):
    return sum(int(block.get('completed_trials') or 0) for direction in ('forward','reverse') for block in (sim.get(direction) or []))

def _merge_sims(parts,base_seed):
    merged={
        'trials_per_direction':0,'blocks':0,'seed':int(base_seed),
        'forward':[],'reverse':[],
        'event_metric_blocks':{'forward':[],'reverse':[]},
        'timeline_trace_blocks':{'forward':[],'reverse':[]},
        'side_bias_issues':[],
    }
    weighted_hp=0.0;weighted_count=0;rates=[]
    for sim in parts:
        if not sim: continue
        merged['trials_per_direction']+=int(sim.get('trials_per_direction') or 0)
        merged['blocks']+=int(sim.get('blocks') or 0)
        for direction in ('forward','reverse'):
            merged[direction].extend(sim.get(direction) or [])
            merged['event_metric_blocks'][direction].extend((sim.get('event_metric_blocks') or {}).get(direction) or [])
            merged['timeline_trace_blocks'][direction].extend((sim.get('timeline_trace_blocks') or {}).get(direction) or [])
        count=_completed(sim);hp=sim.get('avg_hp_diff_balanced')
        if isinstance(hp,(int,float)) and count>0:
            weighted_hp+=float(hp)*count;weighted_count+=count
        rate=sim.get('left_balanced_win_rate')
        if isinstance(rate,(int,float)): rates.append(float(rate))
        for key in ('timeline_trace_policy','side_bias_audit_status','simulator_version'):
            if key not in merged and sim.get(key) is not None: merged[key]=sim.get(key)
        merged['side_bias_issues'].extend(sim.get('side_bias_issues') or [])
    summary=_summary(merged)
    merged['left_balanced_win_rate']=summary['winRate']
    merged['left_rate_min']=min(rates) if rates else summary['winRate']
    merged['left_rate_max']=max(rates) if rates else summary['winRate']
    merged['avg_hp_diff_balanced']=weighted_hp/weighted_count if weighted_count else 0.0
    return merged

def _run_batch(req,trials,seed):
    batch=dict(req)
    batch['trials']=int(trials);batch['blocks']=1;batch['seed']=int(seed);batch['include_detail']=True
    payload=json.loads(calculate(json.dumps(batch,ensure_ascii=False)))
    return payload

def calculate_with_examples(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else dict(request_json)
    base_seed=int(req.get('seed',1326230000))
    started=time.time();payloads=[]
    # Five small batches reuse the already proven 10x1 browser workload.
    # A failed/partial batch is retried as two 5x1 batches before continuing.
    for batch_index in range(5):
        seed=base_seed+batch_index*100000
        payload=_run_batch(req,10,seed)
        sim=payload.get('sim') or {}
        if _completed(sim)<20:
            retry_a=_run_batch(req,5,seed+20000)
            retry_b=_run_batch(req,5,seed+40000)
            payloads.extend((retry_a,retry_b))
        else:
            payloads.append(payload)
    sims=[payload.get('sim') or {} for payload in payloads]
    merged=_merge_sims(sims,base_seed)
    summary=_summary(merged)
    if summary['completedBattles']<=0:
        raise RuntimeError('100戦を完了できませんでした。端末の空きメモリを確認して再実行してください。')
    payload=dict(payloads[0]) if payloads else {'type':'simulation','version':'adapter-v1','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE'}
    payload['sim']=merged
    payload['trials_per_direction']=50
    payload['blocks']=len(payloads)
    payload['win_rate']=summary['winRate']
    payload['hp_diff']=merged.get('avg_hp_diff_balanced')
    payload['elapsed_seconds']=round(time.time()-started,3)
    representatives=[]
    trace_blocks=merged.get('timeline_trace_blocks') or {}
    for direction in ('forward','reverse'):
        for block in trace_blocks.get(direction) or []:
            for row in block.get('representative_traces') or []:
                if row.get('trace_rerun_failed') or row.get('seed') is None: continue
                representatives.append({'direction':direction,'seed':int(row['seed']),'outcome':_candidate_outcome(direction,row.get('winner'))})
    selected=[]
    if summary['wins']>0:
        row=next((r for r in representatives if r['outcome']=='win'),None)
        if row:selected.append(row)
    if summary['losses']>0:
        row=next((r for r in representatives if r['outcome']=='loss'),None)
        if row:selected.append(row)
    examples=[]
    for row in selected:
        examples.append({'schemaVersion':1,**row,'detail':_detail_payload(req,row['direction'],row['seed'])})
    payload['battle_evaluation']={'schemaVersion':1,'summary':summary,'examples':examples}
    payload['trials_total']=summary['completedBattles']
    return json.dumps(payload,ensure_ascii=False)
`);ready=true;self.postMessage({type:'ready'});}
self.onmessage=async(event)=>{const msg=event.data||{};try{await init(msg.bundleUrl);pyodide.globals.set('request_json_js',JSON.stringify(msg.request));const fn={calculate:'calculate_with_examples',search:'search',formal:'formal',detail:'detail'}[msg.type];if(!fn)throw new Error(`unknown operation: ${msg.type}`);const raw=await pyodide.runPythonAsync(`${fn}(request_json_js)`);self.postMessage({type:'result',requestId:msg.requestId,result:JSON.parse(raw)});}catch(error){self.postMessage({type:'error',requestId:msg.requestId,message:error?.stack||String(error)});}};
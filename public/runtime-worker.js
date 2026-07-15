let pyodide=null,ready=false;
const PYODIDE_BASE=new URL('pyodide/',self.location.href).href;
async function init(bundleUrl){if(ready)return;importScripts(PYODIDE_BASE+'pyodide.js');pyodide=await loadPyodide({indexURL:PYODIDE_BASE});const response=await fetch(bundleUrl);if(!response.ok)throw new Error(`runtime bundle HTTP ${response.status}`);pyodide.FS.writeFile('/runtime.tgz',new Uint8Array(await response.arrayBuffer()));await pyodide.runPythonAsync(`
import copy,gc,json,os,sys,tarfile,time
os.makedirs('/nobu',exist_ok=True)
with tarfile.open('/runtime.tgz','r:gz') as tf: tf.extractall('/nobu')
os.chdir('/nobu/02_ENGINE');sys.path.insert(0,'/nobu/02_ENGINE')
from browser_runtime_api import search,formal,_ctx,_make,TARGETS
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
    logs=[str(line) for line in (result.get('logs') or []) if str(line).startswith('T')]
    return {
        'type':'battle_detail','version':'detail-v1','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE',
        'direction':direction,'seed':int(seed),'winner':result.get('winner'),'win_reason':result.get('win_reason'),
        'ended_turn':result.get('ended_turn'),'max_turns':8,'hp_diff':result.get('hp_diff'),
        'final_scoreboard':result.get('final_scoreboard'),'turns':turns,'logs':logs,
    }

def detail(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else request_json
    return json.dumps(_detail_payload(req,str(req.get('direction') or 'forward'),int(req['seed'])),ensure_ascii=False)

def _candidate_outcome(direction,winner):
    if winner not in ('A','B'): return 'draw'
    candidate_raw='A' if direction=='forward' else 'B'
    return 'win' if winner==candidate_raw else 'loss'

def _run_direction(ctx,candidate,target,direction,seed_start,required=50):
    left,right=(target,candidate) if direction=='reverse' else (candidate,target)
    left_wins=right_wins=draws=0
    candidate_hp=[]
    samples=[]
    failures=[]
    seed=int(seed_start)
    attempts=0
    max_attempts=required*3
    while len(candidate_hp)<required and attempts<max_attempts:
        current_seed=seed+attempts
        attempts+=1
        try:
            result=simulate_once(ctx,copy.deepcopy(left),copy.deepcopy(right),seed=current_seed,verbose=False,trace_enabled=False,runtime_mode='outcome_only')
        except MemoryError:
            gc.collect()
            raise
        except Exception as error:
            failures.append({'seed':current_seed,'error':str(error)[:300]})
            continue
        winner=result.get('winner')
        if winner=='A': left_wins+=1
        elif winner=='B': right_wins+=1
        else: draws+=1
        raw_hp=float(result.get('hp_diff') or 0.0)
        candidate_hp.append(raw_hp if direction=='forward' else -raw_hp)
        outcome=_candidate_outcome(direction,winner)
        if not any(row['outcome']==outcome for row in samples):
            samples.append({'direction':direction,'seed':current_seed,'outcome':outcome,'winner':winner})
        if len(candidate_hp)%5==0: gc.collect()
    if len(candidate_hp)<required:
        first_error=failures[0]['error'] if failures else '詳細なし'
        raise RuntimeError(f'{direction}の正本試行を{required}戦完了できませんでした（完了{len(candidate_hp)}戦／試行{attempts}回／最初の例外: {first_error}）')
    raw_hp=[hp if direction=='forward' else -hp for hp in candidate_hp]
    return {
        'trials':required,'completed_trials':required,'left_wins':left_wins,'right_wins':right_wins,'draws':draws,
        'left_win_rate':left_wins/required,'right_win_rate':right_wins/required,
        'avg_hp_diff':sum(raw_hp)/required,'candidate_hp_sum':sum(candidate_hp),'raw_hp_sum':sum(raw_hp),
        'next_seed':seed+attempts,'candidate_hp':candidate_hp,'samples':samples,'runtime_failures':failures,
    }

def _batch_direction_public(value):
    return {key:value[key] for key in (
        'trials','completed_trials','left_wins','right_wins','draws','left_win_rate','right_win_rate',
        'avg_hp_diff','candidate_hp_sum','raw_hp_sum','next_seed','samples','runtime_failures'
    )}

def calculate_batch(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else dict(request_json)
    required=max(1,min(10,int(req.get('trials') or 10)))
    forward_seed=int(req.get('forward_seed',req.get('seed',1326230000)))
    reverse_seed=int(req.get('reverse_seed',int(req.get('seed',1326230000))+5003))
    ctx=_ctx();candidate=_make(req['candidate']);target=_make(req.get('target_spec') or TARGETS[req['target']])
    forward=_run_direction(ctx,candidate,target,'forward',forward_seed,required)
    reverse=_run_direction(ctx,candidate,target,'reverse',reverse_seed,required)
    payload={
        'type':'simulation_batch','version':'batch-v1-isolated-worker','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE',
        'trials_per_direction':required,'forward':_batch_direction_public(forward),'reverse':_batch_direction_public(reverse),
        'candidate_assignment':candidate.get('attach_assignment'),'formal_status':candidate.get('formal_status'),
    }
    gc.collect()
    return json.dumps(payload,ensure_ascii=False)

def calculate_100(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else dict(request_json)
    started=time.time();base_seed=int(req.get('seed',1326230000));ctx=_ctx()
    candidate=_make(req['candidate']);target=_make(req.get('target_spec') or TARGETS[req['target']])
    forward=_run_direction(ctx,candidate,target,'forward',base_seed,50)
    reverse=_run_direction(ctx,candidate,target,'reverse',base_seed+5003,50)
    wins=forward['left_wins']+reverse['right_wins']
    losses=forward['right_wins']+reverse['left_wins']
    draws=forward['draws']+reverse['draws']
    completed=wins+losses+draws
    candidate_hp=forward['candidate_hp']+reverse['candidate_hp']
    win_rate=wins/completed if completed else 0.0
    hp_diff=sum(candidate_hp)/len(candidate_hp) if candidate_hp else 0.0
    representatives=forward['samples']+reverse['samples']
    selected=[]
    if wins>0:
        row=next((row for row in representatives if row['outcome']=='win'),None)
        if row:selected.append(row)
    if losses>0:
        row=next((row for row in representatives if row['outcome']=='loss'),None)
        if row:selected.append(row)
    examples=[]
    for row in selected:
        examples.append({'schemaVersion':1,'direction':row['direction'],'seed':row['seed'],'outcome':row['outcome'],'detail':_detail_payload(req,row['direction'],row['seed'])})
    summary={'requestedBattles':100,'completedBattles':completed,'wins':wins,'losses':losses,'draws':draws,'winRate':win_rate}
    forward_public={k:v for k,v in forward.items() if k not in {'candidate_hp','samples'}}
    reverse_public={k:v for k,v in reverse.items() if k not in {'candidate_hp','samples'}}
    sim={
        'trials_per_direction':50,'blocks':1,'seed':base_seed,
        'forward':[forward_public],'reverse':[reverse_public],
        'left_balanced_win_rate':win_rate,'avg_hp_diff_balanced':hp_diff,
        'timeline_trace_blocks':{'forward':[],'reverse':[]},
        'browser_execution_policy':'CANONICAL_SIMULATE_ONCE_50_FORWARD_50_REVERSE_NO_UNIX_SIGNAL_WATCHDOG',
    }
    payload={
        'type':'simulation','version':'adapter-v1-browser-100','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE',
        'target':req.get('target','CUSTOM'),'trials_per_direction':50,'trials_total':completed,'blocks':1,
        'win_rate':win_rate,'hp_diff':hp_diff,'elapsed_seconds':round(time.time()-started,3),
        'candidate_assignment':candidate.get('attach_assignment'),'formal_status':candidate.get('formal_status'),'sim':sim,
        'battle_evaluation':{'schemaVersion':1,'summary':summary,'examples':examples},
    }
    return json.dumps(payload,ensure_ascii=False)
`);ready=true;self.postMessage({type:'ready'});}
self.onmessage=async(event)=>{const msg=event.data||{};try{await init(msg.bundleUrl);pyodide.globals.set('request_json_js',JSON.stringify(msg.request));const fn={calculate:'calculate_100',calculateBatch:'calculate_batch',search:'search',formal:'formal',detail:'detail'}[msg.type];if(!fn)throw new Error(`unknown operation: ${msg.type}`);const raw=await pyodide.runPythonAsync(`${fn}(request_json_js)`);self.postMessage({type:'result',requestId:msg.requestId,result:JSON.parse(raw)});}catch(error){self.postMessage({type:'error',requestId:msg.requestId,message:error?.stack||String(error)});}};

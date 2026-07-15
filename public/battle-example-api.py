#!/usr/bin/env python3
from __future__ import annotations
import copy, json, re
from browser_runtime_api import _ctx, _make
from battle_simulator import simulate_once


def _record(value):
    return value if isinstance(value,dict) else {}


def _array(value):
    return value if isinstance(value,list) else []


def _canonical_side(direction, raw):
    if raw not in ('A','B'): return raw
    return raw if direction=='forward' else ('B' if raw=='A' else 'A')


def _candidate_outcome(direction, winner):
    if winner=='draw': return 'draw'
    candidate_raw='A' if direction=='forward' else 'B'
    return 'win' if winner==candidate_raw else 'loss'


def _canonical_hp_diff(direction, value):
    try: value=float(value)
    except Exception: return None
    return round(value if direction=='forward' else -value,2)


def _example_targets(rate):
    value=float(rate or 0.0)
    if value>=0.999999:return {'win':1,'loss':0}
    if value<=0.000001:return {'win':0,'loss':1}
    return {'win':1,'loss':1}


def _state_map(rows, direction):
    out={}
    for raw_side in ('A','B'):
        side=_canonical_side(direction,raw_side)
        for row in _array(_record(rows).get(raw_side)):
            name=str(_record(row).get('name') or '')
            if name: out[(side,name)]=round(float(_record(row).get('hp') or 0),2)
    return out


def _pack_troops(values):
    return [{'side':side,'officer':name,'troops':round(value,2)} for (side,name),value in sorted(values.items())]


def _replace_sides(text, direction):
    if direction=='forward': return text
    return text.replace('A:','@@A@@:').replace('B:','A:').replace('@@A@@:','B:')


def _parse_change(line, direction):
    m=re.match(r'^T(\d+) ([AB]):([^\s]+) 損害内訳 source=(.*?) loss=([0-9.]+)',line)
    if m:return {'turn':int(m.group(1)),'side':_canonical_side(direction,m.group(2)),'officer':m.group(3),'delta':-float(m.group(5)),'kind':'troops','source':m.group(4),'raw':line}
    m=re.match(r'^T(\d+) ([AB]):([^\s]+) 負傷兵回復 source=(.*?) heal=([0-9.]+)',line)
    if m:return {'turn':int(m.group(1)),'side':_canonical_side(direction,m.group(2)),'officer':m.group(3),'delta':float(m.group(5)),'kind':'troops','source':m.group(4),'raw':line}
    m=re.match(r'^T(\d+) ([AB]):([^\s]+) 備兵吸収 ([0-9.]+) source=(.*)',line)
    if m:return {'turn':int(m.group(1)),'side':_canonical_side(direction,m.group(2)),'officer':m.group(3),'delta':-float(m.group(4)),'kind':'reserve','source':m.group(5),'raw':line}
    m=re.match(r'^T(\d+) ([AB]):([^\s]+) .*? 備兵grant -> ([^\s]+) amount=([0-9.]+)',line)
    if m:return {'turn':int(m.group(1)),'side':_canonical_side(direction,m.group(2)),'officer':m.group(4),'delta':float(m.group(5)),'kind':'reserve','source':'備兵付与','raw':line}
    return None


def _source_actor(line, order_names, direction):
    m=re.match(r'^T\d+ ([AB]):([^\s]+)\s+(.+)$',line)
    if not m:return None
    key=(_canonical_side(direction,m.group(1)),m.group(2))
    return key if key in order_names else None


def _is_technical(line):
    return any(token in line for token in ('損害内訳','負傷兵回復','残兵与ダメージ係数','残兵回復係数','被回復倍率=','battle_dead','wounded_remain','ACTION_ORDER','_error'))


def _changes_with_before_after(changes, current):
    rows=[]
    for change in changes:
        key=(change['side'],change['officer'])
        before=float(current.get(key,0.0));after=max(0.0,before+float(change['delta'])) if change['kind']=='troops' else before
        if change['kind']=='troops':current[key]=after
        rows.append({**{k:v for k,v in change.items() if k not in ('raw','turn')},'before':round(before,2),'after':round(after,2),'delta':round(float(change['delta']),2)})
    return rows


def _turn_payload(turn, trace_turn, turn_logs, direction, ended_turn, final_state):
    start=_state_map(_record(trace_turn).get('start_state'),direction) or dict(final_state)
    end=_state_map(_record(trace_turn).get('end_state'),direction) or dict(start)
    order=[]
    for row in _array(_record(trace_turn).get('action_order')):
        raw='B' if _record(row).get('side')=='B' else 'A'
        order.append({'rank':int(_record(row).get('rank') or 0),'side':_canonical_side(direction,raw),'rawSide':raw,'officer':str(_record(row).get('officer') or '未確認'),'effectiveSpeed':_record(row).get('effective_speed'),'baseSpeed':_record(row).get('base_speed'),'timedSpeedBonus':_record(row).get('timed_speed_bonus') or 0,'persistentSpeedBonus':_record(row).get('persistent_speed_bonus') or 0})
    if turn>ended_turn or not trace_turn:return {'turn':turn,'status':'battle_ended','startTroops':_pack_troops(start),'endTroops':_pack_troops(start),'turnStartEvents':[],'turnStartChanges':[],'actions':[],'turnEndChanges':[]}
    order_names={(row['side'],row['officer']) for row in order}
    action_index=next((i for i,line in enumerate(turn_logs) if ' ACTION_ORDER ' in line),-1)
    prefix=turn_logs[:action_index] if action_index>=0 else []
    body=turn_logs[action_index+1:] if action_index>=0 else turn_logs
    current=dict(start)
    prefix_changes=[c for c in (_parse_change(line,direction) for line in prefix) if c]
    turn_start_changes=_changes_with_before_after(prefix_changes,current)
    turn_start_events=[]
    for line in prefix:
        if not _is_technical(line):
            event=_replace_sides(re.sub(r'^T\d+\s+','',line),direction)
            if event not in turn_start_events:turn_start_events.append(event)
    buckets={(row['side'],row['officer']):{'events':[],'changes':[]} for row in order}
    unassigned=[];pending=[]
    for line in body:
        change=_parse_change(line,direction);actor=_source_actor(line,order_names,direction)
        if change:pending.append(change);continue
        if actor:
            bucket=buckets.setdefault(actor,{'events':[],'changes':[]})
            if pending:bucket['changes'].extend(pending);pending=[]
            if not _is_technical(line):bucket['events'].append(_replace_sides(re.sub(r'^T\d+\s+','',line),direction))
        elif pending and (' -> ' in line or ' heal ' in line):unassigned.extend(pending);pending=[]
    unassigned.extend(pending)
    actions=[]
    for row in order:
        bucket=buckets.get((row['side'],row['officer']),{'events':[],'changes':[]});changes=_changes_with_before_after(bucket['changes'],current);events=[]
        for event in bucket['events']:
            if event not in events:events.append(event)
        actions.append({**row,'events':events[:40] or ['行動記録なし'],'troopChanges':changes})
    turn_end_changes=_changes_with_before_after(unassigned,current)
    for key,target in end.items():
        now=float(current.get(key,0.0));diff=round(float(target)-now,2)
        if abs(diff)>0.01:
            change={'side':key[0],'officer':key[1],'delta':diff,'kind':'troops','source':'ターン終了時runtime実値'}
            turn_end_changes.extend(_changes_with_before_after([change],current))
    return {'turn':turn,'status':'active','startTroops':_pack_troops(start),'endTroops':_pack_troops(end),'turnStartEvents':turn_start_events[:60],'turnStartChanges':turn_start_changes,'actions':actions,'turnEndChanges':turn_end_changes}


def _build_example(candidate,target,direction,seed,outcome):
    left,right=(candidate,target) if direction=='forward' else (target,candidate)
    result=simulate_once(_ctx(),copy.deepcopy(left),copy.deepcopy(right),seed=int(seed),verbose=True,trace_enabled=True,runtime_mode='full_trace')
    trace=_record(result.get('trace'));logs=_array(result.get('logs'));ended=int(result.get('ended_turn') or 0)
    logs_by_turn={turn:[line for line in logs if str(line).startswith(f'T{turn} ')] for turn in range(1,9)}
    final_state={}
    if ended:
        end_turn=_record(_record(trace.get('turns')).get(str(ended)));final_state=_state_map(end_turn.get('end_state'),direction)
    turns=[]
    for turn in range(1,9):
        trace_turn=_record(_record(trace.get('turns')).get(str(turn)));turns.append(_turn_payload(turn,trace_turn,logs_by_turn[turn],direction,ended,final_state))
        if trace_turn:final_state=_state_map(trace_turn.get('end_state'),direction) or final_state
    winner=result.get('winner')
    return {'outcome':outcome,'direction':direction,'seed':int(seed),'winner':_canonical_side(direction,winner) if winner in ('A','B') else 'draw','winReason':result.get('win_reason') or '未確認','endedTurn':ended,'maxTurns':8,'hpDiff':_canonical_hp_diff(direction,result.get('hp_diff')),'turns':turns}


def _representative_seeds(summary):
    rows=[];sim=_record(summary.get('sim'));blocks=_record(sim.get('timeline_trace_blocks'))
    for direction in ('forward','reverse'):
        for block in _array(blocks.get(direction)):
            for rep in _array(_record(block).get('representative_traces')):
                rep=_record(rep);seed=rep.get('seed');winner=rep.get('winner')
                if isinstance(seed,(int,float)) and winner in ('A','B','draw'):rows.append({'direction':direction,'seed':int(seed),'outcome':_candidate_outcome(direction,winner)})
    return rows


def _scan_ranges(summary):
    sim=_record(summary.get('sim'));ranges=[]
    for direction in ('forward','reverse'):
        for block in _array(sim.get(direction)):
            block=_record(block);seed=block.get('seed');trials=block.get('trials')
            if isinstance(seed,(int,float)) and isinstance(trials,(int,float)):ranges.append((direction,int(seed),int(trials)))
    return ranges


def _outcome(candidate,target,direction,seed):
    left,right=(candidate,target) if direction=='forward' else (target,candidate)
    result=simulate_once(_ctx(),copy.deepcopy(left),copy.deepcopy(right),seed=seed,verbose=False,trace_enabled=False,runtime_mode='outcome_only')
    return _candidate_outcome(direction,result.get('winner'))


def _summary_counts(summary):
    sim=_record(summary.get('sim'));wins=losses=draws=completed=0
    for block in _array(sim.get('forward')):
        b=_record(block);wins+=int(b.get('left_wins') or 0);losses+=int(b.get('right_wins') or 0);draws+=int(b.get('draws') or 0);completed+=int(b.get('completed_trials') or 0)
    for block in _array(sim.get('reverse')):
        b=_record(block);wins+=int(b.get('right_wins') or 0);losses+=int(b.get('left_wins') or 0);draws+=int(b.get('draws') or 0);completed+=int(b.get('completed_trials') or 0)
    return wins,losses,draws,completed


def build_battle_examples(request_json, summary_json):
    req=json.loads(request_json) if isinstance(request_json,str) else request_json;summary=json.loads(summary_json) if isinstance(summary_json,str) else summary_json
    candidate=_make(req['candidate']);target=_make(req.get('target_spec'));rate=float(summary.get('win_rate') or 0.0);targets=_example_targets(rate)
    selected={'win':[],'loss':[]};seen=set()
    def add(direction,seed,outcome):
        key=(direction,int(seed))
        if outcome in selected and len(selected[outcome])<targets[outcome] and key not in seen:selected[outcome].append((direction,int(seed)));seen.add(key)
    for row in _representative_seeds(summary):add(row['direction'],row['seed'],row['outcome'])
    if any(len(selected[k])<targets[k] for k in selected):
        for direction,start,count in _scan_ranges(summary):
            for seed in range(start,start+count):
                if (direction,seed) in seen:continue
                add(direction,seed,_outcome(candidate,target,direction,seed))
                if all(len(selected[k])>=targets[k] for k in selected):break
            if all(len(selected[k])>=targets[k] for k in selected):break
    examples=[]
    for outcome in ('win','loss'):
        for direction,seed in selected[outcome]:
            try:examples.append(_build_example(candidate,target,direction,seed,outcome))
            except Exception as error:examples.append({'outcome':outcome,'direction':direction,'seed':seed,'error':repr(error),'turns':[]})
    wins,losses,draws,completed=_summary_counts(summary)
    return json.dumps({'schemaVersion':1,'trialsPerDirection':int(summary.get('trials_per_direction') or req.get('trials') or 0),'directions':2,'completedTrials':completed,'candidateWins':wins,'candidateLosses':losses,'draws':draws,'examples':examples,'selectionPolicy':'one win and one loss example; 100% or 0% returns one existing-side example'},ensure_ascii=False)

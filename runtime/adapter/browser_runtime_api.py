#!/usr/bin/env python3
from __future__ import annotations
import copy, itertools, json, re, time
from custom_evaluate import load_context, resolve_officers_by_awaken_values, resolve_skills, build_best, public_best
from battle_simulator import simulate_many_balanced, simulate_once

_CTX=None
def _ctx():
    global _CTX
    if _CTX is None:_CTX=load_context()
    return _CTX

def _make(spec):
    if int(spec.get('troops',10000)) != 10000:
        raise ValueError('b223 formal initial troops are fixed at 10000 per officer')
    ctx=_ctx(); officers=resolve_officers_by_awaken_values(ctx,spec['officers'],spec['awaken'])
    overrides=spec.get('stats') or []
    for i,row in enumerate(overrides[:len(officers)]):
        if not isinstance(row,dict):continue
        for src,jp in {'force':'武勇','intel':'知略','lead':'統率','speed':'速度'}.items():
            if src in row and row[src] is not None:
                val=float(row[src]);officers[i][f'{jp}_ステ振り後']=str(val)
                if jp=='速度':officers[i]['行動順用速度']=str(val)
        officers[i]['browser_manual_stat_override']=True
    skills=resolve_skills(ctx,spec['skills'])
    result=build_best(ctx,officers,skills,spec['unit'],spec.get('mode','owned'),fixed_placement=bool(spec.get('fixed_placement',True)),ignore_formal_overlap=bool(spec.get('ignore_formal_overlap',True)))
    if spec.get('unit_level') is not None:
        result['unit_level']=int(spec['unit_level']);result['unit_coef']=1.0+int(spec['unit_level'])*0.02;result['unit_level_sources']=['NOBU Companion explicit input via protected adapter']
    return result

TARGETS={
'YAMAGATA':{'officers':['山県昌景','飯富虎昌','真田昌幸'],'awaken':[5,5,2],'unit':'騎馬','skills':['矢石飛交','血戦奮闘','赤備え隊','理非曲直','瞬息万変','帰還の凱歌']},
'KURODA':{'officers':['黒田官兵衛','豊臣秀吉','ねね'],'awaken':[3,1,3],'unit':'弓','skills':['七十二の計','紅蓮の炎','三河弓兵隊','嚢沙之計','罵詈雑言','沈魚落雁']},
'YAMAMOTO':{'officers':['山本勘助','柴田勝家','柿崎景家'],'awaken':[2,1,2],'unit':'騎馬','skills':['一行三昧','回天転運','会盟の陣','以戦養戦','乗勝追撃','縦横馳突']}}

_TURN_LINE_RE=re.compile(r'^T([0-8])\s+([AB]):([^\s]+)\s+(.+)$')
_LOSS_RE=re.compile(r'^T([1-8])\s+([AB]):([^\s]+)\s+損害内訳\s+source=(.*?)\s+loss=([0-9.]+).*?wounded=([0-9.]+)')
_HEAL_RE=re.compile(r'^T([1-8])\s+([AB]):([^\s]+)\s+負傷兵回復\s+source=(.*?)\s+heal=([0-9.]+)\s+wounded_remain=([0-9.]+)')

def _canonical_side(direction, raw):
    if raw not in {'A','B'}:return raw
    return raw if direction=='forward' else ('B' if raw=='A' else 'A')

def _canonical_text(direction, value):
    text=str(value or '')
    if direction!='reverse':return text
    return text.replace('A:','__RAW_A__:').replace('B:','A:').replace('__RAW_A__:','B:')

def _battle_summary(sim, requested_per_direction):
    wins=losses=draws=completed=failures=0
    for direction in ('forward','reverse'):
        for block in sim.get(direction,[]) or []:
            completed+=int(block.get('completed_trials') or 0)
            failures+=len(block.get('runtime_failures') or [])
            if direction=='forward':
                wins+=int(block.get('left_wins') or 0);losses+=int(block.get('right_wins') or 0)
            else:
                wins+=int(block.get('right_wins') or 0);losses+=int(block.get('left_wins') or 0)
            draws+=int(block.get('draws') or 0)
    requested=int(requested_per_direction)*2
    return {
        'requestedBattles':requested,'completedBattles':completed,'wins':wins,'losses':losses,'draws':draws,
        'winRate':round(wins/max(1,completed),4),'perDirectionBattles':int(requested_per_direction),'runtimeFailures':failures,
        'evaluation':'SIDE_BALANCED_EQUAL_FORWARD_REVERSE_COUNTS',
    }

def _compact_team(raw_team, canonical):
    raw_team=raw_team if isinstance(raw_team,dict) else {}
    officers=[]
    for row in raw_team.get('officers',[]) or []:
        if not isinstance(row,dict):continue
        officers.append({
            'side':canonical,'role':row.get('role') or '', 'name':row.get('name') or '未確認',
            'troops':round(float(row.get('hp') or 0),2),'maxTroops':round(float(row.get('max_hp') or 10000),2),
            'alive':bool(row.get('alive')),'isCommander':bool(row.get('is_commander')),
        })
    return {'side':canonical,'totalTroops':round(float(raw_team.get('team_total_hp') or 0),2),'officers':officers}

def _compact_scoreboard(raw, direction):
    if not isinstance(raw,dict):return None
    result={}
    for raw_side in ('A','B'):
        canonical=_canonical_side(direction,raw_side)
        result[canonical]=_compact_team(raw.get(raw_side),canonical)
    return result if 'A' in result and 'B' in result else None

def _compact_action_order(raw_turn, direction):
    if not isinstance(raw_turn,dict):return []
    rows=[]
    for row in raw_turn.get('action_order',[]) or []:
        if not isinstance(row,dict):continue
        rows.append({
            'rank':int(row.get('rank') or 0),'side':_canonical_side(direction,row.get('side')),
            'officer':row.get('officer') or '未確認','role':('大将','副将1','副将2')[int(row.get('idx') or 0)] if int(row.get('idx') or 0) in (0,1,2) else '',
            'effectiveSpeed':row.get('effective_speed'),
            'baseSpeed':row.get('base_speed'),'timedSpeedBonus':row.get('timed_speed_bonus') or 0,
            'persistentSpeedBonus':row.get('persistent_speed_bonus') or 0,
        })
    return sorted(rows,key=lambda row:row['rank'])

def _event_type(body):
    if ' heal ' in body or '回復' in body:return 'heal'
    if 'DOT ' in body:return 'dot'
    if '行動阻害' in body or '通常攻撃不可' in body:return 'blocked'
    if '準備開始' in body:return 'prepare'
    if 'cleanse ' in body:return 'cleanse'
    if ' -> ' in body:return 'action'
    return 'status'

def _display_action(body):
    if 'ACTION_ORDER' in body or 'damage_formula=' in body or '残兵与ダメージ係数=' in body:return False
    markers=(' -> ',' heal ','DOT ','準備開始','準備完了','行動阻害','cleanse ','buff applied',' activated ',
             '連撃通常攻撃','通常攻撃不可','混乱対象ズレ','挑発誘導','制御無効','control_immune','回避','会心','奇策',
             'cooldown_skip','post_fire_rest')
    return any(marker in body for marker in markers)

def _troop_change(match, direction, kind):
    turn=int(match.group(1));side=_canonical_side(direction,match.group(2));officer=match.group(3);source=match.group(4)
    amount=float(match.group(5));wounded_after=float(match.group(6));after=max(0.0,10000.0-wounded_after)
    before=min(10000.0,after+amount) if kind=='loss' else max(0.0,after-amount)
    delta=-amount if kind=='loss' else amount
    return {
        'turn':turn,'side':side,'officer':officer,'source':source,'before':round(before,2),'after':round(after,2),
        'delta':round(delta,2),'kind':'loss' if kind=='loss' else 'recovery',
    }

def _compact_log_events(logs, direction):
    by_turn={turn:[] for turn in range(1,9)}
    sequence=0
    for line in logs or []:
        text=str(line);loss=_LOSS_RE.match(text);heal=_HEAL_RE.match(text)
        if loss or heal:
            change=_troop_change(loss or heal,direction,'loss' if loss else 'recovery');sequence+=1
            sign='-' if change['delta']<0 else '+'
            by_turn[change['turn']].append({
                'sequence':sequence,'side':change['side'],'actor':change['officer'],'type':'troop_change',
                'text':f"{change['officer']}：{change['source']}で兵数 {change['before']:.0f} → {change['after']:.0f}（{sign}{abs(change['delta']):.0f}）",
                'troopChanges':[change],
            })
            continue
        parsed=_TURN_LINE_RE.match(text)
        if not parsed:continue
        turn=int(parsed.group(1))
        if turn<1 or turn>8:continue
        body=parsed.group(4)
        if not _display_action(body):continue
        sequence+=1
        by_turn[turn].append({
            'sequence':sequence,'side':_canonical_side(direction,parsed.group(2)),'actor':parsed.group(3),
            'type':_event_type(body),'text':_canonical_text(direction,body),'troopChanges':[],
        })
    # The protected runtime writes the exact loss/recovery row immediately before
    # the human-readable action row. Merge those adjacent rows so the UI can show
    # action content and its real troop delta together without inferring damage.
    for turn,events in by_turn.items():
        merged=[]
        for event in events:
            if event['type']!='troop_change' and merged and merged[-1]['type']=='troop_change':
                change_event=merged[-1];change=change_event['troopChanges'][0]
                if change['source'] in event['text'] or change['officer'] in event['text']:
                    merged.pop();event['troopChanges']=change_event['troopChanges']
            merged.append(event)
        by_turn[turn]=merged
    return by_turn

def _compact_example(result, direction, seed):
    trace=result.get('trace') or {};raw_turns=trace.get('turns') or {};ended=int(result.get('ended_turn') or 0)
    events=_compact_log_events(result.get('logs') or [],direction);turns=[]
    for turn in range(1,9):
        raw_turn=raw_turns.get(str(turn)) if isinstance(raw_turns,dict) else None
        raw_turn=raw_turn if isinstance(raw_turn,dict) else {}
        start=_compact_scoreboard(raw_turn.get('scoreboard_start'),direction)
        end_raw=raw_turn.get('scoreboard_end')
        if turn==ended and not end_raw:end_raw=result.get('final_scoreboard')
        turns.append({
            'turn':turn,'played':turn<=ended,'status':'played' if turn<=ended else 'not_played_battle_ended',
            'actionOrder':_compact_action_order(raw_turn,direction),'events':events.get(turn,[]),
            'start':start,'end':_compact_scoreboard(end_raw,direction),
        })
    raw_winner=result.get('winner');winner=_canonical_side(direction,raw_winner) if raw_winner in {'A','B'} else 'draw'
    return {
        'schemaVersion':1,'direction':direction,'seed':int(seed),'outcome':'win' if winner=='A' else 'loss' if winner=='B' else 'draw',
        'winner':winner,'winReason':result.get('win_reason') or '未確認','endedTurn':ended,'maxTurns':8,
        'hpDiff':round(float(result.get('hp_diff') or 0)*(1 if direction=='forward' else -1),2),'turns':turns,
    }

def _representative_refs(sim):
    refs=[];blocks=sim.get('timeline_trace_blocks') or {}
    for direction in ('forward','reverse'):
        for block in blocks.get(direction,[]) or []:
            for rep in block.get('representative_traces',[]) or []:
                if not isinstance(rep,dict) or rep.get('trace_rerun_failed') or rep.get('seed') is None:continue
                raw=rep.get('winner');winner=_canonical_side(direction,raw) if raw in {'A','B'} else 'draw'
                outcome='win' if winner=='A' else 'loss' if winner=='B' else 'draw'
                if not any(row['outcome']==outcome for row in refs):refs.append({'direction':direction,'seed':int(rep['seed']),'outcome':outcome})
    return refs

def _build_battle_examples(ctx, sim, candidate, target, summary):
    wanted=[]
    if summary['wins']>0:wanted.append('win')
    if summary['losses']>0:wanted.append('loss')
    if summary['draws']>0:wanted.append('draw')
    refs=_representative_refs(sim);examples=[]
    for outcome in wanted:
        ref=next((row for row in refs if row['outcome']==outcome),None)
        if not ref:continue
        left,right=(candidate,target) if ref['direction']=='forward' else (target,candidate)
        result=simulate_once(ctx,copy.deepcopy(left),copy.deepcopy(right),seed=ref['seed'],verbose=True,trace_enabled=True)
        examples.append(_compact_example(result,ref['direction'],ref['seed']))
    return examples

def evaluate_request(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else request_json
    candidate=_make(req['candidate']); target=_make(req.get('target_spec') or TARGETS[req['target']])
    trials=max(1,min(int(req.get('trials',10)),100));blocks=max(1,min(int(req.get('blocks',1)),3));seed=int(req.get('seed',1326230000));started=time.time()
    ctx=_ctx();sim=simulate_many_balanced(ctx,copy.deepcopy(candidate),copy.deepcopy(target),trials=trials,seed=seed,blocks=blocks)
    summary=_battle_summary(sim,trials);examples=_build_battle_examples(ctx,sim,candidate,target,summary) if req.get('include_detail') else []
    return json.dumps({'type':'simulation','version':'adapter-v2','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE','target':req.get('target','CUSTOM'),'trials_per_direction':trials,'blocks':blocks,'requested_battles':summary['requestedBattles'],'win_rate':summary['winRate'],'balanced_win_rate':sim.get('left_balanced_win_rate'),'hp_diff':sim.get('avg_hp_diff_balanced'),'elapsed_seconds':round(time.time()-started,3),'candidate_assignment':candidate.get('attach_assignment'),'formal_status':candidate.get('formal_status'),'battle_summary':summary,'battle_examples':examples,'sim':sim if req.get('include_detail') else None},ensure_ascii=False)

def _base_variants(seed, owned_pool, swap_depth):
    yield seed
    depth=max(0,min(int(swap_depth),3))
    if depth < 1:
        return
    officers=seed['officers']; stats=seed.get('stats') or [{},{},{}]
    usable=[]
    for owned in owned_pool:
        name=owned.get('name')
        if name and name not in officers and name not in {x.get('name') for x in usable}:
            usable.append(owned)
    # One-officer replacement.
    for slot in range(3):
        for owned in usable:
            variant=copy.deepcopy(seed)
            variant['officers'][slot]=owned['name']
            variant['awaken'][slot]=int(owned.get('awaken',0))
            variant['stats'][slot]=owned.get('stats') or {}
            yield variant
    if depth < 2 or len(usable) < 2:
        return
    # Two-officer replacement. Replacement officers must be different.
    for slot_a,slot_b in itertools.combinations(range(3),2):
        for owned_a,owned_b in itertools.permutations(usable,2):
            if owned_a['name']==owned_b['name']:
                continue
            variant=copy.deepcopy(seed)
            for slot,owned in ((slot_a,owned_a),(slot_b,owned_b)):
                variant['officers'][slot]=owned['name']
                variant['awaken'][slot]=int(owned.get('awaken',0))
                variant['stats'][slot]=owned.get('stats') or {}
            yield variant
    if depth < 3 or len(usable) < 3:
        return
    # Three-officer free selection from the owned pool. Every ordered trio is a distinct placement.
    for owned_a,owned_b,owned_c in itertools.permutations(usable,3):
        variant=copy.deepcopy(seed)
        for slot,owned in enumerate((owned_a,owned_b,owned_c)):
            variant['officers'][slot]=owned['name']
            variant['awaken'][slot]=int(owned.get('awaken',0))
            variant['stats'][slot]=owned.get('stats') or {}
        yield variant

def _skill_meta(name):
    row=next((r for r in _ctx().get('skills',[]) if r.get('skill_name')==name),None) or {}
    def num(v,default=0.0):
        try:return float(v)
        except:return default
    return {
        'name':name,
        'bucket':row.get('optimizer_bucket') or 'unclassified',
        'priority':num(row.get('optimizer_priority_score'),num(row.get('standard_ev'),0.0)),
        'allowed':str(row.get('candidate_generation_allowed','True')).lower()=='true',
        'formal':str(row.get('formal_score_allowed','True')).lower()=='true',
        'quarantine':bool(row.get('error_quarantine_reason')),
    }

def _beam_full_skill_orders(names, beam_width):
    # Adaptive prefilter: exact exhaustive ranking for 6-8 usable skills; beam for 9+.
    metas={n:_skill_meta(n) for n in names}
    usable=[n for n in names if metas[n]['allowed'] and metas[n]['formal'] and not metas[n]['quarantine']]
    width=max(12,min(int(beam_width or 96),512))
    if 6 <= len(usable) <= 8:
        exact=[(list(eq),_score_skill_order(eq)) for eq in itertools.permutations(usable,6)]
        exact.sort(key=lambda x:(x[1],tuple(x[0])),reverse=True)
        return exact[:width]
    states=[([],frozenset(),0.0,())]
    for officer_slot in range(3):
        nxt=[]
        for equipped,used,score,buckets in states:
            remain=[n for n in usable if n not in used]
            for a,b in itertools.permutations(remain,2):
                ma,mb=metas[a],metas[b]
                new_buckets=buckets+(ma['bucket'],mb['bucket'])
                diversity=len(set(new_buckets))*2.0
                pair_diversity=3.0 if ma['bucket']!=mb['bucket'] else 0.0
                new_score=score+ma['priority']+mb['priority']+diversity+pair_diversity
                nxt.append((equipped+[a,b],used|{a,b},new_score,new_buckets))
        nxt.sort(key=lambda x:(x[2],tuple(x[0])),reverse=True)
        states=nxt[:width]
        if not states:break
    return [(eq,score) for eq,used,score,buckets in states if len(eq)==6]


def _score_skill_order(equipped):
    metas={n:_skill_meta(n) for n in equipped}
    score=0.0; buckets=()
    for officer_slot in range(3):
        a,b=equipped[officer_slot*2:officer_slot*2+2]
        ma,mb=metas[a],metas[b]
        buckets=buckets+(ma['bucket'],mb['bucket'])
        diversity=len(set(buckets))*2.0
        pair_diversity=3.0 if ma['bucket']!=mb['bucket'] else 0.0
        score+=ma['priority']+mb['priority']+diversity+pair_diversity
    return score

def _beam_recall_audit(names, beam_width):
    # Audit only the same DB-grounded prefilter objective. It does not prove battle-runtime optimality.
    metas={n:_skill_meta(n) for n in names}
    usable=[n for n in names if metas[n]['allowed'] and metas[n]['formal'] and not metas[n]['quarantine']]
    if len(usable)<6 or len(usable)>8:
        return {'performed':False,'reason':'confirmed skill pool must contain 6-8 usable skills'}
    exhaustive=[]
    for equipped in itertools.permutations(usable,6):
        exhaustive.append((equipped,_score_skill_order(equipped)))
    exhaustive.sort(key=lambda x:(x[1],x[0]),reverse=True)
    beam=_beam_full_skill_orders(usable,beam_width)
    beam_set={tuple(eq) for eq,score in beam}
    k=min(len(beam),len(exhaustive))
    top=exhaustive[:k]
    hits=sum(1 for eq,score in top if tuple(eq) in beam_set)
    return {
        'performed':True,'usable_skill_count':len(usable),'exhaustive_count':len(exhaustive),
        'beam_count':len(beam),'comparison_k':k,'top_k_hits':hits,
        'recall_at_k':round(hits/k,6) if k else None,
        'prefilter_top1_found':bool(top and tuple(top[0][0]) in beam_set),
        'scope':'PREFILTER_OBJECTIVE_ONLY_NOT_BATTLE_OPTIMUM'
    }

def _skill_variants(seed, skill_pool, skill_swap_depth, beam_width=96):
    yield seed
    depth=max(0,min(int(skill_swap_depth),3))
    if depth < 1:
        return
    base=list(seed['skills'])
    names=[]
    for skill in skill_pool:
        name=skill.get('name') if isinstance(skill,dict) else str(skill)
        if name and name not in names:
            names.append(name)
    # One-slot replacement.
    for slot in range(6):
        for name in names:
            if name==base[slot] or name in base:
                continue
            variant=copy.deepcopy(seed)
            variant['skills'][slot]=name
            yield variant
    if depth < 2 or len(names) < 2:
        return
    # Two-slot replacement. Each skill is unique across the six equipped slots.
    for slot_a,slot_b in itertools.combinations(range(6),2):
        for name_a,name_b in itertools.permutations(names,2):
            if name_a==name_b:
                continue
            kept=[v for i,v in enumerate(base) if i not in (slot_a,slot_b)]
            if name_a in kept or name_b in kept:
                continue
            variant=copy.deepcopy(seed)
            variant['skills'][slot_a]=name_a
            variant['skills'][slot_b]=name_b
            yield variant

    if depth < 3 or len(names) < 6:
        return
    # Full six-slot rebuild uses a DB-grounded beam prefilter before formal evaluation.
    # It relies only on canonical optimizer_priority_score / optimizer_bucket metadata.
    for equipped,prefilter_score in _beam_full_skill_orders(names, beam_width):
        variant=copy.deepcopy(seed)
        variant['skills']=list(equipped)
        variant['skill_build_mode']='CONFIRMED_OWNED_FULL_SIX_SLOT_BEAM_REBUILD'
        variant['skill_prefilter_score']=prefilter_score
        yield variant

def _permute_seed(seed, units):
    officers=seed['officers']; awaken=seed['awaken']; skills=seed['skills']; stats=seed.get('stats') or [{},{},{}]
    pairs=[skills[0:2],skills[2:4],skills[4:6]]
    for perm in itertools.permutations(range(3)):
        for unit in units:
            yield {'officers':[officers[i] for i in perm],'awaken':[awaken[i] for i in perm],'skills':sum((pairs[i] for i in perm),[]),'stats':[stats[i] for i in perm],'unit':unit,'fixed_placement':True,'ignore_formal_overlap':True}

def formalize_request(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else request_json
    candidate=_make(req['candidate'])
    targets=req.get('targets') or []
    search_mode=str(req.get('search_mode') or 'strongest')
    trials=max(1,min(int(req.get('trials',30)),100));blocks=max(1,min(int(req.get('blocks',3)),3));seed0=int(req.get('seed',1326247000));started=time.time()
    results={}
    for ti,t in enumerate(targets):
        tar=_make(t['spec'])
        sim=simulate_many_balanced(_ctx(),copy.deepcopy(candidate),copy.deepcopy(tar),trials=trials,seed=seed0+ti*1000,blocks=blocks)
        results[t['id']]={'win_rate':sim.get('left_balanced_win_rate'),'hp_diff':sim.get('avg_hp_diff_balanced'),'trials_per_direction':trials,'blocks':blocks}
    vals=[x['win_rate'] for x in results.values() if isinstance(x.get('win_rate'),(int,float))]
    return json.dumps({'type':'formal_recheck','version':'adapter-v1','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE','verification_level':f'{trials}x{blocks}_BALANCED','candidate':req['candidate'],'targets':results,'min_win_rate':min(vals) if vals else None,'avg_win_rate':sum(vals)/len(vals) if vals else None,'elapsed_seconds':round(time.time()-started,3)},ensure_ascii=False)

def optimize_request(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else request_json
    units=[u for u in req.get('units',[]) if u in {'騎馬','足軽','弓','鉄砲'}] or ['騎馬']
    seeds=req.get('seeds') or []; owned_pool=req.get('owned_pool') or []
    swap_depth=max(0,min(int(req.get('swap_depth',1)),3)); skill_swap_depth=max(0,min(int(req.get('skill_swap_depth',1)),3)); skill_pool=req.get('skill_pool') or []; beam_width=max(12,min(int(req.get('skill_beam_width',96)),512)); budget=max(50,min(int(req.get('structural_budget',1200)),5000))
    targets=req.get('targets') or []
    search_mode=str(req.get('search_mode') or 'strongest')
    beam_audit_requested=bool(req.get('beam_recall_audit',False))
    trials=max(1,min(int(req.get('trials',2)),10));blocks=max(1,min(int(req.get('blocks',1)),2));seed0=int(req.get('seed',1326237000))
    structural=[];seen=set();stopped=0;budget_cut=False;started=time.time();variant_count=0
    beam_audit=_beam_recall_audit([x.get('name') if isinstance(x,dict) else str(x) for x in skill_pool],beam_width) if beam_audit_requested and skill_swap_depth>=3 else {'performed':False,'reason':'not requested or full rebuild disabled'}
    for seed in seeds:
        for officer_variant in _base_variants(copy.deepcopy(seed),owned_pool,swap_depth):
            for variant in _skill_variants(officer_variant,skill_pool,skill_swap_depth,beam_width):
                variant_count+=1
                for spec in _permute_seed(variant,units):
                    key=(tuple(spec['officers']),tuple(spec['skills']),spec['unit'])
                    if key in seen:continue
                    if len(seen)>=budget:
                        budget_cut=True;break
                    seen.add(key)
                    try:r=_make(spec)
                    except BaseException:stopped+=1;continue
                    if not str(r.get('formal_status','')).startswith('FORMAL_EVAL_READY'):
                        stopped+=1;continue
                    structural.append({'spec':spec,'score':float(r.get('score') or 0),'formal_status':r.get('formal_status'),'assignment':r.get('attach_assignment') or []})
                if budget_cut:break
            if budget_cut:break
        if budget_cut:break
    structural.sort(key=lambda x:x['score'],reverse=True)
    shortlist=structural[:max(1,min(int(req.get('shortlist',4)),8))]
    ranked=[]
    for ci,item in enumerate(shortlist):
        rates={};diffs={};cand=_make(item['spec'])
        for ti,t in enumerate(targets):
            tar=_make(t['spec']);sim=simulate_many_balanced(_ctx(),copy.deepcopy(cand),copy.deepcopy(tar),trials=trials,seed=seed0+ci*1000+ti*100,blocks=blocks)
            rates[t['id']]=sim.get('left_balanced_win_rate');diffs[t['id']]=sim.get('avg_hp_diff_balanced')
        vals=[v for v in rates.values() if isinstance(v,(int,float))]
        ranked.append({'candidate':item['spec'],'structural_score':item['score'],'formal_status':item['formal_status'],'assignment':item['assignment'],'win_rates':rates,'hp_diffs':diffs,'min_win_rate':min(vals) if vals else None,'avg_win_rate':sum(vals)/len(vals) if vals else None})
    ranked.sort(key=lambda x:((x['min_win_rate'] if x['min_win_rate'] is not None else -1),(x['avg_win_rate'] if x['avg_win_rate'] is not None else -1),x['structural_score']),reverse=True)
    return json.dumps({'type':'branch_optimizer','version':'adapter-v1','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE','claim_status':'PURPOSE_AWARE_BUDGETED_SEARCH_NO_GLOBAL_OPTIMUM_CLAIM','search_scope':{'search_mode':search_mode,'seed_count':len(seeds),'owned_pool_count':len(owned_pool),'swap_depth':swap_depth,'skill_swap_depth':skill_swap_depth,'confirmed_skill_pool_count':len(skill_pool),'skill_beam_width':beam_width,'skill_prefilter_basis':'adaptive exact 6-8 skills; beam 9+ using canonical optimizer_priority_score + optimizer_bucket','beam_recall_audit':beam_audit,'variant_count':variant_count,'generated':len(seen),'formal_ready':len(structural),'stopped':stopped,'budget':budget,'budget_cut':budget_cut,'units':units,'shortlist_simulated':len(shortlist),'trials_per_direction':trials,'blocks':blocks},'targets':[t['id'] for t in targets],'ranked':ranked,'elapsed_seconds':round(time.time()-started,3)},ensure_ascii=False)

# Stable public boundary. These aliases live outside the canonical b223 source.
calculate = evaluate_request
search = optimize_request
formal = formalize_request

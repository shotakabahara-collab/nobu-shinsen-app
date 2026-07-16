#!/usr/bin/env python3
from __future__ import annotations
import copy, gc, itertools, json, math, time
from custom_evaluate import load_context, resolve_officers_by_awaken_values, resolve_skills, build_best, public_best
from battle_simulator import simulate_many_balanced
from operational_runtime_overlay import audit_best, install_runtime_overlay

_CTX=None
def _ctx():
    global _CTX
    if _CTX is None:_CTX=load_context()
    install_runtime_overlay(_CTX)
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
    runtime_audit=audit_best(result,ctx)
    result['runtime_overlay_audit']=runtime_audit
    if not runtime_audit['formalReady'] and not str(result.get('formal_status') or '').startswith('STOP'):
        result['formal_status']='OPERATIONAL_ONLY_RUNTIME_EVIDENCE_INCOMPLETE'
    return result

def _balanced_battle_evidence(sim, requested_trials, requested_blocks):
    """Reject the protected runtime's 0/0 sentinel when no battle completed.

    The canonical simulator intentionally isolates failed trials and uses zero for
    empty aggregates.  Zero wins or a zero HP difference can also be a legitimate
    result, so validity must come from completed trial evidence, never the values.
    """
    blocks=max(1,int(requested_blocks));per=max(1,int(requested_trials)//blocks)
    expected_per_direction=per*blocks;expected_total=expected_per_direction*2
    forward=sim.get('forward') if isinstance(sim,dict) else None
    reverse=sim.get('reverse') if isinstance(sim,dict) else None
    reasons=[];completed=0;wins=0;losses=0;draws=0;failure_count=0
    if not isinstance(forward,list) or not isinstance(reverse,list):
        reasons.append('BALANCED_BLOCKS_MISSING')
        forward=[];reverse=[]
    if len(forward)!=blocks or len(reverse)!=blocks:
        reasons.append('BALANCED_BLOCK_COUNT_MISMATCH')
    for direction,rows in (('forward',forward),('reverse',reverse)):
        for row in rows:
            if not isinstance(row,dict):
                reasons.append(f'{direction.upper()}_BLOCK_INVALID');continue
            requested=int(row.get('trials') or per);done=int(row.get('completed_trials') or 0)
            completed+=done
            failures=row.get('runtime_failures') or []
            failure_count+=len(failures) if isinstance(failures,list) else 1
            if done!=requested:reasons.append(f'{direction.upper()}_INCOMPLETE_TRIALS')
            if failures:reasons.append(f'{direction.upper()}_RUNTIME_FAILURES')
            left_wins=int(row.get('left_wins') or 0);right_wins=int(row.get('right_wins') or 0);row_draws=int(row.get('draws') or 0)
            if left_wins+right_wins+row_draws!=done:reasons.append(f'{direction.upper()}_OUTCOME_COUNT_MISMATCH')
            if direction=='forward':wins+=left_wins;losses+=right_wins
            else:wins+=right_wins;losses+=left_wins
            draws+=row_draws
    if completed!=expected_total:reasons.append('BALANCED_COMPLETED_TOTAL_MISMATCH')
    win_rate=sim.get('left_balanced_win_rate') if isinstance(sim,dict) else None
    hp_diff=sim.get('avg_hp_diff_balanced') if isinstance(sim,dict) else None
    if not isinstance(win_rate,(int,float)) or isinstance(win_rate,bool) or not math.isfinite(float(win_rate)):
        reasons.append('WIN_RATE_MISSING_OR_NONFINITE')
    if not isinstance(hp_diff,(int,float)) or isinstance(hp_diff,bool) or not math.isfinite(float(hp_diff)):
        reasons.append('HP_DIFF_MISSING_OR_NONFINITE')
    unique_reasons=list(dict.fromkeys(reasons))
    return {
        'status':'COMPLETE' if not unique_reasons else 'INVALID',
        'measurement_stage':'SCREENING',
        'requested_battles':expected_total,
        'completed_battles':completed,
        'wins':wins,'losses':losses,'draws':draws,
        'runtime_failure_count':failure_count,
        'reasons':unique_reasons,
    }

def _require_balanced_battle_evidence(sim, trials, blocks, label):
    evidence=_balanced_battle_evidence(sim,trials,blocks)
    if evidence['status']!='COMPLETE':
        raise RuntimeError(f'{label}: BALANCED_BATTLE_EVIDENCE_STOP '+json.dumps(evidence,ensure_ascii=False))
    return evidence

TARGETS={
'YAMAGATA':{'officers':['山県昌景','飯富虎昌','真田昌幸'],'awaken':[5,5,2],'unit':'騎馬','skills':['矢石飛交','血戦奮闘','赤備え隊','理非曲直','瞬息万変','帰還の凱歌']},
'KURODA':{'officers':['黒田官兵衛','豊臣秀吉','ねね'],'awaken':[3,1,3],'unit':'弓','skills':['七十二の計','紅蓮の炎','三河弓兵隊','嚢沙之計','罵詈雑言','沈魚落雁']},
'YAMAMOTO':{'officers':['山本勘助','柴田勝家','柿崎景家'],'awaken':[2,1,2],'unit':'騎馬','skills':['一行三昧','回天転運','会盟の陣','以戦養戦','乗勝追撃','縦横馳突']}}

# These are legality anchors already accepted by the protected formal evaluator.
# They are used only as fillers/starting points; catalog coverage skills replace
# them one by one and the protected evaluator remains the final admission gate.
GLOBAL_LEGAL_SKILL_TEMPLATES={
    '足軽':['七十二の計','紅蓮の炎','僧兵','嚢沙之計','沈魚落雁','大智不智'],
    '騎馬':['一行三昧','回天転運','会盟の陣','以戦養戦','乗勝追撃','縦横馳突'],
    '鉄砲':['七十二の計','紅蓮の炎','鉄砲僧兵','嚢沙之計','沈魚落雁','大智不智'],
    '弓':['七十二の計','紅蓮の炎','三河弓兵隊','嚢沙之計','沈魚落雁','大智不智'],
}

def evaluate_request(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else request_json
    candidate=_make(req['candidate']); target=_make(req.get('target_spec') or TARGETS[req['target']])
    trials=max(1,min(int(req.get('trials',10)),100));blocks=max(1,min(int(req.get('blocks',1)),3));seed=int(req.get('seed',1326230000));started=time.time()
    sim=simulate_many_balanced(_ctx(),copy.deepcopy(candidate),copy.deepcopy(target),trials=trials,seed=seed,blocks=blocks)
    evidence=_require_balanced_battle_evidence(sim,trials,blocks,'calculate')
    return json.dumps({'type':'simulation','version':'adapter-v1','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE','target':req.get('target','CUSTOM'),'trials_per_direction':trials,'blocks':blocks,'win_rate':sim.get('left_balanced_win_rate'),'hp_diff':sim.get('avg_hp_diff_balanced'),'battle_evidence':evidence,'elapsed_seconds':round(time.time()-started,3),'candidate_assignment':candidate.get('attach_assignment'),'formal_status':candidate.get('formal_status'),'runtime_overlay_audit':candidate.get('runtime_overlay_audit'),'sim':sim if req.get('include_detail') else None},ensure_ascii=False)

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

def _as_bool(value, default=False):
    if value is None:return default
    if isinstance(value,bool):return value
    return str(value).strip().lower() in {'1','true','yes','on','有','あり','可'}

def _unit_targets(value):
    text=str(value or '').strip()
    if text in {'全兵種','すべて','ALL','all'}:return ['足軽','騎馬','鉄砲','弓']
    for delimiter in ('／','/','、',','):
        text=text.replace(delimiter,'|')
    return [part.strip() for part in text.split('|') if part.strip() in {'足軽','騎馬','鉄砲','弓'}]

def _skill_meta_from_row(row):
    def num(v,default=0.0):
        try:return float(v)
        except:return default
    return {
        'id':str(row.get('canonical_skill_id') or row.get('skill_id') or ''),
        'name':str(row.get('skill_name') or ''),
        'bucket':row.get('optimizer_bucket') or 'unclassified',
        'priority':num(row.get('optimizer_priority_score'),num(row.get('standard_ev'),0.0)),
        'allowed':_as_bool(row.get('candidate_generation_allowed'),True),
        'formal':_as_bool(row.get('formal_score_allowed'),True),
        'quarantine':bool(row.get('error_quarantine_reason')),
        'quarantine_reason':str(row.get('error_quarantine_reason') or ''),
        'attachable':_as_bool(row.get('is_attachable'),False),
        'slot_type':str(row.get('attach_slot_type') or 'normal'),
        'allowed_units':_unit_targets(row.get('allowed_unit_types')),
    }

def _skill_meta(name):
    row=next((r for r in _ctx().get('skills',[]) if r.get('skill_name')==name),None) or {'skill_name':name}
    return _skill_meta_from_row(row)

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

def _number(value,default=0.0):
    try:return float(value)
    except:return default

def _canonical_officer_profiles(req):
    ctx=_ctx();overrides={}
    raw_overrides=req.get('known_awaken_overrides') or req.get('owned_pool') or []
    for item in raw_overrides:
        if not isinstance(item,dict):continue
        name=str(item.get('name') or '').strip()
        if not name:continue
        overrides[name]=max(0,min(int(item.get('awaken',0)),5))
    rows_by_key={}
    for row in ctx.get('officers',[]):
        name=str(row.get('武将名') or '').strip()
        if not name:continue
        rows_by_key[(name,int(_number(row.get('凸数'),0)))]=row
    skill_rows={str(row.get('skill_name') or ''):row for row in ctx.get('skills',[])}
    profiles=[]
    for name in sorted({key[0] for key in rows_by_key}):
        awaken=overrides.get(name,0)
        row=rows_by_key.get((name,awaken)) or rows_by_key.get((name,0))
        if not row:continue
        inherent=str(row.get('固有戦法名') or '').strip()
        inherent_meta=_skill_meta_from_row(skill_rows.get(inherent) or {'skill_name':inherent})
        force=_number(row.get('武勇_ステ振り後'),_number(row.get('武勇_基礎')))
        intel=_number(row.get('知略_ステ振り後'),_number(row.get('知略_基礎')))
        lead=_number(row.get('統率_ステ振り後'),_number(row.get('統率_基礎')))
        speed=_number(row.get('行動順用速度'),_number(row.get('速度_ステ振り後'),_number(row.get('速度_基礎'))))
        inherent_score=inherent_meta['priority'] if inherent_meta['formal'] and not inherent_meta['quarantine'] else 0.0
        profiles.append({
            'name':name,'awaken':awaken,'stats':{},'inherent':inherent,
            'force':force,'intel':intel,'lead':lead,'speed':speed,
            'scores':{
                'balanced':force+intel+lead+speed*0.65+inherent_score*2.0,
                'force':force*1.7+lead*0.7+speed*0.5+inherent_score*1.5,
                'intel':intel*1.7+lead*0.7+speed*0.5+inherent_score*1.5,
                'lead':lead*1.6+max(force,intel)*0.7+speed*0.45+inherent_score*1.5,
                'speed':speed*1.8+max(force,intel)*0.8+lead*0.45+inherent_score*1.5,
            },
        })
    return profiles,len(overrides)

def _family_from_profiles(rows,coverage_officer=None,source='catalog_prefilter'):
    return {
        'officers':[row['name'] for row in rows],
        'awaken':[int(row.get('awaken',0)) for row in rows],
        'stats':[copy.deepcopy(row.get('stats') or {}) for row in rows],
        'coverage_officer':coverage_officer,
        'source':source,
    }

def _family_identity(family):
    packages=[]
    for index,name in enumerate(family['officers']):
        packages.append((name,int(family['awaken'][index]),_stable_stats(family['stats'][index])))
    return tuple(sorted(packages,key=lambda row:json.dumps(row,ensure_ascii=False)))

def _catalog_officer_families(req,profiles):
    by_name={row['name']:row for row in profiles}
    ranking_names=('balanced','force','intel','lead','speed')
    rankings={key:sorted(profiles,key=lambda row:(row['scores'][key],row['name']),reverse=True) for key in ranking_names}
    coverage=[]
    for index,anchor in enumerate(profiles):
        partners=[]
        for offset in range(1,len(ranking_names)+1):
            ranking=rankings[ranking_names[(index+offset)%len(ranking_names)]]
            candidate=next((row for row in ranking if row['name']!=anchor['name'] and row['name'] not in {p['name'] for p in partners}),None)
            if candidate:partners.append(candidate)
            if len(partners)==2:break
        if len(partners)==2:coverage.append(_family_from_profiles([anchor,*partners],coverage_officer=anchor['name']))

    quality=[];seen=set()
    for seed in (req.get('seeds') or [])[:8]:
        names=list(seed.get('officers') or [])
        if len(names)!=3 or len(set(names))!=3 or any(name not in by_name for name in names):continue
        family={
            'officers':names,
            'awaken':[max(0,min(int(value),5)) for value in (seed.get('awaken') or [0,0,0])],
            'stats':copy.deepcopy(seed.get('stats') or [{},{},{}]),
            'coverage_officer':None,'source':'registered_seed',
        }
        while len(family['stats'])<3:family['stats'].append({})
        key=_family_identity(family)
        if key not in seen:seen.add(key);quality.append(family)

    quality_pool=[]
    for ranking in rankings.values():
        for row in ranking[:8]:
            if row['name'] not in {item['name'] for item in quality_pool}:quality_pool.append(row)
    scored=[]
    for trio in itertools.combinations(quality_pool,3):
        archetype=max(sum(row['scores'][key] for row in trio) for key in ranking_names)
        diversity=(max(row['force'] for row in trio)-min(row['force'] for row in trio))+(max(row['intel'] for row in trio)-min(row['intel'] for row in trio))
        scored.append((archetype+diversity*0.08,tuple(row['name'] for row in trio),trio))
    scored.sort(reverse=True)
    for score,names,trio in scored:
        family=_family_from_profiles(list(trio),source='catalog_quality_prefilter')
        key=_family_identity(family)
        if key in seen:continue
        seen.add(key);quality.append(family)
        if len(quality)>=16:break
    return coverage,quality

def _skill_legal_for_unit(meta,unit):
    return not meta['allowed_units'] or unit in meta['allowed_units']

def _build_catalog_skill_order(anchor,metas,unit,anchor_slot):
    by_name={row['name']:row for row in metas}
    baseline=[by_name[name] for name in GLOBAL_LEGAL_SKILL_TEMPLATES.get(unit,[]) if name in by_name]
    selected=list(baseline)
    if anchor['name'] not in {row['name'] for row in selected}:
        same_slot=[index for index,row in enumerate(selected) if row['slot_type']==anchor['slot_type'] and row['slot_type'] in {'unit_type','formation'}]
        removable=same_slot or [index for index,row in enumerate(selected) if row['slot_type']=='normal'] or list(range(len(selected)))
        if removable:selected.pop(removable[-1])
        selected.append(anchor)
    slot_counts={}
    for row in selected:slot_counts[row['slot_type']]=slot_counts.get(row['slot_type'],0)+1
    while len(selected)<6:
        used={row['name'] for row in selected};buckets={row['bucket'] for row in selected}
        candidates=[]
        for row in metas:
            if row['name'] in used or not _skill_legal_for_unit(row,unit):continue
            if row['slot_type'] in {'unit_type','formation'} and slot_counts.get(row['slot_type'],0)>=1:continue
            novelty=5.0 if row['bucket'] not in buckets else 0.0
            candidates.append((row['priority']+novelty,row['name'],row))
        if not candidates:return None
        candidates.sort(reverse=True);chosen=candidates[0][2]
        selected.append(chosen);slot_counts[chosen['slot_type']]=slot_counts.get(chosen['slot_type'],0)+1
    selected=selected[:6]
    others=[row for row in selected if row['name']!=anchor['name']]
    ordered=list(others);ordered.insert(max(0,min(int(anchor_slot),5)),anchor)
    names=[row['name'] for row in ordered]
    legal_units=[candidate for candidate in ('足軽','騎馬','鉄砲','弓') if all(_skill_legal_for_unit(row,candidate) for row in ordered)]
    return {'skills':names,'units':legal_units,'preferred_unit':unit,'anchor':anchor['name'],'score':_score_skill_order(names)}

def _catalog_skill_orders(units):
    ctx=_ctx();all_rows=list(ctx.get('skills',[]));attach_rows=list((ctx.get('attachable_skills') or {}).values())
    all_metas=[_skill_meta_from_row(row) for row in all_rows if row.get('skill_name')]
    attach_metas=[];excluded=[]
    for row in attach_rows:
        meta=_skill_meta_from_row(row)
        reasons=[]
        if not meta['allowed']:reasons.append('candidate_generation_disabled')
        if not meta['formal']:reasons.append('formal_score_disabled')
        if meta['quarantine']:reasons.append(meta['quarantine_reason'] or 'error_quarantine')
        if reasons:excluded.append({'name':meta['name'],'reasons':reasons});continue
        attach_metas.append(meta)
    attach_metas.sort(key=lambda row:(row['priority'],row['name']),reverse=True)
    requested=[unit for unit in ('足軽','騎馬','鉄砲','弓') if unit in units]
    coverage=[];coverage_failures=[]
    for index,anchor in enumerate(sorted(attach_metas,key=lambda row:row['name'])):
        compatible=[unit for unit in requested if _skill_legal_for_unit(anchor,unit)]
        if not compatible:
            coverage_failures.append({'name':anchor['name'],'reason':'no requested compatible unit'});continue
        unit=compatible[index%len(compatible)]
        order=_build_catalog_skill_order(anchor,attach_metas,unit,index%6)
        if order:coverage.append(order)
        else:coverage_failures.append({'name':anchor['name'],'reason':'six-slot legal filler unavailable'})

    quality=[];seen={(tuple(row['skills']),tuple(row['units'])) for row in coverage}
    by_name={row['name']:row for row in attach_metas}
    for unit in requested:
        baseline=[by_name[name] for name in GLOBAL_LEGAL_SKILL_TEMPLATES.get(unit,[]) if name in by_name]
        if len(baseline)!=6:continue
        names=[row['name'] for row in baseline]
        order={'skills':names,'units':[unit],'preferred_unit':unit,'anchor':None,'score':_score_skill_order(names)}
        key=(tuple(order['skills']),tuple(order['units']))
        if key not in seen:seen.add(key);quality.append(order)
    for unit in requested:
        compatible=[row for row in attach_metas if _skill_legal_for_unit(row,unit)]
        for index,anchor in enumerate(compatible[:8]):
            for slot in (index%6,(index+3)%6):
                order=_build_catalog_skill_order(anchor,attach_metas,unit,slot)
                if not order:continue
                key=(tuple(order['skills']),tuple(order['units']))
                if key in seen:continue
                seen.add(key);quality.append(order)
                if len(quality)>=32:break
            if len(quality)>=32:break
        if len(quality)>=32:break
    quality.sort(key=lambda row:(row['score'],tuple(row['skills'])),reverse=True)
    return all_metas,attach_metas,coverage,quality,excluded,coverage_failures

def _canonical_global_variants(req,units):
    profiles,known_override_count=_canonical_officer_profiles(req)
    profiles_by_name={row['name']:row for row in profiles}
    officer_coverage,officer_quality=_catalog_officer_families(req,profiles)
    all_skill_metas,formal_skill_metas,skill_coverage,skill_quality,skill_excluded,skill_coverage_failures=_catalog_skill_orders(units)
    if not profiles or not officer_coverage:raise ValueError('canonical officer catalog produced no searchable families')
    if not skill_coverage:raise ValueError('canonical skill catalog produced no searchable six-slot builds')
    requested_units=[unit for unit in ('足軽','騎馬','鉄砲','弓') if unit in units]
    legal_anchor_officers={
        '足軽':['鈴木佐大夫','本願寺顕如','妻木煕子'],
        '騎馬':['山本勘助','柴田勝家','柿崎景家'],
        '鉄砲':['鈴木佐大夫','本願寺顕如','妻木煕子'],
        '弓':['黒田官兵衛','豊臣秀吉','ねね'],
    }
    variants=[]
    # Officer coverage and skill coverage are separate lanes. Combining both
    # anchors in one build caused unrelated legality conflicts and hid whether an
    # officer or a skill was the reason for rejection.
    for index,family in enumerate(officer_coverage):
        unit=requested_units[index%len(requested_units)]
        anchor=profiles_by_name[family['coverage_officer']]
        support_names=[]
        for name in legal_anchor_officers[unit]+sum((legal_anchor_officers[value] for value in requested_units),[]):
            if name==anchor['name'] or name in support_names or name not in profiles_by_name:continue
            support_names.append(name)
            if len(support_names)==2:break
        rows=[anchor,*[profiles_by_name[name] for name in support_names]]
        if len(rows)!=3:continue
        variants.append({
            'officers':[row['name'] for row in rows],'awaken':[row['awaken'] for row in rows],'stats':[{}, {}, {}],
            'skills':list(GLOBAL_LEGAL_SKILL_TEMPLATES[unit]),'_search_units':[unit],
            '_coverage_officer':family['coverage_officer'],'_coverage_skill':None,'_prefilter_source':'officer_catalog_coverage',
        })
    for order in skill_coverage:
        unit=order.get('preferred_unit') if order.get('preferred_unit') in requested_units else next((value for value in order['units'] if value in requested_units),None)
        if not unit:continue
        names=legal_anchor_officers[unit]
        if any(name not in profiles_by_name for name in names):continue
        rows=[profiles_by_name[name] for name in names]
        variants.append({
            'officers':list(names),'awaken':[row['awaken'] for row in rows],'stats':[{}, {}, {}],
            'skills':list(order['skills']),'_search_units':[unit],
            '_coverage_officer':None,'_coverage_skill':order['anchor'],'_prefilter_source':'skill_catalog_coverage',
        })
    for unit,names in legal_anchor_officers.items():
        if unit not in units or any(name not in profiles_by_name for name in names):continue
        rows=[profiles_by_name[name] for name in names]
        variants.append({
            'officers':names,'awaken':[row['awaken'] for row in rows],'stats':[{}, {}, {}],
            'skills':list(GLOBAL_LEGAL_SKILL_TEMPLATES[unit]),'_search_units':[unit],
            '_coverage_officer':None,'_coverage_skill':None,'_prefilter_source':'formal_legality_anchor',
        })
    quality_orders=skill_quality or sorted(skill_coverage,key=lambda row:row['score'],reverse=True)[:16]
    for family in officer_quality:
        for unit in requested_units:
            variants.append({
                'officers':list(family['officers']),'awaken':list(family['awaken']),'stats':copy.deepcopy(family['stats']),
                'skills':list(GLOBAL_LEGAL_SKILL_TEMPLATES[unit]),'_search_units':[unit],
                '_coverage_officer':None,'_coverage_skill':None,'_prefilter_source':family['source']+'_all_units',
            })
    for order in quality_orders[:16]:
        unit=order.get('preferred_unit') if order.get('preferred_unit') in requested_units else next((value for value in order['units'] if value in requested_units),None)
        if not unit:continue
        names=legal_anchor_officers[unit];rows=[profiles_by_name[name] for name in names]
        variants.append({
            'officers':list(names),'awaken':[row['awaken'] for row in rows],'stats':[{}, {}, {}],
            'skills':list(order['skills']),'_search_units':[unit],
            '_coverage_officer':None,'_coverage_skill':None,'_prefilter_source':'skill_quality_prefilter',
        })
    covered_officers={variant['_coverage_officer'] for variant in variants if variant.get('_coverage_officer')}
    covered_skills={variant['_coverage_skill'] for variant in variants if variant.get('_coverage_skill')}
    attachable_count=len(_ctx().get('attachable_skills') or {})
    formal_skill_names={row['name'] for row in formal_skill_metas}
    catalog_pair_count=0;formal_pair_count=0;pair_prefilter_checksum=0.0
    for officer in profiles:
        for skill in all_skill_metas:
            catalog_pair_count+=1
            # A lightweight, deterministic DB-only score proves that every pair
            # entered the prefilter without retaining a 34k-row matrix on iPhone.
            pair_prefilter_checksum+=officer['scores']['balanced']+skill['priority']*2.0
            if skill['name'] in formal_skill_names:formal_pair_count+=1
    scope={
        'catalog_scope':'canonical_all','staged_search':True,
        'catalog_inspection_complete':len(profiles)>0 and len(all_skill_metas)>0,
        'canonical_officer_count':len(profiles),'canonical_skill_count':len(all_skill_metas),
        'catalog_attachable_skill_count':attachable_count,
        'formal_attachable_skill_count':len(formal_skill_metas),
        'formal_attachable_excluded_count':attachable_count-len(formal_skill_metas),
        'non_attachable_skill_count':len(all_skill_metas)-attachable_count,
        'canonical_officer_skill_pair_count':catalog_pair_count,
        'formal_officer_skill_pair_count':formal_pair_count,
        'pair_prefilter_checksum':round(pair_prefilter_checksum,3),
        'officer_prefilter_coverage_count':len(covered_officers),
        'skill_prefilter_coverage_count':len(covered_skills),
        'prefilter_coverage_complete':len(covered_officers)==len(profiles) and len(covered_skills)==len(formal_skill_metas) and not skill_coverage_failures,
        'known_awaken_override_count':known_override_count,
        'unknown_officer_awaken_policy':'ZERO_AWAKEN_UNLESS_OWNERSHIP_OVERRIDE_EXISTS',
        'formal_attachable_exclusions':skill_excluded,
        'skill_coverage_failures':skill_coverage_failures,
        'prefilter_policy':'ALL_CANONICAL_ROWS_INSPECTED_THEN_COVERAGE_AND_QUALITY_BUILDS_THEN_FORMAL_RUNTIME_SHORTLIST',
        'combination_policy':'STAGED_NOT_CARTESIAN_EXHAUSTIVE',
    }
    return variants,scope

def _owned_variant_stream(seeds,owned_pool,swap_depth,skill_pool,skill_swap_depth,beam_width):
    for seed in seeds:
        for officer_variant in _base_variants(copy.deepcopy(seed),owned_pool,swap_depth):
            for variant in _skill_variants(officer_variant,skill_pool,skill_swap_depth,beam_width):
                yield variant

def _permute_seed(seed, units):
    officers=seed['officers']; awaken=seed['awaken']; skills=seed['skills']; stats=list(seed.get('stats') or [])
    while len(stats)<3:stats.append({})
    pairs=[skills[0:2],skills[2:4],skills[4:6]]
    for perm in itertools.permutations(range(3)):
        for unit in units:
            spec={'officers':[officers[i] for i in perm],'awaken':[awaken[i] for i in perm],'skills':sum((pairs[i] for i in perm),[]),'stats':[stats[i] for i in perm],'unit':unit,'fixed_placement':True,'ignore_formal_overlap':True}
            for key in ('_coverage_officer','_coverage_skill','_prefilter_source'):
                if key in seed:spec[key]=seed[key]
            yield spec

def _stable_stats(stats):
    return json.dumps(stats or {},ensure_ascii=False,sort_keys=True,separators=(',',':'))

def _spec_key(spec):
    return (
        tuple(spec['officers']),tuple(spec['awaken']),tuple(spec['skills']),
        tuple(_stable_stats(row) for row in spec.get('stats') or []),spec['unit'],
    )

def _role_family_key(spec):
    # A family keeps each officer's awaken/stat/skill package intact while ignoring
    # whether that package is commander, deputy 1, or deputy 2.
    packages=[]
    stats=list(spec.get('stats') or [])
    while len(stats)<3:stats.append({})
    for index,name in enumerate(spec['officers']):
        packages.append((name,int(spec['awaken'][index]),_stable_stats(stats[index]),tuple(spec['skills'][index*2:index*2+2])))
    return (spec['unit'],tuple(sorted(packages,key=lambda row:json.dumps(row,ensure_ascii=False))))

def _rank_key(row):
    hp_values=[v for v in row.get('hp_diffs',{}).values() if isinstance(v,(int,float))]
    return (
        row['min_win_rate'] if row['min_win_rate'] is not None else -1,
        row['avg_win_rate'] if row['avg_win_rate'] is not None else -1,
        min(hp_values) if hp_values else float('-inf'),
        sum(hp_values)/len(hp_values) if hp_values else float('-inf'),
        row['structural_score'],
    )

def formalize_request(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else request_json
    candidate=_make(req['candidate'])
    if not str(candidate.get('formal_status') or '').startswith('FORMAL_EVAL_READY'):
        raise ValueError('FORMAL_RUNTIME_EVIDENCE_STOP '+json.dumps(candidate.get('runtime_overlay_audit') or {},ensure_ascii=False))
    targets=req.get('targets') or []
    search_mode=str(req.get('search_mode') or 'strongest')
    trials=max(1,min(int(req.get('trials',30)),100));blocks=max(1,min(int(req.get('blocks',3)),3));seed0=int(req.get('seed',1326247000));started=time.time()
    results={}
    for ti,t in enumerate(targets):
        tar=_make(t['spec'])
        sim=simulate_many_balanced(_ctx(),copy.deepcopy(candidate),copy.deepcopy(tar),trials=trials,seed=seed0+ti*1000,blocks=blocks)
        evidence=_require_balanced_battle_evidence(sim,trials,blocks,f"formal target={t['id']}")
        results[t['id']]={'win_rate':sim.get('left_balanced_win_rate'),'hp_diff':sim.get('avg_hp_diff_balanced'),'trials_per_direction':trials,'blocks':blocks,'battle_evidence':evidence}
    vals=[x['win_rate'] for x in results.values() if isinstance(x.get('win_rate'),(int,float))]
    return json.dumps({'type':'formal_recheck','version':'adapter-v1','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE','verification_level':f'{trials}x{blocks}_BALANCED','candidate':req['candidate'],'targets':results,'min_win_rate':min(vals) if vals else None,'avg_win_rate':sum(vals)/len(vals) if vals else None,'elapsed_seconds':round(time.time()-started,3),'runtime_overlay_audit':candidate.get('runtime_overlay_audit')},ensure_ascii=False)

def optimize_request(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else request_json
    units=[u for u in req.get('units',[]) if u in {'騎馬','足軽','弓','鉄砲'}] or ['騎馬']
    seeds=req.get('seeds') or []; owned_pool=req.get('owned_pool') or []
    catalog_scope=str(req.get('catalog_scope') or 'owned_only')
    global_catalog=catalog_scope=='canonical_all'
    swap_depth=max(0,min(int(req.get('swap_depth',1)),3)); skill_swap_depth=max(0,min(int(req.get('skill_swap_depth',1)),3)); skill_pool=req.get('skill_pool') or []; beam_width=max(12,min(int(req.get('skill_beam_width',96)),512)); budget=max(50,min(int(req.get('structural_budget',4800 if global_catalog else 1200)),6000 if global_catalog else 5000))
    targets=req.get('targets') or []
    search_mode=str(req.get('search_mode') or 'strongest')
    beam_audit_requested=bool(req.get('beam_recall_audit',False))
    trials=max(1,min(int(req.get('trials',2)),10));blocks=max(1,min(int(req.get('blocks',1)),2));seed0=int(req.get('seed',1326237000))
    structural=[];seen=set();stopped=0;budget_cut=False;started=time.time();variant_count=0;family_expected={};catalog_details={};admitted_officers=set();admitted_skills=set();stop_reasons={};screening_invalid=0;screening_invalid_reasons={}
    beam_audit=_beam_recall_audit([x.get('name') if isinstance(x,dict) else str(x) for x in skill_pool],beam_width) if not global_catalog and beam_audit_requested and skill_swap_depth>=3 else {'performed':False,'reason':'not requested, canonical staged mode, or full rebuild disabled'}
    if global_catalog:
        variants,catalog_details=_canonical_global_variants(req,units)
        catalog_officer_names={name for variant in variants for name in variant.get('officers',[])}
        catalog_skill_names={name for variant in variants for name in variant.get('skills',[])}
    else:
        variants=_owned_variant_stream(seeds,owned_pool,swap_depth,skill_pool,skill_swap_depth,beam_width)
        catalog_officer_names=set();catalog_skill_names=set()
    for variant in variants:
        variant_count+=1
        grouped={};variant_units=variant.get('_search_units') or units
        permuted=_permute_seed(variant,variant_units)
        if global_catalog:permuted=itertools.islice(permuted,1)
        for spec in permuted:grouped.setdefault(_role_family_key(spec),[]).append(spec)
        for family_key,specs in grouped.items():
            fresh=[spec for spec in specs if _spec_key(spec) not in seen]
            if not fresh:continue
            # Owned-only families are admitted atomically here. Canonical mode
            # intentionally admits one prefilter placement and expands shortlisted
            # families atomically below.
            if len(seen)+len(fresh)>budget:
                budget_cut=True;break
            family_expected[family_key]=len(specs)
            for spec in fresh:
                seen.add(_spec_key(spec))
                try:r=_make(spec)
                except BaseException as error:
                    stopped+=1;reason='EXCEPTION_'+type(error).__name__;stop_reasons[reason]=stop_reasons.get(reason,0)+1;continue
                if not str(r.get('formal_status','')).startswith('FORMAL_EVAL_READY'):
                    stopped+=1;reason=str(r.get('formal_status') or 'UNKNOWN_FORMAL_STOP');stop_reasons[reason]=stop_reasons.get(reason,0)+1;continue
                if global_catalog:
                    admitted_officers.update(name for name in spec['officers'] if name in catalog_officer_names)
                    admitted_skills.update(name for name in spec['skills'] if name in catalog_skill_names)
                structural.append({'spec':spec,'score':float(r.get('score') or 0),'formal_status':r.get('formal_status'),'assignment':r.get('attach_assignment') or [],'_role_family_key':family_key})
                if len(seen)%100==0:gc.collect()
        if budget_cut:break
    families={}
    for item in structural:families.setdefault(item['_role_family_key'],[]).append(item)
    complete_families={key:items for key,items in families.items() if len(items)==family_expected.get(key,6)}
    selectable=families if global_catalog else (complete_families or families)
    legacy_shortlist=max(1,min(int(req.get('shortlist',4)),48))
    family_limit=max(1,min(int(req.get('role_family_shortlist',(legacy_shortlist+5)//6)),8))
    sorted_families=sorted(selectable.items(),key=lambda pair:max(item['score'] for item in pair[1]),reverse=True)
    if global_catalog:
        family_shortlist=[];selected_keys=set()
        # The target-specific runtime stage receives the best structural family for
        # each requested unit before remaining places are filled by overall score.
        for unit in units:
            match=next((pair for pair in sorted_families if pair[0] not in selected_keys and any(item['spec']['unit']==unit for item in pair[1])),None)
            if match:family_shortlist.append(match);selected_keys.add(match[0])
            if len(family_shortlist)>=family_limit:break
        for pair in sorted_families:
            if len(family_shortlist)>=family_limit:break
            if pair[0] in selected_keys:continue
            family_shortlist.append(pair);selected_keys.add(pair[0])
    else:
        family_shortlist=sorted_families[:family_limit]
    if global_catalog:
        expanded_shortlist=[];structural_by_key={_spec_key(item['spec']):item for item in structural}
        for family_key,items in family_shortlist:
            representative=items[0]['spec'];expanded=[]
            role_specs=list(_permute_seed(representative,[representative['unit']]))
            fresh_role_count=sum(1 for spec in role_specs if _spec_key(spec) not in structural_by_key)
            if len(seen)+fresh_role_count>budget:
                budget_cut=True;continue
            for spec in role_specs:
                key=_spec_key(spec);item=structural_by_key.get(key)
                if item is None:
                    seen.add(key)
                    try:r=_make(spec)
                    except BaseException as error:
                        stopped+=1;reason='EXCEPTION_'+type(error).__name__;stop_reasons[reason]=stop_reasons.get(reason,0)+1;continue
                    if not str(r.get('formal_status','')).startswith('FORMAL_EVAL_READY'):
                        stopped+=1;reason=str(r.get('formal_status') or 'UNKNOWN_FORMAL_STOP');stop_reasons[reason]=stop_reasons.get(reason,0)+1;continue
                    item={'spec':spec,'score':float(r.get('score') or 0),'formal_status':r.get('formal_status'),'assignment':r.get('attach_assignment') or [],'_role_family_key':family_key}
                    structural.append(item);structural_by_key[key]=item
                expanded.append(item)
            family_expected[family_key]=6;families[family_key]=expanded
            if expanded:expanded_shortlist.append((family_key,expanded))
        family_shortlist=expanded_shortlist
        complete_families={key:items for key,items in family_shortlist if len(items)==6}
    runtime_targets=[];target_formal_stops=[]
    for target in targets:
        target_id=target['id']
        try:target_runtime=_make(target['spec'])
        except BaseException as error:
            target_formal_stops.append({'target_id':target_id,'reason':'EXCEPTION_'+type(error).__name__,'detail':str(error)[:500]});continue
        target_status=str(target_runtime.get('formal_status') or '')
        if not target_status.startswith('FORMAL_EVAL_READY'):
            target_formal_stops.append({'target_id':target_id,'reason':target_status or 'TARGET_FORMAL_STATUS_MISSING','runtime_overlay_audit':target_runtime.get('runtime_overlay_audit')});continue
        runtime_targets.append((target_id,target_runtime))
    ranked=[];placements_simulated=0
    if target_formal_stops:family_shortlist=[]
    for fi,(family_key,items) in enumerate(family_shortlist):
        role_rows=[]
        # Common seeds within a family make commander/deputy comparisons fairer:
        # only role order changes, not the random battle sequence.
        for item in items:
            rates={};diffs={};cand=_make(item['spec'])
            evidence_by_target={};row_valid=True
            for ti,(target_id,tar) in enumerate(runtime_targets):
                sim=simulate_many_balanced(_ctx(),copy.deepcopy(cand),copy.deepcopy(tar),trials=trials,seed=seed0+fi*1000+ti*100,blocks=blocks)
                evidence=_balanced_battle_evidence(sim,trials,blocks)
                if evidence['status']!='COMPLETE':
                    row_valid=False;screening_invalid+=1
                    for reason in evidence['reasons']:screening_invalid_reasons[reason]=screening_invalid_reasons.get(reason,0)+1
                else:
                    rates[target_id]=sim.get('left_balanced_win_rate');diffs[target_id]=sim.get('avg_hp_diff_balanced');evidence_by_target[target_id]=evidence
                del sim;gc.collect()
            if not row_valid:continue
            vals=[v for v in rates.values() if isinstance(v,(int,float))]
            public_spec={key:value for key,value in item['spec'].items() if not key.startswith('_')}
            role_rows.append({'candidate':public_spec,'structural_score':item['score'],'formal_status':item['formal_status'],'assignment':item['assignment'],'win_rates':rates,'hp_diffs':diffs,'battle_evidence':evidence_by_target,'min_win_rate':min(vals) if vals else None,'avg_win_rate':sum(vals)/len(vals) if vals else None})
            placements_simulated+=1
        role_rows.sort(key=_rank_key,reverse=True)
        if not role_rows:continue
        best=copy.deepcopy(role_rows[0])
        expected=family_expected.get(family_key,6)
        best['role_comparison']={'policy':'ALL_ROLE_ORDERS_COMMON_RANDOM_SEEDS','expected_placements':expected,'placements_simulated':len(role_rows),'complete':len(role_rows)==expected,'selected_rank':1}
        best['role_variants']=role_rows
        ranked.append(best)
    ranked.sort(key=_rank_key,reverse=True)
    scope={'catalog_scope':catalog_scope,'search_mode':search_mode,'seed_count':len(seeds),'owned_pool_count':len(owned_pool),'swap_depth':swap_depth,'skill_swap_depth':skill_swap_depth,'confirmed_skill_pool_count':len(skill_pool),'skill_beam_width':beam_width,'skill_prefilter_basis':'canonical staged coverage + priority/bucket quality prefilter' if global_catalog else 'adaptive exact 6-8 skills; beam 9+ using canonical optimizer_priority_score + optimizer_bucket','beam_recall_audit':beam_audit,'variant_count':variant_count,'generated':len(seen),'formal_ready':len(structural),'stopped':stopped,'budget':budget,'budget_cut':budget_cut,'units':units,'shortlist_simulated':placements_simulated,'trials_per_direction':trials,'blocks':blocks,'screening_battles_per_placement':2*max(1,trials//blocks)*blocks,'screening_measurement_policy':'COMPLETED_BATTLES_REQUIRED_ZERO_ZERO_SENTINEL_REJECTED','screening_invalid_count':screening_invalid,'screening_invalid_reasons':screening_invalid_reasons,'target_formal_stops':target_formal_stops,'role_selection_policy':'ALL_SIX_ROLE_ORDERS_ATOMIC_COMMON_RANDOM_SEEDS','role_atomic_budget':True,'role_families_generated':len(families),'role_families_complete':len(complete_families),'role_families_shortlisted':len(family_shortlist),'role_placements_simulated':placements_simulated,'role_placements_expected_per_family':6}
    scope.update(catalog_details)
    if global_catalog:
        scope.update({'officer_formal_admission_count':len(admitted_officers),'skill_formal_admission_count':len(admitted_skills),'formal_stop_reasons':stop_reasons})
    version='adapter-v3-canonical-global-staged' if global_catalog else 'adapter-v2-role-complete'
    claim='CANONICAL_CATALOG_COMPLETE_STAGED_SEARCH_NO_GLOBAL_OPTIMUM_CLAIM' if global_catalog else 'PURPOSE_AWARE_BUDGETED_SEARCH_NO_GLOBAL_OPTIMUM_CLAIM'
    search_status='TARGET_FORMAL_STOP' if target_formal_stops else ('NO_VALID_RUNTIME_MEASUREMENTS' if not ranked else 'SCREENING_COMPLETE')
    return json.dumps({'type':'branch_optimizer','version':version,'runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE','claim_status':claim,'search_status':search_status,'search_scope':scope,'targets':[t['id'] for t in targets],'ranked':ranked,'elapsed_seconds':round(time.time()-started,3)},ensure_ascii=False)

# Stable public boundary. These aliases live outside the canonical b223 source.
calculate = evaluate_request
search = optimize_request
formal = formalize_request

#!/usr/bin/env python3
from __future__ import annotations
import copy, gc, itertools, json, time
from custom_evaluate import load_context, resolve_officers_by_awaken_values, resolve_skills, build_best, public_best
from battle_simulator import simulate_many_balanced

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

def evaluate_request(request_json):
    req=json.loads(request_json) if isinstance(request_json,str) else request_json
    candidate=_make(req['candidate']); target=_make(req.get('target_spec') or TARGETS[req['target']])
    trials=max(1,min(int(req.get('trials',10)),100));blocks=max(1,min(int(req.get('blocks',1)),3));seed=int(req.get('seed',1326230000));started=time.time()
    sim=simulate_many_balanced(_ctx(),copy.deepcopy(candidate),copy.deepcopy(target),trials=trials,seed=seed,blocks=blocks)
    return json.dumps({'type':'simulation','version':'adapter-v1','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE','target':req.get('target','CUSTOM'),'trials_per_direction':trials,'blocks':blocks,'win_rate':sim.get('left_balanced_win_rate'),'hp_diff':sim.get('avg_hp_diff_balanced'),'elapsed_seconds':round(time.time()-started,3),'candidate_assignment':candidate.get('attach_assignment'),'formal_status':candidate.get('formal_status'),'sim':sim if req.get('include_detail') else None},ensure_ascii=False)

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
    officers=seed['officers']; awaken=seed['awaken']; skills=seed['skills']; stats=list(seed.get('stats') or [])
    while len(stats)<3:stats.append({})
    pairs=[skills[0:2],skills[2:4],skills[4:6]]
    for perm in itertools.permutations(range(3)):
        for unit in units:
            yield {'officers':[officers[i] for i in perm],'awaken':[awaken[i] for i in perm],'skills':sum((pairs[i] for i in perm),[]),'stats':[stats[i] for i in perm],'unit':unit,'fixed_placement':True,'ignore_formal_overlap':True}

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
    structural=[];seen=set();stopped=0;budget_cut=False;started=time.time();variant_count=0;family_expected={}
    beam_audit=_beam_recall_audit([x.get('name') if isinstance(x,dict) else str(x) for x in skill_pool],beam_width) if beam_audit_requested and skill_swap_depth>=3 else {'performed':False,'reason':'not requested or full rebuild disabled'}
    for seed in seeds:
        for officer_variant in _base_variants(copy.deepcopy(seed),owned_pool,swap_depth):
            for variant in _skill_variants(officer_variant,skill_pool,skill_swap_depth,beam_width):
                variant_count+=1
                grouped={}
                for spec in _permute_seed(variant,units):grouped.setdefault(_role_family_key(spec),[]).append(spec)
                for family_key,specs in grouped.items():
                    fresh=[spec for spec in specs if _spec_key(spec) not in seen]
                    if not fresh:continue
                    # Never spend the last part of the budget on only some of the six
                    # role orders. A family is admitted atomically or left untouched.
                    if len(seen)+len(fresh)>budget:
                        budget_cut=True;break
                    family_expected[family_key]=len(specs)
                    for spec in fresh:
                        seen.add(_spec_key(spec))
                        try:r=_make(spec)
                        except BaseException:stopped+=1;continue
                        if not str(r.get('formal_status','')).startswith('FORMAL_EVAL_READY'):
                            stopped+=1;continue
                        structural.append({'spec':spec,'score':float(r.get('score') or 0),'formal_status':r.get('formal_status'),'assignment':r.get('attach_assignment') or [],'_role_family_key':family_key})
                        if len(seen)%100==0:gc.collect()
                if budget_cut:break
            if budget_cut:break
        if budget_cut:break
    families={}
    for item in structural:families.setdefault(item['_role_family_key'],[]).append(item)
    complete_families={key:items for key,items in families.items() if len(items)==family_expected.get(key,6)}
    selectable=complete_families or families
    legacy_shortlist=max(1,min(int(req.get('shortlist',4)),48))
    family_limit=max(1,min(int(req.get('role_family_shortlist',(legacy_shortlist+5)//6)),8))
    family_shortlist=sorted(selectable.items(),key=lambda pair:max(item['score'] for item in pair[1]),reverse=True)[:family_limit]
    runtime_targets=[(t['id'],_make(t['spec'])) for t in targets]
    ranked=[];placements_simulated=0
    for fi,(family_key,items) in enumerate(family_shortlist):
        role_rows=[]
        # Common seeds within a family make commander/deputy comparisons fairer:
        # only role order changes, not the random battle sequence.
        for item in items:
            rates={};diffs={};cand=_make(item['spec'])
            for ti,(target_id,tar) in enumerate(runtime_targets):
                sim=simulate_many_balanced(_ctx(),copy.deepcopy(cand),copy.deepcopy(tar),trials=trials,seed=seed0+fi*1000+ti*100,blocks=blocks)
                rates[target_id]=sim.get('left_balanced_win_rate');diffs[target_id]=sim.get('avg_hp_diff_balanced')
                del sim;gc.collect()
            vals=[v for v in rates.values() if isinstance(v,(int,float))]
            role_rows.append({'candidate':item['spec'],'structural_score':item['score'],'formal_status':item['formal_status'],'assignment':item['assignment'],'win_rates':rates,'hp_diffs':diffs,'min_win_rate':min(vals) if vals else None,'avg_win_rate':sum(vals)/len(vals) if vals else None})
            placements_simulated+=1
        role_rows.sort(key=_rank_key,reverse=True)
        if not role_rows:continue
        best=copy.deepcopy(role_rows[0])
        expected=family_expected.get(family_key,6)
        best['role_comparison']={'policy':'ALL_ROLE_ORDERS_COMMON_RANDOM_SEEDS','expected_placements':expected,'placements_simulated':len(role_rows),'complete':len(role_rows)==expected,'selected_rank':1}
        best['role_variants']=role_rows
        ranked.append(best)
    ranked.sort(key=_rank_key,reverse=True)
    scope={'search_mode':search_mode,'seed_count':len(seeds),'owned_pool_count':len(owned_pool),'swap_depth':swap_depth,'skill_swap_depth':skill_swap_depth,'confirmed_skill_pool_count':len(skill_pool),'skill_beam_width':beam_width,'skill_prefilter_basis':'adaptive exact 6-8 skills; beam 9+ using canonical optimizer_priority_score + optimizer_bucket','beam_recall_audit':beam_audit,'variant_count':variant_count,'generated':len(seen),'formal_ready':len(structural),'stopped':stopped,'budget':budget,'budget_cut':budget_cut,'units':units,'shortlist_simulated':placements_simulated,'trials_per_direction':trials,'blocks':blocks,'role_selection_policy':'ALL_SIX_ROLE_ORDERS_ATOMIC_COMMON_RANDOM_SEEDS','role_atomic_budget':True,'role_families_generated':len(families),'role_families_complete':len(complete_families),'role_families_shortlisted':len(family_shortlist),'role_placements_simulated':placements_simulated,'role_placements_expected_per_family':6}
    return json.dumps({'type':'branch_optimizer','version':'adapter-v2-role-complete','runtime':'B223_CANONICAL_PYTHON_VIA_PYODIDE','claim_status':'PURPOSE_AWARE_BUDGETED_SEARCH_NO_GLOBAL_OPTIMUM_CLAIM','search_scope':scope,'targets':[t['id'] for t in targets],'ranked':ranked,'elapsed_seconds':round(time.time()-started,3)},ensure_ascii=False)

# Stable public boundary. These aliases live outside the canonical b223 source.
calculate = evaluate_request
search = optimize_request
formal = formalize_request

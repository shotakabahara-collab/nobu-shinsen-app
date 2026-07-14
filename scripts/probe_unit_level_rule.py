#!/usr/bin/env python3
from __future__ import annotations
import io,json,os,sys,tempfile,zipfile
from pathlib import Path
from canonical_archive import canonical_archive_bytes

ROOT=Path(__file__).resolve().parents[1]
LOCK=json.loads((ROOT/'canonical/LOCK.json').read_text(encoding='utf-8'))

archive=canonical_archive_bytes(ROOT,LOCK['archive'],LOCK['archiveSha256'])
with zipfile.ZipFile(io.BytesIO(archive)) as z, tempfile.TemporaryDirectory() as td:
    stage=Path(td)/'runtime';z.extractall(stage)
    engine=stage/'02_ENGINE'
    previous=os.getcwd();previous_bytecode=sys.dont_write_bytecode
    sys.dont_write_bytecode=True;sys.path.insert(0,str(engine))
    try:
        os.chdir(engine)
        from custom_evaluate import load_context
        ctx=load_context()
    finally:
        os.chdir(previous);sys.path.remove(str(engine));sys.dont_write_bytecode=previous_bytecode

    auditor=engine/'unit_level_auditor.py'
    print('=== UNIT_LEVEL_AUDITOR ===')
    print(auditor.read_text(encoding='utf-8',errors='ignore'))

    print('=== TRAIT CONTAINER TYPES ===')
    for key in ('trait_cumulative_by_officer_awaken','traits_by_officer_id','trait_effects'):
        value=ctx.get(key)
        print(key,type(value).__name__,len(value) if hasattr(value,'__len__') else None)
        if isinstance(value,dict):print('sample_keys',list(value.keys())[:12])
        elif isinstance(value,list):print('sample_rows',value[:2])

    name_to_id={str(r.get('武将名') or '').strip():str(r.get('武将ID') or '').strip() for r in ctx.get('officers',[]) if r.get('武将名')}
    print('=== OFFICER TRAITS ===')
    for name in ('柿崎景家','前田慶次','お江','長宗我部元親','立花道雪','大祝鶴','松永久秀'):
        officer_id=name_to_id.get(name)
        print('OFFICER',name,officer_id)
        traits_by=ctx.get('traits_by_officer_id',{})
        print('traits_by_officer_id',repr(traits_by.get(officer_id))[:5000] if isinstance(traits_by,dict) else 'not-dict')
        cumulative=ctx.get('trait_cumulative_by_officer_awaken',{})
        if isinstance(cumulative,dict):
            matches={str(k):v for k,v in cumulative.items() if officer_id and officer_id in str(k)}
            print('cumulative_matches',repr(matches)[:12000])

    print('=== UNIT TRAIT EFFECT ROWS ===')
    needles=('兵種','騎兵大将','足軽大将','弓兵大将','鉄砲大将','馬槍術','槍術','弓術','砲術','unit_level')
    effects=ctx.get('trait_effects',[])
    rows=effects.values() if isinstance(effects,dict) else effects
    found=[]
    for row in rows or []:
        text=json.dumps(row,ensure_ascii=False,default=str)
        if any(needle.lower() in text.lower() for needle in needles):found.append(row)
    print('found_count',len(found))
    for row in found[:120]:print(json.dumps(row,ensure_ascii=False,default=str))

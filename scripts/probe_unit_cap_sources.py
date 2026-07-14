#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

from canonical_archive import canonical_archive_bytes

ROOT=Path(__file__).resolve().parents[1]
LOCK=json.loads((ROOT/'canonical/LOCK.json').read_text(encoding='utf-8'))
OUT=ROOT/'unit-cap-probe.json'
KEY_TERMS=('兵種','上限','lv','level','cap','unit')
VALUE_TERMS=('兵種Lv','兵種レベル','上限解放','上限','unit_level','unit level','cap')


def relevant_mapping(row):
    if not isinstance(row,dict):return False
    text=json.dumps(row,ensure_ascii=False,default=str).lower()
    return any(term.lower() in text for term in VALUE_TERMS)


def compact(row):
    return {str(k):v for k,v in row.items() if any(term.lower() in str(k).lower() for term in KEY_TERMS) or any(term.lower() in str(v).lower() for term in VALUE_TERMS)}


archive=canonical_archive_bytes(ROOT,LOCK['archive'],LOCK['archiveSha256'])
report={'contextKeys':[],'containers':{},'skillRows':[],'traitRows':[],'fileHits':[]}
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
        for cache in stage.rglob('__pycache__'):shutil.rmtree(cache,ignore_errors=True)
        for bytecode in stage.rglob('*.pyc'):bytecode.unlink(missing_ok=True)

    report['contextKeys']=sorted(ctx.keys())
    for key,value in ctx.items():
        if any(term.lower() in key.lower() for term in KEY_TERMS):
            report['containers'][key]={'type':type(value).__name__,'length':len(value) if hasattr(value,'__len__') else None}

    for row in ctx.get('skills',[]):
        if relevant_mapping(row):
            report['skillRows'].append({'name':row.get('skill_name'),'id':row.get('canonical_skill_id') or row.get('skill_id'),'relevant':compact(row),'full':row})

    for row in ctx.get('trait_effects',[]):
        if relevant_mapping(row):
            report['traitRows'].append({'officerId':row.get('武将ID'),'trait':row.get('特性名'),'relevant':compact(row),'full':row})

    for path in sorted(stage.rglob('*')):
        if not path.is_file() or path.suffix.lower() not in {'.py','.json','.csv','.md','.txt'} or path.stat().st_size>5_000_000:continue
        text=path.read_text(encoding='utf-8',errors='ignore')
        hits=[]
        for no,line in enumerate(text.splitlines(),1):
            if any(term.lower() in line.lower() for term in VALUE_TERMS):hits.append({'line':no,'text':line[:1000]})
        if hits:report['fileHits'].append({'path':path.relative_to(stage).as_posix(),'hits':hits[:120]})

OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str)+'\n',encoding='utf-8')
print(json.dumps({'skillRows':len(report['skillRows']),'traitRows':len(report['traitRows']),'files':len(report['fileHits'])},ensure_ascii=False))

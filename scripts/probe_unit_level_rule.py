#!/usr/bin/env python3
from __future__ import annotations
import io,json,os,sys,tempfile,zipfile
from pathlib import Path
from canonical_archive import canonical_archive_bytes

ROOT=Path(__file__).resolve().parents[1]
LOCK=json.loads((ROOT/'canonical/LOCK.json').read_text(encoding='utf-8'))
TERMS=('unit_level','unit_coef','兵種Lv','兵種レベル','覚醒','凸')

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
    print('CONTEXT_KEYS',sorted(ctx.keys()))
    officers=ctx.get('officers',[])
    print('OFFICER_COUNT',len(officers))
    if officers:
        print('OFFICER_RELEVANT_KEYS',[k for k in officers[0].keys() if any(t.lower() in k.lower() for t in TERMS)])
    for name in ('山県昌景','黒田官兵衛','松永久秀'):
        rows=[r for r in officers if str(r.get('武将名') or '').strip()==name]
        print('OFFICER_SAMPLE',name,len(rows))
        for row in rows[:6]:
            relevant={k:v for k,v in row.items() if any(t.lower() in k.lower() for t in TERMS) or k in ('武将名','武将ID')}
            print(relevant)
    hits=0
    for path in sorted(stage.rglob('*')):
        if not path.is_file() or path.suffix.lower() not in {'.py','.json','.csv','.md','.txt'} or path.stat().st_size>3_000_000:
            continue
        try:text=path.read_text(encoding='utf-8',errors='ignore')
        except Exception:continue
        lines=[]
        for no,line in enumerate(text.splitlines(),1):
            if any(t.lower() in line.lower() for t in TERMS):
                lines.append((no,line[:500]))
        if lines:
            print('FILE',path.relative_to(stage).as_posix())
            for no,line in lines[:40]:print(f'{no}: {line}')
            hits+=len(lines)
            if hits>300:break

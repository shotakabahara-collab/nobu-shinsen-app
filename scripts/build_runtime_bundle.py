#!/usr/bin/env python3
from __future__ import annotations
import gzip, hashlib, io, json, os, shutil, sys, tarfile, tempfile, zipfile
from pathlib import Path
from canonical_archive import canonical_archive_bytes

ROOT=Path(__file__).resolve().parents[1]
LOCK=json.loads((ROOT/'canonical/LOCK.json').read_text(encoding='utf-8'))
ARCHIVE=ROOT/'canonical'/LOCK['archive']
OUT=ROOT/'public/runtime_bundle_b223.tgz'
CATALOG_OUT=ROOT/'public/canonical_officer_catalog.json'


def sha(path:Path)->str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()


def build_officer_catalog(stage:Path)->dict:
    engine=stage/'02_ENGINE'
    previous=os.getcwd();previous_bytecode=sys.dont_write_bytecode
    sys.dont_write_bytecode=True
    sys.path.insert(0,str(engine))
    try:
        os.chdir(engine)
        from custom_evaluate import load_context
        rows=load_context().get('officers',[])
    finally:
        os.chdir(previous)
        sys.path.remove(str(engine))
        sys.dont_write_bytecode=previous_bytecode
        for cache in stage.rglob('__pycache__'):shutil.rmtree(cache,ignore_errors=True)
        for bytecode in stage.rglob('*.pyc'):bytecode.unlink(missing_ok=True)
    officers={}
    for row in rows:
        name=str(row.get('武将名') or '').strip()
        inherent=str(row.get('固有戦法名') or '').strip()
        officer_id=str(row.get('武将ID') or '').strip()
        if not name or not inherent:
            continue
        current=officers.get(name)
        entry={'id':officer_id,'name':name,'inherentSkill':inherent}
        if current and current!=entry:
            raise SystemExit(f'canonical officer catalog conflict: {name}: {current} != {entry}')
        officers[name]=entry
    if not officers:
        raise SystemExit('canonical officer catalog is empty')
    payload={
        'schemaVersion':1,
        'canonicalVersion':LOCK['canonicalVersion'],
        'canonicalArchiveSha256':LOCK['archiveSha256'],
        'sourceFields':{'id':'武将ID','name':'武将名','inherentSkill':'固有戦法名'},
        'officerCount':len(officers),
        'officers':sorted(officers.values(),key=lambda row:row['name']),
    }
    CATALOG_OUT.parent.mkdir(parents=True,exist_ok=True)
    CATALOG_OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return payload


def main()->int:
    try:archive_bytes=canonical_archive_bytes(ROOT,LOCK['archive'],LOCK['archiveSha256'])
    except RuntimeError as error:raise SystemExit(str(error)) from error
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as z:
        names=[i.filename for i in z.infolist()]
        if len(names)!=len(set(names)):raise SystemExit('canonical ZIP contains duplicate members')
        with tempfile.TemporaryDirectory() as td:
            stage=Path(td)/'runtime';z.extractall(stage)
            battle=stage/LOCK['battleRuntimePath']
            if sha(battle)!=LOCK['battleRuntimeSha256']:raise SystemExit('battle runtime SHA mismatch')
            catalog=build_officer_catalog(stage)
            shutil.copy2(ROOT/'runtime/adapter/browser_runtime_api.py',stage/'02_ENGINE/browser_runtime_api.py')
            raw=io.BytesIO()
            with tarfile.open(fileobj=raw,mode='w',format=tarfile.PAX_FORMAT) as tf:
                for path in sorted(p for p in stage.rglob('*') if p.is_file()):
                    rel=path.relative_to(stage).as_posix();data=path.read_bytes()
                    info=tarfile.TarInfo(rel);info.size=len(data);info.mode=0o644;info.mtime=0;info.uid=info.gid=0;info.uname=info.gname=''
                    tf.addfile(info,io.BytesIO(data))
            OUT.parent.mkdir(parents=True,exist_ok=True)
            with OUT.open('wb') as target,gzip.GzipFile(filename='',mode='wb',fileobj=target,mtime=0,compresslevel=9) as gz:gz.write(raw.getvalue())
    bundle_sha=sha(OUT)
    if bundle_sha!=LOCK['runtimeBundleSha256']:raise SystemExit('runtime bundle SHA mismatch')
    catalog_sha=sha(CATALOG_OUT)
    manifest={'schemaVersion':1,'canonicalArchiveSha256':LOCK['archiveSha256'],'battleRuntimeSha256':LOCK['battleRuntimeSha256'],'bundleSha256':bundle_sha,'memberCount':len(names)+1,'duplicateMemberCount':0,'officerCatalogSha256':catalog_sha,'officerCatalogCount':catalog['officerCount']}
    (ROOT/'public/runtime_bundle_b223.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(manifest,ensure_ascii=False));return 0
if __name__=='__main__':raise SystemExit(main())

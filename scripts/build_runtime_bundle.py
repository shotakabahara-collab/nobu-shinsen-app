#!/usr/bin/env python3
from __future__ import annotations
import gzip, hashlib, io, json, os, re, shutil, sys, tarfile, tempfile, zipfile
from pathlib import Path
from canonical_archive import canonical_archive_bytes

ROOT=Path(__file__).resolve().parents[1]
LOCK=json.loads((ROOT/'canonical/LOCK.json').read_text(encoding='utf-8'))
ARCHIVE=ROOT/'canonical'/LOCK['archive']
OUT=ROOT/'public/runtime_bundle_b223.tgz'
OFFICER_CATALOG_OUT=ROOT/'public/canonical_officer_catalog.json'
SKILL_CATALOG_OUT=ROOT/'public/canonical_skill_catalog.json'
UNIT_TYPES={'足軽','騎馬','鉄砲','弓'}


def sha(path:Path)->str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()


def load_canonical_context(stage:Path)->dict:
    engine=stage/'02_ENGINE'
    previous=os.getcwd();previous_bytecode=sys.dont_write_bytecode
    sys.dont_write_bytecode=True
    sys.path.insert(0,str(engine))
    try:
        os.chdir(engine)
        from custom_evaluate import load_context
        return load_context()
    finally:
        os.chdir(previous)
        sys.path.remove(str(engine))
        sys.dont_write_bytecode=previous_bytecode
        for cache in stage.rglob('__pycache__'):shutil.rmtree(cache,ignore_errors=True)
        for bytecode in stage.rglob('*.pyc'):bytecode.unlink(missing_ok=True)


def write_catalog(path:Path,payload:dict)->dict:
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return payload


def as_int(value)->int:
    try:return int(float(str(value or '0').strip()))
    except (TypeError,ValueError):return 0


def unlocked_at(value)->int:
    match=re.search(r'(\d+)凸',str(value or ''))
    if not match:raise SystemExit(f'canonical unit level trait has unknown unlock stage: {value!r}')
    return int(match.group(1))


def build_officer_catalog(rows:list[dict],trait_rows:list[dict])->dict:
    officers={}
    for row in rows:
        name=str(row.get('武将名') or '').strip()
        inherent=str(row.get('固有戦法名') or '').strip()
        officer_id=str(row.get('武将ID') or '').strip()
        if not name or not inherent or not officer_id:continue
        current=officers.get(name)
        entry={'id':officer_id,'name':name,'inherentSkill':inherent}
        if current and current!=entry:raise SystemExit(f'canonical officer catalog conflict: {name}: {current} != {entry}')
        officers[name]=entry
    if not officers:raise SystemExit('canonical officer catalog is empty')

    traits_by_officer={}
    for row in trait_rows:
        level_bonus=as_int(row.get('兵種Lv加算'))
        cap_bonus=as_int(row.get('上限解放'))
        if level_bonus<=0 and cap_bonus<=0:continue
        officer_id=str(row.get('武将ID') or '').strip()
        trait_name=str(row.get('特性名') or '').strip()
        targets=[part.strip() for part in re.split(r'[/／,、]',str(row.get('対象兵種') or '')) if part.strip() in UNIT_TYPES]
        if not officer_id or not trait_name or not targets:continue
        trait={
            'name':trait_name,
            'unlockedAt':unlocked_at(row.get('開放段階')),
            'unitTypes':targets,
            'levelBonus':level_bonus,
            'capBonus':cap_bonus,
        }
        bucket=traits_by_officer.setdefault(officer_id,[])
        if trait not in bucket:bucket.append(trait)

    for officer in officers.values():
        officer['unitLevelTraits']=sorted(traits_by_officer.get(officer['id'],[]),key=lambda row:(row['unlockedAt'],row['name'],row['unitTypes']))

    return write_catalog(OFFICER_CATALOG_OUT,{
        'schemaVersion':1,
        'canonicalVersion':LOCK['canonicalVersion'],
        'canonicalArchiveSha256':LOCK['archiveSha256'],
        'unitLevelRule':{'baseLevel':5,'defaultCap':10,'generalTraitCap':11},
        'sourceFields':{
            'id':'武将ID','name':'武将名','inherentSkill':'固有戦法名',
            'traitName':'特性名','traitUnlock':'開放段階','traitUnitTypes':'対象兵種',
            'traitLevelBonus':'兵種Lv加算','traitCapBonus':'上限解放',
        },
        'officerCount':len(officers),
        'officers':sorted(officers.values(),key=lambda row:row['name']),
    })


def build_skill_catalog(rows:list[dict])->dict:
    skills={}
    for row in rows:
        name=str(row.get('skill_name') or '').strip()
        skill_id=str(row.get('canonical_skill_id') or row.get('skill_id') or '').strip()
        skill_type=str(row.get('skill_type') or '').strip()
        attachable=str(row.get('is_attachable') or '').strip().lower()=='true'
        if not name or not skill_id:continue
        current=skills.get(name)
        entry={'id':skill_id,'name':name,'type':skill_type,'attachable':attachable}
        if current and current!=entry:raise SystemExit(f'canonical skill catalog conflict: {name}: {current} != {entry}')
        skills[name]=entry
    if not skills:raise SystemExit('canonical skill catalog is empty')
    return write_catalog(SKILL_CATALOG_OUT,{
        'schemaVersion':1,
        'canonicalVersion':LOCK['canonicalVersion'],
        'canonicalArchiveSha256':LOCK['archiveSha256'],
        'sourceFields':{'id':'canonical_skill_id/skill_id','name':'skill_name','type':'skill_type','attachable':'is_attachable'},
        'skillCount':len(skills),
        'skills':sorted(skills.values(),key=lambda row:row['name']),
    })


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
            context=load_canonical_context(stage)
            officer_catalog=build_officer_catalog(context.get('officers',[]),context.get('trait_effects',[]))
            skill_catalog=build_skill_catalog(context.get('skills',[]))
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
    manifest={
        'schemaVersion':1,
        'canonicalArchiveSha256':LOCK['archiveSha256'],
        'battleRuntimeSha256':LOCK['battleRuntimeSha256'],
        'bundleSha256':bundle_sha,
        'memberCount':len(names)+1,
        'duplicateMemberCount':0,
        'officerCatalogSha256':sha(OFFICER_CATALOG_OUT),
        'officerCatalogCount':officer_catalog['officerCount'],
        'skillCatalogSha256':sha(SKILL_CATALOG_OUT),
        'skillCatalogCount':skill_catalog['skillCount'],
    }
    (ROOT/'public/runtime_bundle_b223.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(manifest,ensure_ascii=False));return 0


if __name__=='__main__':raise SystemExit(main())

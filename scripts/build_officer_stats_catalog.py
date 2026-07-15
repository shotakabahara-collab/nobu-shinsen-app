#!/usr/bin/env python3
from __future__ import annotations
import io,json,tempfile,zipfile
from pathlib import Path
from canonical_archive import canonical_archive_bytes
from build_runtime_bundle import load_canonical_context

ROOT=Path(__file__).resolve().parents[1]
LOCK=json.loads((ROOT/'canonical/LOCK.json').read_text(encoding='utf-8'))
OUT=ROOT/'public/canonical_officer_stats_catalog.json'

def number(value):
 try:return float(str(value).strip())
 except (TypeError,ValueError):return None

def as_int(value):
 try:return int(float(str(value).strip()))
 except (TypeError,ValueError):return 0

def stats(row,suffix):
 return {
  'force':number(row.get(f'武勇_{suffix}')),
  'intel':number(row.get(f'知略_{suffix}')),
  'lead':number(row.get(f'統率_{suffix}')),
  'speed':number(row.get(f'速度_{suffix}')),
 }

def main()->int:
 archive=canonical_archive_bytes(ROOT,LOCK['archive'],LOCK['archiveSha256'])
 with zipfile.ZipFile(io.BytesIO(archive)) as z,tempfile.TemporaryDirectory() as td:
  stage=Path(td)/'runtime';z.extractall(stage)
  context=load_canonical_context(stage)
 corrected=json.loads((ROOT/'public/canonical_officer_catalog.json').read_text(encoding='utf-8'))
 inherent={row['name']:row['inherentSkill'] for row in corrected['officers']}
 records={}
 for row in context.get('officers',[]):
  name=str(row.get('武将名') or '').strip();officer_id=str(row.get('武将ID') or '').strip();awaken=as_int(row.get('凸数'))
  if not name or not officer_id or awaken<0 or awaken>5:continue
  entry={
   'id':officer_id,'name':name,'awaken':awaken,
   'inherentSkill':inherent.get(name,str(row.get('固有戦法名') or '').strip() or '未確認'),
   'allocationPoints':as_int(row.get('配分pt')),
   'base':stats(row,'基礎'),'allocated':stats(row,'ステ振り後'),
   'actionOrderSpeed':number(row.get('行動順用速度')),
   'statState':str(row.get('評価値状態') or '').strip() or '未確認',
  }
  key=f'{name}|{awaken}'
  current=records.get(key)
  if current and current!=entry:raise SystemExit(f'canonical officer stat conflict: {key}: {current} != {entry}')
  records[key]=entry
 payload={
  'schemaVersion':1,'canonicalVersion':LOCK['canonicalVersion'],'canonicalArchiveSha256':LOCK['archiveSha256'],
  'recordCount':len(records),'records':sorted(records.values(),key=lambda row:(row['name'],row['awaken']))
 }
 OUT.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'recordCount':payload['recordCount']},ensure_ascii=False));return 0

if __name__=='__main__':raise SystemExit(main())

#!/usr/bin/env python3
import json,os,sys,tarfile,tempfile,unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

class CatalogContextProbe(unittest.TestCase):
 def test_print_canonical_context_shape(self):
  with tempfile.TemporaryDirectory() as work:
   with tarfile.open(ROOT/'public/runtime_bundle_b223.tgz','r:gz') as bundle:
    bundle.extractall(work)
   engine=Path(work)/'02_ENGINE'
   previous=os.getcwd();os.chdir(engine);sys.path.insert(0,str(engine))
   try:
    import browser_runtime_api as api
    ctx=api._ctx();probe={'ctx_keys':sorted(ctx.keys()),'lists':{}}
    for key,value in ctx.items():
     if isinstance(value,list) and value and isinstance(value[0],dict):
      probe['lists'][key]={'count':len(value),'keys':sorted({str(k) for row in value[:20] for k in row.keys()}),'samples':value[:3]}
    (ROOT/'catalog-probe.json').write_text(json.dumps(probe,ensure_ascii=False,indent=2),encoding='utf-8')
   finally:
    os.chdir(previous)
    sys.path.remove(str(engine))

if __name__=='__main__':unittest.main()

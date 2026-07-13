#!/usr/bin/env python3
import os,sys,tarfile,tempfile,unittest
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
    ctx=api._ctx()
    print('CATALOG_PROBE_CTX_KEYS',sorted(ctx.keys()))
    for key,value in ctx.items():
     if isinstance(value,list) and value and isinstance(value[0],dict):
      sample=value[0]
      print('CATALOG_PROBE_LIST',key,len(value),sorted(sample.keys()))
      print('CATALOG_PROBE_SAMPLE',key,{k:sample.get(k) for k in sample if any(token in str(k).lower() for token in ('name','skill','武将','戦法','固有'))})
   finally:
    os.chdir(previous)
    sys.path.remove(str(engine))

if __name__=='__main__':unittest.main()

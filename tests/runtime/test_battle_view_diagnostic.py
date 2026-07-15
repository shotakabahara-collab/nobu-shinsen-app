#!/usr/bin/env python3
import json,sys,tarfile,tempfile,unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

class BattleViewDiagnosticTest(unittest.TestCase):
 def test_print_resolved_team_shape(self):
  with tempfile.TemporaryDirectory() as td:
   with tarfile.open(ROOT/'public/runtime_bundle_b223.tgz','r:gz') as bundle:bundle.extractall(td)
   engine=Path(td)/'02_ENGINE';sys.path.insert(0,str(engine))
   try:
    import browser_runtime_api as api
    team=api._make(api.TARGETS['YAMAMOTO'])
    def prune(value,depth=0):
     if depth>3:return type(value).__name__
     if isinstance(value,dict):return {str(k):prune(v,depth+1) for k,v in list(value.items())[:80]}
     if isinstance(value,list):return [prune(v,depth+1) for v in value[:5]]
     return value
    self.fail(json.dumps(prune(team),ensure_ascii=False,indent=2,default=str))
   finally:
    sys.path.remove(str(engine))

if __name__=='__main__':unittest.main()

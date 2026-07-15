#!/usr/bin/env python3
import json,subprocess,sys,tarfile,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
class RuntimeE2ETest(unittest.TestCase):
 def test_calculate_search_and_formal_use_real_b223_data(self):
  with tempfile.TemporaryDirectory() as td:
   with tarfile.open(ROOT/'public/runtime_bundle_b223.tgz','r:gz') as tf:tf.extractall(td,filter='data')
   code=r'''
import json,sys
sys.path.insert(0,'.')
from browser_runtime_api import calculate,search,formal
calc=json.load(open(sys.argv[1]));target={'officers':['黒田官兵衛','豊臣秀吉','ねね'],'awaken':[3,1,3],'unit':'弓','skills':['七十二の計','紅蓮の炎','三河弓兵隊','嚢沙之計','罵詈雑言','沈魚落雁'],'fixed_placement':True,'ignore_formal_overlap':True}
formal_req={'candidate':calc['candidate'],'targets':[{'id':'KURODA','spec':target}],'trials':1,'blocks':1,'seed':1326247000}
search_req={'seeds':[calc['candidate']],'owned_pool':[],'swap_depth':0,'skill_pool':[],'skill_swap_depth':0,'structural_budget':50,'targets':[{'id':'KURODA','spec':target}],'units':['騎馬'],'trials':1,'blocks':1,'shortlist':1,'seed':1326237000}
print(json.dumps([json.loads(calculate(json.dumps(calc,ensure_ascii=False))),json.loads(search(json.dumps(search_req,ensure_ascii=False))),json.loads(formal(json.dumps(formal_req,ensure_ascii=False)))],ensure_ascii=False))
'''
   result=subprocess.run([sys.executable,'-c',code,str(ROOT/'fixtures/runtime/calculate_request.json')],cwd=Path(td)/'02_ENGINE',text=True,capture_output=True,check=True)
   calculate_result,search_result,formal_result=json.loads(result.stdout)
   self.assertEqual(calculate_result['runtime'],'B223_CANONICAL_PYTHON_VIA_PYODIDE');self.assertEqual(calculate_result['win_rate'],0.25);self.assertEqual(calculate_result['hp_diff'],-7864.35)
   self.assertEqual(search_result['type'],'branch_optimizer');self.assertEqual(search_result['claim_status'],'PURPOSE_AWARE_BUDGETED_SEARCH_NO_GLOBAL_OPTIMUM_CLAIM')
   self.assertEqual(formal_result['type'],'formal_recheck');self.assertEqual(formal_result['verification_level'],'1x1_BALANCED');self.assertEqual(formal_result['min_win_rate'],0.5)

 def test_browser_worker_streams_a_balanced_batch_compact_detail_and_python_error(self):
  with tempfile.TemporaryDirectory() as td:
   with tarfile.open(ROOT/'public/runtime_bundle_b223.tgz','r:gz') as tf:tf.extractall(td,filter='data')
   code=r'''
import json,sys
worker=open(sys.argv[1],encoding='utf-8').read()
source=worker.split("await pyodide.runPythonAsync(`\n",1)[1].split("\n`);ready=true",1)[0]
functions=source[source.index('from browser_runtime_api'):]
namespace={}
exec("import copy,gc,json,os,sys,tarfile,time,traceback\nsys.path.insert(0,'.')\n"+functions,namespace)
request=json.load(open(sys.argv[2],encoding='utf-8'))
request['target_spec']={'officers':['黒田官兵衛','豊臣秀吉','ねね'],'awaken':[3,1,3],'unit':'弓','unit_level':10,'troops':10000,'skills':['七十二の計','紅蓮の炎','三河弓兵隊','嚢沙之計','罵詈雑言','沈魚落雁'],'fixed_placement':True,'ignore_formal_overlap':True}
request.update({'trials':1,'forward_seed':1326230000,'reverse_seed':1326235003})
batch=json.loads(namespace['calculate_batch'](json.dumps(request,ensure_ascii=False)))
detail_request={key:value for key,value in request.items() if key not in {'forward_seed','reverse_seed'}}
detail_request.update({'direction':'forward','seed':1326230000})
detail=json.loads(namespace['detail'](json.dumps(detail_request,ensure_ascii=False)))
error_raw=namespace['run_operation']('detail','{}')
error=json.loads(error_raw.split(namespace['_RUNTIME_ERROR_PREFIX'],1)[1])
print(json.dumps({'batch':batch,'detail':detail,'error':error},ensure_ascii=False))
'''
   result=subprocess.run([sys.executable,'-c',code,str(ROOT/'public/runtime-worker.js'),str(ROOT/'fixtures/runtime/calculate_request.json')],cwd=Path(td)/'02_ENGINE',text=True,capture_output=True,check=True)
   payload=json.loads(result.stdout);batch=payload['batch'];detail=payload['detail'];error=payload['error']
   self.assertEqual(batch['type'],'simulation_batch');self.assertEqual(batch['version'],'batch-v2-streaming-worker');self.assertEqual(batch['trials_per_direction'],1)
   self.assertEqual(batch['forward']['completed_trials'],1);self.assertEqual(batch['reverse']['completed_trials'],1)
   self.assertEqual(batch['forward']['next_seed'],1326230001);self.assertEqual(batch['reverse']['next_seed'],1326235004)
   self.assertEqual(detail['type'],'battle_detail');self.assertEqual(detail['max_turns'],8);self.assertTrue(detail['turns'])
   self.assertEqual(error['operation'],'detail');self.assertEqual(error['python_error_type'],'KeyError');self.assertIn('Traceback',error['python_traceback'])
if __name__=='__main__':unittest.main()

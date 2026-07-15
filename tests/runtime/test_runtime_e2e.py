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
   self.assertEqual(search_result['version'],'adapter-v2-role-complete');self.assertTrue(search_result['search_scope']['role_atomic_budget'])
   self.assertEqual(search_result['search_scope']['role_placements_simulated'],6);self.assertEqual(len(search_result['ranked']),1)
   self.assertTrue(search_result['ranked'][0]['role_comparison']['complete']);self.assertEqual(len(search_result['ranked'][0]['role_variants']),6)
   self.assertEqual(len({tuple(row['candidate']['officers']) for row in search_result['ranked'][0]['role_variants']}),6)
   self.assertEqual(formal_result['type'],'formal_recheck');self.assertEqual(formal_result['verification_level'],'1x1_BALANCED');self.assertEqual(formal_result['min_win_rate'],0.5)

 def test_optimizer_admits_role_families_atomically_and_compares_all_six_with_common_seeds(self):
  with tempfile.TemporaryDirectory() as td:
   with tarfile.open(ROOT/'public/runtime_bundle_b223.tgz','r:gz') as tf:tf.extractall(td,filter='data')
   code=r'''
import json,sys
sys.path.insert(0,'.')
import browser_runtime_api as api
calls=[]
def fake_make(spec):
 return {'formal_status':'FORMAL_EVAL_READY','score':100.0,'attach_assignment':[],'officers':list(spec['officers'])}
def fake_sim(ctx,candidate,target,trials,seed,blocks):
 calls.append({'officers':candidate['officers'],'seed':seed})
 hp={'甲':200.0,'乙':900.0,'丙':500.0}.get(candidate['officers'][0],0.0)
 return {'left_balanced_win_rate':0.5,'avg_hp_diff_balanced':hp}
api._make=fake_make;api._ctx=lambda:{};api.simulate_many_balanced=fake_sim
seed={'officers':['甲','乙','丙'],'awaken':[1,2,3],'unit':'騎馬','skills':['S1','S2','S3','S4','S5','S6'],'stats':[{'speed':1},{'speed':2},{'speed':3}]}
target={'officers':['丁','戊','己'],'awaken':[0,0,0],'unit':'弓','skills':['T1','T2','T3','T4','T5','T6']}
request={'seeds':[seed],'owned_pool':[],'swap_depth':0,'skill_pool':[{'name':'G'},{'name':'H'}],'skill_swap_depth':1,'structural_budget':50,'targets':[{'id':'target','spec':target}],'units':['騎馬'],'trials':1,'blocks':1,'role_family_shortlist':1,'seed':100}
print(json.dumps({'result':json.loads(api.search(json.dumps(request,ensure_ascii=False))),'calls':calls},ensure_ascii=False))
'''
   process=subprocess.run([sys.executable,'-c',code],cwd=Path(td)/'02_ENGINE',text=True,capture_output=True,check=True)
   payload=json.loads(process.stdout);result=payload['result'];scope=result['search_scope'];best=result['ranked'][0]
   self.assertTrue(scope['budget_cut']);self.assertEqual(scope['generated'],48);self.assertEqual(scope['generated']%6,0)
   self.assertEqual(scope['role_placements_simulated'],6);self.assertEqual(len(best['role_variants']),6);self.assertEqual(best['candidate']['officers'][0],'乙')
   self.assertEqual(len({call['seed'] for call in payload['calls']}),1)

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
formal_calls=[]
def formal_stop(*args,**kwargs):
 formal_calls.append(kwargs.get('seed'))
 raise RuntimeError('FORMAL_BATTLE_INPUT_CONTRACT_STOP ["left: formal_status_stop:STOP_UNIT_TYPE_LIMIT"]')
namespace['simulate_once']=formal_stop
try:
 namespace['_run_direction'](None,{},{} ,'forward',1326230000,10)
 formal_error='missing error'
except RuntimeError as exc:
 formal_error=str(exc)
print(json.dumps({'batch':batch,'detail':detail,'error':error,'formal_calls':formal_calls,'formal_error':formal_error},ensure_ascii=False))
'''
   result=subprocess.run([sys.executable,'-c',code,str(ROOT/'public/runtime-worker.js'),str(ROOT/'fixtures/runtime/calculate_request.json')],cwd=Path(td)/'02_ENGINE',text=True,capture_output=True,check=True)
   payload=json.loads(result.stdout);batch=payload['batch'];detail=payload['detail'];error=payload['error']
   self.assertEqual(batch['type'],'simulation_batch');self.assertEqual(batch['version'],'batch-v2-streaming-worker');self.assertEqual(batch['trials_per_direction'],1)
   self.assertEqual(batch['forward']['completed_trials'],1);self.assertEqual(batch['reverse']['completed_trials'],1)
   self.assertEqual(batch['forward']['next_seed'],1326230001);self.assertEqual(batch['reverse']['next_seed'],1326235004)
   self.assertEqual(detail['type'],'battle_detail');self.assertEqual(detail['max_turns'],8);self.assertTrue(detail['turns'])
   self.assertEqual(error['operation'],'detail');self.assertEqual(error['python_error_type'],'KeyError');self.assertIn('Traceback',error['python_traceback'])
   self.assertEqual(payload['formal_calls'],[1326230000]);self.assertIn('正本入力が戦闘開始条件を満たしません',payload['formal_error']);self.assertIn('STOP_UNIT_TYPE_LIMIT',payload['formal_error'])
if __name__=='__main__':unittest.main()

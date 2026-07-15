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
calc=json.load(open(sys.argv[1]));calc['include_detail']=True;target={'officers':['黒田官兵衛','豊臣秀吉','ねね'],'awaken':[3,1,3],'unit':'弓','skills':['七十二の計','紅蓮の炎','三河弓兵隊','嚢沙之計','罵詈雑言','沈魚落雁'],'fixed_placement':True,'ignore_formal_overlap':True}
formal_req={'candidate':calc['candidate'],'targets':[{'id':'KURODA','spec':target}],'trials':1,'blocks':1,'seed':1326247000}
search_req={'seeds':[calc['candidate']],'owned_pool':[],'swap_depth':0,'skill_pool':[],'skill_swap_depth':0,'structural_budget':50,'targets':[{'id':'KURODA','spec':target}],'units':['騎馬'],'trials':1,'blocks':1,'shortlist':1,'seed':1326237000}
print(json.dumps([json.loads(calculate(json.dumps(calc,ensure_ascii=False))),json.loads(search(json.dumps(search_req,ensure_ascii=False))),json.loads(formal(json.dumps(formal_req,ensure_ascii=False)))],ensure_ascii=False))
'''
   result=subprocess.run([sys.executable,'-c',code,str(ROOT/'fixtures/runtime/calculate_request.json')],cwd=Path(td)/'02_ENGINE',text=True,capture_output=True,check=True)
   calculate_result,search_result,formal_result=json.loads(result.stdout)
   self.assertEqual(calculate_result['runtime'],'B223_CANONICAL_PYTHON_VIA_PYODIDE');self.assertEqual(calculate_result['win_rate'],0.25);self.assertEqual(calculate_result['hp_diff'],-7864.35)
   self.assertEqual(calculate_result['battle_summary'],{'requestedBattles':4,'completedBattles':4,'wins':1,'losses':3,'draws':0,'winRate':0.25,'perDirectionBattles':2,'runtimeFailures':0,'evaluation':'SIDE_BALANCED_EQUAL_FORWARD_REVERSE_COUNTS'})
   self.assertEqual({row['outcome'] for row in calculate_result['battle_examples']},{'win','loss'})
   self.assertTrue(all(len(row['turns'])==8 for row in calculate_result['battle_examples']))
   self.assertTrue(any(change for row in calculate_result['battle_examples'] for turn in row['turns'] for event in turn['events'] for change in event['troopChanges']))
   self.assertEqual(search_result['type'],'branch_optimizer');self.assertEqual(search_result['claim_status'],'PURPOSE_AWARE_BUDGETED_SEARCH_NO_GLOBAL_OPTIMUM_CLAIM')
   self.assertEqual(formal_result['type'],'formal_recheck');self.assertEqual(formal_result['verification_level'],'1x1_BALANCED');self.assertEqual(formal_result['min_win_rate'],0.5)
if __name__=='__main__':unittest.main()

#!/usr/bin/env python3
import importlib.util,sys,tarfile,tempfile,unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

class BattleExampleApiTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp=tempfile.TemporaryDirectory()
  with tarfile.open(ROOT/'public/runtime_bundle_b223.tgz','r:gz') as bundle:bundle.extractall(cls.temp.name)
  cls.engine=Path(cls.temp.name)/'02_ENGINE';sys.path.insert(0,str(cls.engine))
  spec=importlib.util.spec_from_file_location('battle_example_api_test',ROOT/'public/battle-example-api.py')
  cls.api=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.api)

 @classmethod
 def tearDownClass(cls):
  sys.path.remove(str(cls.engine));cls.temp.cleanup()

 def test_example_targets_follow_requested_policy(self):
  self.assertEqual(self.api._example_targets(1.0),{'win':1,'loss':0})
  self.assertEqual(self.api._example_targets(0.0),{'win':0,'loss':1})
  self.assertEqual(self.api._example_targets(.6),{'win':1,'loss':1})

 def test_turn_payload_tracks_actions_troop_changes_and_t8_end(self):
  trace={
   'start_state':{'A':[{'name':'山本勘助','hp':10000}],'B':[{'name':'黒田官兵衛','hp':10000}]},
   'end_state':{'A':[{'name':'山本勘助','hp':10000}],'B':[{'name':'黒田官兵衛','hp':9000}]},
   'action_order':[{'rank':1,'side':'A','officer':'山本勘助','effective_speed':153,'base_speed':153,'timed_speed_bonus':0,'persistent_speed_bonus':0}],
  }
  logs=[
   'T1 B:黒田官兵衛 水の如し -> A:山本勘助 0',
   'T1 ACTION_ORDER 1:A-山本勘助[153]',
   'T1 B:黒田官兵衛 損害内訳 source=通常攻撃 loss=1000 wounded+=1000 battle_dead+0 wounded=1000',
   'T1 A:山本勘助 通常攻撃 -> B:黒田官兵衛 1000',
  ]
  turn=self.api._turn_payload(1,trace,logs,'forward',1,{})
  self.assertEqual(turn['status'],'active');self.assertIn('水の如し',turn['turnStartEvents'][0])
  self.assertEqual(turn['actions'][0]['officer'],'山本勘助');self.assertIn('通常攻撃',turn['actions'][0]['events'][0])
  change=turn['actions'][0]['troopChanges'][0]
  self.assertEqual(change['side'],'B');self.assertEqual(change['officer'],'黒田官兵衛');self.assertEqual(change['before'],10000);self.assertEqual(change['after'],9000);self.assertEqual(change['delta'],-1000)
  later=self.api._turn_payload(8,{},[],'forward',1,{('A','山本勘助'):10000,('B','黒田官兵衛'):9000})
  self.assertEqual(later['turn'],8);self.assertEqual(later['status'],'battle_ended');self.assertEqual(later['actions'],[])

 def test_reverse_direction_is_normalized_to_registered_sides(self):
  change=self.api._parse_change('T2 A:黒田官兵衛 損害内訳 source=通常攻撃 loss=500','reverse')
  self.assertEqual(change['side'],'B')
  self.assertEqual(self.api._replace_sides('A:黒田官兵衛 -> B:山本勘助','reverse'),'B:黒田官兵衛 -> A:山本勘助')

 def test_canonical_runtime_can_generate_one_eight_turn_example(self):
  candidate=self.api._make({'officers':['山本勘助','柴田勝家','柿崎景家'],'awaken':[2,1,2],'unit':'騎馬','unit_level':10,'troops':10000,'skills':['一行三昧','回天転運','会盟の陣','以戦養戦','乗勝追撃','縦横馳突'],'fixed_placement':True,'ignore_formal_overlap':True})
  target=self.api._make({'officers':['黒田官兵衛','豊臣秀吉','ねね'],'awaken':[3,1,3],'unit':'弓','unit_level':10,'troops':10000,'skills':['七十二の計','紅蓮の炎','三河弓兵隊','嚢沙之計','罵詈雑言','沈魚落雁'],'fixed_placement':True,'ignore_formal_overlap':True})
  example=self.api._build_example(candidate,target,'forward',1326230000,'win')
  self.assertEqual(len(example['turns']),8)
  self.assertEqual([turn['turn'] for turn in example['turns']],list(range(1,9)))
  self.assertTrue(any(turn['actions'] for turn in example['turns']))
  self.assertTrue(all('startTroops' in turn and 'endTroops' in turn for turn in example['turns']))

if __name__=='__main__':unittest.main()

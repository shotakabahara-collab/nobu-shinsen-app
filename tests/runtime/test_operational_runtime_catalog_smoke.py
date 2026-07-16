#!/usr/bin/env python3
import json,subprocess,sys,tarfile,tempfile,unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]


class OperationalRuntimeCatalogSmokeTest(unittest.TestCase):
 def test_every_active_skill_phase_and_officer_trait_snapshot_executes(self):
  with tempfile.TemporaryDirectory() as td:
   with tarfile.open(ROOT/'public/runtime_bundle_b223.tgz','r:gz') as tf:tf.extractall(td,filter='data')
   code=r'''
import json,sys
sys.path.insert(0,'.')
import browser_runtime_api as api
import battle_simulator as bs

ctx=api._ctx()

class FixedRng:
 def random(self):return 0.0
 def choice(self,values):return list(values)[0]
 def shuffle(self,values):return None
 def randint(self,start,end):return start
 def uniform(self,start,end):return start

def officer(name,force=200,intel=180,lead=160):
 return {'武将名':name,'武将ID':name,'固有戦法ID':'NONE','固有戦法名':'NONE','凸数':'0','勢力':'X','家門':name,
 '武勇_基礎':str(force),'知略_基礎':str(intel),'統率_基礎':str(lead),'速度_基礎':'100',
 '武勇_ステ振り後':str(force),'知略_ステ振り後':str(intel),'統率_ステ振り後':str(lead),
 '速度_ステ振り後':'100','行動順用速度':'100'}

def make_side(label,rows=None):
 best={'_officer_rows':rows or [officer(label+'0'),officer(label+'1'),officer(label+'2')],
       'unit_type':'騎馬','unit_coef':1.2,'attach_assignment':[]}
 side=bs.side_state(best,label)
 side._runtime_skills_by_actor_v1305={0:[],1:[],2:[]}
 return side

phases=('battle_start','turn_start','before_action','active_execute','normal_attack',
        'after_normal_attack','always','on_damage_taken','after_damage','action_end',
        'turn_end','on_retreat')
failures=[]
skill_calls=0
for sid,skill in sorted(ctx['active_skills'].items()):
 for actor in range(3):
  for turn in range(1,9):
   ally=make_side('A');enemy=make_side('B')
   ally._runtime_skills_by_actor_v1305[actor]=[skill]
   ally.last_normal_targets[actor]=0
   for phase in phases:
    ally.hp=list(ally.max_hp);enemy.hp=list(enemy.max_hp)
    try:
     bs._execute_skill_core(ctx,actor,skill,ally,enemy,FixedRng(),[],turn,phase=phase)
    except Exception as error:
     failures.append({'kind':'skill','id':sid,'actor':actor,'turn':turn,
                      'phase':phase,'error':f'{type(error).__name__}: {error}'})
    skill_calls+=1

trait_initializations=0
companions=[dict(ctx['officers'][0]),dict(ctx['officers'][1])]
for row in ctx['officers']:
 try:
  side=make_side('A',[dict(row),dict(companions[0]),dict(companions[1])])
  bs.initialize_generic_awaken_trait_runtime(ctx,side,[])
 except Exception as error:
  failures.append({'kind':'trait','officer':row.get('武将名'),'awaken':row.get('凸数'),
                   'error':f'{type(error).__name__}: {error}'})
 trait_initializations+=1

payload={'activeSkills':len(ctx['active_skills']),'skillCalls':skill_calls,
         'traitRows':len(ctx['trait_effects']),'traitInitializations':trait_initializations,
         'failures':failures}
print(json.dumps(payload,ensure_ascii=False))
if failures:raise SystemExit(json.dumps(failures[:20],ensure_ascii=False))
'''
   result=subprocess.run([sys.executable,'-c',code],cwd=Path(td)/'02_ENGINE',text=True,capture_output=True,check=True)
   payload=json.loads(result.stdout)
   self.assertEqual(payload['activeSkills'],233)
   self.assertEqual(payload['skillCalls'],233*3*8*12)
   self.assertEqual(payload['traitRows'],584)
   self.assertEqual(payload['traitInitializations'],876)
   self.assertEqual(payload['failures'],[])


if __name__=='__main__':unittest.main()

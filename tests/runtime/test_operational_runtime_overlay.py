#!/usr/bin/env python3
import json,subprocess,sys,tarfile,tempfile,unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]


class OperationalRuntimeOverlayTest(unittest.TestCase):
 def test_exact_id_runtime_overlay_and_formal_audit(self):
  with tempfile.TemporaryDirectory() as td:
   with tarfile.open(ROOT/'public/runtime_bundle_b223.tgz','r:gz') as tf:tf.extractall(td,filter='data')
   code=r'''
import json,sys
sys.path.insert(0,'.')
import browser_runtime_api as api
import battle_simulator as bs
from operational_runtime_overlay import INTRINSIC_SKILL_ID_DELEGATES,audit_best

ctx=api._ctx()
assert ctx['nobu_companion_runtime_overlay_version']=='nobu-companion-runtime-overlay-v1'

class FixedRng:
 def __init__(self,values=None):self.values=list(values or [0.0]*200)
 def random(self):return self.values.pop(0) if self.values else 0.0
 def choice(self,values):return list(values)[0]
 def shuffle(self,values):return None

def officer(name,sid='NONE',force=200,intel=180,lead=160,faction='X'):
 return {'武将名':name,'武将ID':name,'固有戦法ID':sid,'固有戦法名':sid,'凸数':'0','勢力':faction,'家門':name,
 '武勇_基礎':str(force),'知略_基礎':str(intel),'統率_基礎':str(lead),'速度_基礎':'100',
 '武勇_ステ振り後':str(force),'知略_ステ振り後':str(intel),'統率_ステ振り後':str(lead),
 '速度_ステ振り後':'100','行動順用速度':'100'}

def make_side(label,skills=None,officers=None):
 best={'_officer_rows':officers or [officer(label+'0'),officer(label+'1'),officer(label+'2')],
       'unit_type':'騎馬','unit_coef':1.2,'attach_assignment':[]}
 side=bs.side_state(best,label)
 side._runtime_skills_by_actor_v1305={0:[],1:[],2:[]}
 for idx,rows in (skills or {}).items():side._runtime_skills_by_actor_v1305[idx]=rows
 return side

def skill(sid):return bs.find_skill(ctx,sid)

# Historical officer intrinsic IDs resolve to executable canonical rows.
for source,target in INTRINSIC_SKILL_ID_DELEGATES.items():
 assert skill(source)['skill_id']==target,(source,skill(source))

# 独立独歩 must support assault only, never ordinary active tactics.
side=make_side('A',{0:[skill('KNP_10009')]})
side.best['attach_assignment']=[{'role':'大将','skill_id':'KNP_10009','skill_name':'独立独歩'}]
assert bs.activation_bonus_for(0,skill('KNY_ADD_0147'),side,ctx)==0.0
assert abs(bs.activation_bonus_for(0,skill('KNP_10034'),side,ctx)-0.17)<1e-9

# 弓調馬服: fixed target, main-stat -100 and disclosed base20 both-stat branch.
a=make_side('A',{0:[skill('KNP_10021')]});b=make_side('B');logs=[]
bs._execute_skill_core(ctx,0,skill('KNP_10021'),a,b,FixedRng([0.0]),logs,1)
assert b.timed_stat_bonuses[0]['武勇_弓調馬服']['value']==-100
assert b.timed_stat_bonuses[0]['知略_弓調馬服']['value']==-100

# 槍の鈴: prior normal target blade232 and T3 wounded-troop recovery54.
a=make_side('A',{0:[skill('KNP_10034')]});b=make_side('B');a.last_normal_targets[0]=0
a.hp[0]=7000;a.wounded[0]=3000;before_enemy=b.hp[0];logs=[]
bs._execute_skill_core(ctx,0,skill('KNP_10034'),a,b,FixedRng(),logs,3,phase='after_normal_attack')
assert b.hp[0]<before_enemy and a.hp[0]>7000 and a.wounded[0]<3000
assert bs.row_phase_kind({'skill_id':'KNP_10034','turn_event_phase':'ターン開始'})=='after_normal_attack'

# 奮戦: combo plus exact general outgoing x0.85.
a=make_side('A',{0:[skill('KNP_10045')]});b=make_side('B');logs=[]
bs._execute_skill_core(ctx,0,skill('KNP_10045'),a,b,FixedRng(),logs,1)
assert a.zengo_combo_turns[0]==1 and a.timed_general_damage_dealt_mult[0]['奮戦']['mult']==0.85

# 腹中鱗甲 role branch and active 反撃 state both cause non-recursive troop loss.
a=make_side('A');b=make_side('B',{1:[skill('KNP_10044')],2:[skill('KNP_10052')]});logs=[]
bs._execute_skill_core(ctx,2,skill('KNP_10052'),b,a,FixedRng(),logs,1)
before=a.hp[0]
bs.maybe_trigger_dousatsu_hangeki_normal_counter(ctx,b,a,1,0,100,FixedRng(),logs,1)
after_passive=a.hp[0]
bs.maybe_trigger_dousatsu_hangeki_normal_counter(ctx,b,a,2,0,100,FixedRng(),logs,1)
assert before>after_passive>a.hp[0]
assert any('role=副将 ratio=0.62' in line for line in logs)

# Prepared 不意打ち shares one duration roll and applies one random control per target.
a=make_side('A',{0:[skill('KNY_ADD_0147')]});b=make_side('B');logs=[]
bs._execute_skill_core(ctx,0,skill('KNY_ADD_0147'),a,b,FixedRng([0.0,0.0,0.0]),logs,2)
assert b.controls[0].get('無策')==2 and b.controls[1].get('無策')==2

# 月華鶴影 counts friend hits, not holder hits; fourth event grants one critical stack.
a=make_side('A');b=make_side('B',{0:[skill('KNY_0017')]});logs=[]
for turn in range(1,5):
 bs.maybe_trigger_dousatsu_hangeki_normal_counter(ctx,b,a,1,0,100,FixedRng([1.0]),logs,turn)
assert b.runtime_gekka_friend_hit_counts[0]==4
assert b.runtime_gekka_critical_stacks[0]==1
assert b.persistent_critical_rate_bonus[0]==0.25

# 軍神 commander pre-action charge, max-stack normal multiplier/reset, and ranbu block.
a=make_side('A',{0:[skill('KNY_0015')]});b=make_side('B');logs=[]
bs.apply_phase_effects(ctx,a,b,a._runtime_skills_by_actor_v1305,'before_action',1,FixedRng(),logs,only_actor=0)
assert a.charge_counts[0]==1
a.charge_counts[0]=12
before_total=sum(b.hp)
assert bs.normal_attack(ctx,0,a,b,FixedRng([0.2]*20),logs,1,enemy_skills=b._runtime_skills_by_actor_v1305)
assert sum(b.hp)<before_total and a.charge_counts[0]==0
bs.grant_ichiriki_ranbu_state(a,0,0.70,2,'test',logs,1)
assert not a.ichiriki_ranbu_states[0]

# Remaining strict bundles.
checks={}
for sid,phase in [('KNY_ADD_0181','after_normal_attack'),('KNY_ADD_0189','active_execute'),
                  ('TRN_0112','battle_start'),('KNP_10057','active_execute'),
                  ('KNY_ADD_0183','after_normal_attack'),('KNP_10056','after_normal_attack')]:
 a=make_side('A',{0:[skill(sid)]});b=make_side('B');a.last_normal_targets[0]=0;logs=[]
 before=b.hp[0]
 fired=bs._execute_skill_core(ctx,0,skill(sid),a,b,FixedRng(),logs,1,phase=phase)
 assert fired
 checks[sid]={'combo':a.zengo_combo_turns[0],'hpLoss':before-b.hp[0],
              'controls':b.controls,'dealt':b.timed_general_damage_dealt_mult,
              'stats':b.timed_stat_bonuses[0]}
assert checks['KNY_ADD_0181']['combo']==2
assert checks['KNY_ADD_0189']['dealt'][0]['威圧_戦法']['mult']==0.85
assert checks['TRN_0112']['dealt'][0]['深慮遠謀']['mult']==0.72
assert checks['KNP_10057']['controls'][0].get('挑発')==1
assert checks['KNY_ADD_0183']['stats']['統率_一触即発']['value']==-140
assert checks['KNP_10056']['hpLoss']>0

# 古狸 reconnects the precomputed faction lane when two allies share a faction.
spec={'officers':['徳川家康','山県昌景','飯富虎昌'],'awaken':[1,5,5],'unit':'騎馬',
      'skills':['一行三昧','回天転運','会盟の陣','以戦養戦','乗勝追撃','縦横馳突']}
best=api._make(spec);old_fox=bs.side_state(best,'A');logs=[]
bs.initialize_generic_awaken_trait_runtime(ctx,old_fox,logs)
assert old_fox.officers[0]['勢力']=='武田'
assert best['faction_buff_active'] and best['faction_buff_attack_coef']==1.07

# Missing source text remains explicit and must not be replaced by a fake effect.
unresolved=audit_best({'_officer_rows':[officer('鳥居元忠','KNY_ADD_0160')],'attach_assignment':[]})
assert not unresolved['formalReady'] and unresolved['unresolved'][0]['id']=='KNY_ADD_0160'
for name,trait in [('まつ','淑徳'),('お初','手足之愛')]:
 spec={'officers':[name,'山県昌景','飯富虎昌'],'awaken':[0,5,5],'unit':'騎馬',
       'skills':['一行三昧','回天転運','会盟の陣','以戦養戦','乗勝追撃','縦横馳突']}
 best=api._make(spec)
 assert best['formal_status']=='OPERATIONAL_ONLY_RUNTIME_EVIDENCE_INCOMPLETE'
 assert best['runtime_overlay_audit']['unresolved'][0]['id']==trait

# An audit implementation error must fail closed instead of silently admitting
# the formation to formal scoring.
original_cumulative=bs.cumulative_traits_for_officer
try:
 def broken_cumulative(*args,**kwargs):raise RuntimeError('forced trait audit failure')
 bs.cumulative_traits_for_officer=broken_cumulative
 failed_audit=audit_best({'_officer_rows':[officer('監査対象')],'attach_assignment':[]},ctx)
 assert not failed_audit['formalReady']
 assert failed_audit['unresolved'][0]['id']=='TRAIT_RUNTIME_AUDIT_ERROR'
finally:
 bs.cumulative_traits_for_officer=original_cumulative

print(json.dumps({'overlay':ctx['nobu_companion_runtime_overlay_version'],'checks':checks},ensure_ascii=False))
'''
   result=subprocess.run([sys.executable,'-c',code],cwd=Path(td)/'02_ENGINE',text=True,capture_output=True,check=True)
   payload=json.loads(result.stdout)
   self.assertEqual(payload['overlay'],'nobu-companion-runtime-overlay-v1')
   self.assertGreater(payload['checks']['KNP_10056']['hpLoss'],0)


if __name__=='__main__':unittest.main()

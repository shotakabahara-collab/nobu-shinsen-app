#!/usr/bin/env python3
import hashlib,io,json,sys,tarfile,unittest,zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
LOCK=json.loads((ROOT/'canonical/LOCK.json').read_text())
sys.path.insert(0,str(ROOT/'scripts'))
from canonical_archive import canonical_archive_bytes

def sha_bytes(value):return hashlib.sha256(value).hexdigest()

class RuntimeIntegrityTest(unittest.TestCase):
 def test_canonical_and_battle_runtime_hashes(self):
  archive=canonical_archive_bytes(ROOT,LOCK['archive'],LOCK['archiveSha256'])
  self.assertEqual(sha_bytes(archive),LOCK['archiveSha256'])
  with zipfile.ZipFile(io.BytesIO(archive)) as archive_zip:
   self.assertEqual(sha_bytes(archive_zip.read(LOCK['battleRuntimePath'])),LOCK['battleRuntimeSha256'])

 def test_bundle_is_unique_and_keeps_battle_runtime(self):
  bundle_path=ROOT/'public/runtime_bundle_b223.tgz'
  self.assertEqual(sha_bytes(bundle_path.read_bytes()),LOCK['runtimeBundleSha256'])
  with tarfile.open(bundle_path,'r:gz') as bundle:
   names=bundle.getnames()
   self.assertEqual(len(names),len(set(names)))
   self.assertEqual(sha_bytes(bundle.extractfile(LOCK['battleRuntimePath']).read()),LOCK['battleRuntimeSha256'])
   self.assertIn('02_ENGINE/browser_runtime_api.py',names)

 def test_generated_officer_catalog_matches_canonical_db(self):
  catalog_bytes=(ROOT/'public/canonical_officer_catalog.json').read_bytes()
  catalog=json.loads(catalog_bytes)
  self.assertEqual(catalog['schemaVersion'],1)
  self.assertEqual(catalog['canonicalVersion'],LOCK['canonicalVersion'])
  self.assertEqual(catalog['canonicalArchiveSha256'],LOCK['archiveSha256'])
  self.assertEqual(catalog['unitLevelRule'],{'baseLevel':5,'defaultCap':10,'capUnlockMode':'unbounded'})
  self.assertEqual(catalog['officerCount'],len(catalog['officers']))
  names=[row['name'] for row in catalog['officers']]
  self.assertEqual(len(names),len(set(names)))
  by_name={row['name']:row for row in catalog['officers']}
  self.assertEqual(by_name['松永久秀']['inherentSkill'],'梟雄の計')
  self.assertEqual(by_name['鈴木佐大夫']['inherentSkill'],'弾嵐雨霞')
  self.assertEqual(by_name['蜂須賀家政']['inherentSkill'],'未確認')
  self.assertNotIn('有備無患',{row['inherentSkill'] for row in catalog['officers']})
  self.assertIn({
   'officerName':'蜂須賀家政',
   'rejectedInherentSkill':'有備無患',
   'replacement':'未確認',
   'reason':'ユーザー確定情報：有備無患は固有戦法ではなく装着戦法',
  },catalog['corrections'])
  self.assertIn({'name':'砲術Ⅲ','unlockedAt':3,'unitTypes':['鉄砲'],'levelBonus':3,'capUnlock':False,'capBonus':0},by_name['松永久秀']['unitLevelTraits'])
  self.assertIn({'name':'騎兵大将','unlockedAt':0,'unitTypes':['騎馬'],'levelBonus':3,'capUnlock':True,'capBonus':1},by_name['柿崎景家']['unitLevelTraits'])

 def test_generated_skill_catalog_matches_canonical_db(self):
  catalog_bytes=(ROOT/'public/canonical_skill_catalog.json').read_bytes()
  catalog=json.loads(catalog_bytes)
  self.assertEqual(catalog['schemaVersion'],1)
  self.assertEqual(catalog['canonicalVersion'],LOCK['canonicalVersion'])
  self.assertEqual(catalog['canonicalArchiveSha256'],LOCK['archiveSha256'])
  self.assertEqual(catalog['skillCount'],len(catalog['skills']))
  names=[row['name'] for row in catalog['skills']]
  self.assertEqual(len(names),len(set(names)))
  by_name={row['name']:row for row in catalog['skills']}
  self.assertTrue(by_name['紅蓮の炎']['attachable'])
  self.assertFalse(by_name['梟雄の計']['attachable'])
  self.assertEqual(by_name['有備無患']['type'],'能動')
  self.assertTrue(by_name['有備無患']['attachable'])
  self.assertTrue(all(isinstance(row.get('unitLevelEffects'),list) for row in catalog['skills']))
  self.assertEqual(by_name['紅蓮の炎']['unitLevelEffects'],[])

 def test_bundle_manifest_matches_release_lock(self):
  manifest=json.loads((ROOT/'public/runtime_bundle_b223.manifest.json').read_text())
  officer_bytes=(ROOT/'public/canonical_officer_catalog.json').read_bytes()
  skill_bytes=(ROOT/'public/canonical_skill_catalog.json').read_bytes()
  self.assertEqual(manifest['canonicalArchiveSha256'],LOCK['archiveSha256'])
  self.assertEqual(manifest['battleRuntimeSha256'],LOCK['battleRuntimeSha256'])
  self.assertEqual(manifest['bundleSha256'],LOCK['runtimeBundleSha256'])
  self.assertEqual(manifest['duplicateMemberCount'],0)
  self.assertEqual(manifest['officerCatalogSha256'],sha_bytes(officer_bytes))
  self.assertEqual(manifest['officerCatalogCount'],json.loads(officer_bytes)['officerCount'])
  self.assertEqual(manifest['skillCatalogSha256'],sha_bytes(skill_bytes))
  self.assertEqual(manifest['skillCatalogCount'],json.loads(skill_bytes)['skillCount'])

if __name__=='__main__':unittest.main()

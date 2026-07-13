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

 def test_bundle_manifest_matches_release_lock(self):
  manifest=json.loads((ROOT/'public/runtime_bundle_b223.manifest.json').read_text())
  self.assertEqual(manifest['canonicalArchiveSha256'],LOCK['archiveSha256'])
  self.assertEqual(manifest['battleRuntimeSha256'],LOCK['battleRuntimeSha256'])
  self.assertEqual(manifest['bundleSha256'],LOCK['runtimeBundleSha256'])
  self.assertEqual(manifest['duplicateMemberCount'],0)

if __name__=='__main__':unittest.main()

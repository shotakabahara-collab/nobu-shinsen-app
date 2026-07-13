#!/usr/bin/env python3
import hashlib,json,tarfile,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];LOCK=json.loads((ROOT/'canonical/LOCK.json').read_text())
def sha_bytes(v):return hashlib.sha256(v).hexdigest()
class RuntimeIntegrityTest(unittest.TestCase):
 def test_canonical_and_battle_runtime_hashes(self):
  archive=(ROOT/'canonical'/LOCK['archive']).read_bytes();self.assertEqual(sha_bytes(archive),LOCK['archiveSha256'])
  with zipfile.ZipFile(ROOT/'canonical'/LOCK['archive']) as z:self.assertEqual(sha_bytes(z.read(LOCK['battleRuntimePath'])),LOCK['battleRuntimeSha256'])
 def test_bundle_is_unique_and_keeps_battle_runtime(self):
  with tarfile.open(ROOT/'public/runtime_bundle_b223.tgz','r:gz') as tf:
   names=tf.getnames();self.assertEqual(len(names),len(set(names)));self.assertEqual(sha_bytes(tf.extractfile(LOCK['battleRuntimePath']).read()),LOCK['battleRuntimeSha256']);self.assertIn('02_ENGINE/browser_runtime_api.py',names)
if __name__=='__main__':unittest.main()

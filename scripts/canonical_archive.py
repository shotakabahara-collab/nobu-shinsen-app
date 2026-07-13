from __future__ import annotations
import hashlib
from pathlib import Path

def canonical_archive_bytes(root:Path,archive_name:str,expected_sha256:str)->bytes:
    archive=root/'canonical'/archive_name
    if archive.exists():
        data=archive.read_bytes()
        if hashlib.sha256(data).hexdigest()==expected_sha256:return data
    parts=sorted((root/'canonical'/'chunks').glob(f'{archive_name}.part-*'))
    if not parts:raise RuntimeError('canonical archive is missing and no protected chunks exist')
    data=b''.join(part.read_bytes() for part in parts)
    if hashlib.sha256(data).hexdigest()!=expected_sha256:raise RuntimeError('canonical archive SHA mismatch')
    return data

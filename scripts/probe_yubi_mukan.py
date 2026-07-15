#!/usr/bin/env python3
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
officers=json.loads((root/'public/canonical_officer_catalog.json').read_text(encoding='utf-8'))['officers']
skills=json.loads((root/'public/canonical_skill_catalog.json').read_text(encoding='utf-8'))['skills']
result={
 'officer':next((row for row in officers if row.get('name')=='鈴木佐大夫'),None),
 'skill':next((row for row in skills if row.get('name')=='有備無患'),None),
 'officers_with_yubi_mukan_inherent':[row.get('name') for row in officers if row.get('inherentSkill')=='有備無患'],
}
(root/'yubi-mukan-probe.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))

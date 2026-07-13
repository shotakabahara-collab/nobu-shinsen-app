import {describe,expect,it} from 'vitest';import {normalizeCanonicalTroops} from './database';

describe('normalizeCanonicalTroops',()=>{it('migrates legacy variable troops to the b223 formal value',()=>{const legacy={id:'legacy',troops:9000};expect(normalizeCanonicalTroops(legacy)).toBe(true);expect(legacy.troops).toBe(10000);});it('does not rewrite canonical records',()=>{const canonical={id:'current',troops:10000};expect(normalizeCanonicalTroops(canonical)).toBe(false);expect(canonical.troops).toBe(10000);});});

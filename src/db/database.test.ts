import {describe,expect,it} from 'vitest';
import {isRequestedTestFormationName,normalizeCanonicalTroops} from './database';

describe('normalizeCanonicalTroops',()=>{
 it('migrates legacy variable troops to the b223 formal value',()=>{
  const legacy={id:'legacy',troops:9000};
  expect(normalizeCanonicalTroops(legacy)).toBe(true);
  expect(legacy.troops).toBe(10000);
 });
 it('does not rewrite canonical records',()=>{
  const canonical={id:'current',troops:10000};
  expect(normalizeCanonicalTroops(canonical)).toBe(false);
  expect(canonical.troops).toBe(10000);
 });
});

describe('isRequestedTestFormationName',()=>{
 it.each(['テスト1','テスト2',' テスト１ ','テスト２　'])('matches only the requested exact names: %s',name=>{
  expect(isRequestedTestFormationName(name)).toBe(true);
 });
 it.each(['テスト','テスト10','テスト1改','本番テスト1','山本騎馬',null,1])('does not remove unrelated data: %s',name=>{
  expect(isRequestedTestFormationName(name)).toBe(false);
 });
});

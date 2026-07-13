import {describe,expect,it} from 'vitest';
import {getAppleInstallState} from './install';

describe('getAppleInstallState',()=>{
 it('offers installation in iPhone Safari',()=>expect(getAppleInstallState('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',5,false,false)).toBe('browser'));
 it('recognizes an installed home-screen app',()=>expect(getAppleInstallState('Mozilla/5.0 (iPhone)',5,true,false)).toBe('standalone'));
 it('recognizes iPadOS desktop user agents',()=>expect(getAppleInstallState('Mozilla/5.0 (Macintosh; Intel Mac OS X)',5,false,false)).toBe('browser'));
 it('does not show iPhone instructions on desktop',()=>expect(getAppleInstallState('Mozilla/5.0 (Macintosh; Intel Mac OS X)',0,false,false)).toBe('unsupported'));
});

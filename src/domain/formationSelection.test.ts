import {describe,expect,it} from 'vitest';
import type {Formation} from './schemas';
import {resolveFormationPair,resolveFormationSelection} from './formationSelection';

const now=new Date().toISOString();
const formation=(id:string,kind:Formation['kind']='ally')=>({id,name:id,kind,troopType:'騎馬',troopLevel:10,troops:10000,warriors:[] as unknown as Formation['warriors'],createdAt:now,updatedAt:now}) satisfies Formation;

describe('resolveFormationSelection',()=>{
 it('preserves a valid selection regardless of legacy kind',()=>expect(resolveFormationSelection([formation('one','enemy')],'one')).toBe('one'));
 it('replaces a deleted selection with the first registered formation',()=>expect(resolveFormationSelection([formation('two'),formation('three')],'deleted')).toBe('two'));
 it('excludes the opposing selection',()=>expect(resolveFormationSelection([formation('one'),formation('two')],'one','one')).toBe('two'));
 it('returns empty when no eligible formation exists',()=>expect(resolveFormationSelection([formation('one')],'','one')).toBe(''));
});

describe('resolveFormationPair',()=>{
 it('selects two distinct registered formations without kind filtering',()=>expect(resolveFormationPair([formation('ally','ally'),formation('enemy','enemy')],'','')).toEqual(['ally','enemy']));
 it('keeps valid distinct selections',()=>expect(resolveFormationPair([formation('a'),formation('b')],'b','a')).toEqual(['b','a']));
});

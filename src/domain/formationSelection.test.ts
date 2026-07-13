import {describe,expect,it} from 'vitest';
import type {Formation} from './schemas';
import {resolveFormationSelection} from './formationSelection';

const now=new Date().toISOString();
const formation=(id:string,kind:Formation['kind'])=>({id,name:id,kind,troopType:'騎馬',troopLevel:10,troops:10000,warriors:[] as unknown as Formation['warriors'],createdAt:now,updatedAt:now}) satisfies Formation;

describe('resolveFormationSelection',()=>{
 it('preserves a valid selection',()=>expect(resolveFormationSelection([formation('ally-1','ally')],'ally-1','ally')).toBe('ally-1'));
 it('replaces a deleted selection with the first compatible formation',()=>expect(resolveFormationSelection([formation('enemy-1','enemy'),formation('ally-2','ally')],'deleted','ally')).toBe('ally-2'));
 it('does not preserve an id whose kind changed during import',()=>expect(resolveFormationSelection([formation('same','enemy'),formation('ally-2','ally')],'same','ally')).toBe('ally-2'));
 it('returns an empty selection when no compatible formation exists',()=>expect(resolveFormationSelection([formation('enemy-1','enemy')],'deleted','ally')).toBe(''));
});

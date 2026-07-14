import Dexie,{type EntityTable,type Transaction} from 'dexie';
import type {BattleResult,Formation,SkillRecord,WarriorRecord} from '../domain/schemas';

type Tables={
 formations:EntityTable<Formation,'id'>;
 warriors:EntityTable<WarriorRecord,'id'>;
 skills:EntityTable<SkillRecord,'id'>;
 battleResults:EntityTable<BattleResult,'id'>;
};
type LegacyFormation={id?:unknown;name?:unknown;troops?:unknown;[key:string]:unknown};

const requestedRemovalNames=new Set(['テスト1','テスト2']);

export function normalizeCanonicalTroops(formation:LegacyFormation):boolean{
 if(formation.troops===10000)return false;
 formation.troops=10000;
 return true;
}

export function isRequestedTestFormationName(value:unknown):boolean{
 return typeof value==='string'&&requestedRemovalNames.has(value.normalize('NFKC').trim());
}

export async function removeRequestedTestFormations(transaction:Transaction):Promise<number>{
 const formations=transaction.table<LegacyFormation,string>('formations');
 const battleResults=transaction.table<BattleResult,string>('battleResults');
 const targets=await formations.toCollection().filter(formation=>isRequestedTestFormationName(formation.name)).toArray();
 const ids=targets.map(formation=>String(formation.id??'')).filter(Boolean);
 if(!ids.length)return 0;
 await Promise.all([
  formations.bulkDelete(ids),
  battleResults.toCollection().filter(result=>ids.includes(result.allyId)||ids.includes(result.enemyId)).delete(),
 ]);
 return ids.length;
}

export const db=new Dexie('nobu-companion') as Dexie&Tables;
db.version(1).stores({formations:'id,kind,name,updatedAt'});
db.version(2).stores({formations:'id,kind,name,updatedAt',warriors:'id,&name,updatedAt',skills:'id,&name,category,updatedAt'});
db.version(3).stores({formations:'id,kind,name,updatedAt',warriors:'id,&name,updatedAt',skills:'id,&name,category,updatedAt',battleResults:'id,allyId,enemyId,createdAt,status'});
db.version(4).stores({formations:'id,kind,name,updatedAt',warriors:'id,&name,updatedAt',skills:'id,&name,category,updatedAt',battleResults:'id,allyId,enemyId,createdAt,status'}).upgrade(transaction=>transaction.table('formations').toCollection().modify(normalizeCanonicalTroops));
db.version(5).stores({formations:'id,kind,name,updatedAt',warriors:'id,&name,updatedAt',skills:'id,&name,category,updatedAt',battleResults:'id,allyId,enemyId,createdAt,status'}).upgrade(removeRequestedTestFormations);

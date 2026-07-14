import type {Formation} from './schemas';

export function resolveFormationSelection(formations:Formation[],currentId:string,excludeId=''){
 if(formations.some(value=>value.id===currentId&&value.id!==excludeId))return currentId;
 return formations.find(value=>value.id!==excludeId)?.id??'';
}

export function resolveFormationPair(formations:Formation[],currentA:string,currentB:string):[string,string]{
 const first=resolveFormationSelection(formations,currentA);
 const second=resolveFormationSelection(formations,currentB,first);
 return [first,second];
}

import type {Formation} from './schemas';

export function resolveFormationSelection(formations:Formation[],currentId:string,kind:Formation['kind']){
 if(formations.some(value=>value.id===currentId&&value.kind===kind))return currentId;
 return formations.find(value=>value.kind===kind)?.id??'';
}

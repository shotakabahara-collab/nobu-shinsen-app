export type UnitType='足軽'|'騎馬'|'鉄砲'|'弓';

export type UnitLevelTrait={
 name:string;
 unlockedAt:number;
 unitTypes:UnitType[];
 levelBonus:number;
 capBonus:number;
};

export type OfficerUnitLevelRecord={
 name:string;
 unitLevelTraits?:UnitLevelTrait[];
};

export type FormationWarriorLike={
 name:string;
 limitBreak:number;
 equippedSkills:readonly string[];
};

export type EquippedSkillLocation={
 warriorIndex:number;
 skillIndex:number;
};

export type DuplicateEquippedSkill={
 name:string;
 first:EquippedSkillLocation;
 duplicate:EquippedSkillLocation;
};

export type TroopLevelSource={
 officerName:string;
 traitName:string;
 unlockedAt:number;
 levelBonus:number;
 capBonus:number;
};

export type TroopLevelResult={
 level:number;
 cap:number;
 baseLevel:number;
 bonus:number;
 sources:TroopLevelSource[];
 unknownOfficers:string[];
};

export function normalizeFormationName(value:string):string{
 return value.normalize('NFKC').trim();
}

export function findDuplicateEquippedSkill(warriors:readonly FormationWarriorLike[]):DuplicateEquippedSkill|undefined{
 const seen=new Map<string,{name:string;location:EquippedSkillLocation}>();
 for(let warriorIndex=0;warriorIndex<warriors.length;warriorIndex++){
  const warrior=warriors[warriorIndex];
  if(!warrior)continue;
  for(let skillIndex=0;skillIndex<warrior.equippedSkills.length;skillIndex++){
   const raw=warrior.equippedSkills[skillIndex]??'';
   const name=normalizeFormationName(raw);
   if(!name)continue;
   const key=name.toLocaleLowerCase('ja');
   const existing=seen.get(key);
   if(existing)return {name:existing.name,first:existing.location,duplicate:{warriorIndex,skillIndex}};
   seen.set(key,{name,location:{warriorIndex,skillIndex}});
  }
 }
 return undefined;
}

export function calculateTroopLevel(
 troopType:UnitType,
 warriors:readonly Pick<FormationWarriorLike,'name'|'limitBreak'>[],
 officers:readonly OfficerUnitLevelRecord[],
 rule:{baseLevel?:number;defaultCap?:number;generalTraitCap?:number}={}
):TroopLevelResult{
 const baseLevel=rule.baseLevel??5;
 const defaultCap=rule.defaultCap??10;
 const generalTraitCap=rule.generalTraitCap??11;
 const byName=new Map(officers.map(officer=>[normalizeFormationName(officer.name),officer]));
 const sources:TroopLevelSource[]=[];
 const unknownOfficers:string[]=[];
 let bonus=0;
 let cap=defaultCap;

 for(const warrior of warriors){
  const name=normalizeFormationName(warrior.name);
  if(!name)continue;
  const officer=byName.get(name);
  if(!officer){unknownOfficers.push(name);continue;}
  for(const trait of officer.unitLevelTraits??[]){
   if(trait.unlockedAt>warrior.limitBreak||!trait.unitTypes.includes(troopType))continue;
   if(trait.levelBonus<=0&&trait.capBonus<=0)continue;
   bonus+=trait.levelBonus;
   cap=Math.min(generalTraitCap,Math.max(cap,defaultCap+trait.capBonus));
   sources.push({officerName:name,traitName:trait.name,unlockedAt:trait.unlockedAt,levelBonus:trait.levelBonus,capBonus:trait.capBonus});
  }
 }

 return {level:Math.min(baseLevel+bonus,cap),cap,baseLevel,bonus,sources,unknownOfficers};
}

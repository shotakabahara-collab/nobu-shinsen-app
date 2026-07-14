export type UnitType='足軽'|'騎馬'|'鉄砲'|'弓';

export type UnitLevelTrait={
 name:string;
 unlockedAt:number;
 unitTypes:UnitType[];
 levelBonus:number;
 capUnlock:boolean;
 capBonus:number;
};

export type UnitLevelSkillEffect={
 name:string;
 unitTypes:UnitType[];
 levelBonus:number;
 capUnlock:boolean;
};

export type OfficerUnitLevelRecord={
 name:string;
 unitLevelTraits?:UnitLevelTrait[];
};

export type SkillUnitLevelRecord={
 name:string;
 unitLevelEffects?:UnitLevelSkillEffect[];
};

export type FormationWarriorLike={
 name:string;
 limitBreak:number;
 inherentSkill?:string;
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
 sourceType:'trait'|'skill';
 sourceName:string;
 officerName?:string;
 unlockedAt?:number;
 levelBonus:number;
 capUnlock:boolean;
};

export type TroopLevelResult={
 level:number;
 cap:number|null;
 capUnlocked:boolean;
 baseLevel:number;
 bonus:number;
 sources:TroopLevelSource[];
 unknownOfficers:string[];
};

export type UnitLevelRule={
 baseLevel?:number;
 defaultCap?:number;
 capUnlockMode?:'unbounded';
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
 warriors:readonly FormationWarriorLike[],
 officers:readonly OfficerUnitLevelRecord[],
 skills:readonly SkillUnitLevelRecord[]=[],
 rule:UnitLevelRule={}
):TroopLevelResult{
 const baseLevel=rule.baseLevel??5;
 const defaultCap=rule.defaultCap??10;
 const officerByName=new Map(officers.map(officer=>[normalizeFormationName(officer.name),officer]));
 const skillByName=new Map(skills.map(skill=>[normalizeFormationName(skill.name),skill]));
 const sources:TroopLevelSource[]=[];
 const unknownOfficers:string[]=[];
 const activeSkillNames=new Set<string>();
 let bonus=0;
 let capUnlocked=false;

 for(const warrior of warriors){
  const officerName=normalizeFormationName(warrior.name);
  if(officerName){
   const officer=officerByName.get(officerName);
   if(!officer)unknownOfficers.push(officerName);
   else{
    for(const trait of officer.unitLevelTraits??[]){
     if(trait.unlockedAt>warrior.limitBreak||!trait.unitTypes.includes(troopType))continue;
     if(trait.levelBonus<=0&&!trait.capUnlock&&trait.capBonus<=0)continue;
     bonus+=trait.levelBonus;
     const unlock=trait.capUnlock||trait.capBonus>0;
     capUnlocked=capUnlocked||unlock;
     sources.push({sourceType:'trait',sourceName:trait.name,officerName,unlockedAt:trait.unlockedAt,levelBonus:trait.levelBonus,capUnlock:unlock});
    }
   }
  }
  for(const rawSkill of [warrior.inherentSkill??'',...warrior.equippedSkills]){
   const skillName=normalizeFormationName(rawSkill);
   if(skillName)activeSkillNames.add(skillName);
  }
 }

 for(const skillName of activeSkillNames){
  const skill=skillByName.get(skillName);
  if(!skill)continue;
  for(const effect of skill.unitLevelEffects??[]){
   if(!effect.unitTypes.includes(troopType))continue;
   if(effect.levelBonus<=0&&!effect.capUnlock)continue;
   bonus+=effect.levelBonus;
   capUnlocked=capUnlocked||effect.capUnlock;
   sources.push({sourceType:'skill',sourceName:skillName===effect.name?skillName:`${skillName}「${effect.name}」`,levelBonus:effect.levelBonus,capUnlock:effect.capUnlock});
  }
 }

 const rawLevel=baseLevel+bonus;
 const cap=capUnlocked?null:defaultCap;
 const level=capUnlocked?rawLevel:Math.min(rawLevel,defaultCap);
 return {level,cap,capUnlocked,baseLevel,bonus,sources,unknownOfficers};
}

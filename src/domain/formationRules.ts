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

export type FormalSkillRecord={
 name:string;
 type?:string;
 attachable?:boolean;
 slotType?:'normal'|'unitType'|'formation';
 allowedUnitTypes?:readonly UnitType[];
};

export type FormalFormationSkillIssue={
 code:'unknown-skill'|'not-attachable'|'unit-type-skill-limit'|'formation-skill-limit'|'unit-type-mismatch';
 message:string;
 skillNames:string[];
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

function formalSlotType(skill:FormalSkillRecord):'normal'|'unitType'|'formation'{
 if(skill.slotType)return skill.slotType;
 if(skill.type==='兵種')return 'unitType';
 if(skill.type==='陣形')return 'formation';
 return 'normal';
}

export function validateFormalFormationSkills(
 troopType:UnitType,
 warriors:readonly FormationWarriorLike[],
 skills:readonly FormalSkillRecord[],
):FormalFormationSkillIssue[]{
 const byName=new Map(skills.map(skill=>[normalizeFormationName(skill.name),skill]));
 const equipped=warriors.flatMap(warrior=>warrior.equippedSkills.map(rawName=>{
  const name=normalizeFormationName(rawName);
  return {name,skill:byName.get(name)};
 })).filter(row=>row.name);
 const issues:FormalFormationSkillIssue[]=[];

 for(const row of equipped){
  if(!row.skill){
   issues.push({code:'unknown-skill',skillNames:[row.name],message:`「${row.name}」を正本戦法データで確認できません。正本候補から選び直してください。`});
   continue;
  }
  if(row.skill.attachable===false){
   issues.push({code:'not-attachable',skillNames:[row.name],message:`「${row.name}」は装着戦法として使用できません。`});
  }
 }

 const resolved=equipped.filter((row):row is {name:string;skill:FormalSkillRecord}=>Boolean(row.skill));
 const unitTypeSkills=resolved.filter(row=>formalSlotType(row.skill)==='unitType');
 if(unitTypeSkills.length>1){
  const names=unitTypeSkills.map(row=>row.name);
  issues.push({code:'unit-type-skill-limit',skillNames:names,message:`兵種戦法は1編成に1つまでです。${names.map(name=>`「${name}」`).join('・')}を同時には装着できません。いずれか1つだけを残してください。`});
 }
 const formationSkills=resolved.filter(row=>formalSlotType(row.skill)==='formation');
 if(formationSkills.length>1){
  const names=formationSkills.map(row=>row.name);
  issues.push({code:'formation-skill-limit',skillNames:names,message:`陣形戦法は1編成に1つまでです。${names.map(name=>`「${name}」`).join('・')}を同時には装着できません。いずれか1つだけを残してください。`});
 }
 for(const row of resolved){
  const allowed=row.skill.allowedUnitTypes??[];
  if(allowed.length>0&&!allowed.includes(troopType)){
   issues.push({code:'unit-type-mismatch',skillNames:[row.name],message:`「${row.name}」は${allowed.join('・')}専用のため、${troopType}編成では使用できません。`});
  }
 }
 return issues;
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

import type {UnitType} from '../domain/formationRules';
import type {WarriorRecord} from '../domain/schemas';
import type {CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import type {CanonicalSkill} from '../services/canonicalSkillCatalog';

export type ImportConfidence='high'|'medium'|'low'|'missing';
export type ImportedField<T>={value:T|null;confidence:ImportConfidence;evidence:string};
export type ImportedWarrior={
 name:ImportedField<string>;
 limitBreak:ImportedField<number>;
 equippedSkills:[ImportedField<string>,ImportedField<string>];
};
export type FormationImageDraft={
 troopType:ImportedField<UnitType>;
 warriors:[ImportedWarrior,ImportedWarrior,ImportedWarrior];
 warnings:string[];
 rawText:string;
};
export type OcrPage={text:string;confidence?:number};

type TextMatch={name:string;index:number;score:number;evidence:string};

const unitAliases:{type:UnitType;aliases:string[]}[]=[
 {type:'足軽',aliases:['足軽','槍兵','歩兵']},
 {type:'騎馬',aliases:['騎馬','騎兵','馬兵']},
 {type:'鉄砲',aliases:['鉄砲','鉄炮','鉄砲兵','砲兵']},
 {type:'弓',aliases:['弓兵','弓']},
];

export function normalizeImageText(value:string):string{
 return value.normalize('NFKC').replace(/鉄炮/g,'鉄砲').replace(/[‐‑‒–—―]/g,'-');
}

function compact(value:string):string{
 return normalizeImageText(value).replace(/[\s\p{P}\p{S}]/gu,'');
}

function levenshtein(a:string,b:string):number{
 if(a===b)return 0;
 if(!a.length)return b.length;
 if(!b.length)return a.length;
 const previous=Array.from({length:b.length+1},(_,index)=>index);
 for(let i=1;i<=a.length;i++){
  let left=i;let diagonal=i-1;
  for(let j=1;j<=b.length;j++){
   const above=previous[j]!;
   const value=Math.min(above+1,left+1,diagonal+(a[i-1]===b[j-1]?0:1));
   previous[j]=value;diagonal=above;left=value;
  }
 }
 return previous[b.length]!;
}

function similarity(a:string,b:string):number{
 const longest=Math.max(a.length,b.length);
 return longest?1-levenshtein(a,b)/longest:0;
}

function fuzzyLineMatch(lines:string[],name:string):TextMatch|undefined{
 const target=compact(name);
 if(target.length<2)return undefined;
 let best:TextMatch|undefined;let cursor=0;
 for(const raw of lines){
  const line=compact(raw);
  const lineStart=cursor;cursor+=raw.length+1;
  if(!line)continue;
  if(line.includes(target))return {name,index:lineStart+line.indexOf(target),score:.96,evidence:raw.trim()};
  const min=Math.max(2,target.length-1),max=Math.min(line.length,target.length+1);
  for(let size=min;size<=max;size++)for(let start=0;start+size<=line.length;start++){
   const slice=line.slice(start,start+size);const score=similarity(target,slice);
   const threshold=target.length<=3?.8:.72;
   if(score>=threshold&&(!best||score>best.score))best={name,index:lineStart+start,score,evidence:raw.trim()};
  }
 }
 return best;
}

function catalogMatches(text:string,names:readonly string[],limit:number):TextMatch[]{
 const normalized=normalizeImageText(text);const compactText=compact(normalized);const lines=normalized.split(/\r?\n/);
 const matches:TextMatch[]=[];
 for(const name of names){
  const target=compact(name);if(!target)continue;
  const exact=compactText.indexOf(target);
  if(exact>=0){matches.push({name,index:exact,score:1,evidence:name});continue;}
  const fuzzy=fuzzyLineMatch(lines,name);if(fuzzy)matches.push(fuzzy);
 }
 const unique=new Map<string,TextMatch>();
 for(const match of matches.sort((a,b)=>b.score-a.score||a.index-b.index))if(!unique.has(match.name))unique.set(match.name,match);
 const strongest=Array.from(unique.values()).slice(0,Math.max(limit*3,limit));
 return strongest.sort((a,b)=>a.index-b.index||b.score-a.score).slice(0,limit);
}

function confidence(score:number):ImportConfidence{
 if(score>=.94)return 'high';
 if(score>=.8)return 'medium';
 return 'low';
}

function detectTroopType(text:string):ImportedField<UnitType>{
 const normalized=normalizeImageText(text);let best:{type:UnitType;index:number;alias:string}|undefined;
 for(const row of unitAliases)for(const alias of row.aliases){
  const index=normalized.indexOf(alias);
  if(index>=0&&(!best||index<best.index||alias.length>best.alias.length))best={type:row.type,index,alias};
 }
 return best?{value:best.type,confidence:'high',evidence:best.alias}:{value:null,confidence:'missing',evidence:'兵種表記を確認できませんでした'};
}

function detectLimitBreaks(text:string):{value:number;index:number;evidence:string}[]{
 const normalized=normalizeImageText(text);const matches:{value:number;index:number;evidence:string}[]=[];
 const patterns=[/([0-5])\s*凸/g,/凸\s*([0-5])/g,/([★●◆■]{1,5})/g];
 for(const pattern of patterns){
  for(const match of normalized.matchAll(pattern)){
   const raw=match[0]??'';const value=match[1]&&/^\d$/.test(match[1])?Number(match[1]):Array.from(match[1]??'').length;
   if(value>=0&&value<=5)matches.push({value,index:match.index??0,evidence:raw});
  }
 }
 return matches.sort((a,b)=>a.index-b.index);
}

function nearestUnused<T extends {index:number}>(items:T[],index:number,used:Set<number>):number|undefined{
 let selected:number|undefined;let distance=Number.POSITIVE_INFINITY;
 for(let i=0;i<items.length;i++){
  if(used.has(i))continue;const current=Math.abs(items[i]!.index-index);
  if(current<distance){distance=current;selected=i;}
 }
 return selected;
}

function emptyField<T>(evidence:string):ImportedField<T>{return {value:null,confidence:'missing',evidence};}

export function parseFormationImages(
 pages:readonly OcrPage[],
 officers:readonly CanonicalOfficer[],
 skills:readonly CanonicalSkill[],
 ownedWarriors:readonly WarriorRecord[]=[]
):FormationImageDraft{
 const rawText=pages.map(page=>page.text).join('\n');
 const officerMatches=catalogMatches(rawText,officers.map(officer=>officer.name),3);
 const inherent=new Set(officers.map(officer=>compact(officer.inherentSkill)));
 const attachable=skills.filter(skill=>skill.attachable&&!inherent.has(compact(skill.name))).map(skill=>skill.name);
 const skillMatches=catalogMatches(rawText,attachable,12).filter((match,index,array)=>array.findIndex(value=>value.name===match.name)===index);
 const awakenMatches=detectLimitBreaks(rawText);const usedAwaken=new Set<number>();
 const ownedByName=new Map(ownedWarriors.map(warrior=>[compact(warrior.name),warrior]));
 const assignedSkills:[ImportedField<string>[],ImportedField<string>[],ImportedField<string>[]]=[[],[],[]];

 for(const skill of skillMatches){
  const preceding=officerMatches.map((officer,index)=>({officer,index})).filter(row=>row.officer.index<=skill.index&&assignedSkills[row.index]!.length<2).sort((a,b)=>b.officer.index-a.officer.index)[0];
  let warriorIndex=preceding?.index;
  if(warriorIndex===undefined){
   let bestDistance=Number.POSITIVE_INFINITY;
   officerMatches.forEach((officer,index)=>{
    if(assignedSkills[index]!.length>=2)return;
    const distance=Math.abs(skill.index-officer.index);
    if(distance<bestDistance){bestDistance=distance;warriorIndex=index;}
   });
  }
  if(warriorIndex===undefined||assignedSkills[warriorIndex]!.length>=2){
   const open=assignedSkills.findIndex(values=>values.length<2);if(open>=0)warriorIndex=open;
  }
  if(warriorIndex!==undefined&&warriorIndex<3&&assignedSkills[warriorIndex]!.length<2)assignedSkills[warriorIndex]!.push({value:skill.name,confidence:confidence(skill.score),evidence:skill.evidence});
 }

 const warriors=Array.from({length:3},(_,index):ImportedWarrior=>{
  const officer=officerMatches[index];
  const name=officer?{value:officer.name,confidence:confidence(officer.score),evidence:officer.evidence}:emptyField<string>('武将名を確認できませんでした');
  let limitBreak:ImportedField<number>;
  if(officer){
   const nearest=nearestUnused(awakenMatches,officer.index,usedAwaken);
   if(nearest!==undefined){usedAwaken.add(nearest);const found=awakenMatches[nearest]!;limitBreak={value:found.value,confidence:'medium',evidence:found.evidence};}
   else{
    const owned=ownedByName.get(compact(officer.name));
    limitBreak=owned?{value:owned.limitBreak,confidence:'medium',evidence:'登録済み所有情報から補完'}:emptyField<number>('凸表示を確認できませんでした');
   }
  }else limitBreak=emptyField<number>('武将未確定のため凸も未確認です');
  const values=assignedSkills[index]??[];
  return {name,limitBreak,equippedSkills:[values[0]??emptyField<string>('装着戦法1を確認できませんでした'),values[1]??emptyField<string>('装着戦法2を確認できませんでした')]};
 }) as FormationImageDraft['warriors'];

 const warnings:string[]=[];
 if(officerMatches.length<3)warnings.push(`武将は${officerMatches.length}/3名のみ確定しました。`);
 const skillCount=warriors.flatMap(warrior=>warrior.equippedSkills).filter(field=>field.value).length;
 if(skillCount<6)warnings.push(`装着戦法は${skillCount}/6枠のみ確定しました。`);
 if(warriors.some(warrior=>warrior.limitBreak.value===null))warnings.push('凸を読み取れない武将があります。画像内に表示がない場合は手動で確認してください。');
 const troopType=detectTroopType(rawText);if(!troopType.value)warnings.push('兵種を読み取れませんでした。');

 return {troopType,warriors,warnings,rawText};
}

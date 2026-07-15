import type {UnitType} from '../domain/formationRules';
import type {WarriorRecord} from '../domain/schemas';
import type {CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import type {CanonicalSkill} from '../services/canonicalSkillCatalog';

export type ImportConfidence='high'|'medium'|'low'|'missing';
export type ImportedField<T>={value:T|null;confidence:ImportConfidence;evidence:string};
export type ImportedWarrior={name:ImportedField<string>;limitBreak:ImportedField<number>;equippedSkills:[ImportedField<string>,ImportedField<string>]};
export type FormationImageDraft={troopType:ImportedField<UnitType>;warriors:[ImportedWarrior,ImportedWarrior,ImportedWarrior];warnings:string[];rawText:string};
export type OcrRow='card'|'inherent'|'equipped1'|'equipped2';
export type OcrVariant='grayscale'|'binary'|'original';
export type OcrPage={text:string;confidence?:number;slot?:0|1|2;row?:OcrRow;layout?:'three-card';variant?:OcrVariant;limitBreak?:number;limitBreakConfidence?:'high'|'medium';limitBreakEvidence?:string};

type TextMatch={name:string;index:number;score:number;evidence:string;support:number};
type MatchBucket={name:string;support:number;totalScore:number;maxScore:number;index:number;evidence:string};

const unitAliases:{type:UnitType;aliases:string[]}[]=[
 {type:'足軽',aliases:['足軽','槍兵','歩兵']},
 {type:'騎馬',aliases:['騎馬','騎兵','馬兵']},
 {type:'鉄砲',aliases:['鉄砲','鉄炮','鉄怒','鉄砲兵','砲兵']},
 {type:'弓',aliases:['弓兵','弓']},
];

export function normalizeImageText(value:string):string{
 return value.normalize('NFKC')
  .replace(/鉄炮|鉄怒/g,'鉄砲')
  .replace(/破天の[尋農]/g,'破天の轟')
  .replace(/城[凌盗]り/g,'城盗り')
  .replace(/弾[履嵐]雨[敏銭霰霞]/g,'弾嵐雨霞')
  .replace(/有備無[足思患]/g,'有備無患')
  .replace(/[昔革草]木皆兵|革不形兵/g,'草木皆兵')
  .replace(/[類畑]?[成威]同盟/g,'姻戚同盟')
  .replace(/[‐‑‒–—―]/g,'-');
}

function compact(value:string):string{return normalizeImageText(value).replace(/[\s\p{P}\p{S}]/gu,'');}

function levenshtein(a:string,b:string):number{
 if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
 const previous=Array.from({length:b.length+1},(_,index)=>index);
 for(let i=1;i<=a.length;i++){
  let left=i,diagonal=i-1;
  for(let j=1;j<=b.length;j++){
   const above=previous[j]!;
   const value=Math.min(above+1,left+1,diagonal+(a[i-1]===b[j-1]?0:1));
   previous[j]=value;diagonal=above;left=value;
  }
 }
 return previous[b.length]!;
}

function similarity(a:string,b:string):number{const longest=Math.max(a.length,b.length);return longest?1-levenshtein(a,b)/longest:0;}

function fuzzyLineMatch(lines:string[],name:string):TextMatch|undefined{
 const target=compact(name);if(target.length<2)return undefined;
 let best:TextMatch|undefined,cursor=0;
 for(const raw of lines){
  const line=compact(raw),lineStart=cursor;cursor+=raw.length+1;
  if(!line)continue;
  if(line.includes(target))return {name,index:lineStart+line.indexOf(target),score:.96,evidence:raw.trim(),support:1};
  const min=Math.max(2,target.length-1),max=Math.min(line.length,target.length+1);
  for(let size=min;size<=max;size++)for(let start=0;start+size<=line.length;start++){
   const slice=line.slice(start,start+size),score=similarity(target,slice),threshold=target.length<=3?.8:.72;
   if(score>=threshold&&(!best||score>best.score))best={name,index:lineStart+start,score,evidence:raw.trim(),support:1};
  }
 }
 return best;
}

function catalogMatches(text:string,names:readonly string[],limit:number):TextMatch[]{
 const normalized=normalizeImageText(text),compactText=compact(normalized),lines=normalized.split(/\r?\n/),matches:TextMatch[]=[];
 for(const name of names){
  const target=compact(name);if(!target)continue;
  const exact=compactText.indexOf(target);
  if(exact>=0){matches.push({name,index:exact,score:1,evidence:name,support:1});continue;}
  const fuzzy=fuzzyLineMatch(lines,name);if(fuzzy)matches.push(fuzzy);
 }
 const unique=new Map<string,TextMatch>();
 for(const match of matches.sort((a,b)=>b.score-a.score||a.index-b.index))if(!unique.has(match.name))unique.set(match.name,match);
 const strongest=Array.from(unique.values()).slice(0,Math.max(limit*3,limit));
 return strongest.sort((a,b)=>a.index-b.index||b.score-a.score).slice(0,limit);
}

function pageWeight(page:OcrPage):number{
 const confidence=typeof page.confidence==='number'?Math.max(0,Math.min(100,page.confidence))/100:.65;
 return .82+confidence*.18;
}

function consensusCatalogMatches(pages:readonly OcrPage[],names:readonly string[],limit:number,excluded:ReadonlySet<string>=new Set()):TextMatch[]{
 const buckets=new Map<string,MatchBucket>();
 for(const page of pages){
  const pageMatches=catalogMatches(page.text,names,Math.min(3,Math.max(1,limit+1))).filter(match=>!excluded.has(match.name));
  const seen=new Set<string>();
  pageMatches.forEach((match,rank)=>{
   if(seen.has(match.name))return;seen.add(match.name);
   const weighted=match.score*pageWeight(page)*(rank===0?1:.94);
   const current=buckets.get(match.name)??{name:match.name,support:0,totalScore:0,maxScore:0,index:match.index,evidence:match.evidence};
   current.support+=1;current.totalScore+=weighted;current.maxScore=Math.max(current.maxScore,weighted);current.index=Math.min(current.index,match.index);
   if(weighted>=current.maxScore)current.evidence=match.evidence;
   buckets.set(match.name,current);
  });
 }
 return Array.from(buckets.values()).map(bucket=>{
  const average=bucket.totalScore/Math.max(1,bucket.support);
  const score=Math.min(1,average+Math.min(.12,(bucket.support-1)*.045));
  return {name:bucket.name,index:bucket.index,score,support:bucket.support,evidence:bucket.support>=2?`${bucket.support}回のOCRで一致：${bucket.evidence}`:bucket.evidence};
 }).sort((a,b)=>b.support-a.support||b.score-a.score||a.index-b.index).slice(0,limit);
}

function fieldConfidence(match:TextMatch):ImportConfidence{
 if(match.score>=.94||(match.support>=2&&match.score>=.82))return 'high';
 if(match.score>=.78||match.support>=2)return 'medium';
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
 const normalized=normalizeImageText(text),matches:{value:number;index:number;evidence:string}[]=[];
 const patterns=[/([0-5])\s*凸/g,/凸\s*([0-5])/g,/([★●◆■]{1,5})/g];
 for(const pattern of patterns)for(const match of normalized.matchAll(pattern)){
  const raw=match[0]??'',value=match[1]&&/^\d$/.test(match[1])?Number(match[1]):Array.from(match[1]??'').length;
  if(value>=0&&value<=5)matches.push({value,index:match.index??0,evidence:raw});
 }
 return matches.sort((a,b)=>a.index-b.index);
}

function nearestUnused<T extends {index:number}>(items:T[],index:number,used:Set<number>):number|undefined{
 let selected:number|undefined,distance=Number.POSITIVE_INFINITY;
 for(let i=0;i<items.length;i++){
  if(used.has(i))continue;
  const current=Math.abs(items[i]!.index-index);
  if(current<distance){distance=current;selected=i;}
 }
 return selected;
}
function emptyField<T>(evidence:string):ImportedField<T>{return {value:null,confidence:'missing',evidence};}

function segmentedTroopType(pages:readonly OcrPage[],rawText:string):{field:ImportedField<UnitType>;conflict:boolean}{
 const slotVotes:UnitType[]=[];
 for(const slot of [0,1,2] as const){
  const detections=pages.filter(page=>page.slot===slot&&(page.row==='card'||page.row===undefined)).map(page=>detectTroopType(page.text)).filter((field):field is ImportedField<UnitType>&{value:UnitType}=>field.value!==null);
  if(!detections.length)continue;
  const counts=new Map<UnitType,number>();detections.forEach(field=>counts.set(field.value,(counts.get(field.value)??0)+1));
  slotVotes.push(Array.from(counts.entries()).sort((a,b)=>b[1]-a[1])[0]![0]);
 }
 if(!slotVotes.length)return {field:detectTroopType(rawText),conflict:false};
 const counts=new Map<UnitType,number>();slotVotes.forEach(value=>counts.set(value,(counts.get(value)??0)+1));
 const ranked=Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]);const [value,count]=ranked[0]!,conflict=ranked.length>1;
 return {field:{value,confidence:count>=2&&!conflict?'high':'medium',evidence:`${count}/${slotVotes.length}武将カードで「${value}」を確認`},conflict};
}

function inferOfficerFromInherentPages(pages:readonly OcrPage[],officers:readonly CanonicalOfficer[]):{officer:CanonicalOfficer;match:TextMatch}|undefined{
 const usable=officers.filter(officer=>officer.inherentSkill&&officer.inherentSkill!=='未確認');
 const match=consensusCatalogMatches(pages,usable.map(officer=>officer.inherentSkill),1)[0];if(!match)return undefined;
 const candidates=usable.filter(value=>compact(value.inherentSkill)===compact(match.name));
 return candidates.length===1?{officer:candidates[0]!,match}:undefined;
}

function resolveOfficer(slot:number,slotPages:readonly OcrPage[],officers:readonly CanonicalOfficer[]):{officer?:CanonicalOfficer;field:ImportedField<string>;warning?:string}{
 const cardPages=slotPages.filter(page=>page.row==='card'||page.row===undefined);
 const directMatch=consensusCatalogMatches(cardPages.length?cardPages:slotPages,officers.map(value=>value.name),1)[0];
 const directOfficer=directMatch?officers.find(value=>value.name===directMatch.name):undefined;
 const inferred=inferOfficerFromInherentPages(slotPages.filter(page=>page.row==='inherent'),officers);
 if(directOfficer&&inferred?.officer.name===directOfficer.name){
  const combined={...directMatch!,score:Math.min(1,Math.max(directMatch!.score,inferred.match.score)+.06),support:directMatch!.support+inferred.match.support,evidence:`武将名と固有戦法「${inferred.officer.inherentSkill}」が一致`};
  return {officer:directOfficer,field:{value:directOfficer.name,confidence:fieldConfidence(combined),evidence:combined.evidence}};
 }
 if(directOfficer&&inferred&&directOfficer.name!==inferred.officer.name){
  const margin=directMatch!.score-inferred.match.score;
  if(Math.abs(margin)<.14)return {field:emptyField<string>('武将名と固有戦法の候補が競合しました'),warning:`${slot===0?'大将':`副将${slot}`}は武将名「${directOfficer.name}」と固有戦法由来「${inferred.officer.name}」が競合したため未確定です。`};
  const winner=margin>0?{officer:directOfficer,match:directMatch!}:{officer:inferred.officer,match:inferred.match};
  return {officer:winner.officer,field:{value:winner.officer.name,confidence:'low',evidence:`競合候補を比較し「${winner.officer.name}」を暫定採用`},warning:`${slot===0?'大将':`副将${slot}`}は武将名と固有戦法の読取が一致しないため要確認です。`};
 }
 if(directOfficer&&directMatch)return {officer:directOfficer,field:{value:directOfficer.name,confidence:fieldConfidence(directMatch),evidence:directMatch.evidence}};
 if(inferred)return {officer:inferred.officer,field:{value:inferred.officer.name,confidence:fieldConfidence(inferred.match),evidence:`固有戦法「${inferred.officer.inherentSkill}」から武将を特定`}};
 return {field:emptyField<string>('武将名と固有戦法を確認できませんでした')};
}

function detectPixelLimitBreak(slotPages:readonly OcrPage[]):ImportedField<number>|undefined{
 const detections=slotPages.filter(page=>page.limitBreak!==undefined);
 if(!detections.length)return undefined;
 const counts=new Map<number,number>();detections.forEach(page=>counts.set(page.limitBreak!,(counts.get(page.limitBreak!)??0)+1));
 const value=Array.from(counts.entries()).sort((a,b)=>b[1]-a[1])[0]![0];
 const chosen=detections.find(page=>page.limitBreak===value)!;
 return {value,confidence:detections.some(page=>page.limitBreak===value&&page.limitBreakConfidence==='high')?'high':'medium',evidence:chosen.limitBreakEvidence??`赤い凸マーク${value}個`};
}

function parseSegmentedCards(pages:readonly OcrPage[],officers:readonly CanonicalOfficer[],skills:readonly CanonicalSkill[],ownedWarriors:readonly WarriorRecord[]):FormationImageDraft{
 const rawText=pages.map(page=>`${page.slot===0?'大将':page.slot===1?'副将1':page.slot===2?'副将2':'画像'}${page.row?` ${page.row}`:''}${page.variant?` ${page.variant}`:''}\n${page.text}`).join('\n');
 const inherentNames=new Set(officers.map(officer=>compact(officer.inherentSkill)).filter(name=>name&&name!==compact('未確認')));
 const attachable=skills.filter(skill=>skill.attachable&&!inherentNames.has(compact(skill.name))).map(skill=>skill.name);
 const ownedByName=new Map(ownedWarriors.map(warrior=>[compact(warrior.name),warrior]));
 const resolutionWarnings:string[]=[];
 const warriors=([0,1,2] as const).map(slot=>{
  const slotPages=pages.filter(page=>page.slot===slot),resolved=resolveOfficer(slot,slotPages,officers);if(resolved.warning)resolutionWarnings.push(resolved.warning);
  const row1Pages=slotPages.filter(page=>page.row==='equipped1'),row2Pages=slotPages.filter(page=>page.row==='equipped2');
  let skill1:TextMatch|undefined=consensusCatalogMatches(row1Pages,attachable,1)[0],skill2:TextMatch|undefined=consensusCatalogMatches(row2Pages,attachable,1)[0];
  if(!skill1||!skill2){
   const excluded=new Set([skill1?.name,skill2?.name].filter((value):value is string=>Boolean(value)));
   const fallback=consensusCatalogMatches(slotPages.filter(page=>page.row==='equipped1'||page.row==='equipped2'||page.row==='card'),attachable,4,excluded);
   if(!skill1)skill1=fallback.shift();if(!skill2)skill2=fallback.find(match=>match.name!==skill1?.name);
  }
  if(skill1&&skill2&&skill1.name===skill2.name){
   if(skill1.score>=skill2.score)skill2=undefined;else skill1=undefined;
   resolutionWarnings.push(`${slot===0?'大将':`副将${slot}`}の装着戦法2枠が同じ候補になったため、低確度側を未確認にしました。`);
  }
  let limitBreak=detectPixelLimitBreak(slotPages);
  if(!limitBreak){
   const text=slotPages.map(page=>page.text).join('\n'),textBreak=detectLimitBreaks(text)[0];
   if(textBreak)limitBreak={value:textBreak.value,confidence:'medium',evidence:textBreak.evidence};
   else if(resolved.officer){const owned=ownedByName.get(compact(resolved.officer.name));limitBreak=owned?{value:owned.limitBreak,confidence:'medium',evidence:'登録済み所有情報から補完'}:emptyField<number>('赤い凸マークを確認できませんでした');}
   else limitBreak=emptyField<number>('武将未確定のため凸も未確認です');
  }
  return {name:resolved.field,limitBreak,equippedSkills:[skill1?{value:skill1.name,confidence:fieldConfidence(skill1),evidence:skill1.evidence}:emptyField<string>('装着戦法1を確認できませんでした'),skill2?{value:skill2.name,confidence:fieldConfidence(skill2),evidence:skill2.evidence}:emptyField<string>('装着戦法2を確認できませんでした')]} as ImportedWarrior;
 }) as FormationImageDraft['warriors'];
 const warnings=[...resolutionWarnings],officerCount=warriors.filter(warrior=>warrior.name.value).length,skillCount=warriors.flatMap(warrior=>warrior.equippedSkills).filter(field=>field.value).length;
 if(officerCount<3)warnings.push(`武将は${officerCount}/3名のみ確定しました。`);
 if(skillCount<6)warnings.push(`装着戦法は${skillCount}/6枠のみ確定しました。`);
 if(warriors.some(warrior=>warrior.limitBreak.value===null))warnings.push('赤い凸マークを読み取れない武将があります。手動で確認してください。');
 const troop=segmentedTroopType(pages,rawText);if(!troop.field.value)warnings.push('兵種を読み取れませんでした。');if(troop.conflict)warnings.push('武将カード間で兵種の読取結果が一致しません。');
 return {troopType:troop.field,warriors,warnings,rawText};
}

function parseGenericPages(pages:readonly OcrPage[],officers:readonly CanonicalOfficer[],skills:readonly CanonicalSkill[],ownedWarriors:readonly WarriorRecord[]):FormationImageDraft{
 const rawText=pages.map(page=>page.text).join('\n'),officerMatches=consensusCatalogMatches(pages,officers.map(officer=>officer.name),3).sort((a,b)=>a.index-b.index),inherent=new Set(officers.map(officer=>compact(officer.inherentSkill))),attachable=skills.filter(skill=>skill.attachable&&!inherent.has(compact(skill.name))).map(skill=>skill.name),skillMatches=consensusCatalogMatches(pages,attachable,12).filter((match,index,array)=>array.findIndex(value=>value.name===match.name)===index).sort((a,b)=>a.index-b.index),awakenMatches=detectLimitBreaks(rawText),usedAwaken=new Set<number>(),ownedByName=new Map(ownedWarriors.map(warrior=>[compact(warrior.name),warrior])),assignedSkills:[ImportedField<string>[],ImportedField<string>[],ImportedField<string>[]]=[[],[],[]];
 for(const skill of skillMatches){
  const preceding=officerMatches.map((officer,index)=>({officer,index})).filter(row=>row.officer.index<=skill.index&&assignedSkills[row.index]!.length<2).sort((a,b)=>b.officer.index-a.officer.index)[0];
  let warriorIndex=preceding?.index;
  if(warriorIndex===undefined){let bestDistance=Number.POSITIVE_INFINITY;officerMatches.forEach((officer,index)=>{if(assignedSkills[index]!.length>=2)return;const distance=Math.abs(skill.index-officer.index);if(distance<bestDistance){bestDistance=distance;warriorIndex=index;}});}
  if(warriorIndex===undefined||assignedSkills[warriorIndex]!.length>=2){const open=assignedSkills.findIndex(values=>values.length<2);if(open>=0)warriorIndex=open;}
  if(warriorIndex!==undefined&&warriorIndex<3&&assignedSkills[warriorIndex]!.length<2)assignedSkills[warriorIndex]!.push({value:skill.name,confidence:fieldConfidence(skill),evidence:skill.evidence});
 }
 const warriors=Array.from({length:3},(_,index):ImportedWarrior=>{
  const officer=officerMatches[index],name=officer?{value:officer.name,confidence:fieldConfidence(officer),evidence:officer.evidence}:emptyField<string>('武将名を確認できませんでした');
  let limitBreak:ImportedField<number>;
  if(officer){const nearest=nearestUnused(awakenMatches,officer.index,usedAwaken);if(nearest!==undefined){usedAwaken.add(nearest);const found=awakenMatches[nearest]!;limitBreak={value:found.value,confidence:'medium',evidence:found.evidence};}else{const owned=ownedByName.get(compact(officer.name));limitBreak=owned?{value:owned.limitBreak,confidence:'medium',evidence:'登録済み所有情報から補完'}:emptyField<number>('凸表示を確認できませんでした');}}
  else limitBreak=emptyField<number>('武将未確定のため凸も未確認です');
  const values=assignedSkills[index]??[];
  return {name,limitBreak,equippedSkills:[values[0]??emptyField<string>('装着戦法1を確認できませんでした'),values[1]??emptyField<string>('装着戦法2を確認できませんでした')]};
 }) as FormationImageDraft['warriors'];
 const warnings:string[]=[];if(officerMatches.length<3)warnings.push(`武将は${officerMatches.length}/3名のみ確定しました。`);const skillCount=warriors.flatMap(warrior=>warrior.equippedSkills).filter(field=>field.value).length;if(skillCount<6)warnings.push(`装着戦法は${skillCount}/6枠のみ確定しました。`);if(warriors.some(warrior=>warrior.limitBreak.value===null))warnings.push('凸を読み取れない武将があります。画像内に表示がない場合は手動で確認してください。');const troopType=detectTroopType(rawText);if(!troopType.value)warnings.push('兵種を読み取れませんでした。');return {troopType,warriors,warnings,rawText};
}

export function parseFormationImages(pages:readonly OcrPage[],officers:readonly CanonicalOfficer[],skills:readonly CanonicalSkill[],ownedWarriors:readonly WarriorRecord[]=[]):FormationImageDraft{
 const segmentedSlots=new Set(pages.filter(page=>page.layout==='three-card'&&page.slot!==undefined).map(page=>page.slot));
 return segmentedSlots.size>=2?parseSegmentedCards(pages,officers,skills,ownedWarriors):parseGenericPages(pages,officers,skills,ownedWarriors);
}

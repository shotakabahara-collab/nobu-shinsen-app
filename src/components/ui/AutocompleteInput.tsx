import {useId,useMemo,useState} from 'react';

export type AutocompleteOption={
 value:string;
 detail?:string;
 keywords?:string[];
};

type Props={
 label:string;
 value:string;
 options:AutocompleteOption[];
 onChange:(value:string)=>void;
 className?:string;
 placeholder?:string;
 readOnly?:boolean;
 maxResults?:number;
};

export function normalizeAutocompleteText(value:string):string{
 return value.normalize('NFKC').trim().toLocaleLowerCase('ja');
}

export function rankAutocompleteOptions(options:AutocompleteOption[],query:string,limit=8):AutocompleteOption[]{
 const needle=normalizeAutocompleteText(query);
 if(!needle)return [];
 const unique=new Map<string,AutocompleteOption>();
 for(const option of options){
  const value=option.value.trim();
  if(value&&!unique.has(value))unique.set(value,{...option,value});
 }
 return Array.from(unique.values()).map(option=>{
  const label=normalizeAutocompleteText(option.value);
  const keywordMatches=(option.keywords??[]).map(normalizeAutocompleteText).filter(Boolean);
  let rank=Number.POSITIVE_INFINITY;
  let position=Number.POSITIVE_INFINITY;
  if(label===needle){rank=0;position=0;}
  else if(label.startsWith(needle)){rank=1;position=0;}
  else{
   const found=label.indexOf(needle);
   if(found>=0){rank=2;position=found;}
   else{
    for(const keyword of keywordMatches){
     const keywordPosition=keyword.indexOf(needle);
     if(keywordPosition>=0){rank=3;position=Math.min(position,keywordPosition);}
    }
   }
  }
  return {option,rank,position};
 }).filter(result=>Number.isFinite(result.rank)).sort((a,b)=>a.rank-b.rank||a.position-b.position||a.option.value.localeCompare(b.option.value,'ja')).slice(0,Math.max(1,limit)).map(result=>result.option);
}

export function AutocompleteInput({label,value,options,onChange,className='',placeholder,readOnly=false,maxResults=8}:Props){
 const listId=useId();
 const [focused,setFocused]=useState(false);
 const [activeIndex,setActiveIndex]=useState(0);
 const matches=useMemo(()=>rankAutocompleteOptions(options,value,maxResults),[maxResults,options,value]);
 const open=focused&&!readOnly&&normalizeAutocompleteText(value).length>0&&matches.length>0;

 function choose(option:AutocompleteOption){
  onChange(option.value);
  setFocused(false);
  setActiveIndex(0);
 }

 return <div className="relative">
  <input
   aria-label={label}
   aria-autocomplete="list"
   aria-controls={listId}
   aria-expanded={open}
   aria-activedescendant={open&&matches[activeIndex]?`${listId}-${activeIndex}`:undefined}
   autoCapitalize="none"
   autoComplete="off"
   className={className}
   placeholder={placeholder}
   readOnly={readOnly}
   role="combobox"
   value={value}
   onBlur={()=>setFocused(false)}
   onChange={event=>{onChange(event.target.value);setFocused(true);setActiveIndex(0);}}
   onFocus={()=>{if(!readOnly){setFocused(true);setActiveIndex(0);}}}
   onKeyDown={event=>{
    if(event.key==='ArrowDown'&&matches.length){event.preventDefault();setFocused(true);setActiveIndex(index=>Math.min(index+1,matches.length-1));}
    else if(event.key==='ArrowUp'&&matches.length){event.preventDefault();setFocused(true);setActiveIndex(index=>Math.max(index-1,0));}
    else if(event.key==='Enter'&&open&&matches[activeIndex]){event.preventDefault();choose(matches[activeIndex]);}
    else if(event.key==='Escape'){event.preventDefault();setFocused(false);}
   }}
  />
  {open&&<div id={listId} role="listbox" aria-label={`${label}の候補`} className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-600 bg-slate-950 p-1 shadow-2xl">
   {matches.map((option,index)=><button
    id={`${listId}-${index}`}
    key={option.value}
    type="button"
    role="option"
    aria-selected={index===activeIndex}
    className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${index===activeIndex?'bg-amber-500 text-slate-950':'text-white hover:bg-slate-800'}`}
    onMouseEnter={()=>setActiveIndex(index)}
    onPointerDown={event=>{event.preventDefault();choose(option);}}
   >
    <span className="font-medium">{option.value}</span>
    {option.detail&&<small className={`shrink-0 ${index===activeIndex?'text-slate-800':'text-slate-400'}`}>{option.detail}</small>}
   </button>)}
  </div>}
 </div>;
}

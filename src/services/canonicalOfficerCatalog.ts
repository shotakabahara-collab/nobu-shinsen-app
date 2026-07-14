import {z} from 'zod';

const unitTypeSchema=z.enum(['足軽','騎馬','鉄砲','弓']);
const unitLevelTraitSchema=z.object({
 name:z.string().trim().min(1),
 unlockedAt:z.number().int().min(0).max(5),
 unitTypes:z.array(unitTypeSchema).min(1),
 levelBonus:z.number().int().min(0),
 capUnlock:z.boolean().default(false),
 capBonus:z.number().int().min(0),
});
const canonicalOfficerSchema=z.object({
 id:z.string().min(1),
 name:z.string().trim().min(1),
 inherentSkill:z.string().trim().min(1),
 unitLevelTraits:z.array(unitLevelTraitSchema).default([]),
});
const unitLevelRuleSchema=z.object({baseLevel:z.literal(5),defaultCap:z.literal(10),capUnlockMode:z.literal('unbounded')});
const canonicalOfficerCatalogSchema=z.object({
 schemaVersion:z.literal(1),
 canonicalVersion:z.string().min(1),
 canonicalArchiveSha256:z.string().length(64),
 unitLevelRule:unitLevelRuleSchema.default({baseLevel:5,defaultCap:10,capUnlockMode:'unbounded'}),
 officerCount:z.number().int().positive(),
 officers:z.array(canonicalOfficerSchema),
}).superRefine((value,ctx)=>{
 const names=value.officers.map(officer=>officer.name);
 if(new Set(names).size!==names.length)ctx.addIssue({code:'custom',message:'正本武将カタログに武将名の重複があります',path:['officers']});
 if(value.officerCount!==value.officers.length)ctx.addIssue({code:'custom',message:'正本武将カタログ件数が一致しません',path:['officerCount']});
});

export type CanonicalOfficer=z.infer<typeof canonicalOfficerSchema>;
export type CanonicalOfficerCatalog=z.infer<typeof canonicalOfficerCatalogSchema>;

let cached:Promise<CanonicalOfficerCatalog>|null=null;

export async function loadCanonicalOfficerCatalog(fetcher:typeof fetch=fetch,url=`${import.meta.env.BASE_URL}canonical_officer_catalog.json`):Promise<CanonicalOfficerCatalog>{
 if(fetcher===fetch&&cached)return cached;
 const load=async()=>{
  const response=await fetcher(url);
  if(!response.ok)throw new Error(`正本武将カタログを読み込めませんでした（HTTP ${response.status}）`);
  return canonicalOfficerCatalogSchema.parse(await response.json());
 };
 if(fetcher===fetch){cached=load().catch(error=>{cached=null;throw error;});return cached;}
 return load();
}

export function findCanonicalOfficer(officers:CanonicalOfficer[],name:string):CanonicalOfficer|undefined{
 const normalized=name.trim();
 return normalized?officers.find(officer=>officer.name===normalized):undefined;
}

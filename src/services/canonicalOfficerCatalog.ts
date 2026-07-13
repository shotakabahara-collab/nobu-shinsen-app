import {z} from 'zod';

const canonicalOfficerSchema=z.object({id:z.string().min(1),name:z.string().trim().min(1),inherentSkill:z.string().trim().min(1)});
const canonicalOfficerCatalogSchema=z.object({schemaVersion:z.literal(1),canonicalVersion:z.string().min(1),canonicalArchiveSha256:z.string().length(64),officerCount:z.number().int().positive(),officers:z.array(canonicalOfficerSchema)}).superRefine((value,ctx)=>{
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

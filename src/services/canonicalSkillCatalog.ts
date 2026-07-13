import {z} from 'zod';

const canonicalSkillSchema=z.object({id:z.string().min(1),name:z.string().trim().min(1),type:z.string().default(''),attachable:z.boolean()});
const canonicalSkillCatalogSchema=z.object({schemaVersion:z.literal(1),canonicalVersion:z.string().min(1),canonicalArchiveSha256:z.string().length(64),skillCount:z.number().int().positive(),skills:z.array(canonicalSkillSchema)}).superRefine((value,ctx)=>{
 const names=value.skills.map(skill=>skill.name);
 if(new Set(names).size!==names.length)ctx.addIssue({code:'custom',message:'正本戦法カタログに戦法名の重複があります',path:['skills']});
 if(value.skillCount!==value.skills.length)ctx.addIssue({code:'custom',message:'正本戦法カタログ件数が一致しません',path:['skillCount']});
});

export type CanonicalSkill=z.infer<typeof canonicalSkillSchema>;
export type CanonicalSkillCatalog=z.infer<typeof canonicalSkillCatalogSchema>;

let cached:Promise<CanonicalSkillCatalog>|null=null;

export async function loadCanonicalSkillCatalog(fetcher:typeof fetch=fetch,url=`${import.meta.env.BASE_URL}canonical_skill_catalog.json`):Promise<CanonicalSkillCatalog>{
 if(fetcher===fetch&&cached)return cached;
 const load=async()=>{
  const response=await fetcher(url);
  if(!response.ok)throw new Error(`正本戦法カタログを読み込めませんでした（HTTP ${response.status}）`);
  return canonicalSkillCatalogSchema.parse(await response.json());
 };
 if(fetcher===fetch){cached=load().catch(error=>{cached=null;throw error;});return cached;}
 return load();
}

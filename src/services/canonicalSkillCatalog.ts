import {z} from 'zod';

const unitTypeSchema=z.enum(['足軽','騎馬','鉄砲','弓']);
const unitLevelEffectSchema=z.object({
 name:z.string().trim().min(1),
 unitTypes:z.array(unitTypeSchema).min(1),
 levelBonus:z.number().int().min(0),
 capUnlock:z.boolean().default(false),
});
const canonicalSkillSchema=z.object({
 id:z.string().min(1),
 name:z.string().trim().min(1),
 type:z.string().default(''),
 attachable:z.boolean(),
 unitLevelEffects:z.array(unitLevelEffectSchema).default([]),
});
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

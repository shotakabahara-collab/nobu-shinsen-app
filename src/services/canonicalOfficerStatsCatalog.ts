import {z} from 'zod';

const statValuesSchema=z.object({force:z.number().nullable(),intel:z.number().nullable(),lead:z.number().nullable(),speed:z.number().nullable()});
const officerStatSchema=z.object({
 id:z.string().min(1),name:z.string().trim().min(1),awaken:z.number().int().min(0).max(5),inherentSkill:z.string().trim().min(1),allocationPoints:z.number().int().min(0),
 base:statValuesSchema,allocated:statValuesSchema,actionOrderSpeed:z.number().nullable(),statState:z.string().min(1),
});
const catalogSchema=z.object({schemaVersion:z.literal(1),canonicalVersion:z.string().min(1),canonicalArchiveSha256:z.string().length(64),recordCount:z.number().int().positive(),records:z.array(officerStatSchema)}).superRefine((value,ctx)=>{
 if(value.recordCount!==value.records.length)ctx.addIssue({code:'custom',message:'正本武将ステータス件数が一致しません',path:['recordCount']});
 const keys=value.records.map(row=>`${row.name}|${row.awaken}`);if(new Set(keys).size!==keys.length)ctx.addIssue({code:'custom',message:'武将名と凸の組合せが重複しています',path:['records']});
});

export type CanonicalOfficerStat=z.infer<typeof officerStatSchema>;
export type CanonicalOfficerStatsCatalog=z.infer<typeof catalogSchema>;
let cached:Promise<CanonicalOfficerStatsCatalog>|null=null;

export async function loadCanonicalOfficerStatsCatalog(fetcher:typeof fetch=fetch,url=`${import.meta.env.BASE_URL}canonical_officer_stats_catalog.json`):Promise<CanonicalOfficerStatsCatalog>{
 if(fetcher===fetch&&cached)return cached;
 const load=async()=>{const response=await fetcher(url);if(!response.ok)throw new Error(`正本武将ステータスを読み込めませんでした（HTTP ${response.status}）`);return catalogSchema.parse(await response.json());};
 if(fetcher===fetch){cached=load().catch(error=>{cached=null;throw error;});return cached;}
 return load();
}

export function findCanonicalOfficerStat(catalog:CanonicalOfficerStatsCatalog,name:string,awaken:number):CanonicalOfficerStat|undefined{
 return catalog.records.find(row=>row.name===name&&row.awaken===awaken);
}

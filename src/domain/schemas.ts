import {z} from 'zod';
import {findDuplicateEquippedSkill} from './formationRules';

export const troopTypes=['足軽','騎馬','鉄砲','弓'] as const;
export const warriorRecordSchema=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(80),limitBreak:z.number().int().min(0).max(5).default(0),notes:z.string().max(500).default(''),createdAt:z.string().datetime(),updatedAt:z.string().datetime()});
export const skillRecordSchema=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(80),category:z.enum(['固有','装着','兵種','その他']),owned:z.boolean().default(true),description:z.string().max(2000).default(''),createdAt:z.string().datetime(),updatedAt:z.string().datetime()});
export const warriorSchema=z.object({id:z.string().uuid(),name:z.string().trim().min(1),limitBreak:z.number().int().min(0).max(5),inherentSkill:z.string().trim().min(1),equippedSkills:z.tuple([z.string().trim().min(1),z.string().trim().min(1)])});
export const formationSchema=z.object({id:z.string().uuid(),name:z.string().trim().min(1),kind:z.enum(['ally','enemy']),troopType:z.enum(troopTypes),troopLevel:z.number().int().min(1),troops:z.literal(10000,{error:'b223正式評価の兵力は武将ごとに10,000固定です'}),warriors:z.tuple([warriorSchema,warriorSchema,warriorSchema]),createdAt:z.string().datetime(),updatedAt:z.string().datetime()}).superRefine((v,ctx)=>{
 const ids=v.warriors.map(w=>w.id);
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'同じ武将を重複して編成できません',path:['warriors']});
 const duplicate=findDuplicateEquippedSkill(v.warriors);
 if(duplicate)ctx.addIssue({code:'custom',message:`装着戦法「${duplicate.name}」が重複しています`,path:['warriors',duplicate.duplicate.warriorIndex,'equippedSkills',duplicate.duplicate.skillIndex]});
});
export const battleResultSchema=z.object({id:z.string().uuid(),allyId:z.string().uuid(),enemyId:z.string().uuid(),createdAt:z.string().datetime(),status:z.literal('completed'),winRate:z.number().min(0).max(1),hpDiff:z.number().nullable(),trials:z.number().int().positive(),blocks:z.number().int().positive(),runtime:z.string(),payload:z.record(z.string(),z.unknown())});
export const exportSchema=z.object({schemaVersion:z.literal(2),exportedAt:z.string().datetime(),formations:z.array(formationSchema),warriors:z.array(warriorRecordSchema),skills:z.array(skillRecordSchema),battleResults:z.array(battleResultSchema)});
export type BattleResult=z.infer<typeof battleResultSchema>;export type WarriorRecord=z.infer<typeof warriorRecordSchema>;export type SkillRecord=z.infer<typeof skillRecordSchema>;export type Warrior=z.infer<typeof warriorSchema>;export type Formation=z.infer<typeof formationSchema>;export type CompanionExport=z.infer<typeof exportSchema>;

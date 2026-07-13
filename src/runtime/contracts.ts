import {z} from 'zod';
const runtimeFormationSchema=z.object({officers:z.tuple([z.string(),z.string(),z.string()]),awaken:z.tuple([z.number().int().min(0).max(5),z.number().int().min(0).max(5),z.number().int().min(0).max(5)]),unit:z.enum(['騎馬','足軽','弓','鉄砲']),skills:z.tuple([z.string(),z.string(),z.string(),z.string(),z.string(),z.string()]),stats:z.array(z.record(z.string(),z.number())).optional(),fixed_placement:z.boolean().default(true),ignore_formal_overlap:z.boolean().default(true)});
export const calculateRequestSchema=z.object({candidate:runtimeFormationSchema,target:z.string(),target_spec:runtimeFormationSchema.optional(),trials:z.number().int().min(1).max(100),blocks:z.number().int().min(1).max(3),seed:z.number().int(),include_detail:z.boolean().default(false)});
export const searchRequestSchema=z.record(z.string(),z.unknown());export const formalRequestSchema=z.record(z.string(),z.unknown());
export type RuntimeFormation=z.infer<typeof runtimeFormationSchema>;export type CalculateRequest=z.infer<typeof calculateRequestSchema>;
export type RuntimeOperation='calculate'|'search'|'formal';
export type RuntimeResult={type:string;version:string;runtime:string;win_rate?:number;hp_diff?:number;[key:string]:unknown};

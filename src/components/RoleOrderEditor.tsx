import {roleLabels,swapCandidateRoles,type CandidateSpec,type RankedRecommendation} from '../domain/recommendation';

type Props={
 recommendation:RankedRecommendation;
 targetId:string;
 disabled?:boolean;
 onChange:(candidate:CandidateSpec)=>void;
};

export function RoleOrderEditor({recommendation,targetId,disabled=false,onChange}:Props){
 const candidate=recommendation.candidate;
 const rate=recommendation.win_rates?.[targetId]??recommendation.avg_win_rate??recommendation.min_win_rate;
 const evidence=recommendation.battle_evidence?.[targetId];
 const final100=evidence?.measurement_stage==='FINAL'&&evidence.completed_battles===100;
 return <section className="rounded-xl border border-cyan-800 bg-cyan-950/20 p-4" aria-label="大将と副将の入れ替え">
  <h4 className="font-bold text-cyan-200">大将・副将を入れ替え</h4>
  <p className="mt-1 text-xs leading-5 text-slate-400">各役割の武将を選ぶと、凸・固有戦法・装着戦法2枠を武将と一緒に入れ替えます。</p>
  <div className="mt-3 grid gap-3 sm:grid-cols-3">{roleLabels.map((role,index)=><label key={role} className="text-xs font-bold text-slate-300">{role}<select aria-label={`${role}に配置する武将`} disabled={disabled} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm text-white disabled:opacity-60" value={candidate.officers[index]} onChange={event=>{const source=candidate.officers.indexOf(event.target.value);if(source>=0)onChange(swapCandidateRoles(candidate,index,source));}}>{candidate.officers.map(officer=><option key={officer} value={officer}>{officer}</option>)}</select></label>)}</div>
  <p className="mt-3 rounded-lg bg-slate-950 p-3 text-xs text-slate-300">この配置の{final100?'100戦勝率':'事前選別勝率'}：{typeof rate==='number'?`${(rate*100).toFixed(1)}%`:'未評価'}{final100?`（${evidence?.wins??0}勝・${evidence?.losses??0}敗・${evidence?.draws??0}引分）`:recommendation.role_comparison?.complete?'（全6配置を同一乱数条件で事前比較済み）':'（正式再評価で確認してください）'}</p>
 </section>;
}

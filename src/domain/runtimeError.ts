export type RuntimeErrorCode='DATA-001'|'DATA-002'|'DATA-003'|'NETWORK-001'|'RUNTIME-001'|'RUNTIME-002'|'UNKNOWN-001';

export type RuntimeErrorInfo={code:RuntimeErrorCode;title:string;message:string;guidance:string[];detail:string;retryable:boolean};

function detailOf(error:unknown):string{
 if(error instanceof Error)return `${error.name}: ${error.message}${error.stack?`\n${error.stack}`:''}`;
 if(typeof error==='string')return error;
 try{return JSON.stringify(error,null,2);}catch{return String(error);}
}

export function classifyRuntimeError(error:unknown):RuntimeErrorInfo{
 const detail=detailOf(error);const normalized=detail.toLowerCase();const has=(...terms:string[])=>terms.some(term=>normalized.includes(term.toLowerCase()));
 if(has('failed to fetch','networkerror','load failed','http 404','http 500','runtime bundle'))return {code:'NETWORK-001',title:'対戦エンジンを読み込めませんでした',message:'通信状態またはアプリの更新状態により、対戦エンジンの読込に失敗しました。',guidance:['通信状態を確認してください。','アプリを完全に終了し、オンラインで再起動してください。','改善しない場合はSafariで公開URLを再読み込みしてください。'],detail,retryable:true};
 if(has('keyerror','unknown officer','resolve_officers','武将'))return {code:'DATA-002',title:'武将データを確認してください',message:'選択した編成の武将を正本データから解決できませんでした。',guidance:['武将名が正本候補から選択されているか確認してください。','武将名の余分な空白や表記違いを修正してください。'],detail,retryable:false};
 if(has('unknown skill','resolve_skills','戦法'))return {code:'DATA-003',title:'戦法データを確認してください',message:'選択した編成の戦法を正本データから解決できませんでした。',guidance:['装着戦法が正本候補から選択されているか確認してください。','固有戦法や重複戦法が装着枠に入っていないか確認してください。'],detail,retryable:false};
 if(has('tuple index','indexerror','candidate','target_spec','formation'))return {code:'DATA-001',title:'編成データを確認してください',message:'対戦計算に必要な編成情報が不足しているか、保存データに不整合があります。',guidance:['武将3名、各凸、装着戦法2枠、兵種を確認してください。','編成を一度編集して保存し直してください。'],detail,retryable:false};
 if(has('memoryerror','out of memory','allocation failed'))return {code:'RUNTIME-002',title:'計算量が端末の上限を超えました',message:'端末のメモリ不足により対戦計算を完了できませんでした。',guidance:['他のアプリを終了してから再試行してください。','通常対戦の10×1から実行してください。'],detail,retryable:true};
 if(has('pyodide','wasm-function','pythonerror','new_error','traceback'))return {code:'RUNTIME-001',title:'対戦エンジンでエラーが発生しました',message:'b223対戦エンジンが計算を完了できませんでした。編成データまたはエンジン内部処理に原因がある可能性があります。',guidance:['編成内容を確認して、もう一度計算してください。','同じエラーが続く場合は「詳細をコピー」して報告してください。'],detail,retryable:true};
 return {code:'UNKNOWN-001',title:'計算を完了できませんでした',message:'予期しないエラーが発生しました。',guidance:['編成内容と通信状態を確認して再試行してください。','同じエラーが続く場合は「詳細をコピー」して報告してください。'],detail,retryable:true};
}

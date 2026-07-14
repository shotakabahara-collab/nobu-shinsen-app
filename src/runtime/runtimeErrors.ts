import {RuntimeCancelledError,RuntimeEngineError} from './runtimeClient';

export type RuntimeUserOperation='calculate'|'search'|'formal'|'register';
export type RuntimeErrorCode=
 |'NOBU-R001'
 |'NOBU-R002'
 |'NOBU-R003'
 |'NOBU-R004'
 |'NOBU-R005'
 |'NOBU-R006'
 |'NOBU-R999';

export type RuntimeErrorPresentation={
 code:RuntimeErrorCode;
 title:string;
 message:string;
 action:string;
 reloadRecommended:boolean;
};

const operationLabels:Record<RuntimeUserOperation,string>={
 calculate:'対戦計算',
 search:'最適編成の探索',
 formal:'正式再評価',
 register:'推奨編成の登録',
};

function rawErrorText(error:unknown):string{
 if(error instanceof RuntimeEngineError)return `${error.message}\n${error.technicalDetails}`;
 if(error instanceof Error)return `${error.name}: ${error.message}\n${error.stack??''}`;
 return String(error??'');
}

function matches(text:string,patterns:RegExp[]):boolean{
 return patterns.some(pattern=>pattern.test(text));
}

export function presentRuntimeError(error:unknown,operation:RuntimeUserOperation):RuntimeErrorPresentation|null{
 if(error instanceof RuntimeCancelledError)return null;
 const label=operationLabels[operation];
 const raw=rawErrorText(error).normalize('NFKC');
 const text=raw.toLocaleLowerCase('ja');

 if(matches(text,[/failed to fetch/,/networkerror/,/network request failed/,/runtime bundle http/,/load failed/,/通信/,/ネットワーク/])){
  return {
   code:'NOBU-R001',
   title:`${label}用データを読み込めませんでした`,
   message:'計算エンジンまたは正本データの読み込みに失敗しました。通信状態か、オフライン資産の準備状態に問題があります。',
   action:'通信を確認し、オンライン状態でアプリを一度開き直してから再実行してください。',
   reloadRecommended:true,
  };
 }

 if(matches(text,[/out of memory/,/memory access out of bounds/,/cannot enlarge memory/,/webassembly\.memory/,/allocation failed/,/メモリ不足/])){
  return {
   code:'NOBU-R002',
   title:`${label}中にiPhoneのメモリが不足しました`,
   message:'計算量に対して利用可能な端末メモリが不足し、計算エンジンが停止しました。登録データが消えたわけではありません。',
   action:'他のアプリやタブを閉じ、NOBU Companionを完全終了してから再起動してください。',
   reloadRecommended:true,
  };
 }

 if(matches(text,[
  /(?:unknown|unresolved|not found|missing|未登録|見つかりません).{0,40}(?:officer|warrior|武将)/,
  /(?:officer|warrior|武将).{0,40}(?:unknown|unresolved|not found|missing|未登録|見つかりません)/,
  /武将名.{0,30}(?:不正|存在しない|確認できない)/,
 ])){
  return {
   code:'NOBU-R003',
   title:'正本DBで確認できない武将があります',
   message:`${label}に使用した編成に、正本DBで解決できない武将名が含まれています。手入力名、表記揺れ、未登録武将が原因の可能性があります。`,
   action:'編成タブを開き、武将名を予測候補から選び直して保存してください。',
   reloadRecommended:false,
  };
 }

 if(matches(text,[
  /(?:unknown|unresolved|not found|missing|未登録|見つかりません).{0,40}(?:skill|tactic|戦法)/,
  /(?:skill|tactic|戦法).{0,40}(?:unknown|unresolved|not found|missing|未登録|見つかりません)/,
  /戦法名.{0,30}(?:不正|存在しない|確認できない)/,
 ])){
  return {
   code:'NOBU-R004',
   title:'正本DBで確認できない戦法があります',
   message:`${label}に使用した編成に、正本DBで解決できない戦法名が含まれています。手入力名、表記揺れ、固有戦法の誤装着が原因の可能性があります。`,
   action:'編成タブを開き、装着戦法を予測候補から選び直して保存してください。',
   reloadRecommended:false,
  };
 }

 if(matches(text,[
  /zoderror/,/invalid_type/,/validation/,/expected .+ received/,/兵力は.+10,?000固定/,
  /duplicate/,/重複/,/同じ編成/,/unknown operation/,/要求.+不正/,/形式.+正しくない/,
 ])){
  return {
   code:'NOBU-R005',
   title:'編成データを計算に使用できません',
   message:`${label}に必要な編成データの形式または組み合わせが正しくありません。武将3名、各武将の凸、装着戦法2枠、兵種、兵力を確認してください。`,
   action:'対象編成を編集して再保存し、別の同一編成を両側へ選んでいないことも確認してください。',
   reloadRecommended:false,
  };
 }

 if(matches(text,[/pyodide/,/wasm-function/,/webassembly/,/pythonerror/,/traceback/,/new_error@/,/b223 runtime/])){
  return {
   code:'NOBU-R006',
   title:`${label}を計算エンジンが完了できませんでした`,
   message:'Pyodide計算エンジンが処理を継続できませんでした。正本DBにない武将・戦法、不正な編成データ、または一時的な端末メモリ不足の可能性があります。',
   action:'編成の武将・戦法を候補から選び直してください。改善しない場合はアプリを完全終了して再起動してください。',
   reloadRecommended:true,
  };
 }

 return {
  code:'NOBU-R999',
  title:`${label}を完了できませんでした`,
  message:'予期しないエラーが発生しました。内部の英語スタック情報は安全のため画面には表示していません。',
  action:'編成内容を確認して再実行してください。改善しない場合はアプリを再起動してください。',
  reloadRecommended:true,
 };
}

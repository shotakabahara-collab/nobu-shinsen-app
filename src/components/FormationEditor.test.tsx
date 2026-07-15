import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import type {CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import type {CanonicalSkill} from '../services/canonicalSkillCatalog';
import {createEmptyFormation,FormationEditor} from './FormationEditor';

const canonical:CanonicalOfficer[]=[
 {id:'WL_MATSU_HISA',name:'松永久秀',inherentSkill:'梟雄の計',unitLevelTraits:[{name:'砲術Ⅲ',unlockedAt:3,unitTypes:['鉄砲'],levelBonus:3,capUnlock:false,capBonus:0}]},
 {id:'WL_KURODA_KANBEI',name:'黒田官兵衛',inherentSkill:'七十二の計',unitLevelTraits:[]},
 {id:'WL_PALETTE_082',name:'柿崎景家',inherentSkill:'越後二天',unitLevelTraits:[{name:'騎兵大将',unlockedAt:0,unitTypes:['騎馬'],levelBonus:3,capUnlock:true,capBonus:1}]},
 {id:'WL_PALETTE_101',name:'北条綱成',inherentSkill:'地黄八幡',unitLevelTraits:[{name:'騎兵大将',unlockedAt:0,unitTypes:['騎馬'],levelBonus:3,capUnlock:true,capBonus:1}]},
 {id:'WL_SAKAKIBARA_YASUMASA',name:'榊原康政',inherentSkill:'無傷の誇',unitLevelTraits:[{name:'馬術Ⅲ',unlockedAt:0,unitTypes:['騎馬'],levelBonus:3,capUnlock:false,capBonus:0}]},
];
const canonicalSkills:CanonicalSkill[]=[
 {id:'KNY_INHERENT_1',name:'梟雄の計',type:'固有',attachable:false,slotType:'normal',allowedUnitTypes:[],unitLevelEffects:[]},
 {id:'KNY_INHERENT_2',name:'七十二の計',type:'固有',attachable:false,slotType:'normal',allowedUnitTypes:[],unitLevelEffects:[]},
 {id:'KNY_0001',name:'紅蓮の炎',type:'能動',attachable:true,slotType:'normal',allowedUnitTypes:[],unitLevelEffects:[]},
 {id:'KNY_0002',name:'回天転運',type:'能動',attachable:true,slotType:'normal',allowedUnitTypes:[],unitLevelEffects:[]},
 {id:'KNY_0003',name:'一行三昧',type:'能動',attachable:true,slotType:'normal',allowedUnitTypes:[],unitLevelEffects:[]},
];

function editor(props:Partial<React.ComponentProps<typeof FormationEditor>>={}){
 return <FormationEditor canonicalOfficers={canonical} canonicalSkills={canonicalSkills} onSave={()=>{}} onCancel={()=>{}} {...props}/>;
}

function completeFormation(){
 const value=createEmptyFormation();
 value.name='検証編成';
 value.warriors.forEach((warrior,index)=>{
  warrior.name=`武将${index+1}`;
  warrior.inherentSkill=`固有${index+1}`;
  warrior.equippedSkills=[`戦法${index*2+1}`,`戦法${index*2+2}`];
 });
 return value;
}

describe('FormationEditor',()=>{
 it('does not save an incomplete formation',()=>{
  const save=vi.fn();
  render(editor({canonicalOfficers:[],canonicalSkills:[],onSave:save}));
  fireEvent.click(screen.getByRole('button',{name:'保存'}));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeVisible();
 });

 it('shows canonical troop count as read only',()=>{
  render(editor({canonicalOfficers:[],canonicalSkills:[]}));
  const troops=screen.getByRole('spinbutton',{name:'兵力'});
  expect(troops).toHaveValue(10000);
  expect(troops).toHaveAttribute('readonly');
  expect(screen.getByText(/各武将10,000固定/)).toBeVisible();
 });

 it('swaps commander and deputy with the full officer package',()=>{
  const value=completeFormation();
  render(editor({initial:value,canonicalOfficers:[],canonicalSkills:[]}));
  fireEvent.change(screen.getByRole('combobox',{name:'大将に配置する武将'}),{target:{value:value.warriors[2].id}});
  expect(screen.getByRole('combobox',{name:'大将 武将名'})).toHaveValue('武将3');
  expect(screen.getByRole('combobox',{name:'大将 装着戦法1'})).toHaveValue('戦法5');
  expect(screen.getByRole('combobox',{name:'副将2 武将名'})).toHaveValue('武将1');
  expect(screen.getByRole('combobox',{name:'副将2 装着戦法2'})).toHaveValue('戦法2');
 });

 it('automatically calculates troop level from troop type, officer and limit break',async()=>{
  render(editor());
  const level=screen.getByRole('spinbutton',{name:'兵種Lv'});
  expect(level).toHaveAttribute('readonly');
  expect(level).not.toHaveAttribute('max');
  expect(level).toHaveValue(5);
  fireEvent.change(screen.getByLabelText('兵種'),{target:{value:'鉄砲'}});
  fireEvent.change(screen.getByRole('combobox',{name:'大将 武将名'}),{target:{value:'松永久秀'}});
  fireEvent.change(screen.getByRole('spinbutton',{name:'大将 凸'}),{target:{value:'3'}});
  await waitFor(()=>expect(level).toHaveValue(8));
  expect(screen.getByLabelText('兵種Lv計算根拠')).toHaveTextContent('松永久秀「砲術Ⅲ」+3');
  expect(screen.getByLabelText('兵種Lv計算根拠')).toHaveTextContent('上限10');
 });

 it('removes the ceiling entirely when a cap-unlock trait applies',async()=>{
  render(editor());
  const names=['柿崎景家','北条綱成','榊原康政'];
  for(const [index,role] of ['大将','副将1','副将2'].entries())fireEvent.change(screen.getByRole('combobox',{name:`${role} 武将名`}),{target:{value:names[index]}});
  const level=screen.getByRole('spinbutton',{name:'兵種Lv'});
  await waitFor(()=>expect(level).toHaveValue(14));
  expect(screen.getByLabelText('兵種Lv計算根拠')).toHaveTextContent('上限解放済み・天井なし');
  expect(screen.getByLabelText('兵種Lv計算根拠')).not.toHaveTextContent('上限11');
 });

 it('shows partial warrior candidates and selects one to autofill the inherent skill',()=>{
  render(editor());
  const name=screen.getByRole('combobox',{name:'大将 武将名'});
  fireEvent.change(name,{target:{value:'永久'}});
  const candidate=screen.getByRole('option',{name:/松永久秀/});
  fireEvent.pointerDown(candidate);
  expect(name).toHaveValue('松永久秀');
  const inherent=screen.getByLabelText('大将 固有戦法');
  expect(inherent).toHaveValue('梟雄の計');
  expect(inherent).toHaveAttribute('readonly');
  expect(screen.getByText('正本DB自動')).toBeVisible();
 });

 it('shows partial attachable skill candidates and selects one',()=>{
  render(editor());
  const skill=screen.getByRole('combobox',{name:'大将 装着戦法1'});
  fireEvent.change(skill,{target:{value:'蓮の'}});
  fireEvent.pointerDown(screen.getByRole('option',{name:/紅蓮の炎/}));
  expect(skill).toHaveValue('紅蓮の炎');
 });

 it('does not show inherent skills in equipped-skill candidates',()=>{
  render(editor());
  const skill=screen.getByRole('combobox',{name:'大将 装着戦法1'});
  fireEvent.change(skill,{target:{value:'梟雄'}});
  expect(screen.queryByRole('option',{name:/梟雄の計/})).not.toBeInTheDocument();
 });

 it('rejects a directly entered inherent skill with a warning popup',()=>{
  render(editor());
  const skill=screen.getByRole('combobox',{name:'大将 装着戦法1'});
  fireEvent.change(skill,{target:{value:'梟雄の計'}});
  expect(screen.getByRole('alertdialog')).toHaveTextContent('固有戦法');
  expect(skill).toHaveValue('');
 });

 it('rejects a duplicate equipped skill immediately and shows a warning popup',()=>{
  render(editor());
  const first=screen.getByRole('combobox',{name:'大将 装着戦法1'});
  const duplicate=screen.getByRole('combobox',{name:'副将1 装着戦法2'});
  fireEvent.change(first,{target:{value:'紅蓮の炎'}});
  expect(first).toHaveValue('紅蓮の炎');
  fireEvent.change(duplicate,{target:{value:'紅蓮の炎'}});
  expect(screen.getByRole('alertdialog')).toHaveTextContent('装着戦法が重複しています');
  expect(screen.getByRole('alertdialog')).toHaveTextContent('大将の装着戦法1');
  expect(duplicate).toHaveValue('');
 });

 it('blocks saving a legacy formation that already contains duplicate equipped skills',()=>{
  const value=completeFormation();
  value.warriors[2].equippedSkills[1]=value.warriors[0].equippedSkills[0];
  const save=vi.fn();
  render(editor({initial:value,onSave:save}));
  fireEvent.click(screen.getByRole('button',{name:'保存'}));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog')).toHaveTextContent('修正するまで保存できません');
 });

 it('blocks saving the reported double unit-type skill formation with an actionable warning',()=>{
  const value=completeFormation();value.troopType='鉄砲';
  value.warriors[0].equippedSkills=['有備無患','破天の轟'];
  value.warriors[1].equippedSkills=['僧兵','攻其不備'];
  value.warriors[2].equippedSkills=['大智不智','鉄砲僧兵'];
  const normalSkills=['有備無患','破天の轟','攻其不備','大智不智'].map((name,index):CanonicalSkill=>({id:`N${index}`,name,type:'能動',attachable:true,slotType:'normal',allowedUnitTypes:[],unitLevelEffects:[]}));
  const restrictedSkills:CanonicalSkill[]=[
   {id:'U1',name:'僧兵',type:'兵種',attachable:true,slotType:'unitType',allowedUnitTypes:['足軽'],unitLevelEffects:[]},
   {id:'U2',name:'鉄砲僧兵',type:'兵種',attachable:true,slotType:'unitType',allowedUnitTypes:['鉄砲'],unitLevelEffects:[]},
  ];
  const save=vi.fn();render(editor({initial:value,canonicalSkills:[...canonicalSkills,...normalSkills,...restrictedSkills],onSave:save}));
  expect(screen.getByRole('alert')).toHaveTextContent('兵種戦法は1編成に1つまで');
  expect(screen.getByRole('alert')).toHaveTextContent('「僧兵」は足軽専用');
  fireEvent.click(screen.getByRole('button',{name:'保存'}));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog')).toHaveTextContent('正本ルールにより保存できません');
 });

 it('autofills and locks the inherent skill when a canonical warrior name matches',()=>{
  render(editor());
  fireEvent.change(screen.getByRole('combobox',{name:'大将 武将名'}),{target:{value:'松永久秀'}});
  const inherent=screen.getByLabelText('大将 固有戦法');
  expect(inherent).toHaveValue('梟雄の計');
  expect(inherent).toHaveAttribute('readonly');
 });

 it('clears a stale inherent skill when the name no longer matches the canonical catalog',()=>{
  render(editor());
  const name=screen.getByRole('combobox',{name:'大将 武将名'});
  fireEvent.change(name,{target:{value:'松永久秀'}});
  fireEvent.change(name,{target:{value:'未登録武将'}});
  const inherent=screen.getByRole('combobox',{name:'大将 固有戦法'});
  expect(inherent).toHaveValue('');
  expect(inherent).not.toHaveAttribute('readonly');
 });

 it('normalizes a stale saved inherent skill and automatic troop level before saving',async()=>{
  const value=completeFormation();
  value.troopType='鉄砲';
  value.troopLevel=10;
  value.warriors[0].name='松永久秀';
  value.warriors[0].limitBreak=3;
  value.warriors[0].inherentSkill='誤った固有';
  const save=vi.fn();
  render(editor({initial:value,onSave:save}));
  await waitFor(()=>expect(screen.getByLabelText('大将 固有戦法')).toHaveValue('梟雄の計'));
  await waitFor(()=>expect(screen.getByRole('spinbutton',{name:'兵種Lv'})).toHaveValue(8));
  fireEvent.click(screen.getByRole('button',{name:'保存'}));
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]?.[0].warriors[0].inherentSkill).toBe('梟雄の計');
  expect(save.mock.calls[0]?.[0].troopLevel).toBe(8);
 });
});

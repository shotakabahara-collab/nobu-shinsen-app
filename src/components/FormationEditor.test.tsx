import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import type {CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import type {CanonicalSkill} from '../services/canonicalSkillCatalog';
import {createEmptyFormation,FormationEditor} from './FormationEditor';

const canonical:CanonicalOfficer[]=[
 {id:'WL_MATSU_HISA',name:'松永久秀',inherentSkill:'梟雄の計'},
 {id:'WL_KURODA_KANBEI',name:'黒田官兵衛',inherentSkill:'七十二の計'},
];
const canonicalSkills:CanonicalSkill[]=[
 {id:'KNY_0001',name:'紅蓮の炎',type:'能動',attachable:true},
 {id:'KNY_0002',name:'回天転運',type:'能動',attachable:true},
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

 it('shows partial skill candidates and selects an equipped skill',()=>{
  render(editor());
  const skill=screen.getByRole('combobox',{name:'大将 装着戦法1'});
  fireEvent.change(skill,{target:{value:'蓮の'}});
  fireEvent.pointerDown(screen.getByRole('option',{name:/紅蓮の炎/}));
  expect(skill).toHaveValue('紅蓮の炎');
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

 it('normalizes a stale saved inherent skill from the canonical catalog before saving',async()=>{
  const value=completeFormation();
  value.warriors[0].name='黒田官兵衛';
  value.warriors[0].inherentSkill='誤った固有';
  const save=vi.fn();
  render(editor({initial:value,onSave:save}));
  await waitFor(()=>expect(screen.getByLabelText('大将 固有戦法')).toHaveValue('七十二の計'));
  fireEvent.click(screen.getByRole('button',{name:'保存'}));
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]?.[0].warriors[0].inherentSkill).toBe('七十二の計');
 });
});

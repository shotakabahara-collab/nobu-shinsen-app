import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {CanonicalOfficer} from '../services/canonicalOfficerCatalog';
import type {CanonicalSkill} from '../services/canonicalSkillCatalog';
import {ImageFormationImporter} from './ImageFormationImporter';

const officers:CanonicalOfficer[]=[
 {id:'1',name:'山本勘助',inherentSkill:'啄木鳥戦法',unitLevelTraits:[]},
 {id:'2',name:'柴田勝家',inherentSkill:'瓶割り柴田',unitLevelTraits:[]},
 {id:'3',name:'柿崎景家',inherentSkill:'越後二天',unitLevelTraits:[]},
];
const names=['一行三昧','回天転運','会盟の陣','以戦養戦','乗勝追撃','縦横馳突'];
const skills:CanonicalSkill[]=names.map((name,index)=>({id:String(index),name,type:'能動',attachable:true,unitLevelEffects:[]}));

beforeEach(()=>{
 vi.stubGlobal('URL',{createObjectURL:vi.fn(()=>'/preview.png'),revokeObjectURL:vi.fn()});
});
afterEach(()=>vi.unstubAllGlobals());

describe('ImageFormationImporter',()=>{
 it('reviews OCR output before applying it to the formation editor',async()=>{
  const recognize=vi.fn(async()=>[{text:`騎馬\n山本勘助 2凸\n一行三昧\n回天転運\n柴田勝家 1凸\n会盟の陣\n以戦養戦\n柿崎景家 3凸\n乗勝追撃\n縦横馳突`}]);
  const apply=vi.fn();
  render(<ImageFormationImporter officers={officers} skills={skills} ownedWarriors={[]} onApply={apply} recognize={recognize}/>);
  fireEvent.click(screen.getByRole('button',{name:'開く'}));
  const file=new File(['image'],'formation.png',{type:'image/png'});
  fireEvent.change(document.querySelector('input[type="file"]')!,{target:{files:[file]}});
  fireEvent.click(screen.getByRole('button',{name:'自動解析'}));
  await screen.findByLabelText('画像解析結果');
  expect(screen.getByText('山本勘助')).toBeVisible();
  expect(screen.getByText('3凸')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'解析結果を編成へ反映'}));
  await waitFor(()=>expect(apply).toHaveBeenCalledTimes(1));
  expect(apply.mock.calls[0]?.[0]).toMatchObject({troopType:'騎馬',warriors:[{name:'山本勘助',limitBreak:2,equippedSkills:['一行三昧','回天転運']}]});
 });

 it('accepts pasted image clipboard data',()=>{
  render(<ImageFormationImporter officers={officers} skills={skills} ownedWarriors={[]} onApply={()=>{}} recognize={async()=>[]}/>);
  fireEvent.click(screen.getByRole('button',{name:'開く'}));
  const zone=screen.getByText('写真を選ぶ・撮影する・画像を貼り付ける').closest('[tabindex="0"]')!;
  const file=new File(['image'],'clipboard.png',{type:'image/png'});
  fireEvent.paste(zone,{clipboardData:{items:[{type:'image/png',getAsFile:()=>file}]}});
  expect(screen.getByAltText('読込画像1')).toBeVisible();
 });
});

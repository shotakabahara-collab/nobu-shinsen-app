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
const skills:CanonicalSkill[]=names.map((name,index)=>({id:String(index),name,type:'能動',attachable:true,slotType:'normal',allowedUnitTypes:[],unitLevelEffects:[]}));

beforeEach(()=>{
 let preview=0;
 vi.stubGlobal('URL',{createObjectURL:vi.fn(()=>`/preview-${++preview}.png`),revokeObjectURL:vi.fn()});
});
afterEach(()=>vi.unstubAllGlobals());

describe('ImageFormationImporter',()=>{
 it('offers distinct photo library and camera inputs',()=>{
  render(<ImageFormationImporter officers={officers} skills={skills} ownedWarriors={[]} onApply={()=>{}} recognize={async()=>[]}/>);
  fireEvent.click(screen.getByRole('button',{name:'開く'}));
  expect(screen.getByRole('button',{name:'写真ライブラリから選ぶ'})).toBeVisible();
  expect(screen.getByRole('button',{name:'カメラで撮影'})).toBeVisible();
  const library=screen.getByLabelText('写真ライブラリから画像を選択');
  const camera=screen.getByLabelText('カメラで画像を撮影');
  expect(library).toHaveAttribute('multiple');
  expect(library).not.toHaveAttribute('capture');
  expect(camera).toHaveAttribute('capture','environment');
  expect(camera).not.toHaveAttribute('multiple');
 });

 it('reviews OCR output before applying a photo-library image to the formation editor',async()=>{
  const recognize=vi.fn(async()=>[{text:`騎馬\n山本勘助 2凸\n一行三昧\n回天転運\n柴田勝家 1凸\n会盟の陣\n以戦養戦\n柿崎景家 3凸\n乗勝追撃\n縦横馳突`}]);
  const apply=vi.fn();
  render(<ImageFormationImporter officers={officers} skills={skills} ownedWarriors={[]} onApply={apply} recognize={recognize}/>);
  fireEvent.click(screen.getByRole('button',{name:'開く'}));
  const file=new File(['image'],'formation.png',{type:'image/png'});
  fireEvent.change(screen.getByLabelText('写真ライブラリから画像を選択'),{target:{files:[file]}});
  fireEvent.click(screen.getByRole('button',{name:'自動解析'}));
  await screen.findByLabelText('画像解析結果');
  expect(screen.getAllByText('山本勘助').length).toBeGreaterThan(0);
  expect(screen.getAllByText('3凸').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button',{name:'解析結果を編成へ反映して元画像を表示'}));
  await waitFor(()=>expect(apply).toHaveBeenCalledTimes(1));
  const applied=apply.mock.calls[0]?.[0];
  expect(applied?.troopType).toBe('騎馬');
  expect(applied?.warriors[0]).toMatchObject({name:'山本勘助',limitBreak:2,equippedSkills:['一行三昧','回天転運']});
  expect(applied?.warriors[1]).toMatchObject({name:'柴田勝家',limitBreak:1,equippedSkills:['会盟の陣','以戦養戦']});
  expect(applied?.warriors[2]).toMatchObject({name:'柿崎景家',limitBreak:3,equippedSkills:['乗勝追撃','縦横馳突']});
  expect(screen.getByRole('region',{name:'編集中の元画像'})).toBeVisible();
  expect(screen.getByAltText('編集中の元画像1')).toBeVisible();
  expect(screen.getByText(/武将や戦法を入れ替え・編集しても、元画像はこの編集画面を閉じるまで保持されます/)).toBeVisible();

  fireEvent.click(screen.getByRole('button',{name:'画像を隠す'}));
  expect(screen.queryByRole('region',{name:'編集中の元画像'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'元画像を表示'}));
  expect(screen.getByAltText('編集中の元画像1')).toBeVisible();
 });

 it('keeps multiple source photos available for switching and full-screen reference after applying',async()=>{
  const recognize=vi.fn(async()=>[{text:`騎馬\n山本勘助 2凸\n一行三昧\n回天転運\n柴田勝家 1凸\n会盟の陣\n以戦養戦\n柿崎景家 3凸\n乗勝追撃\n縦横馳突`}]);
  render(<ImageFormationImporter officers={officers} skills={skills} ownedWarriors={[]} onApply={()=>{}} recognize={recognize}/>);
  fireEvent.click(screen.getByRole('button',{name:'開く'}));
  const first=new File(['first'],'formation-1.png',{type:'image/png'});
  const second=new File(['second'],'formation-2.png',{type:'image/png'});
  fireEvent.change(screen.getByLabelText('写真ライブラリから画像を選択'),{target:{files:[first,second]}});
  fireEvent.click(screen.getByRole('button',{name:'自動解析'}));
  await screen.findByLabelText('画像解析結果');
  fireEvent.click(screen.getByRole('button',{name:'解析結果を編成へ反映して元画像を表示'}));

  expect(screen.getByAltText('編集中の元画像1')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'元画像2を表示'}));
  expect(screen.getByAltText('編集中の元画像2')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'元画像2を拡大表示'}));
  expect(screen.getByRole('dialog',{name:'元画像2の拡大表示'})).toBeVisible();
  expect(screen.getByAltText('拡大した元画像2')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'拡大表示を閉じる'}));
  expect(screen.queryByRole('dialog',{name:'元画像2の拡大表示'})).not.toBeInTheDocument();
 });

 it('accepts a camera image',()=>{
  render(<ImageFormationImporter officers={officers} skills={skills} ownedWarriors={[]} onApply={()=>{}} recognize={async()=>[]}/>);
  fireEvent.click(screen.getByRole('button',{name:'開く'}));
  const file=new File(['image'],'camera.png',{type:'image/png'});
  fireEvent.change(screen.getByLabelText('カメラで画像を撮影'),{target:{files:[file]}});
  expect(screen.getByAltText('読込画像1')).toBeVisible();
 });

 it('accepts pasted image clipboard data',()=>{
  render(<ImageFormationImporter officers={officers} skills={skills} ownedWarriors={[]} onApply={()=>{}} recognize={async()=>[]}/>);
  fireEvent.click(screen.getByRole('button',{name:'開く'}));
  const zone=screen.getByText('写真ライブラリ・カメラ・画像の貼り付けに対応').closest('[tabindex="0"]')!;
  const file=new File(['image'],'clipboard.png',{type:'image/png'});
  fireEvent.paste(zone,{clipboardData:{items:[{type:'image/png',getAsFile:()=>file}]}});
  expect(screen.getByAltText('読込画像1')).toBeVisible();
 });
});

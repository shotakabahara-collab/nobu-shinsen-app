import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {RuntimeErrorDialog} from './RuntimeErrorDialog';

const error={
 code:'NOBU-R006' as const,
 title:'対戦計算を計算エンジンが完了できませんでした',
 message:'Pyodide計算エンジンが処理を継続できませんでした。',
 action:'編成の武将・戦法を候補から選び直してください。',
 reloadRecommended:true,
};

describe('RuntimeErrorDialog',()=>{
 it('shows Japanese guidance and never renders the internal stack',()=>{
  render(<RuntimeErrorDialog error={error} onClose={()=>{}} onReload={()=>{}}/>);
  const dialog=screen.getByRole('alertdialog');
  expect(dialog).toHaveTextContent('NOBU-R006');
  expect(dialog).toHaveTextContent('対戦計算を計算エンジンが完了できませんでした');
  expect(dialog).toHaveTextContent('対処方法');
  expect(dialog).not.toHaveTextContent('wasm-function');
  expect(screen.getByRole('button',{name:'再読み込み'})).toBeVisible();
 });

 it('supports closing and reloading',()=>{
  const onClose=vi.fn(),onReload=vi.fn();
  render(<RuntimeErrorDialog error={error} onClose={onClose} onReload={onReload}/>);
  fireEvent.click(screen.getByRole('button',{name:'閉じる'}));
  fireEvent.click(screen.getByRole('button',{name:'再読み込み'}));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onReload).toHaveBeenCalledTimes(1);
 });
});

import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {AutocompleteInput,rankAutocompleteOptions,type AutocompleteOption} from './AutocompleteInput';

const options:AutocompleteOption[]=[
 {value:'松永久秀',detail:'梟雄の計'},
 {value:'松平信綱',detail:'知略'},
 {value:'黒田官兵衛',detail:'七十二の計'},
 {value:'紅蓮の炎',detail:'能動'},
];

describe('rankAutocompleteOptions',()=>{
 it('prefers prefix matches and still returns middle matches',()=>{
  expect(rankAutocompleteOptions(options,'松').map(option=>option.value)).toEqual(['松永久秀','松平信綱']);
  expect(rankAutocompleteOptions(options,'久秀').map(option=>option.value)).toEqual(['松永久秀']);
 });

 it('normalizes full-width input',()=>{
  expect(rankAutocompleteOptions([{value:'ABC戦法'}],'ＡＢＣ').map(option=>option.value)).toEqual(['ABC戦法']);
 });
});

describe('AutocompleteInput',()=>{
 it('shows partial matches and selects one by tap',()=>{
  const onChange=vi.fn();
  render(<AutocompleteInput label="武将名" value="久秀" options={options} onChange={onChange}/>);
  fireEvent.focus(screen.getByRole('combobox',{name:'武将名'}));
  const option=screen.getByRole('option',{name:/松永久秀/});
  fireEvent.pointerDown(option);
  expect(onChange).toHaveBeenLastCalledWith('松永久秀');
 });

 it('selects the active candidate with the keyboard',()=>{
  const onChange=vi.fn();
  render(<AutocompleteInput label="戦法名" value="松" options={options} onChange={onChange}/>);
  const input=screen.getByRole('combobox',{name:'戦法名'});
  fireEvent.focus(input);
  fireEvent.keyDown(input,{key:'ArrowDown'});
  fireEvent.keyDown(input,{key:'Enter'});
  expect(onChange).toHaveBeenLastCalledWith('松平信綱');
 });
});

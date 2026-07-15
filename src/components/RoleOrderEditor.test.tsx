import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import type {RankedRecommendation} from '../domain/recommendation';
import {RoleOrderEditor} from './RoleOrderEditor';

const recommendation:RankedRecommendation={
 candidate:{officers:['甲','乙','丙'],awaken:[1,2,3],unit:'騎馬',skills:['A1','A2','B1','B2','C1','C2']},
 win_rates:{target:.75},
 role_comparison:{complete:true,placements_simulated:6},
};

describe('RoleOrderEditor',()=>{
 it('swaps the entire officer package selected for commander',()=>{
  const onChange=vi.fn();render(<RoleOrderEditor recommendation={recommendation} targetId="target" onChange={onChange}/>);
  expect(screen.getByText(/探索時勝率：75.0%/)).toHaveTextContent('全6配置を同一乱数条件で比較済み');
  fireEvent.change(screen.getByRole('combobox',{name:'大将に配置する武将'}),{target:{value:'丙'}});
  expect(onChange).toHaveBeenCalledWith({officers:['丙','乙','甲'],awaken:[3,2,1],unit:'騎馬',skills:['C1','C2','B1','B2','A1','A2']});
 });

 it('locks role changes while runtime verification is running',()=>{
  render(<RoleOrderEditor recommendation={recommendation} targetId="target" disabled onChange={()=>{}}/>);
  expect(screen.getByRole('combobox',{name:'大将に配置する武将'})).toBeDisabled();
 });
});

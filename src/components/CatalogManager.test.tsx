import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {CatalogManager} from './CatalogManager';

const now=new Date().toISOString();
const warrior={id:crypto.randomUUID(),name:'山本勘助',limitBreak:2,notes:'',createdAt:now,updatedAt:now};
const skill={id:crypto.randomUUID(),name:'一行三昧',category:'装着' as const,owned:true,description:'',createdAt:now,updatedAt:now};
const props=()=>({warriors:[warrior],skills:[skill],onSaveWarrior:vi.fn().mockResolvedValue(undefined),onRemoveWarrior:vi.fn().mockResolvedValue(undefined),onSaveSkill:vi.fn().mockResolvedValue(undefined),onRemoveSkill:vi.fn().mockResolvedValue(undefined)});

describe('CatalogManager',()=>{
 it('does not delete when confirmation is cancelled',()=>{vi.spyOn(window,'confirm').mockReturnValue(false);const value=props();render(<CatalogManager {...value}/>);fireEvent.click(screen.getByRole('button',{name:'山本勘助を削除'}));fireEvent.click(screen.getByRole('button',{name:'一行三昧を削除'}));expect(value.onRemoveWarrior).not.toHaveBeenCalled();expect(value.onRemoveSkill).not.toHaveBeenCalled();});
 it('deletes only after confirmation',()=>{vi.spyOn(window,'confirm').mockReturnValue(true);const value=props();render(<CatalogManager {...value}/>);fireEvent.click(screen.getByRole('button',{name:'山本勘助を削除'}));expect(value.onRemoveWarrior).toHaveBeenCalledWith(warrior.id);});
 it('edits a warrior without replacing its identity',async()=>{const value=props();render(<CatalogManager {...value}/>);fireEvent.click(screen.getByRole('button',{name:'山本勘助を編集'}));fireEvent.change(screen.getByLabelText('登録する武将名'),{target:{value:'山本勘助・改'}});fireEvent.change(screen.getByLabelText('所有凸'),{target:{value:'3'}});fireEvent.click(screen.getByRole('button',{name:'武将の変更を保存'}));await waitFor(()=>expect(value.onSaveWarrior).toHaveBeenCalledWith(expect.objectContaining({id:warrior.id,name:'山本勘助・改',limitBreak:3,createdAt:warrior.createdAt})));});
 it('edits a skill without replacing its identity',async()=>{const value=props();render(<CatalogManager {...value}/>);fireEvent.click(screen.getByRole('button',{name:'一行三昧を編集'}));fireEvent.change(screen.getByLabelText('戦法区分'),{target:{value:'固有'}});fireEvent.click(screen.getByRole('button',{name:'戦法の変更を保存'}));await waitFor(()=>expect(value.onSaveSkill).toHaveBeenCalledWith(expect.objectContaining({id:skill.id,name:skill.name,category:'固有',createdAt:skill.createdAt})));});
 it('keeps editor values and reports a failed save',async()=>{const value=props();value.onSaveWarrior.mockRejectedValue(new Error('同名の武将が存在します'));render(<CatalogManager {...value}/>);fireEvent.click(screen.getByRole('button',{name:'山本勘助を編集'}));fireEvent.click(screen.getByRole('button',{name:'武将の変更を保存'}));expect(await screen.findByRole('alert')).toHaveTextContent('同名の武将が存在します');expect(screen.getByLabelText('登録する武将名')).toHaveValue('山本勘助');});
});

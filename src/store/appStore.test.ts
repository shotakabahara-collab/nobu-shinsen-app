import {describe,expect,it} from 'vitest';
import {storageErrorMessage} from './appStore';

describe('storageErrorMessage',()=>{
 it('adds operation context without hiding the storage error',()=>expect(storageErrorMessage(new Error('QuotaExceededError'),'編成の保存')).toBe('編成の保存に失敗しました: QuotaExceededError'));
 it('handles non-Error rejections safely',()=>expect(storageErrorMessage(null,'データの読込')).toBe('データの読込に失敗しました'));
});

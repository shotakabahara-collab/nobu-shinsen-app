import {test,expect} from '@playwright/test';

test('opens on iPhone and presents generic matchup and optimizer controls',async({page,request})=>{
 await page.goto('./');
 await expect(page.getByRole('heading',{name:'NOBU Companion'})).toBeVisible();
 await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content','yes');
 await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href','apple-touch-icon.png');
 await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href','/nobu-shinsen-app/manifest.webmanifest');
 expect((await request.get('/nobu-shinsen-app/canonical_officer_catalog.json')).ok()).toBe(true);
 expect((await request.get('/nobu-shinsen-app/canonical_skill_catalog.json')).ok()).toBe(true);

 await page.getByRole('button',{name:'新規'}).click();
 const warrior=page.getByRole('combobox',{name:'大将 武将名'});
 await warrior.fill('永久');
 await page.getByRole('option',{name:/松永久秀/}).click();
 await expect(page.getByLabel('大将 固有戦法')).toHaveValue('梟雄の計');
 await expect(page.getByRole('combobox',{name:'区分'})).toHaveCount(0);
 await page.getByRole('button',{name:'キャンセル'}).click();

 await page.getByRole('button',{name:'対戦・提案'}).click();
 await expect(page.getByRole('heading',{name:'対戦・最適編成'})).toBeVisible();
 await expect(page.getByLabel('編成A')).toBeVisible();
 await expect(page.getByLabel('編成B')).toBeVisible();
 await expect(page.getByLabel('最適化対象')).toBeVisible();
 await expect(page.getByRole('button',{name:'10×1で対戦'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'最適編成を探索'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'探索',exact:true})).toHaveCount(0);

 await page.getByRole('button',{name:'データ'}).click();
 await expect(page.getByRole('region',{name:'PWA実機診断'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'武将管理'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'戦法管理'})).toBeVisible();
});

test('matches any two registered formations online and offline regardless of legacy kind',async({page,context})=>{
 test.setTimeout(300_000);
 const now='2026-07-13T00:00:00.000Z';
 const warrior=(id:string,name:string,limitBreak:number,equippedSkills:[string,string])=>({id,name,limitBreak,inherentSkill:'固有戦法',equippedSkills});
 const backup={schemaVersion:2,exportedAt:now,warriors:[],skills:[],battleResults:[],formations:[
  {id:'00000000-0000-4000-8000-000000000001',name:'山本騎馬',kind:'ally',troopType:'騎馬',troopLevel:10,troops:10000,createdAt:now,updatedAt:now,warriors:[
   warrior('10000000-0000-4000-8000-000000000001','山本勘助',2,['一行三昧','回天転運']),warrior('10000000-0000-4000-8000-000000000002','柴田勝家',1,['会盟の陣','以戦養戦']),warrior('10000000-0000-4000-8000-000000000003','柿崎景家',2,['乗勝追撃','縦横馳突'])]},
  {id:'00000000-0000-4000-8000-000000000002',name:'黒田弓',kind:'enemy',troopType:'弓',troopLevel:10,troops:10000,createdAt:now,updatedAt:now,warriors:[
   warrior('20000000-0000-4000-8000-000000000001','黒田官兵衛',3,['七十二の計','紅蓮の炎']),warrior('20000000-0000-4000-8000-000000000002','豊臣秀吉',1,['三河弓兵隊','嚢沙之計']),warrior('20000000-0000-4000-8000-000000000003','ねね',3,['罵詈雑言','沈魚落雁'])]}
 ]};

 await page.goto('./');
 await page.getByRole('button',{name:'データ'}).click();
 await page.locator('input[type="file"]').setInputFiles({name:'canonical-e2e.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await expect(page.getByText('バックアップを復元しました（編成2件）',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'対戦・提案'}).click();
 const formationA=page.getByLabel('編成A');
 const formationB=page.getByLabel('編成B');
 await expect(formationA.locator(`option[value="${backup.formations[0].id}"]`)).toHaveText('山本騎馬');
 await expect(formationA.locator(`option[value="${backup.formations[1].id}"]`)).toHaveText('黒田弓');
 await expect(formationB.locator(`option[value="${backup.formations[0].id}"]`)).toHaveText('山本騎馬');
 await expect(formationB.locator(`option[value="${backup.formations[1].id}"]`)).toHaveText('黒田弓');
 await formationA.selectOption(backup.formations[0].id);
 await formationB.selectOption(backup.formations[1].id);
 await page.getByLabel('最適化対象').selectOption(backup.formations[1].id);
 await expect(page.getByRole('button',{name:'最適編成を探索'})).toBeEnabled();

 await page.getByRole('button',{name:'10×1で対戦'}).click();
 await expect(page.getByText('山本騎馬と黒田弓の計算が完了しました',{exact:true})).toBeVisible({timeout:170_000});
 await expect(page.getByText('山本騎馬の勝率')).toBeVisible();
 await expect(page.getByText('B223_CANONICAL_PYTHON_VIA_PYODIDE')).toBeVisible();
 await expect(page.getByText(/山本騎馬 vs 黒田弓/)).toBeVisible();

 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await context.setOffline(true);
 await page.reload();
 await expect(page.getByText('オフラインで利用中',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'対戦・提案'}).click();
 await page.getByLabel('編成A').selectOption(backup.formations[0].id);
 await page.getByLabel('編成B').selectOption(backup.formations[1].id);
 await page.getByRole('button',{name:'10×1で対戦'}).click();
 await expect(page.getByText('山本騎馬と黒田弓の計算が完了しました',{exact:true})).toBeVisible({timeout:170_000});
 await expect(page.getByText('B223_CANONICAL_PYTHON_VIA_PYODIDE')).toBeVisible();
});

test('shows a Japanese popup instead of a raw Pyodide stack',async({page})=>{
 const now='2026-07-13T00:00:00.000Z';
 const warrior=(id:string,name:string,equippedSkills:[string,string])=>({id,name,limitBreak:0,inherentSkill:'固有戦法',equippedSkills});
 const backup={schemaVersion:2,exportedAt:now,warriors:[],skills:[],battleResults:[],formations:[
  {id:'30000000-0000-4000-8000-000000000001',name:'検証A',kind:'ally',troopType:'騎馬',troopLevel:10,troops:10000,createdAt:now,updatedAt:now,warriors:[warrior('31000000-0000-4000-8000-000000000001','山本勘助',['一行三昧','回天転運']),warrior('31000000-0000-4000-8000-000000000002','柴田勝家',['会盟の陣','以戦養戦']),warrior('31000000-0000-4000-8000-000000000003','柿崎景家',['乗勝追撃','縦横馳突'])]},
  {id:'30000000-0000-4000-8000-000000000002',name:'検証B',kind:'enemy',troopType:'弓',troopLevel:10,troops:10000,createdAt:now,updatedAt:now,warriors:[warrior('32000000-0000-4000-8000-000000000001','黒田官兵衛',['七十二の計','紅蓮の炎']),warrior('32000000-0000-4000-8000-000000000002','豊臣秀吉',['三河弓兵隊','嚢沙之計']),warrior('32000000-0000-4000-8000-000000000003','ねね',['罵詈雑言','沈魚落雁'])]}
 ]};

 await page.addInitScript(()=>{
  class FailingWorker{
   onmessage:((event:MessageEvent)=>void)|null=null;
   onerror:((event:ErrorEvent)=>void)|null=null;
   onmessageerror:((event:MessageEvent)=>void)|null=null;
   postMessage(message:{requestId:string}){setTimeout(()=>this.onmessage?.({data:{type:'error',requestId:message.requestId,message:'PythonError',details:'new_error@https://example.test/pyodide.asm.js:10:977 308@wasm-function[308]'}} as MessageEvent),0);}
   terminate(){}
  }
  Object.defineProperty(globalThis,'Worker',{value:FailingWorker,writable:true});
 });
 await page.goto('./');
 await page.getByRole('button',{name:'データ'}).click();
 await page.locator('input[type="file"]').setInputFiles({name:'runtime-error-e2e.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await page.getByRole('button',{name:'対戦・提案'}).click();
 await page.getByLabel('編成A').selectOption(backup.formations[0].id);
 await page.getByLabel('編成B').selectOption(backup.formations[1].id);
 await page.getByRole('button',{name:'10×1で対戦'}).click();
 const dialog=page.getByRole('alertdialog');
 await expect(dialog).toContainText('NOBU-R006');
 await expect(dialog).toContainText('対戦計算を計算エンジンが完了できませんでした');
 await expect(dialog).toContainText('対処方法');
 await expect(dialog).not.toContainText('wasm-function');
 await expect(page.getByText('new_error@',{exact:false})).toHaveCount(0);
});

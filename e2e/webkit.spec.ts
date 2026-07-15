import {expect,test} from '@playwright/test';

test.setTimeout(600_000);

const now='2026-07-13T00:00:00.000Z';
const warrior=(id:string,name:string,limitBreak:number,equippedSkills:[string,string])=>({id,name,limitBreak,inherentSkill:'固有戦法',equippedSkills});
const backup={
 schemaVersion:2,
 exportedAt:now,
 warriors:[],
 skills:[],
 battleResults:[],
 formations:[
  {id:'00000000-0000-4000-8000-000000000001',name:'山本騎馬',kind:'ally',troopType:'騎馬',troopLevel:10,troops:10000,createdAt:now,updatedAt:now,warriors:[
   warrior('10000000-0000-4000-8000-000000000001','山本勘助',2,['一行三昧','回天転運']),
   warrior('10000000-0000-4000-8000-000000000002','柴田勝家',1,['会盟の陣','以戦養戦']),
   warrior('10000000-0000-4000-8000-000000000003','柿崎景家',2,['乗勝追撃','縦横馳突']),
  ]},
  {id:'00000000-0000-4000-8000-000000000002',name:'黒田弓',kind:'enemy',troopType:'弓',troopLevel:10,troops:10000,createdAt:now,updatedAt:now,warriors:[
   warrior('20000000-0000-4000-8000-000000000001','黒田官兵衛',3,['七十二の計','紅蓮の炎']),
   warrior('20000000-0000-4000-8000-000000000002','豊臣秀吉',1,['三河弓兵隊','嚢沙之計']),
   warrior('20000000-0000-4000-8000-000000000003','ねね',3,['罵詈雑言','沈魚落雁']),
  ]},
 ],
};

test('runs the real 100-battle canonical flow in an iPhone WebKit environment',async({page})=>{
 await page.goto('./');
 await expect(page.getByRole('heading',{name:'NOBU Companion'})).toBeVisible();
 await expect(page.getByText('正本準拠シミュレーション',{exact:true})).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/b223/i);
 expect(await page.evaluate(()=>navigator.userAgent)).toContain('AppleWebKit');
 await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content','yes');
 await expect(page.getByText('iPhoneホーム画面に追加')).toBeVisible();

 await page.getByRole('button',{name:'データ'}).click();
 await page.locator('input[type="file"]').setInputFiles({name:'webkit-canonical-e2e.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await expect(page.getByText('バックアップを復元しました（編成2件）',{exact:true})).toBeVisible();

 await page.getByRole('button',{name:'対戦・提案'}).click();
 await page.getByLabel('編成A').selectOption(backup.formations[0].id);
 await page.getByLabel('編成B').selectOption(backup.formations[1].id);
 await page.getByRole('button',{name:'100戦で対戦'}).click();
 await expect(page.getByText('山本騎馬と黒田弓の100戦計算が完了しました',{exact:true})).toBeVisible({timeout:540_000});
 await expect(page.getByText('山本騎馬の勝率')).toBeVisible();
 await expect(page.getByText('正本準拠エンジンで計算済み',{exact:true})).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/b223/i);
 await expect(page.getByText(/HP差.*100戦/)).toBeVisible();
 const battleLog=page.getByRole('button',{name:/山本騎馬 vs 黒田弓/});
 await expect(battleLog).toContainText('100戦');
 await battleLog.click();
 await expect(page.getByRole('region',{name:'100戦結果'}).getByText('100戦の勝率')).toBeVisible();
 await expect(page.getByRole('region',{name:'戦闘例'})).toBeVisible();
});
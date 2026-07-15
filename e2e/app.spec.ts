import {test,expect} from '@playwright/test';

test('opens on iPhone and presents visible image import, photo library and camera controls',async({page,request})=>{
 await page.goto('./');
 await expect(page.getByRole('heading',{name:'NOBU Companion'})).toBeVisible();
 await expect(page.getByText('正本準拠シミュレーション',{exact:true})).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/b223/i);
 await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content','yes');
 await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href','apple-touch-icon.png');
 await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href','/nobu-shinsen-app/manifest.webmanifest');
 expect((await request.get('/nobu-shinsen-app/canonical_officer_catalog.json')).ok()).toBe(true);
 expect((await request.get('/nobu-shinsen-app/canonical_officer_stats_catalog.json')).ok()).toBe(true);
 expect((await request.get('/nobu-shinsen-app/canonical_skill_catalog.json')).ok()).toBe(true);

 const imageEntry=page.getByRole('button',{name:'画像から編成登録'});
 await expect(imageEntry).toBeVisible();
 await imageEntry.click();
 await expect(page.getByRole('region',{name:'画像から編成を読み込む'})).toBeVisible();
 await expect(page.getByText('写真ライブラリ・カメラ・画像の貼り付けに対応')).toBeVisible();
 await expect(page.getByRole('button',{name:'写真ライブラリから選ぶ'})).toBeVisible();
 await expect(page.getByRole('button',{name:'カメラで撮影'})).toBeVisible();
 const libraryInput=page.getByLabel('写真ライブラリから画像を選択');
 const cameraInput=page.getByLabel('カメラで画像を撮影');
 await expect(libraryInput).toHaveAttribute('multiple','');
 await expect(libraryInput).not.toHaveAttribute('capture');
 await expect(cameraInput).toHaveAttribute('capture','environment');
 await expect(cameraInput).not.toHaveAttribute('multiple');
 const warrior=page.getByRole('combobox',{name:'大将 武将名'});
 await warrior.fill('永久');
 await page.getByRole('option',{name:/松永久秀/}).click();
 await expect(page.getByLabel('大将 固有戦法')).toHaveValue('梟雄の計');
 await expect(page.getByText('正本準拠の評価仕様に従い、兵力は各武将10,000固定です。')).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/b223/i);
 await expect(page.getByRole('combobox',{name:'区分'})).toHaveCount(0);
 await page.getByRole('button',{name:'キャンセル'}).click();

 await page.getByRole('button',{name:'対戦・提案'}).click();
 await expect(page.getByRole('heading',{name:'対戦・最適編成'})).toBeVisible();
 await expect(page.getByLabel('編成A')).toBeVisible();
 await expect(page.getByLabel('編成B')).toBeVisible();
 await expect(page.getByLabel('最適化対象')).toBeVisible();
 await expect(page.getByText('順方向50戦＋逆方向50戦の合計100戦で勝率を算出します。')).toBeVisible();
 await expect(page.getByRole('button',{name:'100戦で対戦'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'最適編成を探索'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'探索',exact:true})).toHaveCount(0);

 await page.getByRole('button',{name:'データ'}).click();
 await expect(page.getByRole('region',{name:'PWA実機診断'})).toBeVisible();
 await expect(page.getByText('オンラインで正本準拠計算')).toBeVisible();
 await expect(page.getByRole('button',{name:'オンライン正本準拠診断'})).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/b223/i);
 await expect(page.getByRole('heading',{name:'武将管理'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'戦法管理'})).toBeVisible();
});

test('runs 100 balanced battles and shows one win and loss example through T8 online and offline',async({page,context})=>{
 test.setTimeout(600_000);
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
 const formationA=page.getByLabel('編成A');const formationB=page.getByLabel('編成B');
 await formationA.selectOption(backup.formations[0].id);await formationB.selectOption(backup.formations[1].id);
 await page.getByLabel('最適化対象').selectOption(backup.formations[1].id);
 await expect(page.getByRole('button',{name:'最適編成を探索'})).toBeEnabled();

 await page.getByRole('button',{name:'100戦で対戦'}).click();
 await expect(page.getByText('山本騎馬と黒田弓の100戦計算が完了しました',{exact:true})).toBeVisible({timeout:420_000});
 await expect(page.getByText('山本騎馬の勝率')).toBeVisible();
 await expect(page.getByText(/HP差.*100戦/)).toBeVisible();
 await expect(page.getByText('正本準拠エンジンで計算済み',{exact:true})).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/b223/i);
 const battleLog=page.getByRole('button',{name:/山本騎馬 vs 黒田弓/});await expect(battleLog).toContainText('100戦');await battleLog.click();
 await expect(page.getByRole('region',{name:'Battle Log詳細'})).toBeVisible();
 const summary=page.getByRole('region',{name:'100戦結果'});await expect(summary.getByText('100戦の勝率')).toBeVisible();
 const statuses=page.getByRole('region',{name:'6武将ステータス'});await expect(statuses.getByLabel('A 山本勘助 ステータス')).toBeVisible();await expect(statuses.getByLabel('B 黒田官兵衛 ステータス')).toBeVisible();
 const examples=page.getByRole('region',{name:'戦闘例'});await expect(examples.getByText('勝ち例',{exact:true})).toHaveCount(1);await expect(examples.getByText('負け例',{exact:true})).toHaveCount(1);
 await expect(examples.getByText(/T8.*戦闘終了済み/).first()).toBeVisible();await expect(examples.getByText('行動内容・兵数増減').first()).toBeVisible();await expect(examples.getByText(/兵数 [+-]/).first()).toBeVisible();
 await page.getByRole('button',{name:'閉じる'}).click();

 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await context.setOffline(true);await page.reload();
 await expect(page.getByText('オフラインで利用中',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'対戦・提案'}).click();
 await page.getByRole('button',{name:/山本騎馬 vs 黒田弓/}).first().click();
 await expect(page.getByRole('region',{name:'100戦結果'}).getByText('100戦の勝率')).toBeVisible();
 const offlineExamples=page.getByRole('region',{name:'戦闘例'});await expect(offlineExamples.getByText('勝ち例',{exact:true})).toHaveCount(1);await expect(offlineExamples.getByText('負け例',{exact:true})).toHaveCount(1);await expect(offlineExamples.getByText(/T8.*戦闘終了済み/).first()).toBeVisible();
});

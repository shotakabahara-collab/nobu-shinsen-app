import {test,expect} from '@playwright/test';

test('opens on iPhone and validates formation skill and troop-level rules',async({page,request})=>{
 await page.goto('./');
 await expect(page.getByRole('heading',{name:'NOBU Companion'})).toBeVisible();
 await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content','yes');
 await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href','apple-touch-icon.png');
 await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href','/nobu-shinsen-app/manifest.webmanifest');
 await expect(page.getByText('iPhoneホーム画面に追加')).toBeVisible();
 expect((await request.get('/nobu-shinsen-app/apple-touch-icon.png')).ok()).toBe(true);
 expect((await request.get('/nobu-shinsen-app/canonical_officer_catalog.json')).ok()).toBe(true);
 expect((await request.get('/nobu-shinsen-app/canonical_skill_catalog.json')).ok()).toBe(true);
 await page.getByRole('button',{name:'新規'}).click();
 const warrior=page.getByRole('combobox',{name:'大将 武将名'});
 await warrior.fill('永久');
 await page.getByRole('option',{name:/松永久秀/}).click();
 await expect(warrior).toHaveValue('松永久秀');
 await expect(page.getByLabel('大将 固有戦法')).toHaveValue('梟雄の計');
 await expect(page.getByLabel('大将 固有戦法')).toHaveAttribute('readonly');
 await expect(page.getByText('正本DB自動')).toBeVisible();

 const troopLevel=page.getByRole('spinbutton',{name:'兵種Lv',exact:true});
 await expect(troopLevel).toHaveAttribute('readonly');
 await expect(troopLevel).not.toHaveAttribute('max');
 await page.getByRole('combobox',{name:'兵種',exact:true}).selectOption('鉄砲');
 await page.getByRole('spinbutton',{name:'大将 凸'}).fill('3');
 await expect(troopLevel).toHaveValue('8');
 await expect(page.getByLabel('兵種Lv計算根拠')).toContainText('松永久秀「砲術Ⅲ」+3');
 await expect(page.getByLabel('兵種Lv計算根拠')).toContainText('上限10');

 const skill=page.getByRole('combobox',{name:'大将 装着戦法1'});
 await skill.fill('梟雄');
 await expect(page.getByRole('option',{name:/梟雄の計/})).toHaveCount(0);
 await skill.fill('蓮の');
 await page.getByRole('option',{name:/紅蓮の炎/}).click();
 await expect(skill).toHaveValue('紅蓮の炎');

 const duplicate=page.getByRole('combobox',{name:'副将1 装着戦法2'});
 await duplicate.fill('蓮の');
 await page.getByRole('option',{name:/紅蓮の炎/}).click();
 const warning=page.getByRole('alertdialog');
 await expect(warning).toContainText('装着戦法が重複しています');
 await expect(warning).toContainText('大将の装着戦法1');
 await warning.getByRole('button',{name:'確認'}).click();
 await expect(duplicate).toHaveValue('蓮の');

 await page.getByRole('combobox',{name:'兵種',exact:true}).selectOption('騎馬');
 const uncappedOfficers=['柿崎景家','北条綱成','榊原康政'];
 for(const [index,role] of ['大将','副将1','副将2'].entries())await page.getByRole('combobox',{name:`${role} 武将名`}).fill(uncappedOfficers[index]!);
 await expect(troopLevel).toHaveValue('14');
 await expect(page.getByLabel('兵種Lv計算根拠')).toContainText('上限解放済み・天井なし');
 await expect(page.getByLabel('兵種Lv計算根拠')).not.toContainText('上限11');

 await page.getByRole('button',{name:'キャンセル'}).click();
 await page.getByRole('button',{name:'対戦'}).click();
 await expect(page.getByRole('button',{name:'10×1で計算'})).toBeDisabled();
 await page.getByRole('button',{name:'探索'}).click();
 await expect(page.getByRole('button',{name:'探索を開始'})).toBeDisabled();
 await page.getByRole('button',{name:'データ'}).click();
 await expect(page.getByRole('region',{name:'PWA実機診断'})).toBeVisible();
 await expect(page.getByText('物理iPhoneリリース診断 未完了')).toBeVisible();
 await expect(page.getByRole('button',{name:'オンライン実b223自己診断'})).toBeVisible();
 await expect(page.getByRole('list',{name:'リリース診断項目'})).toContainText('機内モードで実b223計算');
 await expect(page.getByRole('heading',{name:'武将管理'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'戦法管理'})).toBeVisible();
 await expect(page.getByRole('button',{name:/Export/})).toBeVisible();
 await expect(page.getByRole('button',{name:/Import/})).toBeVisible();
});

test('calculates a reproducible real-data battle online and offline through b223',async({page,context})=>{
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
 await page.getByRole('button',{name:'対戦'}).click();
 await expect(page.getByLabel('自軍')).toHaveValue(backup.formations[0].id);
 await expect(page.getByLabel('敵軍')).toHaveValue(backup.formations[1].id);
 await page.getByRole('button',{name:'10×1で計算'}).click();
 await expect(page.getByText('計算が完了しました',{exact:true})).toBeVisible({timeout:170_000});
 await expect(page.getByText('実勝率')).toBeVisible();
 await expect(page.getByText('B223_CANONICAL_PYTHON_VIA_PYODIDE')).toBeVisible();
 await expect(page.getByRole('button',{name:/HP差/})).toBeVisible();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await context.setOffline(true);
 await page.reload();
 await expect(page.getByRole('heading',{name:'NOBU Companion'})).toBeVisible();
 await expect(page.getByText('オフラインで利用中',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'対戦'}).click();
 await expect(page.getByLabel('自軍')).toHaveValue(backup.formations[0].id);
 await expect(page.getByLabel('敵軍')).toHaveValue(backup.formations[1].id);
 await page.getByRole('button',{name:'10×1で計算'}).click();
 await expect(page.getByText('計算が完了しました',{exact:true})).toBeVisible({timeout:170_000});
 await expect(page.getByText('B223_CANONICAL_PYTHON_VIA_PYODIDE')).toBeVisible();
});

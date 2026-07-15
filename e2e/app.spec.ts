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
 expect((await request.get('/nobu-shinsen-app/battle-example-api.py')).ok()).toBe(true);

 const imageEntry=page.getByRole('button',{name:'画像から編成登録'});
 await expect(imageEntry).toBeVisible();await imageEntry.click();
 await expect(page.getByRole('region',{name:'画像から編成を読み込む'})).toBeVisible();
 await expect(page.getByText('写真ライブラリ・カメラ・画像の貼り付けに対応')).toBeVisible();
 await expect(page.getByRole('button',{name:'写真ライブラリから選ぶ'})).toBeVisible();
 await expect(page.getByRole('button',{name:'カメラで撮影'})).toBeVisible();
 const libraryInput=page.getByLabel('写真ライブラリから画像を選択');const cameraInput=page.getByLabel('カメラで画像を撮影');
 await expect(libraryInput).toHaveAttribute('multiple','');await expect(libraryInput).not.toHaveAttribute('capture');
 await expect(cameraInput).toHaveAttribute('capture','environment');await expect(cameraInput).not.toHaveAttribute('multiple');
 const warrior=page.getByRole('combobox',{name:'大将 武将名'});await warrior.fill('永久');await page.getByRole('option',{name:/松永久秀/}).click();
 await expect(page.getByLabel('大将 固有戦法')).toHaveValue('梟雄の計');
 await expect(page.getByText('正本準拠の評価仕様に従い、兵力は各武将10,000固定です。')).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/b223/i);await expect(page.getByRole('combobox',{name:'区分'})).toHaveCount(0);await page.getByRole('button',{name:'キャンセル'}).click();

 await page.getByRole('button',{name:'対戦・提案'}).click();
 await expect(page.getByRole('heading',{name:'対戦・最適編成'})).toBeVisible();
 await expect(page.getByRole('button',{name:'100戦／方向で対戦'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'最適編成を探索'})).toBeDisabled();
 await page.getByRole('button',{name:'データ'}).click();
 await expect(page.getByRole('region',{name:'PWA実機診断'})).toBeVisible();
 await expect(page.getByText('オンラインで正本準拠計算')).toBeVisible();
 await expect(page.getByRole('heading',{name:'武将管理'})).toBeVisible();await expect(page.getByRole('heading',{name:'戦法管理'})).toBeVisible();
});

test('shows 100-run win-loss examples, T1-T8 actions and troop changes online and offline',async({page,context})=>{
 const now='2026-07-15T00:00:00.000Z';
 const warrior=(id:string,name:string,limitBreak:number,equippedSkills:[string,string])=>({id,name,limitBreak,inherentSkill:`${name}固有`,equippedSkills});
 const formations=[
  {id:'00000000-0000-4000-8000-000000000001',name:'山本騎馬',kind:'ally',troopType:'騎馬',troopLevel:10,troops:10000,createdAt:now,updatedAt:now,warriors:[warrior('10000000-0000-4000-8000-000000000001','山本勘助',2,['一行三昧','回天転運']),warrior('10000000-0000-4000-8000-000000000002','柴田勝家',1,['会盟の陣','以戦養戦']),warrior('10000000-0000-4000-8000-000000000003','柿崎景家',2,['乗勝追撃','縦横馳突'])]},
  {id:'00000000-0000-4000-8000-000000000002',name:'黒田弓',kind:'enemy',troopType:'弓',troopLevel:10,troops:10000,createdAt:now,updatedAt:now,warriors:[warrior('20000000-0000-4000-8000-000000000001','黒田官兵衛',3,['七十二の計','紅蓮の炎']),warrior('20000000-0000-4000-8000-000000000002','豊臣秀吉',1,['三河弓兵隊','嚢沙之計']),warrior('20000000-0000-4000-8000-000000000003','ねね',3,['罵詈雑言','沈魚落雁'])]},
 ];
 const stat=(value:number)=>({force:value,intel:value+1,lead:value+2,speed:value+3});
 const snapOfficer=(side:'A'|'B',slot:0|1|2,name:string,value:number)=>({side,formationName:side==='A'?'山本騎馬':'黒田弓',troopType:side==='A'?'騎馬':'弓',troopLevel:10,role:slot===0?'大将':slot===1?'副将1':'副将2',slot,name,limitBreak:2,troops:10000,inherentSkill:`${name}固有`,equippedSkills:[`${name}戦法1`,`${name}戦法2`],allocationPoints:70,base:stat(value-10),allocated:stat(value),actionOrderSpeed:value+3,statState:'VERIFIED'});
 const battleSnapshot={schemaVersion:1,source:'canonical_officer_stats_catalog',sides:{A:{side:'A',formationId:formations[0].id,formationName:'山本騎馬',troopType:'騎馬',troopLevel:10,officers:[snapOfficer('A',0,'山本勘助',150),snapOfficer('A',1,'柴田勝家',140),snapOfficer('A',2,'柿崎景家',130)]},B:{side:'B',formationId:formations[1].id,formationName:'黒田弓',troopType:'弓',troopLevel:10,officers:[snapOfficer('B',0,'黒田官兵衛',145),snapOfficer('B',1,'豊臣秀吉',135),snapOfficer('B',2,'ねね',125)]}}};
 const start=[['A','山本勘助',10000],['A','柴田勝家',10000],['A','柿崎景家',10000],['B','黒田官兵衛',10000],['B','豊臣秀吉',10000],['B','ねね',10000]].map(([side,officer,troops])=>({side,officer,troops}));
 const end=start.map(row=>row.officer==='黒田官兵衛'?{...row,troops:9000}:row);
 const activeTurn={turn:1,status:'active',startTroops:start,endTroops:end,turnStartEvents:[],turnStartChanges:[],actions:[{rank:1,side:'A',rawSide:'A',officer:'山本勘助',role:'大将',effectiveSpeed:153,baseSpeed:153,timedSpeedBonus:0,persistentSpeedBonus:0,events:['A:山本勘助 通常攻撃 -> B:黒田官兵衛 1000'],troopChanges:[{side:'B',officer:'黒田官兵衛',before:10000,after:9000,delta:-1000,kind:'troops',source:'通常攻撃'}]}],turnEndChanges:[]};
 const ended=(turn:number)=>({turn,status:'battle_ended',startTroops:end,endTroops:end,turnStartEvents:[],turnStartChanges:[],actions:[],turnEndChanges:[]});
 const example=(outcome:'win'|'loss',seed:number)=>({outcome,direction:'forward',seed,winner:outcome==='win'?'A':'B',winReason:'commander_kill',endedTurn:1,maxTurns:8,hpDiff:outcome==='win'?1000:-1000,turns:[activeTurn,...[2,3,4,5,6,7,8].map(ended)]});
 const payload={battle_snapshot:battleSnapshot,battle_examples:{schemaVersion:1,trialsPerDirection:100,directions:2,completedTrials:200,candidateWins:120,candidateLosses:80,draws:0,selectionPolicy:'test',examples:[example('win',100),example('loss',200)]}};
 const battleResult={id:'00000000-0000-4000-8000-000000000003',allyId:formations[0].id,enemyId:formations[1].id,createdAt:now,status:'completed',winRate:.6,hpDiff:100,trials:100,blocks:1,runtime:'runtime',payload};
 const backup={schemaVersion:2,exportedAt:now,warriors:[],skills:[],formations,battleResults:[battleResult]};

 await page.goto('./');await page.getByRole('button',{name:'データ'}).click();
 await page.locator('input[type="file"]').setInputFiles({name:'battle-log-e2e.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await expect(page.getByText('バックアップを復元しました（編成2件）',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'対戦・提案'}).click();
 await expect(page.getByRole('button',{name:'100戦／方向で対戦'})).toBeEnabled();
 await page.getByRole('button',{name:/山本騎馬 vs 黒田弓/}).click();
 await expect(page.getByRole('region',{name:'100戦勝率'})).toContainText('60.0%');
 await expect(page.getByRole('region',{name:'100戦勝率'})).toContainText('完了200試行');
 await expect(page.getByRole('region',{name:'勝敗別戦闘例'})).toBeVisible();
 await expect(page.getByRole('button',{name:'勝ち例1'})).toBeVisible();await expect(page.getByRole('button',{name:'負け例1'})).toBeVisible();
 await expect(page.getByRole('button',{name:'勝ち例2'})).toHaveCount(0);await expect(page.getByRole('button',{name:'負け例2'})).toHaveCount(0);
 await expect(page.getByText('T1',{exact:true})).toBeVisible();await expect(page.getByText('T8',{exact:true})).toBeVisible();
 await expect(page.getByText(/通常攻撃 -> B:黒田官兵衛 1000/)).toBeVisible();
 await expect(page.getByText(/10,000 → 9,000/)).toBeVisible();
 await page.getByRole('button',{name:'負け例1'}).click();await expect(page.getByText(/seed 200/)).toBeVisible();
 await page.getByRole('button',{name:'閉じる'}).click();

 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await context.setOffline(true);await page.reload();
 await expect(page.getByText('オフラインで利用中',{exact:true})).toBeVisible();await page.getByRole('button',{name:'対戦・提案'}).click();await page.getByRole('button',{name:/山本騎馬 vs 黒田弓/}).click();
 await expect(page.getByRole('region',{name:'100戦勝率'})).toContainText('60.0%');await expect(page.getByText('T8',{exact:true})).toBeVisible();
});

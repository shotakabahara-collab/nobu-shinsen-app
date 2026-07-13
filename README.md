# NOBU Companion

『信長の野望 真戦』の編成を管理し、保護された b223 battle runtime で対戦評価と編成探索を行う、iPhone対応PWAです。

## 検証済みの実装

- 3武将・凸・固有戦法・装着戦法・兵種・兵種Lvを含む自軍／敵軍編成の作成・編集・削除
- 武将・所有戦法の管理、IndexedDB永続化、全データのJSON Import / Export
- b223の `calculate` / `search` / `formal` 境界、実勝率・計算状態・エラー表示
- Battle Log保存・詳細表示、所有データを使う予算制限付き探索、30×3正式再評価
- iPhoneセーフエリア・ホーム画面用アイコン・standalone表示・オフラインキャッシュ
- 固定SHAのcanonical archive・battle runtime・runtime bundleを用いた改変検知
- Vitest、Python runtime E2E、Chromium iPhone viewport E2E、WebKit iPhone互換E2E

探索結果はb223が評価した予算内の候補であり、大域最適や生成AIによる推論とは表示しません。

## 正本保護

`canonical/NOBU_ONE_v1326p15e2b223.zip` は読み取り専用入力としてSHA-256を固定しています。build時にarchive、`02_ENGINE/battle_simulator.py`、生成runtime bundleのSHAを照合し、adapterだけを正本の外側から追加します。正本ZIPを書き換える処理はありません。

## 未検証

- iPhone Safari実機でのホーム画面追加、standalone起動、機内モード利用
- Draft PRをマージした後のGitHub Pages公開版

未検証項目は完成・PASS扱いしません。

## 検証コマンド

```sh
npm ci
npm audit --omit=dev
npm run test:runtime
npm test
npm run build
npm run test:offline
npm run test:e2e
```

# NOBU Companion

『信長の野望 真戦』の編成を管理し、保護された b223 battle runtime で対戦評価と編成探索を行う、iPhone対応PWAです。

## 検証済みの実装

- 3武将・凸・固有戦法・装着戦法・兵種・兵種Lvを含む自軍／敵軍編成の作成・編集・削除
- 武将・所有戦法の管理、IndexedDB永続化、全データのJSON Import / Export
- b223の `calculate` / `search` / `formal` 境界、実勝率・計算状態・エラー表示
- Battle Log保存・詳細表示、所有データを使う予算制限付き探索、30×3正式再評価
- 同じ3武将の大将・副将全6配置を同一乱数条件で比較し、編成編集・推奨候補の両方で役割を手動入れ替え
- 順方向50戦＋逆方向50戦の100戦評価を10戦ずつ分割し、1つのPyodide workerへ逐次送信するiPhone向けメモリ保護（失敗バッチのみ再起動・再試行）
- T1〜T8詳細traceは表示に必要な情報だけを実行中に収集し、SafariでもPython例外本文・停止段階・seedを保持
- 勝ち例／負け例のT1〜T8行動内容、対象、行動前後の兵数増減表示
- iPhoneセーフエリア・ホーム画面用アイコン・standalone表示・オフラインキャッシュ
- 固定SHAのcanonical archive・battle runtime・runtime bundleを用いた改変検知
- Vitest、Python runtime E2E、Chromium iPhone viewport E2E、WebKit iPhone互換E2E

探索結果はb223が評価した予算内の候補であり、大域最適や生成AIによる推論とは表示しません。

## 正本保護

`canonical/NOBU_ONE_v1326p15e2b223.zip` は読み取り専用入力としてSHA-256を固定しています。build時にarchive、`02_ENGINE/battle_simulator.py`、生成runtime bundleのSHAを照合し、adapterだけを正本の外側から追加します。正本ZIPを書き換える処理はありません。

## 未検証

- 物理iPhoneでの100戦分割実行の完走（WebKit自動検証とは別に公開版で最終確認）

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

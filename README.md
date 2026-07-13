# NOBU Companion

『信長の野望 真戦』の編成入力と、既存 b223 battle runtime への接続を目的としたモバイル対応Webアプリです。

## 現在の状態

- 実装済み: 型付き編成モデル、IndexedDB、JSON Import/Export、b223保護adapter、calculate/search/formal境界、実勝率表示
- 未実装: Battle Log UI、探索UI、AI提案、武将・戦法・敵編成の商用品質CRUD
- 未検証: iPhone Safari実機、Playwright mobile、初回導入後の完全オフライン動作

b223正本は `canonical/` にSHA固定で格納し、adapterは正本外に配置しています。SHAテストに合格しないbundleは生成できません。

## テスト

```sh
npm test
npm run test:runtime
npm run build
```

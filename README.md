# NOBU Companion

『信長の野望 真戦』の編成入力と、既存 b223 battle runtime への接続を目的としたモバイル対応Webアプリです。

## 現在の状態

- 実装済み: 3武将・凸・固有戦法・装着戦法2枠・兵種/Lv/兵力の入力、検証、端末保存、JSON出力
- 未実装: b223 battle runtime adapter、勝率計算、戦闘ログ、編成DB
- 未検証: b223の実データを用いたE2E戦闘再現、iPhone実機

未接続状態では勝率を表示しません。b223 battle runtime自体はこのリポジトリに含めず、変更しません。

## テスト

```sh
npm test
```

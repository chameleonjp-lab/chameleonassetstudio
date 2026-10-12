# 手動weight修正から独立consumerまでの確認（2026-10-12）

## 目的

RIG-04 のうち、製品UIで一つのvertexのweightを手動修正し、保存・backup復元・GLB出力後に、その差がconsumer上の変形へ反映されるソフトウェア経路を確認する。既存の製品rig E2Eはweight編集とbackup復元を扱うがconsumer出力は行わず、既存のconsumer統合E2Eは全頂点へ同じweightをbindするため、一頂点だけの手動weight差を出力変形まで照合するケースを追加した。

## 検査手順と主張

`e2e/native-consumer.spec.ts` の追加ケースは製品画面で箱を作り、Root/Tipを用意して全vertexへ `[0.25, 0.75]` をbindする。先頭vertexだけを `[0.5, 0.5]` に手動修正し、TipをX=0からX=1へ動かすclipを作成する。製品の「今すぐ保存」後に `.cas3dproj` backupを取得し、保存されたvertex weightsを確認する。backupを別のbrowser contextへコピー復元してGLBと `game.json` を作成し、さらに独立contextのBabylon.js consumer（9.28.0）で再生する。

consumerのrest/pose双方でstable node IDとposition oracleが一致することを確かめ、各GLB頂点のX差分を照合する。

- 手動修正した一頂点：0.5
- それ以外の頂点：0.75
- Y/Z差分：0

backup内でも修正vertexだけが `[0.5, 0.5]`、他vertexは `[0.25, 0.75]` のまま残ることを確認する。consumer fixtureの外部通信は発生しない。

## ローカル検査結果

- Chromium: 新規ケース成功（1/1）。
- WebKit: 新規ケース成功（1/1）。
- `e2e/native-consumer.spec.ts`: Chromium/WebKit合計22件成功。
- JSON検査記録とconsumer画面画像はPlaywrightテスト添付に保存する。

## 限界

これは限定した自作box・二boneのソフトウェア統合確認であり、RIG-04全体の合格ではない。未割当や異常weightの全境界、別target profile、実ユーザー作品、別GPU/物理端末、最終出荷判定は別の受け入れ条件である。`ACCEPTANCE_STATUS_2026-10-10.md` の状態をこの文書単独で昇格させない。

この差分はE2Eと検査範囲の記録のみで、製品コード、保存形式、DB、export schema、依存関係、CI workflowを変更しない。ローカルの成功と提出headのCI結果は区別する。

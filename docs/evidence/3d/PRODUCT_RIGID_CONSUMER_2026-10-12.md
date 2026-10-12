# 製品UIで作成した剛体割当の独立consumer確認（2026-10-12）

## 目的と範囲

3D要件 RIG-03 の残件から、**製品UIで行った剛体部品→骨割当が、GLB出力後に独立consumerでも骨へ追従する経路**を追加確認する。混合weightのskin、GLB出力、独立consumer自体は別の既存E2Eが対象としているため、同じ確認は重ねない。

追加した `e2e/native-consumer.spec.ts` の製品E2Eは、製品画面から2部品を作り、片方を2骨へ0.25/0.75でskin bindし、もう片方を確認後にboneへ剛体割当する。Tip骨のX移動を1秒のclipとして作り、製品のGLBと `game.json` をダウンロードする。別のPlaywright browser contextから独立Babylon.js consumer（9.28.0）へ両ファイルを渡し、stable node ID、hash、GLB/sidecar由来のnode・position oracle、skeleton/animation数を確認する。

clip終端で、consumerが検査した各頂点について次の差分を区別して照合する。

- 0.25/0.75混合skin：X方向へ0.75
- Tipへ剛体割当した部品：X方向へ1.0

この差分検査により、単にhierarchyや保存データへ骨参照があるだけでなく、出力GLB内で両方式が別々の変形として再生されることを確認する。外部通信が発生しないことも検査する。

## 実行結果

- Chromium: 新規ケース成功（1/1）。
- WebKit: 新規ケース成功（1/1）。
- `e2e/native-consumer.spec.ts`: Chromium/WebKit合計20件成功。
- JSONの検証情報とconsumer画面画像はPlaywrightのテスト添付として出力する。

## 限界

これは固定した自作fixtureとブラウザ上のソフトウェア受け入れ確認であり、RIG-03全体や3D出荷判定の完了を意味しない。実ユーザー作品・入力骨格、物理端末、実利用者の操作、全ブラウザ／GPU条件、最終のRIG-03 acceptanceは別に残る。既存の `ACCEPTANCE_STATUS_2026-10-10.md` の状態をこの文書だけで昇格させない。

本変更はE2Eとこの範囲記録だけであり、製品コード、保存形式、DB、export schema、依存関係は変更しない。PRの最終headでCIを再確認するまで、ローカル結果を提出headのCI結果として扱わない。

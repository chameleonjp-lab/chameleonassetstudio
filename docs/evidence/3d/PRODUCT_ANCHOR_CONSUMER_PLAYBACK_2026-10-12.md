# 製品UI由来bone anchorのconsumer playback（2026-10-12）

## 受け入れ範囲

製品UIで箱mesh、Root/Tipのskin、明示weight（25/75）、Tip追従anchor「Tip socket」、1秒clipを作成し、GLBとgame.jsonを出力。その2ファイルを独立したPlaywright browser contextのBabylon.js 9.28.0 consumerへ読み込む。これは既存F06の手作りconsumer fixtureとは別に、製品UIからexportまでの経路を検証する。

anchor local translationは `[0.25, 0.5, 0]`、local Z rotationは90度。Tipはrest translation `[0, 1, 0]` からclip終端で `[1, 1, 0]` へ移動する。consumerのrest anchor world position `[0.25, 1.5, 0]`、clip終端のworld position `[1.25, 1.5, 0]` と16要素world matrixを検証し、両時点のposition/node oracle passと追従先IDを確認する。

## 検証

- Chromium: `e2e/native-consumer.spec.ts` の製品anchor playback test 1/1。
- WebKit: 同テスト 1/1。
- `npm run format:check`: pass。
- `npm run test:ci-scope`: 8/8 pass。

## 残る条件

独立consumerはリポジトリ内のBabylon.js test harnessであり、Unity/Godot/Blenderなど外部engine、物理device、ゲーム側コードへのanchor適用を意味しない。実機再生・手動目視確認・外部runtimeでの座標/親追従は未検証。CIを待たずDraftのまま提出する。

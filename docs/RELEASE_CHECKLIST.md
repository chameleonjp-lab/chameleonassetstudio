# Chameleon Asset Studio リリースチェックリスト

最終更新日: 2026-07-24
対象: v1.0.0 判定
上位文書: `docs/implementation/TEST_AND_RELEASE.md` / `docs/implementation/PHASES_14_17.md`（Phase 17）

**現状: Phase 0〜17 の実装・自動テスト・文書は完了。** 実機ブラウザ確認は自動化環境では実施できないため「手動確認推奨」として残す（下記 3 章）。大画像のメモリ計測は今回のリリース完了条件に含めない（将来課題、下記 4 章）。

---

## 1. 実装・自動テスト（完了）

- [x] Phase 0〜17（+ 15.5 品質補修）が main にマージ済み
- [x] `npm run build` / `npm run lint` / `npm run format:check` が成功する
- [x] Phase 0〜17当時の最低証拠としてUnit テスト200件が成功した（現在のSlice E証拠は§1.1）
- [x] Phase 0〜17当時の最低証拠としてE2Eテスト56件（Chromium）が成功した（現在のSlice E証拠は§1.1）
- [x] 画像取り込み / 保存・再読み込み / `.casproj` roundtrip（欠落警告含む）
- [x] PNG / WebP / ZIP export（examples / helpers / engines guide 同梱）
- [x] effect アセットの作成・設定・書き出し
- [x] リグ焼き込み / モーションテンプレート
- [x] モバイルレイアウト（縦 / 横 / iPad）
- [x] 4096 x 4096 の受理と超過拒否がテストされている
- [x] 画像処理中に進捗が表示される（Web Worker 実行）
- [x] Blob URL の解放が管理されている（decodeImageSource の close 一元化 / downloadBlob の遅延 revoke）
- [x] 画像 Blob 欠落が書き出し・`.casproj` 書き出しで検出される
- [x] 旧Asset 0.1.0を既存フィールド不変で0.2.0へ移行し、`.casproj`とIndexedDB live / trash / snapshotで互換性・原子性を検証する（Project・export-presets・atlas・appは0.1.0維持）

### 1.1 Slice E optional import post-merge review-fix gate（完了）

製品実装PR #138はmerge `c188e17`でmainへ反映済みだが、独立レビュー補修前のheadだった。補修はmain `0d539ee`を基準とするPR #144で行い、最終head `1980ae6`のCI Run #450はunit 676件とChromium E2E 142件を含め全成功した。Opus 4.8を利用できなかったため、ユーザー提供のWork運用仕様に従い、仕様、実装・データ安全、テスト・端末の3担当が同じheadを独立read-only reviewし、`BLOCKER 0 / MUST 0 / SHOULD 2 / NOTE 1`を確認した。これはOpus review完了とは扱わない。PR #144は人間のmerge判断によりmerge `616d225`としてmainへ反映され、merge後のユーザー指示「#144更新されました。後続対応開始」を人間確認として記録する。

- [x] 1A + 2A + 3A / ADR-0020で入口、frame / 時間 / repeat写像、SVG安全境界を人間承認済み
- [x] PR #138 / `c188e17`で新規AssetだけがSVG / GIF / APNGを受け、layer / 連番 / sheet / tileset / atlasのPNG / JPEG / WebP gateを維持する製品実装をmainへ反映済み
- [x] Run #450でsafe SVGのrasterize・source原本、active / external CSS / font SVGの非実行・非通信・非quarantine、malformed SVGのquarantineをChromium E2Eで確認した
- [x] Run #450でGIF / APNGのcodec前寸法検査、最大16frame、全frame pixel、uniform fps / duration、preflight由来loop、APNG canonical sourceを確認した
- [x] Run #450で`ImageDecoder`不在時の先頭frame + 8fps + loss、17frame / unsupported拒否、取消 / Undo / Redo / reload、375 x 667 viewportを確認した
- [x] PR #144の最終headでmalformedかつactiveなSVGのsignature quarantine、CI全成功、固定head独立reviewの`BLOCKER 0 / MUST 0`を確認し、merge `616d225`としてmainへ反映した

## 2. 文書（完了）

- [x] `docs/REQUIREMENTS_SPECIFICATION.md`
- [x] `docs/IMPLEMENTATION_PLAN.md`（+ `docs/implementation/`）
- [x] `docs/DATA_FORMAT.md`
- [x] `docs/EXPORT_FORMATS.md`
- [x] `docs/ENGINE_INTEGRATION.md`
- [x] `docs/USER_GUIDE.md`
- [x] `docs/TEST_PLAN.md`
- [x] `docs/RELEASE_CHECKLIST.md`（本書）

## 3. 実機確認（手動確認推奨）

主要画面（ホーム / 編集 / 書き出し）と、取り込み → 編集 → 書き出しの一連を各実機で確認する。

- [ ] iPhone Safari
- [ ] iPad Safari
- [ ] Chrome（PC）
- [ ] Edge（PC）
- [ ] Firefox（PC）
- [ ] Android Chrome

Slice Eについては各実機で、Files pickerからSVG / GIF / APNGを選んだときのMIME、SVG rasterize、animated全frameまたは明示fallback、loss確認、Undo / Redo、reload、外部通信なしを確認する。Safariで`ImageDecoder`または対象MIMEが非対応の場合、先頭frame fallbackが理由付きで表示されれば仕様どおりである。

- [ ] iPhone SafariでFiles picker / native pickerからSVG / GIF / APNGを選び、渡されるMIMEとfallback理由を記録する
- [ ] iPhone Safariでsafe areaと下部操作バーが重ならず、確定・取消・loss確認を操作できる
- [ ] iPhone Safariでsoftware keyboard表示中も入力、focus、確定・取消、横overflowに問題がない

P1 Slice Cについては、Playwrightの375 × 667 / 667 × 375を実機Safariの代替にせず、Group 12完了前に確認端末・iOS・Safari・commit SHAを記録する。

- [ ] iPhone SE 2 / 3世代相当で20件以上の構成Layer一覧を縦横表示し、指スクロール、選択、確定、取消、横overflowなしを確認する
- [ ] software keyboard表示中も構成Layerの確定・取消へ到達でき、入力zoom、safe area、下部バーとの重なりがない
- [ ] 取消で正本不変、確定後のUndo / Redo / reloadで同じ`Part.layerIds`が復元される

## 4. 性能・メモリ計測（今回の完了条件に含めない・将来課題）

- [ ] 4096 x 4096 画像の取り込み〜編集〜書き出しが実機でクラッシュしない
- [ ] 連続編集でメモリが増え続けない（開発者ツールで確認）
- [ ] レイヤー多数（20+）でも編集可能なフレームレートを保つ
- [ ] スマホ実機で重い処理中も UI が完全停止しない
- [ ] iPhone SafariでSVG / GIF / APNGを連続取り込みしても実機memoryが増え続けない

## 5. 既知の残課題（リリースを妨げないが記録する）

- Godot / Unity の import helper script（設計メモ: `docs/ENGINE_INTEGRATION.md` 4 章）
- 本格的なエフェクトエディタ / パーティクル（effect はメタデータの最小対応のみ）
- Rive / Spine の取り込み補助（docs 上の関係説明のみ。互換は名乗らない）
- 大画像（4096²）連続編集のメモリ計測（4 章）
- Group 12契約監査PR #146はmerge `cb21ea4`で完了し、T1 / R1 / P1とH1=E1 / H2=L1 / H3=M1をacceptedとした。T1 Slice AはPR #153、merge `e8fac95`、P1 Slice CはPR #154、merge `1c700e7`で実装済み。ADR-2026-07-24-027でR1をB1 / B2へ分割し、B1の座標修正・構造preflight・独立rig反転コピーを先行可能とした。B2のH3数値budget、warning、hard cap、採用上限での実機確認は未着手
- PR #147 final head `1ba671f7`、merge `24a089c`でH3計測準備をmainへ反映済み。PR #148 final head `0cfc1ea`、merge `fbdeb357`で24時間配信基盤を反映し、CI Run #462 / #463は全job成功した
- H3は`docs/future/2D_3_H3_MEASUREMENT_PROTOCOL.md`に従い、PC Chromium、iPhone 17 Pro / 11 Pro Safari、iPad Pro 2018 Safariのcore結果を先に記録する。120 / 240 Frameは未採用候補
- 配信前にPages sourceが`GitHub Actions`であること、本体rootとH3 `/h3/`、画面のsource commit、開始 / 終了時刻、HTTPSを確認する。JSON保存後は`close-now`を実行してH3だけを閉じる。未完了でも24時間後に新規計測を拒否することを確認する。サービス本体も止める明示判断がない限りUnpublishしない
- 公開workflowのChromium baselineと結果schema確認が成功していることを確認する。これは参考値であり、iPhone / iPad Safari結果の代替にしない
- B1はmobile Chromium E2Eで独立rig反転コピーの利用、History不変、保存失敗rollback、reload、横overflowを確認する。物理iPhone / iPad Safariのsafe area、software keyboard、44px touch targetと、後続承認した上限のrig bake、保存・reload、memoryはB2 / Group 12 closeoutのproduct-path Gateとして確認する

## 6. リリース手順（3 の手動確認後。4 は任意）

1. 本書 3 のチェックを埋める（結果と確認日を追記する。4 は実施できる範囲で）
2. `package.json` の version を `1.0.0` に上げ、README の実装状況を更新する
3. `npm run build` の成果物（`dist/`）で最終動作確認する
4. git タグ `v1.0.0` を作成し、リリースノート（主な機能・既知の制限）を添える

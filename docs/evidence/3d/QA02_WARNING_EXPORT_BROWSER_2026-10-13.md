# QA-02 warning target and export retention — 2026-10-13 JST

**状態: 部分的な本番preview browser証拠。QA-02の受入合格ではない。**

## 対象

QA-02「warningから対象object・修正操作へ移動し、何が・なぜ・ゲームへどう影響するか・どう直すかを説明し、重要warningをexportで保持する」のうち、互換用自動透過 (`LEGACY_AUTO`) の1経路を検査した。

- 対象source/test commit: `ab9e27469c67514f48a1ed6cd6b97044e8af5115`
- Spec: `e2e/native-quality-product.spec.ts` — `a warning opens the correct material section, preserves drafts and survives package export`
- 入力は製品UIから設定した `LEGACY_AUTO` material。品質検査でwarning本文、影響 (`GLB`では明示方式へ変換)、対応方法（不透明・切抜き・半透明の確認）を確認。
- warningの「編集先を確認」操作で正しいmaterial sectionへ移動し、未保存のroughness `0.123` draftとfocusを保持。作品revisionを変更した後、古い結果からの編集リンクがdisabledになることを確認。
- その後、現行revisionを明示確認して製品出力workerからZIPを生成。画面の出力注意と `manifest.json` の双方に `Legacy alpha resolved for material <material ID>` が残り、manifest revisionが現在の編集用backup revisionと一致することを確認。

## 実行結果

| 検証 | 結果 |
| --- | --- |
| Production preview focused product E2E | Chromium + Playwright `webkit-critical`、各3回: **6/6 passed** |
| Preview builds | app + independent consumer build passed。Viteの既存 >500 kB chunk advisoryあり |
| Changed E2E static checks | Prettier、ESLint、`git diff --check` passed |

Remote CIは監視していない。

## 限界・未完了

対象warningは `LEGACY_AUTO` 1種類であり、全warning code/targetの網羅ではない。自動化したheadless browser検査であって、初回利用者による説明理解、実engine/runtimeでの描画・動作、物理端末・支援技術の受入は確認していない。検査結果はこのlocal preview snapshotとfixtureに限る。QA-02はpartialのままとし、全受入passを意味しない。

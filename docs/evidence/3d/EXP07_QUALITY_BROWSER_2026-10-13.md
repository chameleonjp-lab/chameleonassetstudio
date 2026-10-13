# EXP-07 quality browser evidence — 2026-10-13 JST

検査対象snapshotは `e01d284`（PR #397 head）。この追補では製品コードを変更せず、既存quality-panel product spec全体を本番previewで実行した。

## 実行結果

- Spec: `e2e/native-quality-product.spec.ts`、`playwright.production.config.ts`、Chromium + WebKit。6 tests/browser、計12/12 pass。
- 固定revisionの品質検査画面で未知値`gpuMemoryBytes`を確認し、他engineの実行状態を「未検証」と表示。作品編集後のstale結果表示と再検査での解除も検査した。
- 同suiteはpanel close/background時のheld worker遅着拒否、375px phone contextの操作性、材質warningからの正しい編集先移動と未保存draft保持、worker startup failure時の安全な案内/作品復旧も検査する。
- Production buildは既存large-chunk advisoryを出したが、今回のbrowser testsに失敗はない。

## 残る境界

このspecは品質検査panelのscreen/UI表示を確認するが、GLB/ZIP `manifest`内のformat・notes・runtime区分の最終表記を確認しない。現在の品質検査結果も固定fixture由来の値を実物のruntime実証へ昇格させない。実engine実行、実GPU/driver、device性能は未測定であるため、EXP-07はpartialのまま。

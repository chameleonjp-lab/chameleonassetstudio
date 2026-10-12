# RIG-06 製品UIの人型ガイド適合確認（2026-10-12）

## 範囲

- 人型ガイドの対象を「腰から胴・頭へ続き、左右に腕と脚がある二足直立形状」とUIに明記。
- ガイドの基準向きを正面 `+Z`、頭側 `+Y`、左 `-X`・右 `+X` と表示。
- 四足・非人型には適用しない注意を表示し、現在の作品revisionで適合確認を行うまでガイド追加を無効化。作品revisionが変わると確認は失効する。
- ガイドは手動fitの開始点に限定。自動fit・自動weightはしない。E2Eで確認前の非適用、確認後の7関節追加、mesh/skin重量データの不変、hipsの手動rest変更を確認。

## 検証

- Playwright Chromium: `e2e/native-rig-product.spec.ts` 7/7。
- Playwright WebKit: `e2e/native-rig-product.spec.ts` 7/7。
- Vitest: 185 files / 3,530 tests passed。
- `npm run build`: pass。既存の500 kB超chunk warningあり。
- `npm run lint`: error 0。`NativeViewportPanel.tsx:205` の既存React Hook warning 1件。
- `npm run format:check`: pass。
- `npm run test:ci-scope`: 8/8 pass。

## 残る条件

確認チェックはユーザー判断を明示化するもので、形状を自動分類・四足を自動検知するものではない。受け入れ試験は4箱の合成sceneであり、実際の人型/四足モデル、物理device、外部consumerでの目視fitは未実施。CI結果やmergeはこの作業では待たず、Draft PRのままにする。

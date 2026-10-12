# 3D製品 pointercancel 受け入れ確認 — 2026-10-12

## 目的と対象

UX-02 と実装計画 F12/T07 のうち、3D変形ハンドルのドラッグが `pointercancel` で中断された際に、未確定の変形をcommitしないことを製品UI経由で検査する。既存の `NativeEditController` 単体検査は取消を扱っていたが、ブラウザーcanvasから履歴・backupまでつながる製品E2Eの確認がなかったため補った。

## 検査内容

`e2e/native-editing-product.spec.ts` の製品E2Eで、箱のX軸変形ハンドルを実際のPlaywright mouse操作でドラッグし、未確定状態とrevision不変を確認する。その `pointerdown` の実target canvasと `pointerId` を保持し、同じcanvasへ合成 `pointercancel` を送った後、遅れて到着するmouse releaseを実行する。revisionが増えず、作成前後の独立backup内のprojectが完全一致することを確認する。

実操作後はDOMが再描画され得るため、locatorを再解決してpointer IDを取得するのではなく、`pointerdown` 時のtargetとIDを保存して同じ対象へ取消を送る。これによりテストハーネスが別canvasを誤って操作することを避ける。

## 結果

- `e2e/native-editing-product.spec.ts` — Chromium と WebKit-critical 合計 **32/32 passed**。新しいpointercancelケースは両ブラウザで通過。
- `npm test` — **185 test files / 3,530 tests passed**。
- `npm run format:check` — passed。
- `npm run lint` — errors なし。既存の `NativeViewportPanel.tsx:205` React Hook warning が1件。
- `npm run build` — passed。500 kBを超えるchunkに関する既存のnon-blocking advisoryあり。

## 境界・未確認事項

`pointercancel` はブラウザー内で送出した**合成・untrusted DOM event**であり、実OSによるタッチ中断、画面回転、実機のpointer capture動作を再現したものではない。物理端末でのF12/T07受け入れは未実施で、実機・支援技術・実zoom・contrastの確認も引き続き未完了。製品コード、project data、schemaの変更はない。

# EXP-05 worker close browser evidence — 2026-10-13 JST

検査対象snapshotは `60e183d`（PR #396 head）。この追補では製品コードを変更せず、既存のworker-close product E2Eをproduction previewで実行した。

## 実行結果

- Spec: `e2e/native-asset-io-product.spec.ts` — `phone game numeric editing supports IME and cancels a worker without changing the project`
- `playwright.production.config.ts`、Chromium + WebKit、各1回、2/2 pass。
- 375×812のtouch contextで製品画面を開き、metadataのIME compositionを確認。export panelで`assetIo.worker`のrequestをroute gateで保留し、生成button操作後にpanelを閉じてからgateを解放する。前後のnative backup projectが完全一致することを検査。

## 残る境界

route gateはworker script取得前に止めるため、実GLB encode/geometry/ZIP処理が走行中に中断されたことを示さない。このcaseはpanel closeをまたぐsaved projectの不変性を示すにとどまり、取消応答時間、temporary outputの解放、不完全ZIPがdownload/UIに出ないことをassertしない。実encode/ZIP/geometryでのcancel boundaryと実device acceptanceは未確認でありEXP-05はpartialのまま。

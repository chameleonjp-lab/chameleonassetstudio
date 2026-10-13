# EXP-08 独立Babylon browser証拠 — 2026-10-13 JST

この追補はEXP-04 product round-tripとのcross-check結果を反映する。基本handoff試験の対象snapshotは `01c52da`（PR #394 head）、後続texture付きproduct round-trip試験は `075459a`（PR #395 head）。どちらも同じ製品コードを検査し、この追補でも製品コード変更はない。

## 固定runtime

Root `package.json` は `@babylonjs/core` と `@babylonjs/loaders` をともに `9.28.0` に固定し、`package-lock.json` も同版を解決する。test専用consumer (`tools/3d-consumer/main.ts`) はBabylon `Engine` と `ImportMeshAsync` を使い、editorのThree.js rendererやNullEngineとは別の実browser runtimeである。Production Playwright configはアプリpreviewとconsumerを別々にbuild/serveする。

## 実行結果

| 対象 | 実行設定 / 結果 | 確認内容 |
| --- | --- | --- |
| `a project authored and exported in the product opens in a separate consumer context` (`e2e/native-consumer.spec.ts`) | snapshot `01c52da`、production preview、Chromium + WebKit各1回、2/2 pass | 製品UIで作成した基本boxのGLB・`game.json`を別browser contextのBabylon consumerでloadし、position oracle、mesh、GLB hashを照合。 |
| `edited textured mixed skin and two clips survive backup, re-edit and actual independent delivery with verified sidecar metadata` (`e2e/native-consumer.spec.ts`) | snapshot `075459a`、production preview、Chromium + WebKit各1回、2/2 pass | 製品UIでPNGをuploadし、skin/two clipsを編集。backup copy restore後に再編集・再exportし、Khronos validator errors 0、sidecar model hash、Babylon consumerのGLB hash、vertex、skeleton、二つのanimation、texture loaded/sizeを照合。testはtextureのexact pixel oracleまでは持たない。詳細は[EXP-04証拠](EXP04_FULL_DELIVERY_2026-10-13.md)。 |
| `F04 actual PNG upload preserves corner colors and alpha in independent rendering` (`e2e/native-consumer.spec.ts`) | snapshot `01c52da`、production preview、Chromium + WebKit各3回、6/6 pass | 固定2×2 PNG/GLB fixtureのdimensions、GLTF `BLEND` alpha mode、double-sided materialと実canvas pixel readbackを検査。赤/緑/青patchのchannel優位、透過patchのneutral/darker表示を確認。 |

F04は `consumerFixture('F04')` と固定PNG fixtureからrunner内でGLBを生成するため、実browser pixel testだが製品UIで作ったtextureのexact pixelsを照合するものではない。F04各実行はvisual artifactをPlaywrightへ添付する。記載したbrowser runsはすべてpassで、buildには既存large-chunk advisoryが残る。

## 残る境界

製品UIからtexture付き作品を作り、別contextで再編集・再exportし、独立Babylon consumerでtextureが読み込まれるround-tripはEXP-04 caseで確認済み。未確認なのは、そのproduct-authored imageに対するconsumer pixel/color oracle、全UV transform/orientation・複数material・color management・JPEG/WebP変換・全alpha mode/GLTF機能の網羅である。Chromium/WebKit自動browser上の固定Babylon consumerであり、物理GPU/driver、mobile device、別Babylon版や他engineの受入ではないため、EXP-08全体はpartialのまま。

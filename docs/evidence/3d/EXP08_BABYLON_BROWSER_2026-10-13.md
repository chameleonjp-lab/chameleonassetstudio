# EXP-08 独立Babylon browser証拠 — 2026-10-13 JST

検査対象repository snapshotは `01c52da`（PR #394 head）。この追補では製品コードを変更せず、既存の製品handoffと独立consumer browser testを実行して受入証拠を追加した。

## 固定runtime

Root `package.json` は `@babylonjs/core` と `@babylonjs/loaders` をともに `9.28.0` に固定し、`package-lock.json` も同版を解決する。test専用consumer (`tools/3d-consumer/main.ts`) はBabylon `Engine` と `ImportMeshAsync` を使用し、editorのThree.js rendererやNullEngineとは別の実browser runtimeである。Production Playwright configはアプリpreviewとconsumerを別々にbuild/serveする。

## 実行結果

| 対象 | 実行設定 | 結果 | 保証したこと |
| --- | --- | --- | --- |
| `a project authored and exported in the product opens in a separate consumer context` (`e2e/native-consumer.spec.ts`) | production preview、Chromium + WebKit、各1回 | 2/2 pass | 製品UIでprojectを作成しGLB・`game.json`を出力。別browser contextのBabylon 9.28.0 consumerでloadし、position oracle・mesh存在・GLB hashを照合 |
| `F04 actual PNG upload preserves corner colors and alpha in independent rendering` (`e2e/native-consumer.spec.ts`) | production preview、Chromium + WebKit、各3回 | 6/6 pass | 2×2 textureの寸法、GLTF `BLEND` alpha mode、double-sided materialを確認。実canvas pixel readbackで赤/緑/青patchのchannel優位と透過patchのneutral/darker表示を検査 |

F04 testは `consumerFixture('F04')` と固定PNG fixtureからrunner内でGLBを生成して独立consumerへ渡す。したがってpixel testは実browser描画だが、製品UIによるPNG upload→texture割当→GLB exportのend-to-end検査ではない。F04各実行は視覚artifactをPlaywrightへ添付する。Buildは既存のlarge-chunk advisoryを表示したが、記載したbrowser runsはすべてpass。

## 残る境界

- 製品handoff testの代表作は基本boxであり、texture/alpha/UV付き製品制作物のround-tripではない。F04は別途作成した単一2×2 PNG fixture・一material構成で、全UV transform/orientation・複数material・色管理・JPEG/WebP変換・全alpha mode/GLTF機能を網羅しない。
- Pixel assertionはchannel比のoracleで、全画素のexact color-management一致や任意画像に対する品質を保証しない。
- Chromium/WebKit自動browser上の固定Babylon consumerであり、物理GPU/driver、mobile device、別Babylon版や他engineの受入ではない。
- 従って固定runtimeで製品の基本GLB handoffと代表texture fixtureを実browser描画する証拠を得たが、EXP-08全体はpartialのまま。製品UIを通したtexture付き代表作のconsumer round-tripは別の未確認境界として残る。

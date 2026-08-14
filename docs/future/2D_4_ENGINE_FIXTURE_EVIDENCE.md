# Group 17 engine fixture evidence

最終更新日: 2026-08-14
対象main: `b79327857b2d9f9bfbc9a4c0a4a4566d1000a69a`
work package: `2D-4-PIXIJS + 2D-4-PHASER + 2D-4-DOCS`
採用判断: `G17-C1 A + G17-C2 A + G17-C3 A`
実装PR: #246（final head `9380494f7a662b9211f341d87a15f62d4b82986f`、merge `b79327857b2d9f9bfbc9a4c0a4a4566d1000a69a`）
CI: Run #785（全job成功、PixiJS / Phaser artifactあり）

## 役割

PixiJSとPhaserの実ブラウザfixtureで確認した範囲を記録する。成功を既存生成sample、既存helper、標準atlas完全互換、project自動生成、物理iPhone Safariへ広げない。

## 対象version

| engine | version | CDN URL | fixture |
|---|---:|---|---|
| PixiJS | 8.12.0 | https://cdn.jsdelivr.net/npm/pixi.js@8.12.0/dist/pixi.min.js | `public/engine-fixtures/pixijs-v8` |
| Phaser | 4.2.0 | https://cdn.jsdelivr.net/npm/phaser@4.2.0/dist/phaser.min.js | `public/engine-fixtures/phaser-v4` |

## 必須確認

各engineを別E2E・別artifactでHTTP経由で確認する。

- distribution manifest、package manifest、asset、target、2ページの画像を読み込む。
- packed、scale 2、frame rect、trim後contentRect、contentOffset、origin、anchor、rect / circle colliderを確認する。
- animationがpage 0からpage 1へ順番どおり進むこと、実際のcanvas描画、console error 0、download 0を確認する。
- 通常viewportとChromium `375×667`で横スクロールがないことを確認する。
- artifactへsource commit、fixture hash、manifest hash、browser version、viewport結果、page数を保存する。

## 状態

`verified`はこの2つのfixtureと固定versionで確認した範囲だけに使う。PR #246で独立確認・mergeまで完了した。CI実行後にartifact IDと対象headをPR本文・handoffへ追記する。CDN障害、画像読込失敗、実行時version不一致、artifact欠落は成功扱いにしない。

# AC-07 寿命 — 製品viewportのWebGL2所有権反復（2026-10-12）

**状態: 部分的なheadless browser証拠。AC-07の受入合格ではない。**

## 対象

AC-07「寿命」のうち、実製品UIで保存済みprojectを交互に開き直す反復ケースを追加した。対応するMUSTは `LIFE-04`（renderer/context等の所有者解放）。既存台帳 `PERF-06` にある20回browser反復の一部にも対応する。スコープはviewport ownerの切替だけで、import/export cancellation、tab background、context-loss後のresume/latest-revisionなどは含めない。

- 対象source commit: `d5c0d398cb20274fc5d430f1db11b2aa46faca1c`
- テスト: [`e2e/native-viewport-product.spec.ts`](../../../e2e/native-viewport-product.spec.ts) — `AC-07 product project switches release each prior WebGL2 viewport owner`
- 同一ページで保存済みの2作品を用意し、viewportを表示したまま作品を20回交互に切替。
- 初期2画面を含む成功WebGL2 context objectは22個、`WEBGL_lose_context.loseContext()` 呼出しは21回（2作品目への切替で1回 + その後の20切替）という製品API経路の期待値を検査。各切替後に「3D表示中」と1個のviewport canvasも確認。
- 計測はE2E内のAPI observerで、アプリの非公開状態にはアクセスしない。

## 実行結果

| 検証 | 結果 |
| --- | --- |
| Chromium focused AC-07 | 1/1 passed（system Chromium `/usr/bin/chromium`） |
| WebKit-critical focused AC-07 | 1/1 passed |
| `native-viewport-product.spec.ts` Chromium + WebKit-critical | 46/46 passed（各23件） |
| Unit | 185 test files、3,531 tests passed |
| `npm run format:check` | passed |
| `npm run lint` | 0 errors。既存 `NativeViewportPanel.tsx:205` Hook依存warning 1件 |
| `npm run build` | app/H3 build passed。既存のminified chunk >500 kB advisoryあり |

## 限界・未完了

`getContext('webgl2')` から得られたcontext objectの個数と、明示的なcontext-loss要求の呼出しを観測しただけであり、**GPU driverが実メモリを解放した証拠ではない**。差分1も実driver上のlive context countを意味しない。geometry/material/textureのGPU byte数、RAF停止・worker数・Object URL数、import/export cancellation、実製品のcontext-loss復元と最新revision再表示、BFCache/reload/OS discard、物理GPU・実端末は測っていない。

したがってAC-07、`LIFE-04`、`PERF-06`はpartial/openのまま。今回の証拠を理由に受入statusをpassへ変更しない。保存形式・project schema・製品挙動の変更はない。

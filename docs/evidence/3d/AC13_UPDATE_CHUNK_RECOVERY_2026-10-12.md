# AC-13 更新失敗 — chunk 404後の保存作品再開（2026-10-12）

**状態: 部分的なheadless browser証拠。AC-13の受入合格ではない。**

## 対象

AC-13のうち、ユーザーが別版を確認したあと明示的に再読み込みし、その読み込み時に3D editorのdynamic chunkが404になった場合でも、直前にdirty編集を保存していれば通信復帰後に同じprojectを再開できる経路を検証した。

- 対象source commit: `0428ccb4f9719d10d88fd8cae51b6dad4693f1ed`
- 対象tree: `402e05f72c9a676188bfae150e3a419a0985d67b`
- テスト: [`e2e/native-diagnostics-product.spec.ts`](../../../e2e/native-diagnostics-product.spec.ts) — `AC-13 recovers the explicitly saved project after the reloaded editor chunk returns 404`
- `native-build-info.json`を別版に置換し、自動reloadがない既存UIから手動の「現在の内容を保存して再読み込み」を開始。
- project名をdirty状態に変更してからreloadし、再読込時の`Editor3DShell` chunk要求へPlaywright routeでHTTP 404を返す。
- EntryBoundaryの回復表示を確認後、注入routeを外して手動reloadし、project一覧から同じ変更後名称の作品を開いて保存済みrevisionを確認。

## 実行結果

| 検証 | 結果 |
| --- | --- |
| focused AC-13 / Chromium dev server | 1/1 passed |
| focused AC-13 / WebKit-critical dev server | 1/1 passed |
| focused AC-13 / production preview Chromium | 1/1 passed |
| `native-diagnostics-product.spec.ts`全体 / Chromium + WebKit-critical | 24/24 passed |
| Unit | 185 test files、3,531 tests passed |
| `npm run format:check` | passed |
| `npm run lint` | 0 errors。既存 `NativeViewportPanel.tsx:205` Hook依存warning 1件 |
| `npm run build` | app/H3 build passed。既存のminified chunk >500 kB advisoryあり |

## 限界・未完了

404はPlaywright routeがchunk要求へ返す合成HTTP応答であり、実CDN deploymentの旧HTML・新chunk不一致を再現したものではない。Service Worker、browser/CDN cache残留、実際のoffline→network reconnect、OS tab discard/reload、物理端末は検査していない。復旧は同じURLを手動reloadして、headless browser内の保存領域からprojectを再開したもの。

したがってAC-13、B10更新失敗、実network/cache/OS復旧はpartial/openのまま。今回の証拠を理由に受入statusをpassへ変更しない。製品runtime、保存形式・project schema・export formatの変更はない。

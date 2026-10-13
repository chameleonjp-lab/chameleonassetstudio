# SEC-01 製品通信allowlist検証 — 2026-10-13 JST

**状態: ローカルproduction-previewの3Dアプリで実測した部分証拠。SEC-01全体の受入passではない。**

## 対象と再現情報

- E2E base test commit: `8fe4546a1c3f162dba07221aa4170da7d9d919e8`; URL/headers hardening commit: `559018efaf7c7b57a1d3c6f754776cea7424210e`.
- Final source tree: `530c72012226a7163092ece7f5870ae6f378915a`
- Test: `e2e/native-diagnostics-product.spec.ts` — `SEC-01: product asset workflows stay on a same-origin read-only network allowlist`
- 実行先: `playwright.production.config.ts` のproduction build preview、3D entry、同じテストpreview origin `http://localhost:4176`。公開サイトやCDNへの通信試験ではない。
- Runtime: Node.js `v24.19.0`、Playwright `1.61.1`。Playwright project `chromium` / `webkit-critical`。
- Fixture: `assetIoFixture()` と自作RGBA PNG `assetIoPng()` から生成したbackup。PNGは75 bytes、SHA-256 `517688c8544ab2bf0add5eb6f17e5750a685d9b789f6403a7ad50f9bfce3babd`。アーカイブは4,361 bytes、SHA-256 `91972a017b0fd6da2ad9aaa8c8ffd7a0418d698a4af753ed563f1572b609eb39`（生成を2回照合し同じhash）。fixtureはmesh/skin/joints/clips/anchor/colliderとこのPNGを含む。
- 一意な検査markerとしてproject名、`.cas3dproj` filename、source rights申告、任意の診断再現文字列を入れた。これらを本番サービスへ送ったものではない。

## 操作と観測

1. 製品UIでfixture `.cas3dproj` をコピー復元し、品質検査workerを実行。
2. 診断の任意再現欄へmarkerを入力し、画面内previewを確認後、診断テキストと現在のbackupをそれぞれbrowser downloadとして保存。
3. browserの全HTTP(S) requestを観測しつつ、同一preview originへの `GET` / `HEAD` 以外、または別originへのrequestはroute guardで記録してabort。WebSocketも観測。
4. downloadしたbackupを独立にparseし、project名とPNG原本bytesが元fixtureと一致することを確認。診断downloadには利用者が欄へ入力したmarkerが含まれることを確認。

各実行で、観測されたHTTP(S) requestは**0件ではない**こと、origin集合が許可origin `http://localhost:4176` のみであること、methodが `GET` / `HEAD` のみであること、non-empty request bodyが0、拒否された別originまたは非read-only requestが0、WebSocketが0であることをassertした。project名・filename・source-rights marker・texture SHA-256・手入力診断markerはrequest URL（raw/percent-decoded）とheadersに現れず、backup/PNG bytesのstandard Base64・Base64URL・percent-encoded表現もURL/headers/bodyに現れない。観測summaryはE2E attachmentとして実行時に生成する。

## 実行結果

- SEC-01ケース: Chromium 3回 + WebKit 3回 = **6/6 passed**（production preview）。
- `native-diagnostics-product.spec.ts` 全体: 両browser合計 **26/26 passed**（現source commit）。
- `npm run test -- --reporter=dot`: **186 files / 3,553 tests passed**。
- `npm run lint`: **0 errors**。既存warning 1件 `src/features/editor3d/NativeViewportPanel.tsx:205`（`react-hooks/exhaustive-deps`）。
- `npm run format:check`: passed。
- `npm run build`: app + H3 passed。`npm run consumer:build`: passed。既存Vite `>500 kB` chunk advisoryあり。
- `npm run test:ci-scope`: **8/8 passed**。
- Remote CIは照会・監視していない。

## 残る境界

- 測定対象はローカルproduction-preview上の3D appと合成fixtureに限る。public deployment / CDN / cache、OSのnetwork stack、利用者の実素材・実端末は未検証。
- このSEC-01計測では独立consumerの一連の送受信は別途測っていない。consumerや配信artifactの他のテストを本結果へ合算しない。
- route interceptionで検査したHTTP(S) requestの範囲であり、実OSのpacket capture、browser外通信、全runtime/engineの挙動は保証しない。
- 明示的なcopy/downloadはローカル操作として実行した。Playwrightのdownload artifactを読み戻したことは、利用者端末での最終保存・共有完了を意味しない。
- よってSEC-01は `implemented-candidate / partial` を維持する。3D受入全体、公開承認、物理端末または外部consumerの合格根拠にはしない。

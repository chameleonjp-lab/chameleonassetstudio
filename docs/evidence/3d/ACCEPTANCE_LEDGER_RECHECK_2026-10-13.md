# 受入台帳の現HEAD照合 — 2026-10-13

## 範囲

- 対象HEAD: `bbfd3f82e10bd910f85f59dd9e595b2cab4e2191`（Draft PR #390 head、PR #389の下流）
- 対象: [受入状況台帳](ACCEPTANCE_STATUS_2026-10-10.md)のCOMPAT-06、EDIT-02、EDIT-04、VIEW-02、IMP-01
- 実行: local production previewのPlaywright、`chromium` と `webkit-critical`。remote CIは監視していない。

## 結果

| 要件 | 製品E2E | Chromium | WebKit-critical |
| --- | --- | --- | --- |
| EDIT-02 | `object deletion previews linked dependencies and preserves originals through cancel and Undo/Redo` | pass | pass |
| EDIT-04 | `hierarchy clone confirms dependencies, invalidates stale selection and preserves source bytes across Undo/Redo and copy restore` | pass | pass |
| EDIT-04 | `hierarchy clone refuses a skinned part without its joints and preserves the complete project` | pass | pass |
| IMP-01 | `successful unsaved import previews cancel on close, Escape, file replacement and canonical changes` | pass | pass |
| IMP-01 | `keyboard-only import preview, GameData edit and export after fixture upload`（未保存preview→明示確認→新copy保存） | pass | pass |
| COMPAT-06 | `COMPAT-06 explicitly copies a real 2D PNG export into 3D without automatic synchronization` | pass | pass |
| VIEW-02 | `ground is an independent view-only helper and never enters canonical backup or GLB geometry` | pass | pass |

3回の実行で**合計14/14 pass、skip 0、flaky 0**。最初の5ケースは10/10、IMP-01のkeyboard-only成功経路は2/2、EDIT-04のskin依存拒否は2/2。

## 台帳の読み替え

このheadには、上記5要件について台帳の旧残文言が示す欠落（一般object削除、階層clone、保存前import preview/apply、実2D PNG handoff、VIEW-02 ground表示）は残っていない。各行の実装状況を `implemented-candidate` に更新したが、検査状態は `partial` のままとする。これは製品E2Eの対象範囲を反映するもので、全受入完了を意味しない。

## 未確認境界

- ファイル入力にはPlaywrightのfixture注入を使用し、OSのネイティブfile picker操作自体は検査していない。
- 対象は自動化されたChromium/WebKit製品previewであり、実端末、assistive technology、OS/process interruption、実storage quota/eviction、deployment環境の受入は含まない。
- テスト結果はこのローカルHEADとfixtureに対するもの。リモートCIの状態や、別headでの結果へ一般化しない。


## SEC-02 製品入力セキュリティ再照合 — 2026-10-13 JST

- Tested code commit: `133f6785be9eb28536b0c2b9ffa68314a8c84094`、PR #409 head `59234231423a23286dc3184de88215f10d1f4f5d`をbaseとするchild branch。
- 対象: `SEC-02`。production-previewの製品3D画面で合成`.cas3dproj`と合成GLBを復元し、HTML風project/node name、copyright/VRM metadata、申告権利を品質検査・診断経路へ通した。
- 結果: Chromium 3回 + WebKit 3回で**6/6 pass**。DOM injectionなし、event handler実行なし、`Object.prototype`汚染なし。GLBの`__proto__` keyは`invalid`として拒否理由を表示。診断previewはimported name/metadata/rightsを含まず、backup再読込後のsource bytes一致を確認。
- コマンド: `npx playwright test --config playwright.production.config.ts e2e/native-security-product.spec.ts --project=chromium --project=webkit-critical --repeat-each=3 --timeout=30000`。
- 同じ候補treeの全体検証: unit **186 files / 3,553 tests**、lint 0 errors / 既存warning 1件、format check、app + H3 build、consumer build、CI scope **8/8**。

### 台帳の読み替え

`SEC-02`のローカル製品DOM injection / prototype negative / diagnostics経路という残条件に対する合成入力の証拠を追加した。実装状況は`implemented-candidate`、検査状態は`partial`を維持する。公開配信/CDN、実素材、実端末・支援技術、全runtime/engineは未検証。Remote CIは照会・監視していない。詳しいfixtureと観測境界は[SEC02_PRODUCT_INERT_JSON_2026-10-13.md](SEC02_PRODUCT_INERT_JSON_2026-10-13.md)を参照。


## SEC-04 配布NOTICE browser follow-up — 2026-10-13 JST

Tested application source commit: `b38adb721facafa910d4d65acfb450de7246328c`（Draft PR #410 head）。既存のproduction-preview test `bundled dependency notices open only on request and preserve their complete static text`をChromium/WebKitで実行し、**2/2 passed**。noticeリンクを明示的に選ぶ前は`runtime-notices.txt`のrequestがなく、選択後のpopupは同一origin・固定path・queryなし、配信bodyは`public/licenses/runtime-notices.txt`とbyte-for-byte一致した。

同じtreeのfresh app/H3 buildとconsumer buildはpass。build後の`npx vitest run tools/build/thirdPartyNotices.test.ts --reporter=dot`は**31/31 passed**で、production runtime notice、Three MIT notice、独立consumer Babylon noticesの配布byte比較を含む。大chunk advisoryは既存。未導入`vite-node`を新規installせず、repo内checkerだけを使用した。

SEC-04は`implemented-candidate / partial`を維持する。確認範囲はlocal production previewと生成distribution artifactであり、公開サイト/CDN/cache、広範なbrowser regression、法的・商用利用適合判断は含まない。Remote CIは照会・監視していない。詳細は[NATIVE_DISTRIBUTION_NOTICES.md](NATIVE_DISTRIBUTION_NOTICES.md)を参照。


## SEC-07 shared runtime log privacy follow-up — 2026-10-13 JST

Tested source commit: `0d4d6787d11dd34d1bfcc4d387ab386d959991a2` (child of Draft PR #411 head `1ae6a7673e78d74e4bc5df95df190a7197af4853`). A source audit found one shared 2D image-editor recovery-point failure path that passed the raw storage exception to `console.warn`. The path now emits only the fixed category `復旧点の保存に失敗しました`; a regression test supplies token/path markers and asserts the console receives exactly that fixed string, not the exception object. A post-change scan found only this sanitized runtime console sink under product `src`.

Local results: targeted regression **1/1**; full unit suite **187 files / 3,554 tests**; lint **0 errors / one pre-existing warning**; format check, app/H3 build, consumer build and CI-scope **8/8** passed. The two builds retain their existing large-chunk advisory. Remote CI was not queried or monitored.

This follow-up addresses one concrete shared-product logging sink; it does not complete the 3D product/browser acceptance boundary. `SEC-07` remains `implemented-candidate / partial`. The specific browser failure path, clipboard, assistive technology, physical devices, and deployed runtime were not exercised. See [SEC07_RUNTIME_LOG_PRIVACY_2026-10-13.md](SEC07_RUNTIME_LOG_PRIVACY_2026-10-13.md) for evidence details.

## SEC-06 VRM rights review follow-up — 2026-10-13 JST

Tested source commit: `50f3a28518cfa0b2b7b80f8aedceda0c66dbdf64` (child of Draft PR #412 head `a97e71e314a26e382e93fa7e26aba17210a5b9d0`). The local production-preview Chromium case `SEC-06: embedded VRM restrictions stay separate from declarations through inspection and package provenance` passed **1/1**. A synthetic source with a permissive user declaration and explicit VRM `commercialUsage: personalNonProfit` / `allowRedistribution: false` showed the generic source-terms warning and retained declaration, stored embedded note, and parsed VRM terms separately. Backup source bytes remained identical; exported `game.json` retained the unverified provenance record and source rights fields. The package does not contain the original GLB bytes.

The same tree passed **187 files / 3,554 unit tests**, lint (0 errors, one pre-existing warning), format check, app/H3 and consumer builds, CI-scope **8/8**, and `git diff --check`. Existing large-chunk advisories remain. Remote CI was not queried or monitored.

`SEC-06` remains `implemented-candidate / partial`: the generic warning is not a semantic/legal conflict classifier, and this does not cover WebKit, real third-party assets, deployed delivery, external engines, assistive technology, or physical devices. See [SEC06_VRM_RIGHTS_REVIEW_2026-10-13.md](SEC06_VRM_RIGHTS_REVIEW_2026-10-13.md) for the exact test boundary.

# 3D統合候補の検証記録（2026-10-17）

状態: **candidate / not published**。実装、ローカル検査、main統合、実機受入を区別する。新機能の存在を全169要件の受入passへ読み替えない。

この文書はローカル候補C0の観測要約です。計画PRは文書のみで、C0コード・生ログ・失敗artifactは未収録です。C0はリモート未提出であり、SHAを指定した第三者の取得・再現は未保証です。この計画PRのheadやmainを上記件数で検証したという意味ではありません。

## 対象

- tested source SHA: `29ef7c6907abddaf983ad371ef20006d50d37b3e`。
- 統合候補: `feat/completion-integration-20261017`。確認時のmainは `8f985eba42a056c8f74e4296d6100681e610a319`。
- app `0.1.0`、native schema `0.3.0`。版bump、lockfile/依存追加、MCP接続追加なし。
- Node.js `v24.19.0`、npm `11.17.0`、Ubuntu Linux。アプリの別clean worktreeをSHAに固定し、node_modulesなしから`npm ci`。OSとPlaywright browserバイナリは既存環境を利用するので、物理端末や完全な新OSの試験ではない。

## 今回の変更

**保存領域の安全な整理**: 派生cacheの整理を優先案内し、参照外blob/版だけを明示確認後に削除する。件数確認はblob本体を読み込まずmetadataで行う。確認後の保存変更はepoch再検査で拒否、取消はtransaction abortに接続。root、recovery、trash、history、pin、staging、legacy backupが参照する原本は保持する。中断job参照の期限切れ判定は実装せず、安全側で保持する。

**品質統計**: header寸法と実decodeを分離。参照画像のbounded `createImageBitmap` とcanvas readbackに成功した場合だけdecoded pixel数へ加算し、失敗・未対応・予算不足はunknown。bitmap/canvasの解放と共有texture予算をテストする。GPU memory・未生成GLB bytesの未知値は維持する。

**案内と計画**: トップの古い「rig/animation/GLBは準備中」を実装範囲に合わせ、機能・限定profile・未実装・検証状態を別列で示す。3D計画の現在入口、実機ゲート、offline/cold、2D回帰と3D回帰、将来MCP候補を分離する。MCP接続は追加しない。

## 実行状態

固定SHAの一括検査は終了した。**production E2Eに3件の失敗があり、候補全体は未合格**。個別成功を全受入へ読み替えない。

| 検査 | 現在の結果 |
|---|---|
| `npm ci` | 成功。新規worktreeのnode_modulesなしから導入 |
| `npm run lint` / `npm run format:check` | 成功 |
| `npm run test -- --reporter=default` | 189 files / 3,568 tests成功 |
| `npm run test:ci-scope` | 8/8成功 |
| `npm run build` / `npm run consumer:build` | 成功。既存の大chunk advisoryは残る |
| `node --experimental-strip-types tools/build/nativeArchitecture.ts --json` | 成功。これはsource/pathの静的検査であり、実機受入ではない |
| production E2E・Chromium/WebKit計326件 | **323成功 / 3失敗**。機能表2件、WebKitの破損画像fixture1件 |
| 後続の2D関連回帰 | Chromium 35/35成功。対象はevent-payload、animation、rich-distribution-controls、legacy-distribution-pixels |

実行ログは検証環境の `/tmp/chameleon-completion-validation/` に保存される。これは公開artifactではない。具体的な対象環境・優先順位・責任者案は[改善実装計画表](../../IMPROVEMENT_IMPLEMENTATION_PLAN_2026-10-17.md)に整理する。

### 失敗分類と次の対応（コード修正は未着手）

| 対象 | 観測事実 | 分類・次の対応 |
|---|---|---|
| hub機能表 / Chromium・WebKit各1件 | `studio-entries.spec.ts:28`の`getByRole('cell', {name:'限定対応'})`が見つからない。表は閉じた`details`内にあり、testは開かずrole検索している | 手順不足の根拠あり。ユーザーと同じ操作でsummaryを開き、表の可視性と内容を確認する回帰へ直す方針。hidden検索への変更だけで利用者の到達性を済ませない |
| QA-01破損IDAT fixture / WebKit1件 | `native-quality-product.spec.ts:460`でunknownを期待したが`decodedPixels=4`。Chromiumの同じケースは成功 | browser decode/readbackの許容差とfixture前提を切り分ける必要がある。実装はAPI成功＋readbackを測っており、ファイルの完全性検証とは別。破損画像は全browserで必ず拒否されると決めつけず、厳密な破損拒否を製品要件にするか先に判断する。単なる期待値緩和で合格にしない |

ログ: `production-e2e.log`、`two-d-regression.log`。失敗時のcontextはclean worktreeの`test-results-quality/`配下。分類はsourceと既存ログの読み取りによるもので、修正・再実行・新SHAの合格は未実施。

## 変更に直接対応する既確認結果

- storage cleanup product E2E: Chromium 2件 / WebKit-critical 2件、計4/4成功。確認→同意前のDB不変、Escape→再同意、原本backup bytes不変、synthetic interrupted staging/pin/history参照保持、実製品save後のstale mark拒否を確認。物理crashの再現ではない。
- 対象unit: storage repository/cleanup、statistics/reportの56件成功、型検査成功。decoder追加のfocused unit 5件成功。これらを全体最終実行の代用にしない。

## 真に残る条件

- 所有権と回復可能性が不明なcrash残pin/stagingの自動整理は未実装。根拠なく孤立扱いして削除しない。
- real quota/eviction/disk full、OS強制終了、実端末へのdownload保存と再読込、iPhone/iPad/Android、VoiceOver/TalkBackは未検証。
- cold uncachedかつ無通信の初回起動を、shell読込後にHTTPを遮断する試験と混同しない。
- 未採用SHOULD/FUTURE、採用外runtime/素材の保証、公開配信・main統合・最終出荷は対象外または未検証。

[完了ターゲット案](COMPLETION_TARGET_2026-10-17.md)。全169要件の候補台帳はC0上の `docs/evidence/3d/ACCEPTANCE_STATUS_2026-10-10.md` にあり、本PRには含めない。

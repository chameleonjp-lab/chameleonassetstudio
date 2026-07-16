# 2D-2-PROJECT + 2D-2-CREATE C-slice 実装報告

作成日: 2026-07-16
状態: `C slice completed / PR #94 merged / CI Run #277 success / reviewed`
正式work package: `2D-2-PROJECT + 2D-2-CREATE`
採用判断: `C`（現行0.1.0の独立Asset管理を先行し、Family / Variantを別契約へ保留）
基準main: `359cb9c9d0918df95d1fc52db6d472639f0f3703`
最終head: `c44246cbcf9f038c8089cbba4f79528165d3b553`
merge commit: `5b0d16478d0b0140e6e56db63b5b89c52fd0f608`

## 1. 実装範囲

- Asset metadata保存時にProject要約を同一IndexedDB transactionで同期する。
- `saveProjectBundle`で新規AssetとProject要約のmetadata一致、既存・新規Asset集合の完全一致を検査する。
- Asset、TextureRef、Layer、Part、Anchor、Collider、Frame、Animation、RigAnimationのIDと内部参照を再採番した独立copyを作る。
- 全Texture Blobを新Asset ID配下へcopyし、Project、新Asset、Blobを`saveProjectBundle`で原子的に追加する。
- Asset listへasset typeを表示し、選択中Assetの独立copy操作を追加する。
- 複数Assetの保存、reload、`.casproj`退避をE2Eで検証する。

## 2. 安全境界

- schema、data version、DB version、IndexedDB store / index layout、migrationを変更しない。
- `.casproj`内部構成、export ZIP内部構成、dependenciesを変更しない。
- copyは元Assetとの同期、親子、Family ID、Variant roleを保存しない。
- 保存失敗時はProject要約、Asset、Blobのtransactionをabortし、直前正本を維持する。
- 2D-1Bで確定した復元、trash purge、autosave、History、snapshot、入力安全性を後退させない。
- Family / Variantは`2D-2-PROJECT`の未完了範囲として残し、別設計PR、人間判断、Opus 4.8互換性review前に実装しない。

## 3. ローカル検証

| 検証 | 結果 |
|---|---|
| `npm run lint` | success |
| `npm run format:check` | success |
| `npm run build` | success。既存の500 kB chunk warningのみ。 |
| `npm run test` | 46 files / 401 tests success |
| `npm run e2e -- e2e/create.spec.ts` | Playwright Chromium実体がローカル環境になく、5 testsすべてbrowser起動前に停止。code assertion失敗は0件。正式判定はGitHub Actionsで行う。 |

## 4. GitHub Actions

CI Run #276（workflow run ID: `29461197731`）は、Draft PR #94のhead
`f8c677b425e4184b1ab57c3ee0217c6e92654a52`に対して全job successとなった。

| job / 検証 | 結果 |
|---|---|
| `classify-changes` | success |
| `build-and-test` / lint | success |
| `build-and-test` / format | success |
| `build-and-test` / build | success。既存の500 kB chunk warningのみ。 |
| `build-and-test` / unit test | 46 files / 401 tests success |
| `e2e` | success。84 tests中83 passed、既存`canvas.spec.ts`の1件は初回失敗後のretryで成功し、Playwright上はflakyとして記録された。今回追加した`create.spec.ts`を含むjob全体の最終conclusionはsuccess。 |

文書同期後のheadについても同じDraft PR #94でCIを再確認する。CI失敗は同じbranch・同じPRで補修する。

文書同期後の最終head `c44246cbcf9f038c8089cbba4f79528165d3b553`に対するCI Run #277（workflow run ID: `29461350701`）も全job successとなった。unit testは46 files / 401 tests、E2Eは84 tests passed / flaky 0である。PR #94はmerge commit `5b0d16478d0b0140e6e56db63b5b89c52fd0f608`でmainへmerge済みで、2026-07-16にユーザーからOpus reviewと人間reviewの完了が報告された。追加の対応指摘は引き継がれていない。

## 5. 完了条件

1. Project要約とAsset metadataが成功時だけ同時更新され、途中失敗時は両方維持される。
2. 独立copyの全IDと内部参照が元Assetと分離され、Blob欠落・ID衝突時は全件拒否される。
3. 複数Assetをreloadでき、`.casproj`へ安全に退避できる。
4. lint、format、build、unit test、E2E、GitHub Actionsが成功する。
5. Opus 4.8 reviewで`BLOCKER 0 / MUST 0`を確認し、人間確認を得る。
6. ユーザーの明示指示前にready化、merge、auto-mergeを行わない。

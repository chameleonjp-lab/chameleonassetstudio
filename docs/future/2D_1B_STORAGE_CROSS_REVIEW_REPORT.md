# 2D-1B 保存基盤 横断レビュー報告

最終更新日: 2026-07-16  
状態: `completed / re-review passed / PR #85 merged`
実行チェックポイント: `2D-1B-STORAGE-CROSS-REVIEW`  
判定: `BLOCKER 0 / MUST 0`  
次の正式work package: `2D-1B-CAPACITY`

## 1. 結論

`2D-1B-REVISION`、`2D-1B-LAYERS`、`2D-1B-RECOVERY`を横断監査し、初回監査で4件の`BLOCKER`と2件の`MUST`を確認した。

PR #84とfollow-up PR #85により、所有境界、復元入口、metadata-only履歴、bundle保存、autosave失敗伝播、snapshot作成時のStored Blob照合を補修した。PR #85の最終head `d8ce80f36adaa94b2711d0e4ce3ffc1f1bf5e413`に対する正式CI Run #244は、lint、format、build、unit test、E2Eをすべて成功した。

再レビュー結果:

- `BLOCKER`: 0件
- `MUST`: 0件
- `SHOULD`: 2件。`2D-1B-GATE`前の追跡項目として維持する。
- `NOTE`: 2件。計画済みの後続work packageへ維持する。

PR #85はmainへmerge済みであり、`2D-1B-CAPACITY`の開始条件は成立した。保存基盤横断レビューはcompletedとし、CAPACITYの契約・実装へ進む。

## 2. GitHub基準

- 初回監査基準main: PR #82 merge commit `fb6f4454ecb46dc66b8f5e9141a12462ab8faef8`
- 初回監査報告: PR #83
- 保存基盤補修: PR #84
- PR #84 merge commit: `fcb576a126c85cbf523a56a846785803a614ed84`
- 検証完了follow-up: PR #85
- PR #85最終head: `d8ce80f36adaa94b2711d0e4ce3ffc1f1bf5e413`
- PR #85 merge commit: `e3c34fb292aab1d35a6da571ff17ca4ed9d13e0e`
- 正式CI Run #244: success

PR #84は検証完了前にmainへmergeされたため、PR #85で一時診断workflowと一時スクリプトを除去し、標準read-only workflowへ復元した上で再検証した。

## 3. 総合判定

| 分類 | 初回 | 再レビュー | CAPACITY開始への影響 |
|---|---:|---:|---|
| `BLOCKER` | 4 | 0 | 解消済み。CAPACITY開始可 |
| `MUST` | 2 | 0 | 解消済み |
| `SHOULD` | 2 | 2 | `2D-1B-GATE`前に対応先を維持 |
| `NOTE` | 2 | 2 | 計画済み後続範囲 |

## 4. 解消したBLOCKER

### BLOCKER-1: trash完全削除とAsset削除の所有境界

確定方針:

- live Project IDまたはAsset IDとの衝突時は完全削除を拒否する。
- live正本とtrashをどちらも変更しない。
- `purgeAllTrash`は1件でも衝突があれば全件を維持する。
- trash上限の自動purgeは衝突recordを飛ばして別recordを代替削除しない。
- 上限超過を維持し、手動で衝突を解消する。

実装結果:

- snapshot削除をProject ID + Asset ID所有単位へ変更した。
- `deleteAsset`と`deleteAssetBundle`は対象Projectのsnapshotだけを削除する。
- trash purge前にlive Project / Asset ID衝突を同一transaction内で検査する。
- `purgeAllTrash`は全recordをpreflightしてから削除する。
- auto purgeは衝突時に削除を行わない。

テスト証拠:

- live Project ID衝突時にtrash、live Blobを維持する。
- live Asset ID衝突時に相手snapshotを維持する。
- `purgeAllTrash`の全件原子拒否。
- auto purgeの代替削除禁止。
- `deleteAsset` / `deleteAssetBundle`のcross-owner snapshot保護。

判定: `resolved`。

### BLOCKER-2: unsafe legacy `restoreProject`

実装結果:

- `projectStore.ts`の旧上書き復元入口を削除した。
- public storage barrelから`projectRecovery.ts`の衝突安全な実装だけを公開する。
- trash rollback testを安全なpublic入口へ変更した。

判定: `resolved`。

### BLOCKER-3: metadata-only履歴と保存成功の順序

実装結果:

- `History.push()`は同tickで予約されたautosave成功後だけentryを確定する。
- 保存失敗時はUI stateを保存前へ戻し、失敗したentryを登録しない。
- `History.undo()` / `redo()`はautosave成功後だけstackを移動する。
- `waitForPending()`を追加し、Asset削除はmetadata保存完了後に開始する。
- 数値入力のblurで履歴保存が始まっても削除clickが失われないよう、削除ボタンはhandler内待機を使用する。

テスト証拠:

- autosave成功後だけentryが登録される。
- autosave失敗時にUI stateが戻り、履歴が追加されない。
- Undo / Redo reject時に元stackを維持する。
- metadata編集直後のAsset削除E2Eが成功する。

判定: `resolved`。

### BLOCKER-4: `saveProjectBundle`のguard不足

実装結果:

- supplied Asset ID重複を拒否する。
- Projectから参照されないAssetを拒否する。
- 既存Asset IDと既存Blob keyの上書きを拒否する。
- supplied Assetの全TextureRefとBlob keyの完全な双方向一致を要求する。
- Blob不足とorphan Blobを拒否する。
- 検査と書込みを単一transaction境界へ維持する。
- `.casproj`互換読み込みは、Projectが参照しない旧Asset / fileを警告付きで正本保存対象から除外する。

テスト証拠:

- Project参照欠落。
- TextureRef対応Blob欠落。
- orphan Blob。
- 既存Asset上書き。
- transaction途中失敗時のProject / Asset / Blob原状態維持。
- 旧`.casproj` dangling Asset互換E2E。

判定: `resolved`。

## 5. 解消したMUST

### MUST-1: autosave失敗伝播

- `AutosaveQueue.flush()`と`flushAll()`は保存task失敗をrejectする。
- background autosaveのerror状態と理由表示は維持する。
- 次の成功保存でerror状態から回復する。
- snapshot復元、Asset削除、Blob改訂はautosave失敗後に続行しない。
- rollback用に予約された重複autosaveを取消できる。

判定: `resolved`。

### MUST-2: snapshot作成時のStored edit Blob照合

- snapshot作成transactionへ`STORE_BLOBS`を追加した。
- 対象Blobの存在、Project所有、bytes、MIMEを入力Blobと照合する。
- 不一致、欠落、別Project所有時はsnapshotを残さない。
- fixtureを「旧状態でsnapshot作成→現状態へ改訂」という実際の時系列へ修正した。

判定: `resolved`。

## 6. 正式CI証拠

CI Run #244:

- classify-changes: success
- npm ci: success
- lint: success
- format:check: success
- build: success
- unit test: success
- Playwright Chromium install: success
- E2E: success

診断期間中に使用した次の一時物は、最終headから除去済みである。

- write権限付きCI workflow
- build / unit / Playwright artifact upload step
- fixture修正Python script
- delete button修正Python script

最終`.github/workflows/ci.yml`のblob SHAは標準版`f812cf03227cad74e5baee8e75725cf78b2e6c7b`である。

## 7. 継続するSHOULD

### SHOULD-1: 低レベルAPIの公開範囲

`saveBlob`、`deleteBlob`、`deleteAsset`などの低レベルAPIは、test fixtureと一部互換経路で引き続き必要である。Project所有引数が必要なsnapshot削除は今回修正した。

対応期限: `2D-1B-GATE`前に、製品コードから不要なpublic exportを再監査する。

### SHOULD-2: snapshot復元のtoken化・取消

`snapshotRestoreCoordinator`のmodule-global Mapは、画面離脱や中間例外時の取消境界が明示されていない。

対応期限: `2D-1B-GATE`の明示項目。token、cancel、timeout、component cleanupの採否を再確認する。

## 8. 継続するNOTE

### NOTE-1: `.casproj` staged importと入力上限

ZIP展開サイズ、ファイル数、圧縮率、JSON深さ、画像寸法、MIME検証は`2D-1B-CASPROJ`と`2D-1B-INPUT-SAFETY`で扱う。

### NOTE-2: CAPACITY固有機能

storage estimate、persistent storage、予防警告、容量不足時の`.casproj`退避導線は`2D-1B-CAPACITY`で扱う。今回の補修ではCAPACITY UIや新storeを追加していない。

## 9. 変更しなかった範囲

- schema
- version
- migration
- IndexedDB store layout
- `.casproj`構成
- export ZIP構成
- dependencies
- CAPACITY UI
- 2D-2 / 2D-3本実装
- 3D / WebGPU

## 10. 次のアクション

1. `docs/future/2D_1B_CAPACITY_PLAN.md`でCAPACITYの契約、対象ファイル、受け入れ条件を固定する。
2. 人間判断で予防警告の割合を選ぶ。
3. 同じCAPACITY Draft PRでcode、unit test、E2E、完了報告を実装する。
4. CI成功後にreview-onlyを行う。

`2D-1B-GATE` merge前に2D-2 / 2D-3本実装を開始せず、2D Pro Gate承認前に3Dを開始しない。

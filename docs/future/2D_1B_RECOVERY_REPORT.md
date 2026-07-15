# 2D-1B-RECOVERY 実装監査報告

最終更新日: 2026-07-16  
状態: `completed`  
対象: `2D-1B-RECOVERY`

## 1. 結論

PR #53で先行実装されたsnapshot、trash、復元、完全削除をrevertせず、accepted済み契約と照合して再監査・補修した。

`2D-1B-RECOVERY`は、PR #80とPR #81により完了した。

- PR #80: snapshotの所有境界、source不変性、復元前Blob必須化、trash処理の原子性、Project / Asset ID衝突時の復元拒否を実装した。
- PR #81: 保留autosave確定後のsnapshot復元準備、準備後競合の拒否、Asset JSONとedit Blobの原子的復元確定、復元→Undo→reloadの利用者E2Eを実装した。
- PR #81の最終CI Run #207は、lint、format、build、unit test、E2Eを含めて成功した。

Projectをtrashから復元する際のID衝突は、ユーザー判断により「同じProject IDまたはAsset IDが正本storeに存在する場合は復元を拒否する」と確定した。既存データの置換や自動再採番は行わない。

次の実装work packageは`2D-1B-CAPACITY`だが、着手前に`2D-1B-REVISION`、`2D-1B-LAYERS`、`2D-1B-RECOVERY`の横断レビューを行う。横断レビューは新しい永続化機能を追加せず、既存の保存不変条件とtest coverageを確認する実行チェックポイントである。

## 2. 参照した契約

- `docs/adr/0006-migration-and-recovery-boundaries.md`
- `docs/adr/0007-data-layer-separation.md`
- `docs/future/2D_ASSET_DATA_CONTRACT.md`
- `docs/future/2D_DEVICE_RELIABILITY_SPEC.md`
- `docs/future/2D_1B_LAYERS_REPORT.md`

固定した前提:

- source TextureRefとsource Blobはsnapshot復元、Undo、Redoで変更しない。
- edit Asset JSONとedit Blobは同じ改訂として確定する。
- 復元失敗時にAssetだけ、またはBlobだけを更新しない。
- snapshotは対象ProjectとAssetの所有境界を越えない。
- trash移動中はBlobとsnapshotを残し、完全削除時だけ削除する。
- ID衝突時は復元を拒否し、既存データを置換しない。
- IDの自動再採番は`2D-1B-CASPROJ`等の別契約なしに導入しない。
- snapshot復元前に保留中のautosaveを確定する。
- snapshot読出し後にAssetまたはedit Blobが変更された場合は復元を拒否する。

## 3. 操作対応表

| 操作 | 呼び出し元 | 対象store | 原子性 | sourceへの影響 | editへの影響 | Undo / Redo | 失敗時状態 |
|---|---|---|---|---|---|---|---|
| snapshot作成 | `EditorScreen.applyImageEdit` | assets参照、snapshots書込 | snapshot保存単位で原子的 | source不変を検証 | edit Assetと対象Blobを保存 | 復旧点として利用 | snapshot書込を残さない |
| snapshot一覧 | `EditorScreen.reloadSnapshots` | assets、snapshots | readonly | なし | なし | なし | 一覧を返さない |
| snapshot復元準備 | public `restoreSnapshot` → coordinator | snapshots、assets、blobs | autosave flush後のreadonly transaction | source不変を検証 | snapshot Blobと復元直前Blobを対で読出す | 復元前状態をUndo用に返す | 書込なし |
| snapshot復元確定 | coordinator → `applySnapshotRestore` | assets、blobs | 同一readwrite transaction | source不変 | Asset JSONとedit Blobを同時更新 | 成功後だけUI履歴へ登録 | 競合・書込失敗時は元状態維持 |
| 復元後Undo / Redo | `History` + public `saveAssetRevision` | assets、blobs | 各改訂が原子的 | source不変 | 復元前 / 復元後へ戻す | 失敗時はstackを移動しない | 元のstackと正本を維持 |
| Project trash移動 | `HomeScreen` → `deleteProject` | projects、assets、trash、blobs、snapshots | 同一readwrite transaction | Blobを残す | 正本一覧からProject / Assetを除外 | trash復元 | abortで移動前を維持 |
| Project復元 | `HomeScreen` → public `restoreProject` | trash、projects、assets | 同一readwrite transaction | Blobは既存を利用 | Project / Assetを正本へ戻す | なし | 衝突時はtrashと既存正本を維持 |
| trash完全削除 | `purgeTrash` / `purgeAllTrash` | trash、blobs、snapshots | 同一readwrite transaction | 対象Project由来Blobを削除 | 復元不能にする | なし | abortでtrash、Blob、snapshotを維持 |
| Asset削除 | `deleteAssetBundle` | projects、assets、blobs、snapshots | 同一readwrite transaction | 対象Assetだけ削除 | Project参照も同時更新 | なし | abortで削除前を維持 |

## 4. 実装範囲

PR #80:

- `src/core/storage/snapshotStore.ts`
- `src/core/storage/snapshotStore.test.ts`
- `src/core/storage/snapshotRestoreFlow.test.ts`
- `src/core/storage/recoveryTrash.test.ts`
- `src/core/storage/projectRecovery.ts`
- `src/core/storage/projectRecovery.test.ts`
- `src/core/storage/index.ts`
- 本報告

PR #81:

- `src/core/storage/autosave.ts`
- `src/core/storage/snapshotRestoreCoordinator.ts`
- `src/core/storage/snapshotRestoreCoordinator.test.ts`
- `src/core/storage/snapshotStore.ts`
- `src/core/storage/index.ts`
- `e2e/storage.spec.ts`

## 5. 完了した補修

### snapshot保存・一覧

- `snapshot.asset.id`と対象`assetId`の一致を必須化した。
- Stored Assetの存在とProject所有を検証した。
- snapshotのBlob keyを対象Assetの`kind: edit` TextureRefへ限定した。
- Stored Assetとsnapshotでsource TextureRefが完全一致することを検証した。
- 上限3件をProject + Asset単位で適用した。
- 同じAsset IDを再利用した別Projectのsnapshotを一覧へ混ぜない。

### snapshot復元

- snapshotのProjectと現在のStored AssetのProjectが一致しない場合は拒否する。
- snapshotのAsset ID、edit TextureRef、Blob keyを検証する。
- 復元前のedit Blobが欠落している場合は、復元書込前に理由付きで拒否する。
- 復元直前のAssetとBlobをUndo用として対で取得する。
- すべての`AutosaveQueue`を復元準備前にflushする。
- 復元準備後にAssetまたはedit Blobが変わった場合は上書きせず拒否する。
- snapshot Assetとedit Blobを同一readwrite transactionで確定する。
- 復元、Undo、reload後もAsset JSONのTextureRef寸法と復号画像寸法が一致することをE2Eで確認した。

### Project trash復元

- public storage入口の`restoreProject`を衝突安全な復元処理へ切り替えた。
- trash recordのIDとProject IDが一致しない破損状態を拒否する。
- 正本storeに同じProject IDがある場合は、書き込み前に復元を拒否する。
- 復元対象Asset IDを全件検査し、1件でも正本storeに存在する場合は復元を拒否する。
- trash内でAsset IDが重複する破損状態を拒否する。
- 衝突時に既存Project / Assetを上書きせず、部分復元しない。

### 失敗時原子性

- 復元用Blob書込が失敗した場合、AssetとBlobの元状態を維持する。
- Projectのtrash移動中に失敗した場合、Project、Asset、Blob、snapshotを維持する。
- trash完全削除中に失敗した場合、trash、Blob、snapshotを部分削除しない。

## 6. 確定した判断: Project / Asset ID衝突

trashからProjectを復元する時に、同じProject IDまたはAsset IDが正本storeへ存在する場合は、復元を拒否する。

採用理由:

- 既存の正本データを無断で置換しない。
- 復元対象の一部だけを再採番して参照やBlob keyを壊さない。
- Project / Asset / TextureRef / Blob keyの再採番は`.casproj`読み込み等と共通設計が必要であり、RECOVERY単独で導入しない。
- 利用者へ理由を表示し、既存データとtrashの両方を残せる。

保証する状態:

- Project ID衝突時、既存Projectは変更しない。
- Asset ID衝突時、既存Assetは変更しない。
- いずれの衝突でも、復元対象Projectや衝突していないAssetを部分書き込みしない。
- trash recordは残し、衝突を解消した後に再試行できる。

## 7. CI証拠

### PR #80

- snapshot、trash、ID衝突拒否のunit / E2Eを含むCIが成功。
- merge commit: `7eb0348283be49cef7271c17d3d9445311da68d0`

### PR #81

- 最終head: `f92ed96b9115173421962820da78ce852f4d3eb3`
- merge commit: `08da2531fc3bb8f947dc1b5763b78d5a949b150f`
- CI Run #207: success
- lint: success
- format:check: success
- build: success
- unit test: success
- E2E: success

## 8. 変更しなかった範囲

- schema
- version
- migration
- IndexedDB store layout
- `.casproj`構成
- export ZIP構成
- storage estimate / persistent storage
- quarantine
- ID自動再採番
- 2D-2 / 2D-3
- 3D / WebGPU

## 9. 現在位置

- 現在の段階: `2D-1b`
- 完了済み: `2D-1B-REVISION`
- 完了済み: `2D-1B-LAYERS`
- 完了済み: `2D-1B-RECOVERY`
- 次の実行チェックポイント: `2D-1B-STORAGE-CROSS-REVIEW`
- 横断レビューでBLOCKERがなければ、次の実装work package: `2D-1B-CAPACITY`
- `2D-1B-GATE` merge前は、追加の`2D-2-*`、`2D-3-*`、3D本実装を開始しない。

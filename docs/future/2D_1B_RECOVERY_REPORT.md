# 2D-1B-RECOVERY 実装監査報告

最終更新日: 2026-07-15  
状態: `implementation in review`  
対象: `2D-1B-RECOVERY`

## 1. 結論

PR #53で先行実装されたsnapshot、trash、復元、完全削除をrevertせず、accepted済み契約と照合した。

今回の補修では、snapshotのProject / Asset所有境界、source不変性、edit TextureRefとBlob keyの対応、復元前edit Blobの存在を保存層で検証する。さらに、復元→Undo→Redoとtrash失敗時原子性の回帰テストを追加する。

Projectをtrashから復元する際のID衝突は、ユーザー判断により「同じProject IDまたはAsset IDが正本storeに存在する場合は復元を拒否する」と確定した。既存データの置換や自動再採番は行わない。

衝突検査は復元書き込みと同じIndexedDB readwrite transaction内で、すべての書き込みより前に実行する。1件でも衝突した場合はtransactionを中断し、既存Project / Assetとtrashを変更しない。

`2D-1B-RECOVERY`のcompleted判定は、EditorScreenのsnapshot復元境界統合と利用者操作の専用E2Eを追加してから行う。

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

## 3. 操作対応表

| 操作               | 呼び出し元                           | 対象store                                 | 原子的か                  | sourceへの影響            | editへの影響                      | Undo / Redo                | 失敗時状態                         | 今回の扱い                                          |
| ------------------ | ------------------------------------ | ----------------------------------------- | ------------------------- | ------------------------- | --------------------------------- | -------------------------- | ---------------------------------- | --------------------------------------------------- |
| snapshot作成       | `EditorScreen.applyImageEdit`        | assets参照、snapshots書込                 | snapshot保存単位で原子的  | source不変を検証          | edit Assetと対象Blobを保存        | 復旧点として利用           | snapshot書込を残さない             | Project / Asset所有、edit key、source不変を追加検証 |
| snapshot一覧       | `EditorScreen.reloadSnapshots`       | assets、snapshots                         | readonly                  | なし                      | なし                              | なし                       | 一覧を返さない                     | 現在のStored Assetと同じProjectのsnapshotだけを返す |
| snapshot復元読出し | `EditorScreen.handleRestoreSnapshot` | snapshots、assets、blobs                  | readonly transaction      | source不変を検証          | snapshot Blobと復元前Blobを読出す | 復元前状態をUndo用に返せる | 書込なし                           | 別Project、別Asset、Blob欠落を拒否                  |
| 復元確定           | `saveAssetRevision`                  | assets、blobs                             | 同一readwrite transaction | 既存LAYERS guardで不変    | Asset JSONとedit Blobを同時更新   | UI履歴へ成功後だけ登録     | transaction abortで元状態維持      | 既存実装を維持し、復元失敗テストを追加              |
| 復元後Undo / Redo  | `History` + `saveAssetRevision`      | assets、blobs                             | 各改訂が原子的            | source不変                | 復元前 / 復元後へ戻す             | 失敗時はstackを移動しない  | 元のstackと正本を維持              | 復元→Undo→Redoのstorage回帰を追加                   |
| Project trash移動  | `HomeScreen` → `deleteProject`       | projects、assets、trash、blobs、snapshots | 同一readwrite transaction | Blobを残す                | 正本一覧からProject / Assetを除外 | trash復元                  | abortで移動前を維持                | 失敗注入テストを追加                                |
| Project復元        | `HomeScreen` → public `restoreProject` | trash、projects、assets                 | 同一readwrite transaction | Blobは既存を利用          | Project / Assetを正本へ戻す       | なし                       | 衝突時はtrashと既存正本を維持      | 全IDを先に検査し、衝突時は理由付きで拒否            |
| trash完全削除      | `purgeTrash` / `purgeAllTrash`       | trash、blobs、snapshots                   | 同一readwrite transaction | 対象Project由来Blobを削除 | 復元不能にする                    | なし                       | abortでtrash、Blob、snapshotを維持 | 失敗注入テストを追加                                |
| Asset削除          | `deleteAssetBundle`                  | projects、assets、blobs、snapshots        | 同一readwrite transaction | 対象Assetだけ削除         | Project参照も同時更新             | なし                       | abortで削除前を維持                | 既存テストで確認済み                                |

## 4. 今回変更するファイル

- `src/core/storage/snapshotStore.ts`
- `src/core/storage/snapshotStore.test.ts`
- `src/core/storage/snapshotRestoreFlow.test.ts`
- `src/core/storage/recoveryTrash.test.ts`
- `src/core/storage/projectRecovery.ts`
- `src/core/storage/projectRecovery.test.ts`
- `src/core/storage/index.ts`
- `docs/future/2D_1B_RECOVERY_REPORT.md`

## 5. 今回の補修内容

### snapshot保存

- `snapshot.asset.id`と対象`assetId`の一致を必須にする。
- Stored Assetの存在とProject所有を検証する。
- snapshotのBlob keyが対象Assetの`kind: edit` TextureRefに対応することを検証する。
- Stored Assetとsnapshotでsource TextureRefが完全一致することを検証する。
- 上限3件をProject + Asset単位で適用する。

### snapshot一覧・復元

- 同じAsset IDを再利用した別Projectのsnapshotを一覧へ混ぜない。
- snapshotのProjectと現在のStored AssetのProjectが一致しない場合は拒否する。
- snapshotのAsset ID、edit TextureRef、Blob keyを検証する。
- 復元前のedit Blobが欠落している場合は、復元書込前に理由付きで拒否する。
- 復元直前のAssetとBlobを返し、Undo登録に利用できる境界を用意する。

### Project trash復元

- public storage入口の`restoreProject`を衝突安全な復元処理へ切り替える。
- trash recordのIDとProject IDが一致しない破損状態を拒否する。
- 正本storeに同じProject IDがある場合は、書き込み前に復元を拒否する。
- 復元対象Asset IDを全件検査し、1件でも正本storeに存在する場合は復元を拒否する。
- trash内でAsset IDが重複する破損状態を拒否する。
- 検査後にProject / Assetを書き戻し、最後にtrash recordを削除する。
- 衝突時に既存Project / Assetを上書きせず、Projectや一部Assetを部分復元しない回帰テストを追加する。

### 失敗時原子性

- 復元用Blob書込が失敗した場合、AssetとBlobの元状態が残ることを固定する。
- Projectのtrash移動中に失敗した場合、Project、Asset、Blob、snapshotが残ることを固定する。
- trash完全削除中に失敗した場合、trash、Blob、snapshotが部分削除されないことを固定する。

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

## 7. 変更しない範囲

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

## 8. 現在位置

- 現在の段階: `2D-1b`
- 完了済み: `2D-1B-REVISION`
- 完了済み: `2D-1B-LAYERS`
- 実装レビュー中: `2D-1B-RECOVERY`
- ID衝突方針: 確定・実装済み。衝突時は復元拒否。
- completed前の残り: EditorScreenのsnapshot復元境界統合、snapshot復元→Undo→reloadの専用E2E、入口文書同期。
- 次のwork package: 未変更。`2D-1B-RECOVERY`完了前に`2D-1B-CAPACITY`へ進まない。

# 2D-1B 保存基盤 横断レビュー報告

作成日: 2026-07-16  
状態: `completed / blockers found`  
実行チェックポイント: `2D-1B-STORAGE-CROSS-REVIEW`  
判定: `2D-1B-CAPACITY blocked`

## 1. 結論

`2D-1B-REVISION`、`2D-1B-LAYERS`、`2D-1B-RECOVERY`を、accepted契約、実装、unit test、E2E、完了報告の順に横断監査した。

個別PRで追加された主要な原子保存、source不変性、snapshot復元、ID衝突拒否は確認できた。一方で、完了済み領域の接続部に4件の`BLOCKER`と2件の`MUST`が残っている。

このため、`2D-1B-CAPACITY`は開始しない。先に保存基盤補修Draft PRを作成し、全BLOCKER / MUSTを修正して再監査する。

## 2. GitHub基準

- 監査基準main: PR #82 merge commit `fb6f4454ecb46dc66b8f5e9141a12462ab8faef8`
- 監査開始時のopen PR: 0件
- `2D-1B-REVISION`: PR #70、#71、#72 merge済み
- `2D-1B-LAYERS`: PR #76、#77、#78 merge済み
- `2D-1B-RECOVERY`: PR #80、#81 merge済み
- PR #81最終CI Run #207: success

## 3. 総合判定

| 分類 | 件数 | CAPACITY開始への影響 |
|---|---:|---|
| `BLOCKER` | 4 | 全件解消まで開始不可 |
| `MUST` | 2 | 同じ保存基盤補修PRで修正必須 |
| `SHOULD` | 2 | 補修PRまたは`2D-1B-GATE`までに対応先固定 |
| `NOTE` | 2 | 後続work packageの既知範囲 |

## 4. 不変条件マトリクス

| 操作 | Project所有 | Asset所有 | source不変 | Asset / Blob原子性 | autosave競合 | Undo / Redo | 失敗時原状態 | 判定 |
|---|---|---|---|---|---|---|---|---|
| `saveProject` | Project ID単位 | 対象外 | 対象外 | Project単体 | queue経由 | 未実装 | 単一put | `NOTE` |
| `saveAsset` | 既存Assetで検証 | 既存Assetで検証 | TextureRef変更拒否 | Asset単体 | queue経由 | metadata履歴に使用 | 単一put | `BLOCKER-3` |
| `saveProjectBundle` | 不十分 | 不十分 | 新規作成前提 | transaction自体は原子的 | 呼び出し側 | Project級操作 | abort可能 | `BLOCKER-4` |
| `saveAssetRevision` | 検証あり | 検証あり | guardあり | Asset + Blob同一transaction | flush後 | 非同期履歴 | abortで維持 | 合格 |
| `deleteAssetBundle` | Asset所有検証あり | 検証あり | Asset削除 | Project + Asset + Blob + snapshot | flush後 | 対象外 | abortで維持 | `BLOCKER-1` |
| `saveSnapshot` | 検証あり | 検証あり | guardあり | snapshot単体 | 破壊的編集前 | 復旧点 | snapshot書込abort | `MUST-2` |
| snapshot復元 | 検証あり | 検証あり | guardあり | Asset + edit Blob同一transaction | global flush後 | 非同期履歴 | 競合・失敗時維持 | `MUST-1` |
| Project trash移動 | Project単位 | indexで収集 | Blob保持 | 同一transaction | Home操作 | 対象外 | abortで維持 | 合格 |
| Project復元 | safe public入口は検証 | safe public入口は検証 | Blob再利用 | 同一transaction | Home操作 | 対象外 | 衝突時維持 | `BLOCKER-2` |
| trash完全削除 | 不十分 | snapshot側不十分 | 完全削除 | transaction自体は原子的 | Home操作 | 対象外 | transaction内はabort | `BLOCKER-1` |

## 5. BLOCKER

### BLOCKER-1: trash完全削除とAsset削除が別所有者のBlob / snapshotを削除できる

#### 状況

`purgeTrashRecordInTx`は、trash recordの`project.id`を使い、`blobs.byProject`に一致するBlobを全削除する。また、各Assetについて`deleteSnapshotsForAssetInTx(tx, asset.id)`をProject IDなしで呼び出す。

`deleteAsset`と`deleteAssetBundle`も、snapshot削除時にProject IDを渡していない。

一方、ID衝突時のProject復元は、既存正本とtrashを両方残して拒否する契約になった。この状態でtrashを完全削除すると、同じProject IDを持つlive ProjectのBlob、または同じAsset IDを持つ別Projectのsnapshotを削除できる。

#### 影響

- live Projectの画像Blobをtrash purgeが削除する可能性。
- live Assetのsnapshotを別Projectのpurge / Asset削除が削除する可能性。
- ごみ箱上限超過の自動purgeでも同じ問題が起こり得る。
- transactionは原子的でも、削除対象の選択自体が誤っているためデータ損失を防げない。

#### 必須修正

- `deleteSnapshotsForAssetInTx`のProject IDを必須にする。
- `purgeTrashRecordInTx`、`deleteAsset`、`deleteAssetBundle`の全呼び出しで所有Projectを渡す。
- trash purge前にlive Project ID / Asset ID衝突を検査する。
- 衝突時のpurge方針を確定する。推奨は復元と同様に「完全削除を拒否し、live正本とtrashを両方残す」。
- `purgeAllTrash`とtrash上限自動purgeも同じ方針を使う。

#### 必須テスト

- trash Project IDと同じlive Projectが存在する状態でpurgeを拒否し、live Blobとtrashを維持する。
- trash Asset IDと同じlive Assetが別Projectに存在する状態で、相手snapshotを削除しない。
- `deleteAssetBundle`が別Project / trashの同Asset ID snapshotを削除しない。
- trash上限自動purgeで衝突対象を無断削除しない。

### BLOCKER-2: 衝突を拒否しない旧`restoreProject`が引き続きexportされている

#### 状況

衝突安全な実装は`projectRecovery.ts`にあるが、`projectStore.ts`にも旧`restoreProject`が残っている。旧実装はProjectとAssetを`put`し、既存正本を置換できる。

public barrelの`index.ts`は明示exportで安全な実装を優先するが、`projectStore.ts`から直接importすれば旧実装を呼べる。実際に`projectStore.test.ts`と`recoveryTrash.test.ts`の一部は旧実装を直接importしている。

#### 影響

- accepted済みの「ID衝突時は復元拒否」を保存モジュールの別入口から回避できる。
- 原子性・失敗注入テストの一部が、製品UIの安全な復元入口と異なる実装を検証している。
- 将来の内部呼び出しが誤って旧実装を利用する可能性。

#### 必須修正

- `projectStore.ts`の旧`restoreProject`を削除するか、安全実装への単純委譲にする。
- 復元入口を1つに統一する。
- すべての復元テストをpublic storage入口または安全実装へ切り替える。
- 旧上書き挙動を利用するテストを残さない。

#### 必須テスト

- direct module importを含めて、利用可能な復元入口が衝突を拒否する。
- 失敗注入テストが安全な復元実装を対象にする。

### BLOCKER-3: metadata-only操作の履歴が保存成功前に確定する

#### 状況

`applyAssetSnapshot`はReact stateを即時変更し、`AutosaveQueue.schedule(() => saveAsset(...))`を予約するだけでPromiseを返さない。

metadata-only操作の履歴entryは、Undo / Redoで`applyAssetSnapshot`を呼ぶ。このため`History.undo()` / `redo()`は保存完了を待たず、stackを移動する。通常のmetadata変更でも、履歴を先にpushしてからautosaveを予約する。

これは入口計画に記録された次の完了条件と一致しない。

- 保存成功時だけ履歴stackを移動する。
- 保存成功後に履歴を登録する。
- 失敗時は履歴と正本を維持する。

#### 影響

- autosave失敗時、UIとHistoryは変更後、IndexedDBは変更前という不整合になる。
- Undo / Redoが成功表示されても、reload後に別状態へ戻る可能性。
- 保存失敗後の再操作で、stackと正本の対応が崩れる。

#### 必須修正

- metadata-only履歴の`undo` / `redo`も保存Promiseを返し、`History`が完了を待てるようにする。
- UI stateは保存成功後に反映するか、失敗時に確実に元状態へ戻す。
- 通常metadata操作の履歴登録も保存成功後へ統一する。
- 数値入力blur確定経路を含める。

#### 必須テスト

- metadata Undo保存失敗時、undoStackを維持しredoStackへ移動しない。
- metadata Redo保存失敗時、redoStackを維持する。
- 通常metadata保存失敗時、履歴を追加しない。
- reload後のIndexedDB状態と画面状態が一致する。

### BLOCKER-4: `saveProjectBundle`が所有境界とTextureRef / Blob対応を保証しない

#### 状況

`saveProjectBundle`はProjectとAssetのschema検証、Asset内TextureRefのID / key一意性、Blob keyの重複だけを検証する。

次は検証していない。

- supplied Asset IDが既に別Projectに属していないこと。
- supplied Asset ID同士の重複。
- supplied AssetがProjectの`assets`参照に存在すること。
- Projectの新規参照が実際のAssetへ対応すること。
- Blob keyがsupplied Asset配下であること。
- 新規AssetのTextureRefとBlobが双方向に対応すること。
- orphan BlobやBlob欠落がないこと。

既存unit testは任意の`bundle-key`を正常例に使用しており、TextureRefとの対応を固定していない。

#### 影響

- 別ProjectのAssetを`put`で移動・上書きできる。
- Asset JSONだけ、Blobだけ、Project参照だけの整合しないbundleを原子的に保存できる。
- transactionが成功しても、正本自体が不整合になる。
- LAYERS報告の「TextureRefとBlobの双方向対応を保存API境界で拒否する」という目的を満たさない。

#### 必須修正

既存schemaやstore layoutを変えず、保存前・同一transaction内のguardを追加する。

- supplied Asset IDを一意にする。
- 既存Assetがある場合は、別Project所有を必ず拒否する。
- 新規作成用APIとして既存Asset自体を拒否するか、許可する同Project更新条件を明文化する。
- supplied AssetをProject参照と照合する。
- supplied Assetの全永続TextureRefに対応するBlob key集合を検証する。
- supplied Assetが参照しないBlobを拒否する。
- 既存Projectの未変更Assetを壊さず追加できることを確認する。

#### 必須テスト

- 別Project所有Asset IDの上書きを拒否する。
- supplied Asset ID重複を拒否する。
- Projectに未参照のAssetを拒否する。
- TextureRef対応Blob欠落を拒否する。
- orphan Blobを拒否する。
- 失敗時にProject / Asset / Blobの原状態を維持する。

## 6. MUST

### MUST-1: `AutosaveQueue.flush()`が保存失敗を呼び出し元へ伝えない

`AutosaveQueue.startRun`はtask例外を捕捉して`error`状態へ変換するが、Promise自体はresolveする。そのため`flush()`と`flushAll()`は、保存が失敗しても成功扱いで戻る。

snapshot復元、Asset削除、Blob改訂は「autosaveを先に確定した」という前提で後続処理を開始するため、成功を要求するflush入口が必要である。

必須修正:

- background autosaveの状態通知は維持する。
- 原子的・破壊的操作向けに、直前task失敗をrejectする`flushOrThrow`相当を追加するか、`flush`へ成功必須モードを追加する。
- snapshot復元、Asset削除、Blobを伴う改訂で成功必須入口を使う。
- 失敗時は後続処理を開始しない。

必須テスト:

- autosave失敗後にsnapshot復元を開始しない。
- autosave失敗後にAsset削除を開始しない。
- autosave失敗理由をUIへ表示できる。

### MUST-2: snapshot作成時に現在のStored edit Blobと入力Blobを照合していない

`saveSnapshot`はStored Asset、Project所有、source不変、edit TextureRef IDを検証するが、`STORE_BLOBS`を同じtransactionで読まず、入力Blobが現在の正本edit Blobと一致することを確認しない。

呼び出し側の取り違えや別タブ競合により、Asset JSONと異なるBlobをsnapshotへ保存できる。

必須修正:

- snapshot作成transactionに`STORE_BLOBS`を含める。
- 対象Blobの存在、Project所有、bytes、必要ならMIMEを入力Blobと照合する。
- AssetまたはBlobが変わった場合はsnapshot作成を拒否する。

必須テスト:

- 入力BlobとStored Blobが異なる場合はsnapshotを残さない。
- 別Project所有Blobを拒否する。
- Blob欠落時にsnapshotを残さない。

## 7. SHOULD

### SHOULD-1: 低レベルAPIの公開範囲を縮小する

`saveBlob`、`deleteBlob`、`deleteAsset`、`deleteSnapshotsForAsset`は、直接利用すると上位のTextureRef / Project参照 / source不変guardを回避できる。

- 製品コードから不要なexportを外す。
- test fixture用helperはtest側へ移すか、明確なinternal名にする。
- 公開を維持する場合はProject所有とTextureRef対応を必須引数にする。

対応期限: 保存基盤補修PRまたは`2D-1B-GATE`前。

### SHOULD-2: snapshot復元の保留状態をtoken化し、取消可能にする

`snapshotRestoreCoordinator`はmodule-globalなMapをAsset IDで管理する。復元準備後に画面離脱や中間例外が起きると、保留状態が残り、次の通常保存が1回拒否される可能性がある。

- 復元準備結果に一意tokenを付ける。
- 専用`applySnapshotRestore(token)`で消費する。
- cancel / timeout / component cleanupの境界を持たせる。

対応期限: 補修PRで低コストに対応できない場合、`2D-1B-GATE`の明示項目にする。

## 8. NOTE

### NOTE-1: `.casproj` staged importと入力上限

ZIP展開サイズ、ファイル数、圧縮率、JSON深さ、画像寸法、MIME検証は、計画どおり`2D-1B-CASPROJ`と`2D-1B-INPUT-SAFETY`で扱う。今回の補修PRへ混ぜない。

### NOTE-2: CAPACITY固有機能

storage estimate、persistent storage、予防警告、容量不足時の`.casproj`退避導線は`2D-1B-CAPACITY`の正式範囲である。今回のBLOCKER補修では、新しい容量UIやstoreを追加しない。

## 9. test coverage判定

### 確認できた証拠

- `saveAssetRevision`のProject所有、source不変、TextureRef / Blob遷移、transaction abort。
- Historyの非同期entry、reject時stack維持、busy中競合拒否。
- snapshot復元準備後のAsset / Blob競合拒否。
- Project復元のProject ID / Asset ID衝突拒否。
- trash移動・purge・snapshot復元の単一所有者での失敗注入。
- 復元→Undo→reloadのE2E。

### 不足する証拠

- trash / live間のProject ID衝突中のpurge。
- trash / live間のAsset ID再利用中のsnapshot削除。
- metadata-only保存失敗時のHistoryとreload。
- `saveProjectBundle`の所有境界とBlob双方向対応。
- autosave失敗後に後続の破壊的操作を停止するテスト。
- snapshot作成時のStored Blob一致。

## 10. 補修PRの固定範囲

次の保存基盤補修Draft PRを1本作成する。

対象:

- Project / Asset所有付きsnapshot削除。
- purge衝突安全性。
- 復元APIの一本化。
- metadata-only履歴の保存成功同期。
- autosave成功必須flush。
- `saveProjectBundle`の所有・参照・Blob guard。
- snapshot作成時のStored Blob照合。
- 上記unit testと必要最小限のE2E。

変更禁止:

- schema
- version
- migration
- IndexedDB store layout
- `.casproj`構成
- export ZIP構成
- dependencies
- 2D-2 / 2D-3本実装
- 3D / WebGPU
- CAPACITY UI

## 11. 判断待ち

### trash完全削除時のID衝突方針

推奨:

- live Project IDまたはAsset IDとの衝突がある場合、完全削除を拒否する。
- live正本とtrashをどちらも変更しない。
- 利用者へ衝突理由を表示する。
- 自動purgeでは、衝突したtrashを飛ばして別recordを無断削除しない。上限超過を理由付きで維持し、手動解消を求める。

この方針は、既に確定した「復元時のID衝突は拒否」と整合し、無断データ損失を避ける。

## 12. 次のアクション

1. 本監査報告をDraft PRとして確認・mergeする。
2. trash完全削除時のID衝突方針を人間が確定する。
3. 同じ保存基盤範囲の補修Draft PRを作成する。
4. unit / E2E / CI成功後に横断レビューを再実施する。
5. BLOCKER / MUSTが0件になった場合だけ`2D-1B-CAPACITY`を開始する。

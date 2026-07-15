# 2D-1B 保存基盤 横断レビュー計画

作成日: 2026-07-16  
状態: `planned`  
実行チェックポイント: `2D-1B-STORAGE-CROSS-REVIEW`

## 1. 目的

`2D-1B-REVISION`、`2D-1B-LAYERS`、`2D-1B-RECOVERY`が個別に完了した時点で、保存基盤を横断して不変条件、失敗経路、test coverage、文書の整合を確認する。

このチェックポイントは新しい正式work packageを追加するものではない。次の実装work packageである`2D-1B-CAPACITY`へ進む前に、既に完成した3領域の接続部分にBLOCKERがないことを確認するための監査である。

## 2. 実行順

```txt
2D-1B-REVISION completed
        ↓
2D-1B-LAYERS completed
        ↓
2D-1B-RECOVERY completed
        ↓
2D-1B-STORAGE-CROSS-REVIEW
        ↓
BLOCKERなし → 2D-1B-CAPACITY
BLOCKERあり → 保存基盤補修PR → 再レビュー → 2D-1B-CAPACITY
```

正式work packageの順序は変更しない。

1. `2D-1B-RECOVERY`
2. `2D-1B-CAPACITY`
3. `2D-1B-CASPROJ`
4. `2D-1B-INPUT-SAFETY`
5. `2D-1B-GATE`

## 3. 入力証拠

### 契約

- `docs/adr/0006-migration-and-recovery-boundaries.md`
- `docs/adr/0007-data-layer-separation.md`
- `docs/adr/0015-migration-version-and-fixture-policy.md`
- `docs/future/2D_ASSET_DATA_CONTRACT.md`
- `docs/future/2D_DEVICE_RELIABILITY_SPEC.md`
- `docs/future/2D_COMPLETION_ROADMAP.md`

### 完了報告

- `docs/future/2D_1B_LAYERS_REPORT.md`
- `docs/future/2D_1B_RECOVERY_REPORT.md`
- `docs/future/2D_1A_BASELINE_REPORT.md`

### 実装PR

- `2D-1B-REVISION`: PR #70、#71、#72
- `2D-1B-LAYERS`: PR #76、#77、#78
- `2D-1B-RECOVERY`: PR #80、#81

## 4. レビュー対象

### 4.1 所有境界

- Project IDとAsset IDの所有関係が全保存経路で一貫しているか。
- Asset IDだけで別ProjectのAsset、Blob、snapshotへ到達できないか。
- Blob keyが対象AssetのTextureRefへ必ず対応しているか。
- trash、snapshot、通常正本storeの境界を越える操作がないか。

### 4.2 データ層

- source TextureRefとsource Blobが破壊的操作、復元、Undo / Redoで不変か。
- edit Asset JSONとedit Blobが常に同じ改訂として確定されるか。
- cache / preview / export artifactが正本として誤用されていないか。
- metadata-only更新とBlobを伴う改訂の入口が混同されていないか。

### 4.3 原子性

- Project、Asset、Blob、snapshot、trashの複数store操作が必要な範囲で同一transactionになっているか。
- 同期例外、非同期request失敗、QuotaExceededErrorで部分書込みが残らないか。
- transaction abort後にUI stateやHistory stackだけが進まないか。

### 4.4 競合

- autosaveと原子的改訂が逆順で正本を上書きしないか。
- Undo / Redo中の通常編集が拒否されるか。
- snapshot復元準備後のAsset / Blob変更を検出して拒否するか。
- Project / Asset ID衝突時にtrash復元が既存正本を置換しないか。

### 4.5 失敗経路

- source Blob欠落。
- edit Blob欠落。
- TextureRef欠落またはBlob key不一致。
- 別ProjectのAsset / snapshot。
- trash移動途中の失敗。
- trash完全削除途中の失敗。
- snapshot復元途中の失敗。
- History entry登録失敗。

### 4.6 テスト証拠

- unit testが保存層の厳密な分岐を確認しているか。
- E2Eが一瞬のbusy状態や内部実装へ依存せず、利用者が観測できる最終状態を確認しているか。
- reload後のAsset JSONとBlobの整合を確認しているか。
- source不変性が負の経路を含めて確認されているか。
- 失敗注入テストがtransaction abort後の原状態を確認しているか。

### 4.7 文書整合

- `IMPLEMENTATION_PLAN`、ロードマップ、各報告の現在位置が一致しているか。
- PR #53のprovisional残範囲から完了済みREVISION / LAYERS / RECOVERYが除外されているか。
- `2D-1B-GATE`前の2D-2 / 2D-3 / 3D停止条件が維持されているか。

## 5. 実行手順

### Step 0: GitHub基準確認

- main最新commit。
- open PR。
- PR #70〜#72、#76〜#78、#80〜#81のmerge状態。
- 各系列の最終成功CI。

### Step 1: 保存入口の棚卸し

次の入口を列挙し、呼び出し元、対象store、transaction、検証、失敗時状態を表にする。

- `saveProject`
- `saveAsset`
- `saveProjectBundle`
- `saveAssetRevision`
- `deleteAssetBundle`
- snapshot作成・一覧・復元
- Project trash移動・復元・完全削除
- `.casproj` import / exportの既存入口

### Step 2: 不変条件マトリクス

最低限、次の列を持つ表を作る。

| 操作 | Project所有 | Asset所有 | source不変 | Asset / Blob原子性 | autosave競合 | Undo / Redo | 失敗時原状態 | test証拠 |
|---|---|---|---|---|---|---|---|---|

### Step 3: 負の経路確認

既存testと実コードを照合し、未検証の負の経路だけを列挙する。推測で修正しない。

### Step 4: 判定

各指摘を次へ分類する。

- `BLOCKER`: CAPACITYへ進む前に修正必須。
- `MUST`: 同じ保存基盤補修PRで修正する。
- `SHOULD`: CAPACITYまたはGATEで扱えるが、対応先を固定する。
- `NOTE`: 既知制限または後続契約。

### Step 5: 成果物

- `docs/future/2D_1B_STORAGE_CROSS_REVIEW_REPORT.md`
- 指摘と対応先の一覧。
- `2D-1B-CAPACITY`開始可否。

## 6. 完了条件

- REVISION、LAYERS、RECOVERYの保存不変条件が1つのマトリクスで説明されている。
- 完了済み範囲とPR #53のprovisional残範囲が一致している。
- BLOCKER / MUSTが0件、または補修PRと再レビューで解消されている。
- source不変性、所有境界、Asset / Blob原子性、autosave競合、Undo / Redo、trash / snapshot失敗経路のtest証拠が特定されている。
- CAPACITYへ持ち越す項目とGATEへ持ち越す項目が分離されている。
- `2D-1B-CAPACITY`を開始してよいか明示されている。

## 7. 変更禁止範囲

横断レビュー開始時は、次を変更しない。

- schema
- version
- migration
- IndexedDB store layout
- `.casproj`構成
- export ZIP構成
- dependencies
- CI workflow
- 2D-2 / 2D-3本実装
- 3D / WebGPU

監査中に問題が見つかっても、レビュー報告と製品コード補修を同じPRへ混ぜない。最初のPRは監査・計画・証拠整理に限定し、BLOCKERがある場合だけ別の保存基盤補修Draft PRを作る。

## 8. PR運用

- 横断レビューはdocs / audit目的のDraft PRとして開始する。
- CI失敗は同じbranch・同じPRで修正する。
- BLOCKER補修が必要な場合は、監査PRで修正範囲を固定した後に別Draft PRを作る。
- ユーザーの明示指示前にready化、merge、auto-mergeを行わない。

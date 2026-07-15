# 2D-1B-LAYERS 実装レビュー報告

最終更新日: 2026-07-15  
状態: `completed`  
対象: `2D-1B-LAYERS`

## 完了証拠

- PR #76: source Blob遷移guardとexport edit境界。
- PR #77: TextureRef追加・削除とBlob遷移の整合、保存API境界。
- PR #78: TextureRef一意性、双方向整合、source不変性、transaction abort、`saveAsset`境界の最終固定。
- CI Run #168: success。
- CI Run #170: success。
- CI Run #182: success。正式CIのみでlint、format、build、unit test、E2Eが全成功。

次のwork package: `2D-1B-RECOVERY`

## 1. 目的

source / edit / thumbnail・preview / export artifact の保存境界を、accepted 済み ADR と現在の実コードに一致させる。Asset JSON の `TextureRef` と IndexedDB の Blob は双方向に対応させ、参照欠落、孤児 Blob、既存 source の変更、別 Project への移動を保存 API 境界で拒否する。

schema、version、migration、`.casproj` 構成、export ZIP 構成、IndexedDB store layout は変更しない。

## 2. 固定した不変条件

### TextureRef 一意性

- 1 Asset 内で `TextureRef.id` は一意でなければならない。
- 1 Asset 内で `${asset.id}/${texture.path}` による Blob key は一意でなければならない。
- 同じ Blob key を別の TextureRef ID へ再割り当てしない。

### TextureRef と Blob の双方向対応

- 新しい TextureRef を追加する改訂では、対応 Blob を同じ transaction の `putBlobs` に含める。
- TextureRef を削除する改訂では、対応 Blob を同じ transaction の `deleteBlobKeys` に含める。
- 保存後 Asset が参照しない Blob key は `putBlobs` に指定できない。
- 保存後 Asset が引き続き参照する Blob key は削除できない。
- 保存前 Asset が参照していない Blob key は削除できない。

### source

- 既存 source TextureRef は ID で追跡し、通常改訂では `kind`、`name`、`mimeType`、`size`、`path`を変更しない。
- 既存 source Blob は上書きしない。
- 新規 source は、保存前に存在しない source ID、対応 Blob、具体的な `sourceBlobTransitions.createKeys` が揃う場合だけ作成する。
- source 削除は、保存後に ID が存在せず、対応 Blob 削除と具体的な `sourceBlobTransitions.deleteKeys` が揃う場合だけ許可する。
- 既存 source keyをeditやthumbnailへ再利用しない。

### edit / thumbnail

- 既存 edit・thumbnail Blobの内容更新は許可する。
- pathを変更する場合は、旧Blob削除と新Blob保存を同じ改訂で行う。
- TextureRefを残したままBlobだけを削除しない。

### saveAsset / saveAssetRevision

- `saveAsset` は新規 Asset の互換用初期保存と、既存 Asset の metadata-only autosaveに限定する。
- 既存 Asset の TextureRef変更は `saveAsset` で拒否し、`saveAssetRevision`へ誘導する。
- `saveAssetRevision` は保存済み Asset だけを対象とし、指定Projectの所有境界を検証する。
- Asset JSONとBlob追加・更新・削除は単一transactionで確定する。

### export

- 画像 layer のexport入力は `kind: "edit"` のTextureRefに限定する。
- sourceまたはthumbnailを参照するlayerは、Blobを読み込む前に理由付き`ExportError`で停止する。
- export artifactはIndexedDBの編集正本へ書き戻さない。

## 3. 層対応表

| 層 | 現在のデータ | 正本か | IndexedDB保存 | `.casproj`同梱 | export ZIP同梱 | 更新経路 | 削除経路 | Undo / Redo対象 | 再生成可能か |
|---|---|---|---|---|---|---|---|---|---|
| source | `TextureRef.kind === 'source'` と対応Blob | implemented: 元データの正本 | implemented | implemented: 現行は全TextureRefファイル必須 | not implemented | 新規作成・import・明示source createのみ | Asset削除、Project完全削除、明示source delete | 通常編集対象外 | 再生成不可 |
| edit | `TextureRef.kind === 'edit'`、Asset JSONの編集情報 | implemented: 編集正本 | implemented | implemented | implemented: 合成出力の入力 | `saveAssetRevision` | TextureRef削除と同一改訂 | implemented | sourceまたは履歴から更新可能 |
| thumbnail / preview | thumbnail Blob、UI一時合成 | 正本ではない | partially implemented: thumbnail Blobのみ | implemented: 現行要件 | not implemented | 新規作成時。自動再生成は未実装 | TextureRef削除、Asset完全削除 | not implemented | partially implemented |
| export preset | `ExportPresetFile` | 出力設定 | 専用IndexedDB storeはnot implemented | optionalでimplemented | recordとしてはnot implemented | `.casproj` import/export | requires decision | not implemented | 該当なし |
| export artifact | PNG、WebP、sheet、atlas、ZIP | 正本ではない | not persisted by design | not persisted by design | implemented | editから都度生成 | アプリ正本外 | not implemented | implemented |
| export record | 未実装 | not implemented | not implemented | not implemented | not implemented | requires decision | requires decision | not implemented | requires decision |
| verification record | 未実装 | not implemented | not implemented | not implemented | not implemented | requires decision | requires decision | not implemented | requires decision |

## 4. 保存API一覧

| API | 主な呼び出し元 | 対象層 | 原子的か | autosaveとの順序 | 履歴対象か | 境界 |
|---|---|---|---|---|---|---|
| `saveProject` | Home、Project metadata autosave | Project metadata | Project単体 | queue経由あり | not implemented | Asset・Blob改訂には使用しない |
| `saveAsset` | Editor metadata autosave、metadata Undo/Redo、unit test | Asset JSON metadata | Asset単体 | queue経由 | implemented | 既存TextureRef変更を拒否する |
| `saveBlob` | 低レベル補助、unit test | 単一Blob | Blob単体 | UI改訂では直接使用しない | not implemented | Asset JSONとの整合は保証しないため通常改訂に使わない |
| `saveProjectBundle` | 新規Asset、import、複製 | Project + Asset + Blob | implemented | 呼び出し側でflush | 新規操作 | 新規作成用。TextureRef ID/key一意性を検証する |
| `saveAssetRevision` | 画像編集、layer追加、snapshot復元 | Asset JSON + Blob | implemented | flush後 | implemented | TextureRef/Blob双方向整合、source、Project所有境界を検証する |
| `deleteAsset` | 低レベル削除 | Asset + 所有Blob + snapshot | implemented | UIではbundle版優先 | not implemented | Project参照は呼び出し側責務 |
| `deleteAssetBundle` | Editor Asset削除 | Project参照 + Asset + Blob + snapshot | implemented | flush後 | not implemented | 別Project所有を拒否する |
| `saveSnapshot` | 破壊的編集前 | edit復旧点 | snapshot単体 | 編集前 | 復旧点 | sourceを変更しない |
| `restoreSnapshot` | 復旧UI | edit復旧データ | 読み出し | 改訂保存前 | implemented | 確定は`saveAssetRevision`を使う |
| `.casproj` import後保存 | Home import flow | Project + Asset + TextureRef files | `saveProjectBundle`でimplemented | 別Projectとして保存 | not implemented | staged import等は`2D-1B-CASPROJ`範囲 |

## 5. 未実装・後続範囲

次の項目は`2D-1B-LAYERS`の未完了事項ではない。完了済みの保存境界を前提に、それぞれ後続work packageまたは別契約で扱う。

- thumbnail欠落時の自動再生成。
- export record / verification recordの正式永続化。
- export presetの専用IndexedDB保存。
- recovery UI、容量管理、安全なstaged `.casproj` import。

これらはそれぞれ後続work packageまたは別契約で扱い、`2D-1B-LAYERS`内で新しいschemaやstoreを追加しない。

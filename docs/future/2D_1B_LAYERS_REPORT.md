# 2D-1B-LAYERS Report

最終更新日: 2026-07-14  
work package: `2D-1B-LAYERS`  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`

## 1. 目的

accepted 済み ADR と現在の main 実コードを照合し、source / edit / cache・preview / export record / 配布物の保存境界を固定する。新しいデータ層、schema、store、version、migration、`.casproj` 構成、export ZIP 構成は追加しない。

## 2. 現在の層対応表

| 層 | 現在のデータ | 正本か | IndexedDB保存 | .casproj同梱 | export ZIP同梱 | 更新経路 | 削除経路 | Undo / Redo対象 | 再生成可能か |
|---|---|---|---|---|---|---|---|---|---|
| source | `TextureRef.kind === 'source'` と `${asset.id}/${texture.path}` Blob。 | implemented: 元データの正本。通常編集では上書きしない。 | implemented: `blobs` store。新規取り込み・新規作成時は `saveProjectBundle` 等で初期保存。 | implemented: 現行 `exportCasproj` は全 `TextureRef` のファイルを要求。 | not implemented: export ZIP は source を配布物として同梱しない。 | partially implemented: 初期作成・import で保存。`saveAssetRevision` では上書き・削除を拒否。 | implemented: Asset削除、Project完全削除、trash purgeで削除。Project trash移動では復元用に残す。 | not persisted by design: 通常編集・Undo / Redoで変更しない。 | not persisted by design: 編集結果やthumbnailから作り直せるものではない。 |
| edit | `TextureRef.kind === 'edit'` Blob と `asset.json` の layers / parts / frames / animations / origin / anchors / colliders 等。 | implemented: 編集正本。 | implemented: `assets` store + `blobs` store。`saveAssetRevision` で同一 transaction 保存。 | implemented: `asset.json` と全 `TextureRef` ファイルとして同梱。 | partially implemented: export artifact は edit に紐づく layer texture から合成。`asset.json` も配布物として同梱。 | implemented: `saveAssetRevision`、`saveProjectBundle`、autosave flush 後の編集操作。 | implemented: Asset削除、Project完全削除、trash purge。 | implemented: Editor の履歴操作は保存成功後に履歴を進める。 | not persisted by design: 正本なので派生物として再生成しない。 |
| thumbnail / preview | `TextureRef.kind === 'thumbnail'` Blob、UI上の一時合成。 | not persisted by design: 派生プレビューであり正本ではない。 | partially implemented: thumbnail Blob は `blobs` store に保存される。UI一時合成は保存しない。 | implemented: 現行 `.casproj` は thumbnail を含む全 TextureRef ファイルを要求する。 | not implemented: export ZIP の最終画像入力には使わない。 | partially implemented: 新規作成時に保存。既存構造内の欠落時自動再生成は未実装。 | implemented: Asset削除、Project完全削除、trash purgeで削除。 | not persisted by design: 履歴対象ではない。 | partially implemented: 概念上は再生成可能。ただし現行 `.casproj` export ではファイル必須のため、再生成可能性と同梱要件は別論点。 |
| export preset | `ExportPresetFile` / `settings/export-presets.json`。 | partially implemented: 出力設定として正本になり得るが、現行 export 実処理への接続は限定的。 | not implemented: 専用 IndexedDB store なし。 | implemented: 任意で `.casproj` に同梱・roundtrip。 | not implemented: export ZIP の record としては同梱しない。 | partially implemented: sample / `.casproj` import/export のみ。 | requires decision: 専用保存領域未実装。 | not implemented: Editor履歴対象ではない。 | not persisted by design: 設定であり派生物ではない。 |
| export artifact | PNG、WebP、sprite sheet、atlas.json、README、examples、helpers、export ZIP。 | not persisted by design: 配布物。編集正本ではない。 | not persisted by design: export 処理は IndexedDB へ artifact を保存しない。 | not implemented: `.casproj` は再編集用であり export artifact を暗黙同梱しない。 | implemented: `exportZip` が生成する配布物。 | implemented: edit layer texture から都度生成。 | not persisted by design: ダウンロード後はアプリ正本外。 | not persisted by design: 履歴対象ではない。 | implemented: edit + Asset JSON から再生成する。 |
| export record | いつ、どの設定で出力したかの記録。 | not implemented | not implemented | not implemented | not implemented | requires decision: 新規保存契約が必要。 | requires decision | not implemented | requires decision |
| verification record | 外部ツールで検証した証拠、hash、警告、対象 version 等。 | not implemented | not implemented | not implemented | not implemented | requires decision: 新規保存契約が必要。 | requires decision | not implemented | requires decision |

## 3. 保存APIの呼び出し一覧

| API | 呼び出し元 | 対象層 | 原子的か | autosaveとの順序 | 履歴対象か | 問題 |
|---|---|---|---|---|---|---|
| `saveProject` | `HomeScreen` 新規Project、`EditorScreen` Project更新/autosave、unit tests | Project参照 | Project単体では atomic | Project autosave queue 経由あり | Project名等はEditor履歴対象外 | Asset + Blob と同時改訂に使わない。 |
| `saveAsset` | `EditorScreen` の Asset autosave、unit tests | edit の Asset JSONのみ | Asset単体では atomic | Asset autosave queue 経由あり | 通常編集の画像Blob更新には使わない | Blob と同時保存しないため、edit Blob更新経路では `saveAssetRevision` を使う。 |
| `saveBlob` | unit tests / 低レベル補助 | source / edit / thumbnail Blob | Blob単体では atomic | UI通常改訂では直接使わない | 直接履歴対象ではない | 単体APIは残すが、Asset JSONと整合が必要な改訂には使わない。 |
| `saveProjectBundle` | `.casproj` import後保存、新規Asset、空Asset、反転コピー | Project + Asset JSON + source/edit/thumbnail Blob | implemented: 単一 transaction | 呼び出し前に autosave flush する経路あり | 新規/複製操作の確定保存 | Blob key の重複は拒否。新規 source 初期保存を許可。 |
| `saveAssetRevision` | 画像編集、snapshot復元、レイヤー追加等 | edit Blob + Asset JSON | implemented: 単一 transaction | Editor 操作は競合 guard と autosave flush 後に呼ぶ | implemented: 保存成功後に履歴 stack を進める | source Blob の上書き・削除を拒否する guard を追加。 |
| `deleteAsset` | unit tests / 低レベルAPI | Asset + 所有Blob + snapshot | implemented: 単一 transaction | UI削除は `deleteAssetBundle` を使う | 削除操作自体は履歴対象外 | Project参照更新は呼び出し側責務。 |
| `deleteAssetBundle` | `EditorScreen` のAsset削除 | Project参照 + Asset + source/edit/thumbnail Blob + snapshot | implemented: 単一 transaction | 削除前に autosave flush | 削除操作自体は履歴対象外 | 別Project所属Assetなら拒否。Projectに削除Asset参照が残る場合も拒否。 |
| `saveSnapshot` | 破壊的画像編集前 | edit の復旧点 | snapshot単体 atomic | 編集前に保存 | 履歴そのものではなく復旧点 | source は snapshot 対象にしない。 |
| `restoreSnapshot` | snapshot復元UI | edit の復旧読み出し | 読み出しのみ | 復元確定時に `saveAssetRevision` | 復元操作は履歴対象 | 読み出しだけでは正本を更新しない。 |
| `.casproj import後保存` | `HomeScreen` が `importCasproj` 結果を再採番して `saveProjectBundle` | Project + Asset + TextureRef files | implemented: 保存時は単一 transaction | 既存Projectとは別Projectとして保存 | 履歴対象外 | `importCasproj` 自体はDBへ書かない。欠落TextureRefはwarnings。 |

## 4. 固定した不変条件

- 通常の Asset 改訂保存では、既存 source Blob を上書き・削除できない。
- edit Blob と Asset JSON は `saveAssetRevision` で同一 transaction により確定する。
- 保存失敗時は旧 Asset、旧 edit Blob、source Blob を残す。
- thumbnail / preview が欠落しても import は warnings で継続し、source / edit の bytes を変更しない。
- export は layer が参照する edit texture を入力に使い、source / thumbnail を最終画像として使わない。
- export artifact は IndexedDB の正本 store に永続保存しない。
- Asset削除はProject参照、Assetレコード、所有Blob、snapshotを整合して処理し、別Projectやprefix類似Blobを削除しない。
- 現行 `.casproj` 構成は変更せず、全 TextureRef ファイル要求を維持する。

## 5. 未実装・判断が必要な範囲

- thumbnail 欠落時の自動再生成は未実装。schema変更、store追加、migration、`.casproj`構成変更なしで安全に入れられる範囲を超える場合は別判断が必要。
- export record / verification record の正式永続化は未実装。新しい schema、store、JSONフィールド、manifest を追加するには別の契約PRが必要。
- export preset の IndexedDB 専用保存領域は未実装。現行では `.casproj` 任意同梱と sample/schema の範囲に留まる。

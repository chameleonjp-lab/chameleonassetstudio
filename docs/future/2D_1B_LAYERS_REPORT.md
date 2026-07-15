# 2D-1B-LAYERS 実装レビュー報告

状態: implementation in review

## source Blob 境界

- 既存 source: 通常改訂では不変。保存前 Asset と保存後 Asset の両方に存在する source TextureRef は、source Blob の上書き・削除を拒否する。TextureRef の kind / path / mimeType を変更して保護を回避することも拒否する。
- 新規レイヤー source: 画像レイヤー追加で保存前に存在せず保存後に追加される source は、runtime API の明示的な source create 遷移として具体的な Blob key が許可された場合だけ初期保存できる。
- 新規レイヤー追加の Undo: その操作で追加した source だけ、runtime API の明示的な source delete 遷移として具体的な Blob key が許可された場合だけ削除できる。
- Redo: Undo で削除された追加 source は、同じ具体 key の source create 遷移として再作成できる。

| kind | 保存目的 | 再生成可能か | 通常改訂での扱い |
| --- | --- | --- | --- |
| source | 取り込んだ元画像 | 再生成不可 | 既存 source は不変。新規レイヤー追加時だけ明示的な create 遷移で追加可能。 |
| edit | 編集・書き出し用画像 | source または編集結果から更新 | 通常改訂で更新可能。 |
| thumbnail | 一覧表示用派生画像 | 必要に応じて再生成可能 | source / edit とは別境界で扱う。 |

## export 境界

画像 layer の書き出し前処理は、参照先 TextureRef が `kind: "edit"` であることを runtime guard する。layer が source または thumbnail を参照している場合は、該当 Blob を読み込まず、理由付きの ExportError で停止する。

## 計画書上の状態

2D-1B-LAYERS: implementation in review

## 層対応表

| 層 | 現在のデータ | 正本か | IndexedDB保存 | .casproj同梱 | export ZIP同梱 | 更新経路 | 削除経路 | Undo / Redo対象 | 再生成可能か |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| source | implemented | implemented | implemented | implemented | not implemented | partially implemented | partially implemented | partially implemented | not persisted by design |
| edit | implemented | partially implemented | implemented | implemented | implemented | implemented | partially implemented | implemented | partially implemented |
| thumbnail / preview | partially implemented | not persisted by design | partially implemented | partially implemented | not implemented | partially implemented | partially implemented | not implemented | implemented |
| export preset | implemented | implemented | implemented | partially implemented | implemented | implemented | partially implemented | not implemented | not persisted by design |
| export artifact | partially implemented | not persisted by design | not persisted by design | not persisted by design | implemented | implemented | not persisted by design | not implemented | implemented |
| export record | partially implemented | implemented | partially implemented | partially implemented | partially implemented | partially implemented | requires decision | not implemented | not persisted by design |
| verification record | partially implemented | implemented | partially implemented | partially implemented | partially implemented | partially implemented | requires decision | not implemented | partially implemented |

## 保存API一覧

| API | 呼び出し元 | 対象層 | 原子的か | autosaveとの順序 | 履歴対象か | 残る問題 |
| --- | --- | --- | --- | --- | --- | --- |
| saveProject | Home / editor autosave | project metadata | implemented | partially implemented | not implemented | project と asset / blob の一体更新は `saveProjectBundle` または上位 flow で扱う。 |
| saveAsset | 初期保存 / 旧API呼び出し | Asset JSON | partially implemented | partially implemented | not implemented | 新規作成用途。改訂保存は `saveAssetRevision` へ寄せる。 |
| saveBlob | import / 旧API呼び出し | TextureRef Blob | partially implemented | partially implemented | not implemented | 単独保存のため Asset JSON との対応は呼び出し側責務。 |
| saveProjectBundle | .casproj import / 複製 / 新規bundle保存 | project / asset / blobs | implemented | implemented | not implemented | 新規Asset作成の責務を持つ。既存Asset改訂とは分離。 |
| saveAssetRevision | editor revision保存 | Asset JSON / TextureRef Blob | implemented | implemented | implemented | 2D-1B-LAYERS follow-upでTextureRef追加・削除とsource create/delete整合を補修中。 |
| deleteAsset | asset削除 | asset / blob / snapshots | implemented | partially implemented | not implemented | Project参照更新との一体性が必要な箇所は `deleteAssetBundle` を使う。 |
| deleteAssetBundle | Home asset削除 | project / asset / blobs / snapshots | implemented | implemented | not implemented | recovery packageでtrash / rollback導線の追加確認が残る。 |
| saveSnapshot | snapshot保存 | backup / revision snapshot | implemented | implemented | implemented | 復旧UIと容量管理は後続work package。 |
| restoreSnapshot | snapshot復元 | asset / blobs | partially implemented | requires decision | implemented | restore後のautosave順序とUI導線は2D-1B-RECOVERYで扱う。 |
| .casproj import後の保存 | HomeScreen import flow | project / asset / blobs | implemented | implemented | not implemented | staged import / 旧形式互換の残課題は2D-1B-CASPROJで扱う。 |

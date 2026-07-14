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

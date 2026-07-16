# 2D-2-RASTER + 2D-2-REPAIR 実装報告

作成日: 2026-07-16
状態: `Slice 1 implementation started / stacked Draft PR pending`
採用判断: `A+X+P+M`
契約branch: `agent/2d2-raster-repair-acceptance`
実装branch: `agent/2d2-raster-foundation-slice1`

## 1. 今回開始した範囲

Slice 1の最初のcommitとして、UI・Worker・保存経路へ接続する前に、次の純粋PixelBuffer処理を追加した。

- 不透明brush。点列補間とrectangular selection mask対応
- 4近傍flood fill。許容量とselection境界対応
- raster rect / ellipse
- single-layer rectangular selectionのcopy / clear / paste / move

すべて元PixelBufferを変更せず、新しいPixelBufferを返す。selectionとcopy bufferはAsset、Project、History、`.casproj`へ保存する型を参照しない一時データである。

## 2. unit test

- brushの点列補間、selection外拒否、入力検査
- fillの連続領域、selection境界
- rect / ellipseのpixel確定
- selection copy / clear / paste / move
- 元buffer不変性
- copy bufferが永続Asset形式を持たないこと

## 3. 今回まだ接続しない範囲

- `ImageOperation` unionとWeb Worker request
- Canvas tool UI
- raster text preview / commit
- snapshot、`saveAssetRevision`、Undo / Redo
- touch / mouse E2E
- Slice 2のalpha trim、padding、layer resize、palette

これらは同じSlice 1 Draft PR上で順次実装する。契約PRがmainへmergeされるまでは、実装PRをstacked状態で維持する。

## 4. 安全境界

schema、version、migration、IndexedDB layout、`.casproj`、export ZIP、dependencies、source Blobを変更しない。selectionやcopy bufferを永続化しない。frameずれ修正、Asset canvas resize、game data自動追従は実装しない。

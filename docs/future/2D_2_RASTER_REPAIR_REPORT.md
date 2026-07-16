# 2D-2-RASTER + 2D-2-REPAIR 実装報告

作成日: 2026-07-16
状態: `Slice 1 in progress / Draft PR #105 / Worker and revision path integrated`
採用判断: `A+X+P+M`
契約PR: #103（merge commit `6cd9c71ff49466ce054eb8e00b65b6823ca9d964`）
実装branch: `agent/2d2-raster-foundation-slice1`

## 1. 純粋PixelBuffer基盤

Slice 1の基礎として、次の非破壊PixelBuffer処理を追加した。

- 不透明brush。点列補間とrectangular selection mask対応
- 4近傍flood fill。許容量とselection境界対応
- raster rect / ellipse
- single-layer rectangular selectionのcopy / clear / paste / move

すべて元PixelBufferを変更せず、新しいPixelBufferを返す。selectionとcopy bufferはAsset、Project、History、`.casproj`へ保存する型を参照しない一時データである。

## 2. 統合ImageOperationとWorker

legacy画像操作と新しいraster操作を統合する`imageOperation.ts` facadeを追加した。

- 既存`operations.ts`からraster基盤を逆importせず、循環依存を回避
- brush / fill / rect / ellipse / selection clear / paste / moveを統合operationとして定義
- 既存crop、背景透過、eraser、HSL、色置換、outlineはlegacy dispatcherへ委譲
- `runImageOperation`の同期fallbackとWeb Workerを同じ統合dispatcherへ接続
- Worker request / response形式は変更せず、結果は従来どおりPixelBufferで返す
- copy buffer取得は異なる戻り値型のためWorker operationへ混ぜず、UIメモリ内helperとして維持
- 新旧operationの日本語ラベルを統合入口で提供

## 3. Editor改訂保存経路

`EditorScreen`が参照するoperation型とlabel入口を統合facadeへ切り替えた。

- 既存の`applyImageEdit`へ新しいraster operationを渡せる
- 編集前Blobからsnapshotを作る既存経路を再利用する
- `saveAssetRevision`でAssetとedit Blobを対で保存する
- 保存成功後だけReact stateへ反映する
- 非同期Undo / Redoでbefore / after Blobを戻せる
- source Blobを上書きしない
- 既存legacy操作の挙動とエラー文言を維持する

現時点ではCanvas UIから新operationを発火しないため、保存形式や既存ユーザー操作の挙動は変わらない。

## 4. unit test

- brushの点列補間、selection外拒否、入力検査
- fillの連続領域、selection境界
- rect / ellipseのpixel確定
- selection copy / clear / paste / move
- 元buffer不変性
- copy bufferが永続Asset形式を持たないこと
- legacy operationが既存dispatcherへ委譲されること
- raster operationが統合dispatcherから実行され、progress 1を通知すること
- selection moveが統合operationでもPixelBufferを返すこと
- 新旧operation label

Worker統合とEditor接続の一時job内でPrettier、lint、build、unit testは成功した。一時的なCI jobは各commit時にmain版へ戻し、最終差分へ残していない。

## 5. Slice 1の残作業

- Canvas tool UI
- raster text preview / commit
- mouse / touch / iPhone SE E2E

これらは同じDraft PR #105で継続する。

## 6. 安全境界

schema、version、migration、IndexedDB layout、`.casproj`、export ZIP、dependencies、source Blobを変更しない。selectionやcopy bufferを永続化しない。persistent shape / text、frameずれ修正、Asset canvas resize、game data自動追従は実装しない。

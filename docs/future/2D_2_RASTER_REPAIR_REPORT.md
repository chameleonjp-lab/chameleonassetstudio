# 2D-2-RASTER + 2D-2-REPAIR 実装報告

作成日: 2026-07-16
状態: `Slice 1 in progress / Draft PR #106 / Canvas drawing UI completed`
採用判断: `A+X+P+M`
契約PR: #103（merge commit `6cd9c71ff49466ce054eb8e00b65b6823ca9d964`）
基盤実装PR: #105（merge commit `45c2ce2df277823d7d4e8d92363659794c878504`）
現在branch: `agent/2d2-raster-foundation-ui`

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

PR #105のfinal head `98761c48091a1d8e97a7fc35b45bb1be6a618072`について、CI Run #330はlint、format、build、unit test、E2Eを全成功した。

## 4. Canvas raster描画UI

Draft PR #106で、純粋処理と改訂保存経路をCanvas上の利用者操作へ接続した。

- toolbarへ`ブラシ`、`塗りつぶし`、`矩形`、`楕円`を追加
- 描画色、brush size、fill toleranceを設定できる
- brushはpointer dragの点列をpreviewし、pointer upで1操作として確定
- fillは選択中のedit layerをタップして確定
- rect / ellipseはpointer drag中に半透明previewを表示し、pointer upでpixelsへ確定
- mouseとtouchで共通のPointer Events経路を使う
- すべて統合`ImageOperation`からWorker、snapshot、`saveAssetRevision`、Undo / Redoへ到達する
- shape parameterは保存せず、確定後のpixelsだけを正本とする

限定適用jobのCI Run #332では、Prettier、lint、build、unit test、全E2Eが成功し、補助workflowを除去して3つのUIファイルだけをbranchへ確定した。

## 5. focused E2E

`e2e/raster-canvas-ui.spec.ts`で次を保存済みedit PNGから直接確認する。

- 32 x 32透明Assetへのbrush描画
- 全透明領域へのfill
- raster rect / ellipse
- 各操作後に保存済みPNGのalpha画素数が変化する
- 各操作をUndoすると保存済みPNGが全透明へ戻る
- Assetのedit TextureRefから対象Blob keyを特定し、source / thumbnailと混同しない

初回CI Run #335はテスト実装側のpreset IDとBlob選択方法に問題があり失敗した。製品コードの失敗ではない。修正版はpreset ID `32`とedit TextureRefを使用し、focused診断CI Run #336で成功した。診断workflowは最終差分から除去した。

## 6. Slice 1の残作業

- single-layer rectangular selectionのCanvas UI、copy / clear / paste / move導線
- raster textのpreview / commitと「確定後はpixelsになる」説明
- touch viewportとiPhone SE級viewportを明示した専用E2E

これらは同じ正式work package内の後続Draft PRで継続する。PR #106はCanvas raster描画UIの完成単位としてDraftを維持する。

## 7. 安全境界

schema、version、migration、IndexedDB layout、`.casproj`、export ZIP、dependencies、source Blobを変更しない。selectionやcopy bufferを永続化しない。persistent shape / text、frameずれ修正、Asset canvas resize、game data自動追従は実装しない。

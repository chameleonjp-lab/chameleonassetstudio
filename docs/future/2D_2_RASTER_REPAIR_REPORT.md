# 2D-2-RASTER + 2D-2-REPAIR 実装報告

作成日: 2026-07-16
状態: `Slice 1 + Slice 2 completed / PR #110 merged / CI Run #371 success`
採用判断: `A+X+P+M`

## 1. 反映済みPR

- 契約PR #103: merge commit `6cd9c71ff49466ce054eb8e00b65b6823ca9d964`
- raster基盤PR #105: merge commit `45c2ce2df277823d7d4e8d92363659794c878504`
- Canvas描画PR #106: merge commit `509778ba205fa6d973529ce5c55dc96aabe776be`
- Slice 1完了PR #107: merge commit `07422af6472d59874da5ca2cef1a7c7a6a2b9dbb`
- alpha検査・trim PR #108: merge commit `0e405773c1e88c235351e40f396c2bff1fbc8abb`
- padding・resize PR #109: final head `dc74803704d3c00e0b594abbc940e7db387c18d6`、merge commit `4f781a1dca76e67aedc517632edb81d8d852a6e1`
- palette・修復workflow PR #110: final head `788386abf20d2b95ee5141d20e97a03ea7c2ed53`、merge commit `ac1dfd3a9daff2f1079524e63b02579c01216674`

## 2. Slice 1: raster foundation

Slice 1では次を完成した。

- brush、fill、raster rect、raster ellipse
- raster text preview / commit
- single-layer rectangular selection、mask、copy / clear / paste / move
- 統合`ImageOperation`、Web Worker、同期fallback
- snapshot、`saveAssetRevision`、保存成功後state反映、非同期Undo / Redo
- mouse、touch、iPhone SE級viewport E2E

shape、text、selection、copy buffer、previewは一時UI状態として扱い、保存形式へ混入させていない。raster textは確定後のpixelだけを正本とする。

PR #107のfinal head `1af90370d56e6ea37107d88b604e7c2f789320da`について、CI Run #340はlint、format、build、unit test、E2Eを全成功した。

## 3. Slice 2-1: alpha bounds検査・透明縁warning・alpha trim

PR #108ではaccepted済み`P`に基づき、Layer image単位の修復を開始した。

### 3.1 alpha検査

- `inspectAlphaBounds`でalphaしきい値を超えるpixelの最小外接矩形を非破壊で算出する
- bounds、上下左右margin、画像端への接触、visible pixel数、空画像を返す
- `imageAnalysis.worker.ts`でUI thread外へ移し、非対応環境では同期fallbackする
- 分析結果はAsset ID、Layer ID、Texture IDに結び付いた一時stateだけで保持する
- Asset / Layer切替、threshold変更、画像編集成功時に古い結果を破棄する

### 3.2 alpha trim

- 検査済みboundsを既存crop operationへ渡す
- 選択中のedit textureだけを切り詰める
- Layer.positionを補正してworld上の見た目を維持する
- source Blob、Asset canvasSize、origin、anchors、collidersを変更しない
- snapshot、改訂保存、Undo / Redo、reloadを既存経路で維持する

`e2e/layer-repair-alpha.spec.ts`では、保存済みedit PNGの実alpha bounds、trim後のTextureRef size、Layer位置補正、ゲーム情報不変、Undo / Redo、reload後の再オープンを確認した。

PR #108のfinal head `e977032327dec7051d2efbce787226423fc16858`について、CI Run #352はlint、format、build、unit test、全E2Eを成功した。PR #108はmainへmerge済みである。

## 4. Slice 2-2: 透明padding

PR #109で、選択中Layer画像の周囲へ透明pixelを追加する処理を実装した。

### 4.1 純粋PixelBuffer処理

`padLayerImage`は次を満たす。

- top / right / bottom / leftを個別指定する
- 入力PixelBufferを変更しない
- 元pixelを指定offsetへそのままコピーする
- padding領域は透明pixelとする
- 0 paddingでも新しいBufferを返す
- 進捗を通知する
- 負数、非整数、変更後4096 x 4096超をallocation前に拒否する

### 4.2 Layer位置補正

padding後も元の画像内容がworld上で移動しないよう、追加したleft / top分を含むローカル座標を`layerWorldPoint`へ渡し、Layer.positionを補正する。

例: 32 x 32画像へtop 2、right 3、bottom 4、left 5を追加した場合、画像は40 x 38となり、default transformではLayer.positionを`x=-5 / y=-2`へ補正する。Asset canvasは変更しない。

### 4.3 UIとpreview

- 4辺のpadding入力を表示する
- 変更後Texture寸法と予測Layer位置を確定前に表示する
- scale / rotationを含む変更後Layerの四隅を計算する
- Asset canvas外へ出る場合は「canvasは自動拡張しない」とwarningする
- warningは操作を禁止せず、利用者へ結果を明示する

## 5. Slice 2-2: Layer画像リサイズ

### 5.1 補間方式

`resizeLayerImage`は補間方法を明示選択する。

- `nearest`: pixel art向け。元pixelを最近傍で複製・間引きする
- `smooth`: 写真・滑らかな素材向け。premultiplied-alpha bilinear補間を使用する

smoothでRGBをalphaと独立に補間すると、透明pixelに残ったRGBが縁へ混ざる。premultiplied alphaで補間し、alphaが0の結果はRGBAすべて0へすることで、透明色のhaloを避ける。

### 5.2 Layer中心維持

resizeでは旧Texture中心と新Texture中心が同じworld位置になるよう、Layer.positionを次で補正する。

- `x += (oldWidth - newWidth) / 2`
- `y += (oldHeight - newHeight) / 2`

Layer scale、rotation、Asset canvasSize、origin、anchors、collidersは変更しない。

### 5.3 入力安全

- 幅・高さは1〜4096の整数
- 補間はnearestまたはsmoothだけ
- 総pixel数上限をallocation前に検査する
- 入力PixelBufferを変更しない
- Worker progressを通知する

## 6. 統合operation・保存経路

paddingとresizeを統合`ImageOperation`へ追加し、既存のWorker request / response契約を再利用した。

- `padLayerImage`
- `resizeLayerImage`

いずれも既存`applyImageEdit`へ接続し、次を維持する。

- edit Blobだけを更新する
- source Blobを上書きしない
- 編集前snapshotを作る
- `saveAssetRevision`でAssetとBlobを対で保存する
- 保存成功後だけReact stateへ反映する
- 非同期Undo / RedoでAsset、TextureRef size、Layer.position、Blobを対で戻す
- 編集成功後に古いalpha検査結果を破棄する

## 7. focused E2E

`e2e/layer-repair-padding-resize.spec.ts`で次を確認した。

1. 32 x 32のedit画像を全面fillする
2. top 2 / right 3 / bottom 4 / left 5を追加する
3. previewが40 x 38とcanvas外warningを表示する
4. 保存済みedit PNGとTextureRef sizeが40 x 38になる
5. alpha boundsが`x=5 / y=2 / 32 x 32`になる
6. Layer.positionが`x=-5 / y=-2`になる
7. source PNGは32 x 32のまま変化しない
8. canvasSize、origin、anchors、collidersが変化しない
9. Undo / Redoでpadding前後を復元できる
10. smoothで20 x 19へresizeする
11. Layer中心を維持する位置補正を確認する
12. Undo / Redoでresize前後を復元できる
13. reload後にホームからプロジェクトを再度開き、20 x 19のedit画像を読み込める

PR #109のfinal headに対するCI Run #362では、lint、format、build、unit test、全E2Eが成功した。整形済みE2Eをcommitする際に使用した補助workflowは標準版へ戻し、最終差分には含めていない。

## 8. Slice 2-3: palette抽出と修復workflow

PR #110で次を完成した。

- alphaしきい値と1〜32色の上限を持つ、入力非破壊のpalette抽出
- RGB 5-bit量子化、代表平均色、pixel数、coverageの決定的な算出
- 既存image analysis Workerと同期fallbackへの接続
- Asset / Layer / Textureに結び付いた一時palette state
- swatchからreplaceColorの対象色を選ぶ導線
- replaceColor、outline、flipを同じ修復panelへ統合
- source Blob不変、snapshot、Undo / Redo、reload、`.casproj`downloadのE2E

一時的に追加されていたPR専用のtest書き換え・自動push workflowは削除し、read-only権限の標準CIへ戻した。PR #110のfinal headに対するCI Run #371は、classify-changes、build-and-test、全E2Eを成功した。

## 9. 完了範囲と次の作業

Raster Slice 1とLayer Repair Slice 2は完了した。次の正式作業は、同じwork package内の複数Layer align / distribute契約監査である。

実装前に次を固定する。

- 複数Layer選択は保存しない一時UI状態とし、active layerとの関係を明示する
- Asset基準、選択範囲基準、active layer基準のどれを各操作に使うか
- rotation、scale、負scaleを含むworld boundsの計算
- 同じ位置や同じ大きさのLayerがある場合の決定的な順序
- 1操作1履歴としてのsnapshot、Undo / Redo、保存、reloadの確認

frame alignmentは`2D-3-TIMELINE`完了後まで実装しない。

## 10. 安全境界

次を変更しない。

- Asset / Project schema、data version、DB version、migration
- IndexedDB store / index layout
- `.casproj`内部構成、export ZIP内部構成
- source Blob
- Asset canvasSize、origin、anchors、colliders
- Family / Variant、batch、frame alignment
- dependencies、3D、WebGPU

padding、resize、alpha検査は選択中のedit textureだけを対象とし、Asset canvasとgame dataを自動追従させない。

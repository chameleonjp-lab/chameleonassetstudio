# 2D-2-RASTER + 2D-2-REPAIR 実装報告

作成日: 2026-07-16
状態: `Slice 1 completed / Slice 2 alpha inspection + trim in Draft PR #108`
採用判断: `A+X+P+M`
契約PR: #103（merge commit `6cd9c71ff49466ce054eb8e00b65b6823ca9d964`）
基盤実装PR: #105（merge commit `45c2ce2df277823d7d4e8d92363659794c878504`）
Canvas描画PR: #106（merge commit `509778ba205fa6d973529ce5c55dc96aabe776be`）
Slice 1完了PR: #107（merge commit `07422af6472d59874da5ca2cef1a7c7a6a2b9dbb`）
現在branch: `agent/2d2-layer-repair-alpha-trim`
現在Draft PR: #108

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

PR #106で、純粋処理と改訂保存経路をCanvas上の利用者操作へ接続した。

- toolbarへ`ブラシ`、`塗りつぶし`、`矩形`、`楕円`を追加
- 描画色、brush size、fill toleranceを設定できる
- brushはpointer dragの点列をpreviewし、pointer upで1操作として確定
- fillは選択中のedit layerをタップして確定
- rect / ellipseはpointer drag中に半透明previewを表示し、pointer upでpixelsへ確定
- mouseとtouchで共通のPointer Events経路を使う
- すべて統合`ImageOperation`からWorker、snapshot、`saveAssetRevision`、Undo / Redoへ到達する
- shape parameterは保存せず、確定後のpixelsだけを正本とする

PR #106はmainへmerge済みである。

## 5. Canvas描画focused E2E

`e2e/raster-canvas-ui.spec.ts`で次を保存済みedit PNGから直接確認した。

- 32 x 32透明Assetへのbrush描画
- 全透明領域へのfill
- raster rect / ellipse
- 各操作後に保存済みPNGのalpha画素数が変化する
- 各操作をUndoすると保存済みPNGが全透明へ戻る
- Assetのedit TextureRefから対象Blob keyを特定し、source / thumbnailと混同しない

初回CI Run #335はテスト実装側のpreset IDとBlob選択方法に問題があり失敗した。製品コードの失敗ではない。修正版はpreset ID `32`とedit TextureRefを使用し、focused診断CI Run #336で成功した。診断workflowは最終差分から除去した。

## 6. single-layer rectangular selectionのCanvas UIとcopy / clear / paste / move

PR #107で、`canvasTools.ts`に新tool `selection`（toolbar表示名は既存のlayer選択tool「選択」との名称衝突を避けるため「範囲」）と`text`（表示名「文字」）を追加し、`SELECTION_AWARE_TOOLS`を新設した。

- `CanvasEditor`へドラッグで矩形selectionを定義する`selection-new`、selection内側dragでの`selection-move`、paste previewの`paste-move`を追加した
- selection、move offset、paste previewはReact local state / refで完結し、Asset、Project、History、`.casproj`へ保存しない
- selection矩形はtexture座標で保持し、描画時にscreen座標へ再投影する
- brush / fill / rect / ellipseへ現在のselectionをmaskとして渡す
- copyはedit Blobを読み、`copySelectionPixels`で一時clipboardを作る
- clear / paste / moveは既存の統合operation経路へ接続する
- Asset / Layer切替、非selection-aware toolへの切替、Escで一時selection状態を破棄する

## 7. raster textのpreview / commit

- 新tool `text`でCanvasをclickしてtexture座標のanchorを確定する
- 文字列、font family、sizeは一時stateで保持し、Asset / Projectへ保存しない
- previewと確定処理は同じCanvas 2D `fillText`経路を使用する
- UIへ「確定するとテキストはピクセルになり、再編集できません。」を表示する
- 確定時は`stampImage`と`compositeStampPixels`を使用してsource-over合成し、text以外の既存pixelを透明化しない
- Worker、snapshot、`saveAssetRevision`、Undo / Redoへ接続する

## 8. touch・iPhone SE級viewportのE2E

PR #107では次を追加した。

- selection copy / clear / pasteとUndo
- raster text確定、pixel化告知、保存PNG、Undo
- `hasTouch: true`とCDP touch eventによる実touch brush描画
- 375 x 667のiPhone SE級viewportでアセット作成、Canvas操作、保存、Undoを確認

PR #107のfinal head `1af90370d56e6ea37107d88b604e7c2f789320da`について、CI Run #340はlint、format、build、unit test、E2Eを全成功した。PR #107はmainへmerge済みであり、Slice 1は完了した。

## 9. 副次的に発見・修正したrendering race

PR #107のE2E追加過程で、asset切替直後にclose済みImageBitmapが1frameだけ`drawImage`へ渡される既存raceを確認した。`render.ts`のlayer描画と`CanvasEditor.tsx`のpaste preview描画を防御し、detached bitmapのframeだけ描画をskipする。データ形式・schema・保存内容は変更しない。

## 10. Slice 2: alpha bounds検査・透明縁warning・alpha trim

PR #108で、accepted済み`P`に基づくLayer image修復を開始した。

### 10.1 純粋alpha検査

新設した`inspectAlphaBounds`は、指定したalphaしきい値を超えるpixelの最小外接矩形を非破壊で計算する。

- alphaしきい値は0〜255の整数
- bounds、上下左右の透明margin、各辺への接触状態を返す
- visible pixel数、total pixel数、空画像、透明margin有無を返す
- 入力PixelBufferを変更しない
- 進捗を通知する
- 不正なBufferとthresholdを理由付きで拒否する

全透明、外接矩形、端接触、threshold、進捗、入力不変性、拒否理由をunit testで固定した。

### 10.2 読み取り専用Worker経路

`imageAnalysis.worker.ts`と`runAlphaInspection`を追加した。

- Worker対応環境ではUI thread外でalpha検査する
- Worker非対応環境では同じ純粋関数へ同期fallbackする
- 分析結果はAsset、Project、History、IndexedDB、`.casproj`へ保存しない
- source Blobを変更しない

### 10.3 修復inspector UI

`EditorScreen`へ一時的なalpha検査stateを追加した。

- stateはAsset ID、Layer ID、Texture IDと結び付ける
- 現在の選択対象と一致する場合だけ結果を表示する
- Asset / Layer切替、threshold変更、画像編集成功時に古い結果を破棄する
- 検査中は他の永続変更を開始しない
- bounds、margin、透明縁有無、画像端への接触warning、空画像warningを表示する
- alpha検査自体はread-onlyであり、保存・exportを停止しない

### 10.4 alpha trim

検査済みboundsを既存crop operationへ渡す。

- 選択Layerのedit textureだけを切り詰める
- 既存crop経路のLayer.position補正によりworld上の見た目を維持する
- snapshot、`saveAssetRevision`、保存成功後state反映、非同期Undo / Redoを再利用する
- Asset canvasSize、origin、anchors、collidersを変更しない
- 自動でAsset canvasを拡張しない
- trim成功後は古い検査結果を破棄する

### 10.5 alpha trim focused E2E

`e2e/layer-repair-alpha.spec.ts`で次を確認した。

- 32 x 32透明Assetへ部分矩形を描画する
- 保存済みedit PNGから実alpha boundsを算出する
- inspectorに透明margin結果が表示される
- trim後のTextureRef sizeとPNG実寸がbounds寸法になる
- trim後のalpha boundsが`x:0 / y:0`になる
- Layer.positionがtrim前boundsのoffset分補正される
- canvasSize、origin、anchors、collidersが不変である
- Undoで32 x 32と元Layer.positionへ戻る
- Redoでtrim済み寸法へ戻る
- reload後はホームから保存済みプロジェクトを再度開き、trim済みAssetとBlobを読み込める

最初のfocused E2E失敗は、reload後もEditorに留まるという誤ったテスト前提が原因だった。現行アプリはreload後にホームを表示するため、保存済みプロジェクトを再度開く手順へ修正した。修正版focused E2E、Prettier、lint、build、unit testは成功している。

PR #108の標準workflowによる最終CIは、本報告更新commitを基準として実行する。

## 11. Slice 2の残作業

PR #108のalpha検査・trim単位を確定した後、次を別の安全なcommitまたは後続Draft PRで進める。

- padding
- nearest / smoothを明示選択するLayer image resize
- canvas外へ出る場合のpreview / warning
- palette抽出
- 既存replaceColor、outline、flipとの修復workflow統合
- 各操作の失敗時無変更、snapshot、Undo / Redo、reload、`.casproj`退避確認

frame alignmentは`2D-3-TIMELINE`完了後まで実装しない。

## 12. 安全境界

schema、version、migration、IndexedDB layout、`.casproj`、export ZIP、dependencies、source Blobを変更しない。selection、copy buffer、paste preview、text文字列 / font / size、alpha検査結果を永続化しない。persistent shape / text、frameずれ修正、Asset canvas resize、game data自動追従は実装しない。

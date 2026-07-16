# 2D-2-RASTER + 2D-2-REPAIR 実装報告

作成日: 2026-07-16
状態: `Slice 1 completed / branch claude/2d2-raster-slice1-remaining stacked on Draft PR #106`
採用判断: `A+X+P+M`
契約PR: #103（merge commit `6cd9c71ff49466ce054eb8e00b65b6823ca9d964`）
基盤実装PR: #105（merge commit `45c2ce2df277823d7d4e8d92363659794c878504`）
現在branch: `agent/2d2-raster-foundation-ui`（残作業は`claude/2d2-raster-slice1-remaining`でstack）

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

## 6. single-layer rectangular selectionのCanvas UIとcopy / clear / paste / move

PR #106の残作業として、`canvasTools.ts`に新tool `selection`（toolbar表示名は既存の layer選択tool「選択」との名称衝突を避けるため「範囲」）と`text`（表示名「文字」）を追加し、`SELECTION_AWARE_TOOLS`（selection / brush / fill / rect / ellipse / text）を新設した。

- `CanvasEditor`へドラッグで矩形selectionを定義するdrag mode（`selection-new`）、selection内側drag での移動preview（`selection-move`）、paste previewのdrag配置（`paste-move`）を追加した。selection・move offset・paste previewはすべてCanvas内のReact local state / refで完結し、Asset・Project・History・`.casproj`へは一切保存しない（契約 §6 / §10.4）。
- selection矩形はtexture座標のまま保持し、描画のたびに`layerWorldPoint` / `worldToScreen`で screen座標へ再投影する（pan / zoom操作と独立）。
- **mask配線**: `RasterFoundationOperation`の`paintBrush` / `floodFill` / `rasterRect` / `rasterEllipse`はもともと任意の`selection?: RasterSelection`パラメータを受け付ける設計だった（純関数は既に対応済み）。今回、`CanvasEditor`がこれらのoperationを組み立てる箇所（pointer up時のcommitとfillのpointer down時）で、現在有効な`selection` propをそのまま`selection: selection ?? undefined`として渡す配線だけを追加した。純関数（`rasterFoundation.ts`）・統合dispatcher（`imageOperation.ts`の`paintBrush` / `floodFill` / `rasterRect` / `rasterEllipse`分岐）は無変更である。
- **copy**: 「選択範囲」fieldsetの「コピー」ボタンが`EditorScreen`側で選択中edit textureのBlobを読み、`blobToPixelBuffer` → 既存の`copySelectionPixels`（無変更）でclipboardを作り、React stateにin-memoryで保持する（保存しない）。
- **clear**: 「消去」ボタンが`applyImageEdit({ type: 'selectionClear', selection })`を呼び、既存の統合operation経路（snapshot → `saveAssetRevision` → 保存成功後state反映 → 非同期Undo/Redo）へそのまま乗る。
- **paste**: 「貼り付け」ボタンがclipboardをarmし（`pastePreview`state）、Canvas上のdragで位置を調整するとpointer upで`applyImageEdit({ type: 'selectionPaste', clipboard, target })`を確定する。ドラッグせずパネルの「貼り付けを確定」ボタンからも同じ経路で確定できる。
- **move**: 有効なselectionの内側をdragすると、pointer upで`applyImageEdit({ type: 'selectionMove', selection, target })`を確定し、成功時はselection矩形自体も移動先へ追従させる（既存`moveSelectionPixels`のsemantics通り、元位置は透明化）。
- selectionの解除はEditorScreen側の3つの`useEffect`で行う。(1) Escキーで`selection` / `selectionClipboard` / `pastePreview` / `textDraft`をすべてnullへ。(2) `selectedAssetId` / `selectedLayerId`が変わったら同様にnullへ（single-layer selectionのため）。(3) `tool`が`SELECTION_AWARE_TOOLS`に含まれなくなったら`selection` / `selectionClipboard`を、`tool !== 'selection'`なら`pastePreview`を、`tool !== 'text'`なら`textDraft`をnullへ。

## 7. raster textのpreview / commit

- 新tool `text`（表示名「文字」）でCanvasをclickすると、texture座標のアンカーを確定する（`onTextAnchor`）。文字列・font family（sans-serif / serif / monospace の汎用candidateのみ）・size（px、texture最大辺を上限に整数clamp）はパネルの一時state（`textDraft` / `textFontFamily` / `textSize`）で保持し、Asset / Projectへは一切保存しない。
- Canvas上のlive previewは`CanvasEditor`のdraw effect内で`ctx.font` + `ctx.fillText`により確定前の見た目を描く。確定操作と同じCanvas描画経路（`fillText`）をcommit時のoffscreen canvasでも使うため、preview と確定結果の描画方法は一致する。
- パネルには契約が求める文言「確定するとテキストはピクセルになり、再編集できません。」を`role="note"`付きの`<p>`として常時表示し、E2Eから`getByText`で検証できるようにした。
- **確定処理（`EditorScreen.handleTextCommit`）**: 選択中layerのtextureと同じ幅・高さのoffscreen `<canvas>`をmain threadで生成し、`clearRect` → `fillStyle = 描画色` → `font` → `textBaseline = 'top'` → `fillText(text, anchor.x, anchor.y)`の順に描画し、`getImageData`でRGBAを取り出してSelectionClipboard形状（`{width, height, data}`）に詰める。
- 取り出したRGBAは新設のraster operation `stampImage`（`imageOperation.ts`）へ渡し、`applyImageEdit({ type: 'stampImage', clipboard, target: {x:0, y:0} })`として既存の統合operation経路（Worker → snapshot → `saveAssetRevision` → 保存成功後state反映 → 非同期Undo/Redo）で確定する。
- `stampImage`は新設の純関数`compositeStampPixels`（`rasterFoundation.ts`に追加、既存の`paintBrush`等は無変更）を呼ぶ。既存の`pasteSelectionPixels`は選択範囲を全pixel（透明部分含め）で上書きするsemanticsのため、textureサイズ全体をtargetにするtext stampにそのまま使うと非text領域まで透明化してしまう。`compositeStampPixels`はsource-over合成を行い、透明pixelは既存内容を保ち、不透明・半透明pixelだけを合成することで、text以外のlayer内容を破壊しない。unit testを`rasterFoundation.test.ts`・`imageOperation.test.ts`に追加した。

## 8. touch・iPhone SE級viewportのE2E

`e2e/raster-canvas-ui.spec.ts`へ既存パターン（32 x 32透明Asset作成 → 操作 → edit TextureRef経由でBlob解決 → PNG decode → alpha検証 → Undoで全透明へ戻る）に従い次を追加した。

- 選択範囲のcopy → 貼り付けpreviewをdragで位置調整 → pointer upで確定 → 保存PNGのalpha画素数増加を確認 → Undoで直前値に戻る
- 選択範囲のclear → 保存PNGのalpha画素数減少を確認 → Undoで直前値に戻る
- raster textの確定 → ピクセル化告知（`確定するとテキストはピクセルになり、再編集できません。`）の表示検証 → 保存PNGへの反映 → Undoで全透明へ戻る
- **touch**: `browser.newContext({ hasTouch: true })` + CDP `Input.dispatchTouchEvent`（touchStart / touchMove / touchEnd）による実touchイベントでのbrush描画
- **iPhone SE級viewport（375×667）**: 767px以下では既存レスポンシブ仕様によりtoolbar nav がCSS上`display:none`になりaccessibility treeからも除外されるため、下部ナビの「プロパティ」タブへ切り替えて新規アセット作成フォームへ到達し、ツール切り替えだけはDOM状態（textContent一致）を基にbutton要素を特定して`.click()`する。それ以外（アセット作成、canvas上のpointer操作、保存・Undo確認）はrole / accessible name経由の通常操作である。ツールバーを小viewportでも視認・操作可能にするレイアウト変更は本sliceの範囲外とし、次slice以降の課題として残す。

既存E2Eの期待値は変更していない。

## 9. 副次的に発見・修正したrendering race

上記E2E追加の過程で、`renderers/canvas2d/render.ts`の`drawLayer`が、asset切り替え直後の1frameだけ「直前layerのbitmapが別effectでcloseされた直後」に`ctx.drawImage`へ渡され`InvalidStateError: ... The image source is detached`を投げ、`CanvasEditor`をuncaught errorでクラッシュさせる既存の潜在raceを発見した（`e2e/flipcopy.spec.ts`が本sliceの変更前から約4割の頻度でflakyに失敗することを、変更前branchでの複数回再実行により確認済み）。同種のraceは新設した貼り付けpreviewの`pasteBitmap`描画にも当てはまるため、両箇所の`ctx.drawImage`呼び出しをtry/catchで囲み、detached bitmapのframeだけ描画をskipする防御的修正を追加した（次renderで正しいbitmap / nullへ更新されるため安全）。データ形式・schemaには影響しない、`render.ts` / `CanvasEditor.tsx`内の描画堅牢性のみの修正である。

## 10. 安全境界

schema、version、migration、IndexedDB layout、`.casproj`、export ZIP、dependencies、source Blobを変更しない。selection・copy buffer・paste preview・text文字列/font/sizeを永続化しない。persistent shape / text、frameずれ修正、Asset canvas resize、game data自動追従は実装しない。

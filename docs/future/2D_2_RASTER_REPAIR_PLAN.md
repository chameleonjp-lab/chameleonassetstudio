# 2D-2-RASTER + 2D-2-REPAIR 契約監査・実装計画

作成日: 2026-07-16
状態: `A+X+P+M accepted / Slice 1 + Slice 2 completed / align-distribute S1+R2+W1+D1+H1 accepted / PR #113 verification in progress`
正式work package: `2D-2-RASTER + 2D-2-REPAIR`
基準main: `c6a18eb78637033ddeeb60dc5d645bf6d3347ed5`（PR #102 merge）
直前slice: `2D-2-PROJECT + 2D-2-CREATE` accepted A+B+X completed
採用判断: `A+X+P+M`

## 1. 目的

画像を取り込む、または空Assetを作るだけで終わらず、選択中のimage layerへ描画し、ゲーム素材として必要な修正を安全に完了できる状態へ進める。

本work packageでは、次を完成対象にする。

- brush、fill、selection、shape、textのraster編集
- transform、align、grid、snapを使った配置修正
- 背景透過、透明縁、alpha trim、余白、layer resize、palette、色違い、flip、outline
- frameずれ修正の意味と実装時期
- sourceを残し、edit Blob、Asset、History、snapshotを整合して確定する編集経路

2026-07-16の人間判断により、shape / textはraster-first、selectionはsingle-layer rectangular、trim / padding / resizeはlayer image単位、frameずれ修正は`2D-3-TIMELINE`後とする。

## 2. 着手条件と直前sliceの完了

`2D-2-PROJECT + 2D-2-CREATE`の残るA+B+X sliceは完了した。

- 契約PR #99 merge commit: `261bc2dcd3635c2741323727c6364de579e668c2`
- 実装PR #100 final head: `0151295089a1259e4b4c27e2a64ac55816c5dedb`
- PR #100 merge commit: `5f72c5f3f94df27a293b0131c88cc6550b5c76f0`
- CI Run #306: lint、format、build、unit test、E2Eが全成功
- Opus 4.8事後監査: `BLOCKER 0 / MUST 0 / SHOULD 1 / NOTE 3`
- 軽微指摘反映PR #101 final head: `a5492c298baaf08f60773b61d4104a15ff91dc71`
- PR #101 merge commit: `33ebb60c0f78e40439a4c16393ec3e82b4b532eb`
- CI Run #308: lint、format、build、unit test、E2Eが全成功
- 契約監査PR #102 merge commit: `c6a18eb78637033ddeeb60dc5d645bf6d3347ed5`
- CI Run #310: docs-only classification成功

PR #101は製品挙動を変更せず、body Part付きstarterのschema validation、負数・Infinityのsize境界test、防御的な総pixel検査の意図を補強した。

## 3. 現行実装の監査結果

| 対象 | 現状 | 不足 / 境界 |
|---|---|---|
| Pixel処理 | `crop`、背景色透過、eraser、HSL、色置換、outlineが純粋な`PixelBuffer`操作として存在する。 | brush、fill、selection mask、shape描画、text描画、resize、padding、alpha bounds検出は未実装。 |
| Worker | `runImageOperation`はWeb Workerを使い、非対応環境では同期処理へfallbackする。元BufferはUndo用に保持する。 | 新しい重い処理も同じrequest / progress / error契約へ追加する必要がある。 |
| 保存 | 編集前Blobからsnapshotを作り、`saveAssetRevision`でAssetとedit Blobを対で保存し、非同期Undo / Redoを登録する。 | 複数layerや複数frameを同時変更する操作は、部分確定を避ける別の原子境界が必要。 |
| source境界 | 選択layerの参照Blobを編集し、source Blobを通常の画像編集で上書きしない。 | 新機能もsourceを直接変更せず、edit / derived側だけを更新する必要がある。 |
| Canvas tool | select、pan、crop、eraser、背景透過、picker、origin、anchor、colliderがある。 | brush、fill、rect / ellipse、text、rectangular selection専用toolがない。 |
| transform | Layer position、scale、rotation、左右反転、grid、snapは存在する。 | selection内pixelsのmove / copy、複数layer align、pixel resizeの補間選択がない。 |
| shape data | `LayerType`に`shape`はあるが、shapeの種類、座標、fill、strokeを保存するpayloadがない。rendererはTexture-backed imageを描画する。 | 再編集可能shapeを保存するならschema、version、migration、renderer、exportの契約変更が必要。 |
| text data | Asset / Layerにtext、font、size、layoutの保存欄がない。 | 再編集可能textを保存するならfont可搬性を含む契約変更が必要。 |
| repair | 背景透過、crop、色置換、outline、layer flipは部分的に成立する。 | 透明縁の検出、alpha trim、padding、layer resize、palette抽出、frameずれ修正がない。 |

## 4. 変更しない安全境界

本work packageのaccepted sliceでは、次を変更しない。

- Asset / Project JSON Schema、data version、DB version、migration
- IndexedDB store / index layout
- `.casproj`内部構成、export ZIP内部構成
- source Blobの上書きまたは無断削除
- Family / Variant、linked更新、batch
- animation / rig / collider override / polygonのデータ意味
- 2D-4 exporter、3D、WebGPU、外部parser、dependencies

画像編集は、処理成功と保存成功の前にAsset、Blob、React state、Historyを確定しない。失敗時は直前正本と復旧点を維持する。

## 5. A: shape / textはraster-first

brush、fill、rect、ellipse、textはcommit時に選択image layerのpixelsへ確定する。shape / text設定はcommit前の一時UI状態だけにし、Assetへ保存しない。

- schema、version、migrationを変更しない。
- 確定後は文字列や図形パラメータを再編集できないことをUIで明示する。
- Undo / snapshotで確定前へ戻れるようにする。
- textは汎用font family候補からCanvasへ描画し、確定後のpixelsを正本とする。
- font名や文字列を保存しないため、別端末で再描画しない。
- 確定前previewと確定結果は同じCanvas描画経路を使う。

persistent shape / textを将来採用する場合は、schema、version、migration、renderer、export、font可搬性を扱う独立した危険契約とする。

## 6. X: single-layer rectangular selection

1つのimage layerに対するrectangular selectionを一時UI状態として実装する。

- brush / erase / fill / 色置換のmaskとして使う。
- 同一layer内のmove / copy / clearに使う。
- selection、copy buffer、preview overlayはAsset、Project、Historyへ保存しない。
- commit時だけpixel差分を1操作として確定する。
- system clipboard、cross-asset paste、lasso、magic wand、複数layer selectionは後続へ送る。
- touchとmouseの両方で矩形を作成・調整・解除できるようにする。

## 7. P: layer image操作とAsset canvas操作を分離

alpha trimは選択textureだけを切り詰め、Layer.positionを補正してworld上の見た目を維持する。paddingとlayer resizeもtexture単位とする。

- origin、anchor、collider、canvasSizeを変更しない。
- resize補間はnearest / smoothを明示選択する。
- layer resize後もAsset canvasとgame dataの座標を維持する。
- 画像がcanvas外へ出る場合はpreviewとwarningを表示する。
- 自動でcanvasを拡張しない。
- Asset canvas resizeとgame data追従は別の座標契約まで保留する。

## 8. M: frameずれ修正はtimeline完成後

最初のRASTER / REPAIR sliceでは単一image layerを完成させる。frameずれ修正は`2D-3-TIMELINE`でframe意味と可変時間を完成させた後、本work packageの後続sliceとして実装する。

- 現行`frames[].layerStates`のposition差だけをframeずれ全体とは扱わない。
- 画像内容解析による自動位置合わせを先取りしない。
- timeline完成後にtransform差、pixel内容差、透明領域、Undo、性能を改めて契約する。

## 9. 採用結果

採用組み合わせは`A+X+P+M`である。

- shape / textを明示的にraster化し、保存形式を変えない
- single-layer rectangular selectionを基礎にする
- layer imageのtrim / padding / resizeとAsset canvas / game dataを分離する
- frameずれ修正はtimelineの意味を完成させた後に扱う

この組み合わせにより、現行schema、`.casproj`、export ZIPを変えず、既存のWorker、snapshot、改訂保存、Undo / Redoを再利用する。

## 10. accepted後の実装順

正式work packageは分割せず、同じ`2D-2-RASTER + 2D-2-REPAIR`内で利用者体験ごとにsliceを分ける。

### Slice 1: raster foundation

1. brush、fill、rect、ellipseの純粋PixelBuffer操作とWorker requestを追加する。
2. raster text preview / commitを追加し、「確定後はpixelsになる」と表示する。
3. single-layer rectangular selectionとmask、move / copy / clearを追加する。
4. 既存snapshot、`saveAssetRevision`、非同期Undo / Redo、競合guardへ接続する。
5. mouse、touch、iPhone SE級レイアウトのE2Eを追加する。

### Slice 2: layer repair

1. alpha bounds検出、透明縁warning、alpha trimを追加する。
2. paddingとlayer resizeを追加し、nearest / smoothを明示選択する。
3. palette抽出と既存replaceColor、outline、flipを同じ修復導線へ整理する。
4. 操作前後preview、失敗時無変更、snapshot、reload、`.casproj`退避を確認する。

### 後続slice

- 複数layer align / distribute。`S1+R2+W1+D1+H1`を2026-07-17にacceptedとし、PR #113で実装・検証中。正本は`docs/future/2D_2_LAYER_ALIGN_PLAN.md`を参照する。
- canvas resizeとgame data追従契約
- timeline完成後のframeずれ修正
- persistent shape / textを採用する場合の独立schema契約

Slice 1とSlice 2はPR #105〜#110で完了した。align / distributeはPR #112で契約監査し、accepted後の実装をPR #113で行う。CI成功後にOpus 4.8 reviewと人間確認へ渡す。

## 11. 完了条件

1. `A+X+P+M`が人間判断として記録される。
2. source Blobを変更せず、edit BlobとAssetを改訂単位で確定する。
3. 各raster操作が純粋処理、Worker、progress、理由付きerror、Undo / Redoを持つ。
4. selectionやpreviewなどの一時状態を保存形式へ混入させない。
5. trim / resizeでgame dataを無断変更しない。
6. 失敗、取消、容量不足、reloadで直前正本を維持する。
7. schema、version、migration、`.casproj`、export ZIP、dependenciesを変更しない。
8. unit test、E2E、lint、format、build、GitHub Actionsが成功する。
9. Opus reviewと人間確認前にready化、merge、auto-mergeを行わない。

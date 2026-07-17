# 複数Layer align / distribute 契約監査

作成日: 2026-07-17
状態: `accepted (2026-07-17) / implemented`。人間判断で`S1+R2+W1+D1+H1`がacceptされ、同日中に実装した。実装記録は§8。
正式work package: `2D-2-RASTER + 2D-2-REPAIR`
関連PR: PR #111 closeoutが本監査を次の正式作業として固定した。実装PRは`claude/2d2-layer-align-impl`ブランチ。
推奨組み合わせ: `S1+R2+W1+D1+H1`（2026-07-17に人間判断でaccepted）

## 1. 目的

`2D-2-RASTER + 2D-2-REPAIR`のSlice 1（raster foundation）とSlice 2（layer repair）は完了済みである。次の正式契約対象は、複数Layerを対象にしたalign（整列）/ distribute（等間隔配置）である。本文書は、実装前に固定すべき次の5点を監査し、判断の選択肢と推奨、推奨組み合わせを提示する。

1. 保存しない複数Layer選択とactive layerの関係
2. Asset / 選択範囲 / active layerの整列基準
3. rotation・scale・負scaleを含むworld bounds
4. 同率時の決定的な配置順
5. snapshot・Undo/Redo・保存・reloadの境界

本文書はacceptを含まない。人間判断後に、実装計画を`docs/future/2D_2_RASTER_REPAIR_PLAN.md`の後続sliceとして着手する。

## 2. 現状監査

file根拠付きで次を確認した。

| 対象 | 現状 | 根拠 |
|---|---|---|
| 複数Layer選択 | 未実装。既存`checkedLayerIds`はパーツ作成専用の一時state。 | `src/features/editor/EditorScreen.tsx:252`で`useState<string[]>([])`として宣言。`src/features/editor/LayerPanel.tsx:59`のcheckbox `aria-label`は`「${layer.name}」をパーツ作成の対象にする`で、パーツ作成専用の意図に固定されている。 |
| align / distributeのコード | 存在しない。src/内の`align`/`distribute`ヒットはCSSとtest内の無関係な語のみ。 | `src/features/editor/editor.css`、`src/features/home/home.css`にCSSの`align-items`等のヒットのみ。`src/core/model/assetInspection.test.ts:171`の`aligned duration`はtestの説明文中の英単語で、layer整列機能とは無関係。 |
| `LayerTransform` | position / scale / rotationを持つ。負scaleはflip由来で発生しうる。 | `src/core/model/layer.ts:8-12`。 |
| transform済み4隅計算の前例 | PR #109がEditorScreenへ導入した`layerExtendsOutsideCanvas`が、`layerWorldPoint`を使いテクスチャ4隅をrotation・scale込みでworld座標へ変換している。 | `src/features/editor/EditorScreen.tsx:170-190`（4隅を`layerWorldPoint(previewLayer, textureSize, point)`で変換）。`layerWorldPoint`本体は`src/renderers/canvas2d/view.ts:103-114`（`position`はテクスチャ左上、`scale`/`rotation`はテクスチャ中心基準、と関数直上のdocコメントで明記）。 |
| 既存のlayer数値編集経路 | position等の直接編集は`commitAssetChange`（1操作 = 1 History entry、autosave）を通る。 | `src/features/editor/EditorScreen.tsx:618-635`。`history.push`でundo/redoを登録し、`applyAssetSnapshot(next)`で確定する。snapshot（`saveAssetRevision`）は使わない。 |

## 3. 判断待ち5点

### 判断1: 選択モデル

- **S1（推奨）**: 既存のLayer checkbox（`checkedLayerIds`、現状はパーツ作成専用）を「複数Layer操作の対象」へ一般化し、パーツ作成とalign / distributeで共用する。React一時state（`checkedLayerIds`）のままとし、Asset / Project / History / IndexedDBへ保存しない。active layer（`selectedLayerId`）とは独立に扱う。
- S2: align専用の新しい複数選択モードを別stateで追加する。UIが重複するため非推奨。

### 判断2: 整列基準

- **R2（推奨）**: Asset canvas（`canvasSize`矩形）/ 選択群の合成bounds / active layerのboundsの3基準を明示selectorで提供する。既定は選択bounds。active layer基準を選んだ場合、active layer自身は移動対象から除外する。
- R1: canvas + 選択boundsの2基準のみとし、active layer基準は後続へ送る。bounds計算が共通で追加コストが小さいため、R2（初回提供）を推奨する。

### 判断3: world bounds

- **W1（推奨）**: baseの`Layer.transform`（position / scale / rotation。負scale = flipを含む）を適用したtexture 4隅のAABBを整列対象矩形とする。PR #109が確立した`layerWorldPoint`による4隅計算と同型の手法を再利用する。frame別`layerStates`の上書きは考慮しない（frame単位の整列は`2D-3-TIMELINE`後の別契約とする）。`visible=false`のlayerもcheck済みなら対象とする（明示選択を尊重する）。
- W2: position点のみでboundsを無視する。回転・反転時に見た目とずれるため非推奨。

### 判断4: distributeの決定性

- **D1（推奨）**: 対象のAABB中心座標（整列軸方向）でソートし、同値の場合は`Asset.layers`配列順（描画順）を第2キーとする決定的順序にする。両端の2 layerは固定し、中心を等間隔配置する。対象3枚未満はno-opとし、理由をUIで表示する。gap（隙間）等間隔は後続候補として記録する。
- D2: gap等間隔を初回から提供する。複雑化するため後続へ送ることを推奨する。

### 判断5: 履歴・保存境界

- **H1（推奨）**: align / distributeはpixelを変更せずpositionのみを変更するため、既存の`commitAssetChange`経路（1操作 = 1 History entryで複数layerのposition変更をまとめてundo、autosave保存、snapshotは作らない）に乗せる。選択状態・整列基準の選択値は保存しない。reload後はpositionだけが残る。
- H2: `saveAssetRevision`経路を使う。Blob変更が無いため過剰であり非推奨。

### 推奨組み合わせ

`S1 + R2 + W1 + D1 + H1`を推奨する。**本文書ではacceptしない。人間判断待ちとする。**

## 4. 実装スライス案

acceptされた場合、単一sliceとして次の順で実装する。

1. 純関数（bounds計算、align計算、distribute計算）を追加し、unit testで固める。
2. 既存`checkedLayerIds`をLayerPanel / EditorScreenで整列UIへ配線する。
3. 整列基準selector（canvas / 選択 / active layer）とalign / distribute操作ボタンを追加する。
4. `commitAssetChange`経路へ接続し、複数layerのposition変更を1 History entryにまとめる。
5. mouse、touch、iPhone SE級レイアウトを含むE2Eを追加する。

## 5. 受け入れ条件

### unit

- AABBが負scale（flip）・rotationを含むLayerで正しく計算される境界test。
- 同率tiebreak（AABB中心が同値の場合に`Asset.layers`配列順で決定される）の決定性test。
- 対象3枚未満のdistributeがno-opになり、理由を返すtest。

### E2E

- 整列 → 保存 → reloadで、position変更が維持され、選択状態・整列基準は保存されないことを確認する。
- Undoで、align / distributeが変更した全layerのpositionが1操作でまとめて復元されることを確認する。

## 6. 安全境界

acceptされた場合も、次を変更しない。

- Asset / Project JSON Schema、data version、DB version、migration
- IndexedDB store / index layout
- `.casproj`内部構成、export ZIP内部構成
- source Blobの上書きまたは無断削除
- dependencies

次を保存形式へ混入させない。

- 複数Layer選択状態（`checkedLayerIds`の一般化含む）
- 整列基準の選択値

次を対象外とする。

- Family / Variant、linked更新、batch
- frame別`layerStates`のalign（`2D-3-TIMELINE`後の別契約）
- 3D、WebGPU

## 7. 状態

`contract audit / human decision pending`。人間判断でS1+R2+W1+D1+H1がacceptされた後、`docs/future/2D_2_RASTER_REPAIR_PLAN.md`の後続sliceとして実装契約PRを起票する。

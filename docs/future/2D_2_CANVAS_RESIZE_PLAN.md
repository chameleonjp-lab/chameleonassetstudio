# Asset canvas resize / game data追従 契約監査

作成日: 2026-07-17
状態: `human decision pending / docs-only audit`
正式work package: `2D-2-RASTER + 2D-2-REPAIR`
基準main: `c6810487fd7dcd9e182f70c71fe7047c47b0ba0f`（PR #113 merge）
前段: 複数Layer align / distribute `S1+R2+W1+D1+H1` completed（PR #113）
推奨組み合わせ: `B1+P1+G1+O1+V1+H1`（未採用）

## 1. 目的

Layer imageのtrim / padding / resizeは、PR #105〜#110でAsset canvasとgame dataを自動変更しない契約として完成した。次の後続sliceとして、既存textureやpixelを変更せずに`Asset.canvasSize`を変更するとき、旧canvasを新canvas内のどこへ置き、canvas座標を持つLayerとgame dataをどう追従させるかを監査する。

本監査で固定候補にする判断は次の6点である。

1. canvas resizeと画像scale / layer image resizeの境界
2. 旧canvasを置く9点anchorと、奇数差分の決定的な丸め
3. canvas座標データへ同じ移動量を適用する範囲
4. 縮小後にcanvas外へ出るデータの扱い
5. 寸法validationとno-op
6. History、autosave、snapshot、exportへの影響

この文書は監査結果と選択肢を提示するだけであり、推奨組み合わせをacceptしない。product codeへの実装は人間判断後の別Draft PRで行う。

## 2. 現状監査

| 対象 | 現状 | 根拠 |
|---|---|---|
| `Asset.canvasSize` | 現行`0.1.0`の必須fieldで、アセット基準canvasの幅・高さをpxで持つ。schemaは正数を許容するが、新規空canvas UIは1〜4096の整数へ制限する。 | `src/core/model/asset.ts:94`、`src/core/schema/asset.schema.json:40-42,143-158`、`src/features/editor/blankAsset.ts:14-15,50-71`。 |
| canvas resize UI / model操作 | 既存Assetの`canvasSize`だけを変更するUIと純関数は存在しない。新規作成時だけ寸法を入力できる。 | `src/features/editor/EditorScreen.tsx:280-312,1435-1460`、`src/features/editor/blankAsset.ts:117-138`。 |
| layer image操作との境界 | alpha trim / padding / layer resizeはtexture単位であり、`canvasSize`、origin、anchor、colliderを変更しない。canvas外へ出る場合も自動拡張しない。 | `docs/future/2D_2_RASTER_REPAIR_PLAN.md` §7、`docs/future/2D_2_RASTER_REPAIR_REPORT.md:187-191`。 |
| 共通座標 | canvas左上`(0, 0)`、右`x+`、下`y+`、単位px。Layer position、origin、anchor、collider、frame内のpositionはcanvas座標を使う。 | `docs/adr/0001-coordinate-and-transform-semantics.md`、`docs/future/2D_ASSET_DATA_CONTRACT.md` §6.1-6.2。 |
| canvas座標を持つ保存データ | base Layerの`transform.position`、明示された`frames[].layerStates[].transform.position`、`origin`、`anchors[].position`、rect colliderの`x/y`、circle colliderの中心`x/y`、`parts[].pivot`が該当する。 | `src/core/model/asset.ts:94-104`、`src/core/model/animation.ts:3-16`、`src/core/model/anchor.ts:20-26`、`src/core/model/collider.ts:7-37`、`src/core/model/part.ts:27-41`。 |
| canvas座標ではないデータ | texture sizeとpixel、scale / rotation、colliderのwidth / height / radius、Partの`bindPose.localPosition`、rig keyframeの`localPosition`、tileSize、gameAttributesは移動対象ではない。 | `src/core/model/part.ts:20-24,37-41`、`src/core/model/rig.ts:3-16`、`src/core/model/asset.ts:106-115`。 |
| Game Data編集 | origin、anchor、colliderは既存の純関数と`GameDataPanel`から変更し、Asset変更履歴へ積める。 | `src/core/model/assetOps.ts:161-270`、`src/features/editor/GameDataPanel.tsx:73-112`、`src/features/editor/EditorScreen.tsx:618-635`。 |
| export影響 | 合成PNGとsprite sheetのcellは`asset.canvasSize`で生成される。canvas resizeはexport形式を変えないが、再出力画像の寸法と余白 / 切り出し範囲を変える。 | `src/core/export/exportAsset.ts:106-135,186-205`、`docs/EXPORT_FORMATS.md:69-70`。 |

## 3. 判断候補

### 判断1: canvas境界とpixelの関係

- **B1（推奨）**: `Asset.canvasSize`だけを変更するcanvas境界操作とする。texture size、source / edit / thumbnail Blob、Layer scale / rotation、pixel内容を変更しない。画像scaleやlayer image resizeは既存の別操作を使う。
- B2: canvas変更に合わせて全texture / pixelをscaleする。source境界、Blob改訂、補間、frame、game dataのscaleまで同時に変えるため、本sliceでは採用しない。

### 判断2: 旧canvasの配置anchorと奇数差分

- **P1（推奨）**: 左上 / 上 / 右上 / 左 / 中央 / 右 / 左下 / 下 / 右下の9点anchorを明示する。旧sizeを`old`、新sizeを`next`、差を`dw = next.width - old.width`、`dh = next.height - old.height`とし、移動量を各軸で次のように決める。
  - 左 / 上: `0`
  - 中央: `Math.trunc(difference / 2)`
  - 右 / 下: `difference`
  - 奇数差分の余り1pxは右 / 下側へ置く、または右 / 下側から除く。既存の整数座標を不用意に0.5pxへずらさない。
  - UI既定値は中央とする。ただし前回値をAsset / Projectへ保存しない。
- P2: 左上固定だけを提供する。座標は最も単純だが、中央や下中央を基準にした素材で手作業が増える。
- P3: 中央計算で0.5pxを許す。幾何学中心は厳密になるが、pixel artを半pixelへ移動しうるため非推奨。

### 判断3: game data追従範囲

- **G1（推奨）**: P1で得た同じ`dx / dy`を、canvas座標を持つ全保存データへ原子的に加える。
  - `layers[].transform.position`
  - `frames[].layerStates[].transform.position`（transformが明示されているstateだけ。未指定stateは移動後のbase Layerを継承する）
  - `origin`
  - `anchors[].position`
  - rect colliderの`rect.x / rect.y`
  - circle colliderの`circle.x / circle.y`
  - 値が存在する`parts[].pivot`
- G1では、texture size / Blob / pixel、Layer scale / rotation、collider width / height / radius、Part bind poseとrig keyframeのlocal position、tileSize、effect / gimmick設定、`gameAttributes`、animation時間と順序を変更しない。
- G2: Layerだけを移動し、origin / anchor / collider等のgame dataを数値固定する。見た目とgame dataの対応を壊すため非推奨。
- G3: `canvasSize`だけを変更し、保存座標を一切動かさない。左上anchor時のG1と同値だが、他anchorの意味を提供できない。

### 判断4: 縮小とcanvas外データ

- **O1（推奨）**: 縮小を許可し、適用前previewでcanvas外へ出る対象をLayer / origin / anchor / collider / part pivot / frame stateごとに数えて警告する。1件以上ある場合は明示確認を必須にする。適用後も座標をclampせず、Layerをcropせず、game dataを削除・縮小しない。
- O2: いずれかの対象がcanvas外へ出る縮小を拒否する。安全だが、意図的なcrop用canvas変更ができない。
- O3: canvas内へ自動clamp / cropする。game dataの意味や画像内容を無断変更するため採用しない。

### 判断5: 寸法validationとno-op

- **V1（推奨）**: 新規空canvasと同じ1〜4096の整数、各辺4096以下、総pixel数4096 x 4096以下を再利用する。値を暗黙に丸めたりclampしたりしない。同じsizeはno-opとし、Historyとautosaveを発生させない。
- V2: schemaが許す任意の正数を受け入れる。Canvas / exportが整数寸法を要求し、既存の入力安全境界ともずれるため非推奨。

### 判断6: History、保存、export境界

- **H1（推奨）**: pixel / Blobを変更しないAsset-only操作として既存`commitAssetChange`経路へ接続する。canvasSizeとG1の全座標変更を1 History entryにまとめ、Undo / Redo、autosave、reloadで一括復元する。Blob snapshotは作らない。
- anchor選択、入力途中、preview、警告確認状態は一時UI stateとし、Asset / Project / IndexedDBへ保存しない。
- schema、data version、DB version、migration、`.casproj`構成、export ZIP構成は変更しない。再export時の画像 / cell寸法が新しい`canvasSize`へ変わることは、既存format内の期待結果としてE2Eで確認する。
- H2: Blob snapshotを作る。Blobが変わらない操作には過剰であり非推奨。

### 推奨組み合わせ

`B1 + P1 + G1 + O1 + V1 + H1`を推奨する。ただし本PRでは採用せず、人間判断を待つ。

## 4. 実装スライス案（accept後）

1. `canvasSize`、9点anchor、移動量から次のAssetを返す純関数を追加する。
2. 全canvas座標fieldの追従、奇数差分、frame transform継承、非対象field不変、同size no-opをunit testで固定する。
3. canvas width / height、9点anchor、変更前後preview、対象別warningをEditorへ追加する。
4. 変更を`commitAssetChange`へ1操作として接続し、Undo / Redo、autosave、reloadを確認する。
5. export画像 / sprite sheet cellへの反映、mouse、touch、iPhone SE級viewportをE2Eで確認する。

## 5. 受け入れ条件（accept後）

### unit

- 9点anchorの`dx / dy`が拡大 / 縮小、偶数 / 奇数差分で決定的である。
- base Layer、明示frame transform、origin、anchor、rect / circle collider、part pivotへ同じ移動量が一度だけ適用される。
- texture / Blob参照、scale / rotation、collider size / radius、local pose、tileSize、gameAttributes、animationが不変である。
- 1〜4096の整数制限と同size no-opが成立する。
- 縮小warningがtransform済みLayer範囲と各game dataのcanvas外判定を分類して返す。

### E2E

- 中央anchorで拡大し、見た目とgame dataの相対位置を維持したまま保存 / reloadできる。
- canvas外警告のある縮小を取消した場合は無変更、確認した場合はclamp / cropなしで保存される。
- 1回のUndoでcanvasSizeと全追従座標が戻り、Redoで再適用される。
- source / edit Blobとtexture sizeは変わらず、再export画像とsprite sheet cellだけが新canvas寸法になる。
- touch contextとiPhone SE級viewportで入力、9点anchor、preview、警告確認へ到達でき、横スクロールが発生しない。

## 6. 安全境界

accept後の実装でも次を変更しない。

- Asset / Project JSON Schema、data version、DB version、migration
- IndexedDB store / index layout
- `.casproj`内部構成、export ZIP内部構成
- source / edit / thumbnail Blob、texture size、pixel内容
- dependencies

次を対象外とする。

- 画像 / Layerのscale、resampling、DPI変更
- game dataのscale、clamp、crop、自動削除
- `gameAttributes`内の任意座標の推測変換
- frame別collider / anchor、polygonなど未導入schema
- Family / Variant、batch resize、linked更新
- 3D、WebGPU

## 7. 判断待ち

次の人間判断は、推奨`B1+P1+G1+O1+V1+H1`を採用するか、各判断の代替案へ差し替えるかである。採用前にproduct codeへ着手せず、ready化、merge、auto-mergeを行わない。

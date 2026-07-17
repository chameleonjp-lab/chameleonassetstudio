# 複数Layer align / distribute 契約・実装記録

作成日: 2026-07-17
状態: `accepted (2026-07-17) / implemented / CI successful / merged (PR #113)`。人間判断で`S1+R2+W1+D1+H1`がacceptされ、同日中に実装・検証・mergeした。実装記録は§8。
正式work package: `2D-2-RASTER + 2D-2-REPAIR`
関連PR: PR #111 closeoutが本監査を次の正式作業として固定した。実装PR #113は`claude/2d2-layer-align-impl`からmainへmerge済み。
採用組み合わせ: `S1+R2+W1+D1+H1`（2026-07-17に人間判断でaccepted）

## 1. 目的

`2D-2-RASTER + 2D-2-REPAIR`のSlice 1（raster foundation）とSlice 2（layer repair）は完了済みである。後続sliceとして、複数Layerを対象にしたalign（整列）/ distribute（等間隔配置）の次の5点を監査し、2026-07-17の人間判断で採用した契約と実装記録を固定する。

1. 保存しない複数Layer選択とactive layerの関係
2. Asset / 選択範囲 / active layerの整列基準
3. rotation・scale・負scaleを含むworld bounds
4. 同率時の決定的な配置順
5. snapshot・Undo/Redo・保存・reloadの境界

採用組み合わせは`S1+R2+W1+D1+H1`である。実装は`docs/future/2D_2_RASTER_REPAIR_PLAN.md`の後続slice、PR #113として完了した。

## 2. 実装前の現状監査

file根拠付きで次を確認した。

| 対象 | 現状 | 根拠 |
|---|---|---|
| 複数Layer選択 | 未実装。既存`checkedLayerIds`はパーツ作成専用の一時state。 | `src/features/editor/EditorScreen.tsx:252`で`useState<string[]>([])`として宣言。`src/features/editor/LayerPanel.tsx:59`のcheckbox `aria-label`は`「${layer.name}」をパーツ作成の対象にする`で、パーツ作成専用の意図に固定されている。 |
| align / distributeのコード | 存在しない。src/内の`align`/`distribute`ヒットはCSSとtest内の無関係な語のみ。 | `src/features/editor/editor.css`、`src/features/home/home.css`にCSSの`align-items`等のヒットのみ。`src/core/model/assetInspection.test.ts:171`の`aligned duration`はtestの説明文中の英単語で、layer整列機能とは無関係。 |
| `LayerTransform` | position / scale / rotationを持つ。負scaleはflip由来で発生しうる。 | `src/core/model/layer.ts:8-12`。 |
| transform済み4隅計算の前例 | PR #109がEditorScreenへ導入した`layerExtendsOutsideCanvas`が、`layerWorldPoint`を使いテクスチャ4隅をrotation・scale込みでworld座標へ変換している。 | `src/features/editor/EditorScreen.tsx:170-190`（4隅を`layerWorldPoint(previewLayer, textureSize, point)`で変換）。`layerWorldPoint`本体は`src/renderers/canvas2d/view.ts:103-114`（`position`はテクスチャ左上、`scale`/`rotation`はテクスチャ中心基準、と関数直上のdocコメントで明記）。 |
| 既存のlayer数値編集経路 | position等の直接編集は`commitAssetChange`（1操作 = 1 History entry、autosave）を通る。 | `src/features/editor/EditorScreen.tsx:618-635`。`history.push`でundo/redoを登録し、`applyAssetSnapshot(next)`で確定する。snapshot（`saveAssetRevision`）は使わない。 |

## 3. accepted 5判断

### 判断1: 選択モデル

- **S1（採用）**: 既存のLayer checkbox（`checkedLayerIds`、現状はパーツ作成専用）を「複数Layer操作の対象」へ一般化し、パーツ作成とalign / distributeで共用する。React一時state（`checkedLayerIds`）のままとし、Asset / Project / History / IndexedDBへ保存しない。active layer（`selectedLayerId`）とは独立に扱う。
- S2: align専用の新しい複数選択モードを別stateで追加する。UIが重複するため非推奨。

### 判断2: 整列基準

- **R2（採用）**: Asset canvas（`canvasSize`矩形）/ 選択群の合成bounds / active layerのboundsの3基準を明示selectorで提供する。既定は選択bounds。active layer基準を選んだ場合、active layer自身は移動対象から除外して固定し、残る移動対象が1枚でも整列可能とする。したがって`active + 他1枚`のチェックで成立する。
- R1: canvas + 選択boundsの2基準のみとし、active layer基準は後続へ送る。bounds計算が共通で追加コストが小さいため、R2（初回提供）を推奨する。

### 判断3: world bounds

- **W1（採用）**: baseの`Layer.transform`（position / scale / rotation。負scale = flipを含む）を適用したtexture 4隅のAABBを整列対象矩形とする。PR #109が確立した`layerWorldPoint`による4隅計算と同型の手法を再利用する。frame別`layerStates`の上書きは考慮しない（frame単位の整列は`2D-3-TIMELINE`後の別契約とする）。`visible=false`のlayerもcheck済みなら対象とする（明示選択を尊重する）。
- W2: position点のみでboundsを無視する。回転・反転時に見た目とずれるため非推奨。

### 判断4: distributeの決定性

- **D1（採用）**: 対象のAABB中心座標（整列軸方向）でソートし、同値の場合は`Asset.layers`配列順（描画順）を第2キーとする決定的順序にする。両端の2 layerは固定し、中心を等間隔配置する。対象3枚未満はno-opとし、理由をUIで表示する。gap（隙間）等間隔は後続候補として記録する。
- D2: gap等間隔を初回から提供する。複雑化するため後続へ送ることを推奨する。

### 判断5: 履歴・保存境界

- **H1（採用）**: align / distributeはpixelを変更せずpositionのみを変更するため、既存の`commitAssetChange`経路（1操作 = 1 History entryで複数layerのposition変更をまとめてundo、autosave保存、snapshotは作らない）に乗せる。選択状態・整列基準の選択値は保存しない。reload後はpositionだけが残る。
- H2: `saveAssetRevision`経路を使う。Blob変更が無いため過剰であり非推奨。

### 推奨組み合わせ

`S1 + R2 + W1 + D1 + H1`を2026-07-17の人間判断で採用した。

## 4. 実装スライス案

単一sliceとして次の順で実装する。

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
- touch contextとiPhone SE級viewportで、active基準の整列へ到達でき、横スクロールが発生しないことを確認する。

## 6. 安全境界

実装時も、次を変更しない。

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

`S1+R2+W1+D1+H1 accepted / PR #113 implemented / CI successful / merged`。PR #113は2026-07-17にmainへmergeされ、本sliceのcloseoutは完了した。

## 8. 実装記録

PR #113で次を実装した。

- `checkedLayerIds`をパーツ作成とalign / distributeで共有する一時UI stateとして一般化した。
- `layerWorldPoint`を再利用し、rotation・scale・負scaleを含むAABB、6方向align、中心等間隔distributeを純関数化した。
- canvas / selection / activeの3基準を提供し、active基準ではactive自身を固定して、他1枚から整列可能にした。
- position変更を既存`commitAssetChange`へまとめ、1 History entry、autosave、reload維持、選択・基準の非永続化を守った。
- unit test、desktop E2E、touch context + iPhone SE級viewport E2Eを追加した。

CI Run #377はE2E成功、`format:check`失敗だった。Prettier適用、active基準契約、docs同期、mobile E2E補完後のhead `b4c58099cc8eff1791ea3c974786bb5a5d83fa6b`に対するCI Run #378は、classify、lint、format、build、unit test、E2Eが全成功した。最終head `a43d13a8fc82262495b2bfb8ab37eedefb1f4176`のCI Run #379も全成功し、PR #113はmerge commit `c6810487fd7dcd9e182f70c71fe7047c47b0ba0f`としてmainへmergeされた。

後続のAsset canvas resize / game data追従は、契約監査PR #114をmerge commit `99a00d250532010c0bbafed82a33bff290aebf7e`としてmainへmergeした。2026-07-17に`B1+P1+G1+O1+V1+H1`がacceptedとなり、PR #115で実装した。最終head `63d92a1dd56679edc047fa62ab450ad743323cfc`のCI Run #384は全成功し、merge commit `1838f58918a2958f9ebce2f8379f87a45fb17c26`としてmainへmerge済みである。GitHub上のreview / comment記録は0件で、Opus review完了とは扱わない。

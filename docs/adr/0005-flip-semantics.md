# 0005-flip-semantics

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§6.4 左右反転）、`docs/future/FLIP_DESIGN.md`
関連 fixture: `src/core/model/contract.fixtures.test.ts`（ADR-0005）

---

## 文脈

左右反転には「通常反転（非破壊の transform 反映）」と「反転コピー（新規アセット生成）」の 2 種類が実装済みである。両者の反転軸・反転対象・反転式を明文化し数値で固定しないと、将来 trim / atlas / rig 拡張時に反転の意味がぶれる危険がある。

## 決定

- `docs/future/FLIP_DESIGN.md` と契約 §6.4 を規範として固定する。
- **通常反転**: 選択中レイヤー単体に対する非破壊操作であり、レイヤー**中心**を基準に `LayerTransform.scale.x` の符号を反転する（`flipLayerHorizontal`、`src/core/model/assetOps.ts`）。画像ピクセル・`asset.json` の version は変えない。
- **反転コピー**: アセット全体を反転した新規アセットを生成する操作であり、`asset.origin.x` を反転軸 `mirrorX` とする（`flipCopyAsset`、`src/core/model/flipCopy.ts` を規範実装として固定）。
  - 点の反転: `newX = mirrorX - (oldX - mirrorX)`（`anchors`、`part.pivot` に適用）。
  - 矩形 collider の反転: 右端（`x + width`）を反転して新しい左端を求める（`newRectX = mirrorX - ((oldX + width) - mirrorX)`、`width` は不変）。
  - 円 collider の反転: 中心 `x` を上記の点の反転式で反転する（`radius` は不変）。
  - レイヤー変形（`layers` および `frames[].layerStates[].transform`）は `mirrorTransform` により、`scale.x` と `rotation` の符号を反転し、`position` はテクスチャ幅を考慮した中心反射で再計算する（`position.x' = 2*mirrorX - position.x - textureWidth`）。
  - 左右の対応付けを入れ替える。実装上は 2 系統ある: アンカー用途は `ANCHOR_ROLE_MIRROR`（現行対象は `hand_left <-> hand_right` のみ）、パーツ種別は `PART_TYPE_MIRROR`（`arm_left <-> arm_right`、`leg_left <-> leg_right` など）。加えて名前中の left/right トークン（`swapLeftRightLabel`）を入れ替える。
  - `origin` は反転軸そのものなので座標は不変。
  - 新規 `id` を採番し、`layers` / `parts` / `frames` / `animations` の相互参照を張り替える（ADR-0002 と同一の規範実装）。
- リグ編集データ（`rigAnimations`）、`part` の `bindPose` / `rotationLimit`、polygon 頂点順、frame 別の反転上書きは、本 ADR の対象外とし、別の設計レビュー + 人間確認まで実装しない。現行 `flipCopyAsset` も `rigAnimations` を意図的に省く（`undefined` にする）ことで、この境界を実装済みである。

## 根拠

- `flipLayerHorizontal`（`src/core/model/assetOps.ts`）が通常反転の全実装であり、`scale.x *= -1` のみを行う。
- `flipCopyAsset` / `mirrorTransform`（`src/core/model/flipCopy.ts`）が反転コピーの全反転式を実装し、既存テスト（`src/core/model/flipCopy.test.ts`）が数式の一部を裏付けている。本 ADR の fixture はこれとは独立したデータで契約として再固定する。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §6.4、`docs/future/FLIP_DESIGN.md`。
- 影響実装（現状維持）: `src/core/model/assetOps.ts`（`flipLayerHorizontal`）、`src/core/model/flipCopy.ts`（`flipCopyAsset` / `mirrorTransform` / `swapLeftRightLabel`）。
- fixture: `src/core/model/contract.fixtures.test.ts` の ADR-0005 セクションで、`origin.x = 20` を軸にした反転コピーに対し、anchor 点・rect（x, width 不変）・circle（中心 x）の座標が式どおりになること、`hand_left`/`hand_right` の role 入れ替えを数値で固定する。

## 再検討条件

リグ編集データ・polygon 頂点順・frame 別上書きの反転を実装する場合は、`docs/future/FLIP_DESIGN.md` 6 章のとおり、Opus 4.8 の設計レビューと人間確認を経てから着手する。反転軸・反転式・role 対応表を変更する場合も同様に別 PR とする。

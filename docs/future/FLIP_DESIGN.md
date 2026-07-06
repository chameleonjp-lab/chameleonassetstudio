# 左右反転の設計方針

最終更新日: 2026-07-06
文書種別: Phase 19「左右反転」の仕様方針（実装前の設計固定）
上位文書: `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`（Phase 19-B）
関連: `docs/DATA_FORMAT.md`, `docs/EXPORT_FORMATS.md`

この文書は Phase 19「左右反転」の**設計方針を固定するため**のもの。本文書時点では実装しない（UI・`assetOps` 変更・schema 変更・E2E 追加はいずれも未実施）。

---

## 1. 結論

**通常の左右反転は `LayerTransform.scale.x` の符号反転（非破壊）を基本にする。**

加えて、右向き・左向きを別々に編集したい用途のために、**「左右反転コピーを作成」を別コマンドとして将来実装する**。

---

## 2. 通常の左右反転（基本操作）

- 対象: 選択中レイヤー
- 実装方針: `layer.transform.scale.x *= -1`
- 反転基準: レイヤー中心
- 画像ピクセルは変更しない（非破壊）
- `asset.json` の version は上げない（既存 `LayerTransform` に乗るため追加フィールド不要）
- Undo / Redo に自然に乗る

### この方式を基本にする理由

- 元画像を破壊しない。
- Undo / Redo しやすい。
- 既存 `LayerTransform`（`position` / `scale: Vec2` / `rotation`）にそのまま乗り、データ形式の追加が不要。
- 右向き / 左向きの編集差分を増やしすぎない。
- まず作者自身の制作速度を上げる目的に合う。

### 反転コピーを「基本」にしない理由

反転コピーを基本にすると、レイヤー・フレーム・アニメーション・アンカー・当たり判定・パーツ・リグ・effect などの複製が増える。結果、右向き側を直したあと左向き側も直す必要が出やすく、ゲーム用メタデータのズレが起きる。よって**通常操作は transform 反映を基本**にする。

---

## 3. 左右反転コピーを作成（将来コマンド）

右向き・左向きで別々に編集したい場面（左右で見た目を変える、武器を持つ手を変える、左向きだけ影や服を直す、攻撃判定やアンカーを左右別に微調整する、ゲーム側へ左右別データとして渡す）のために、通常の反転とは別コマンドとして用意する。

- 対象: レイヤー、パーツ、フレーム、アニメーション
- キャラクター全体の反転軸は `asset.origin.x` を基本とする
- アンカー・当たり判定も反転対象にする
- `hand_left` / `hand_right` など左右 role の入れ替えを検討する
- 右向き / 左向きで別々に調整する用途に使う

---

## 4. 反転軸の方針

| 対象 | 反転軸 |
| --- | --- |
| レイヤー単体 | レイヤー中心 |
| パーツ単体 | パーツ pivot |
| キャラクター全体 | `asset.origin.x` |
| アニメーション複製 | `asset.origin.x` |
| 背景 | キャンバス中心、または選択範囲中心 |
| タイル | タイル中心 |

特にキャラクター全体の反転では、**左右反転後に足元位置がズレないこと**を優先する。そのためキャンバス中心ではなく `asset.origin.x` を基本にする。

---

## 5. 反転コピー時のメタデータ反転

反転コピーを作る場合は、見た目だけでなくゲーム用メタデータも反転対象にする。

対象:

- `anchors`
- `colliders`
- `frames`
- `animations`
- `parts`
- 必要に応じて `rigAnimations`
- 必要に応じて `effect`

### 反転式（`mirrorX` は反転軸の x 座標）

点の反転:

```
newX = mirrorX - (oldX - mirrorX)
```

矩形 collider（左上 x + 幅）:

```
newRectX = mirrorX - ((oldRectX + oldRectWidth) - mirrorX)
```

円 collider（中心 x）:

```
newCircleX = mirrorX - (oldCircleX - mirrorX)
```

### 左右 role の入れ替え候補

```
hand_left <-> hand_right
arm_left  <-> arm_right
leg_left  <-> leg_right
```

---

## 6. 実装時の注意（将来）

- 通常の左右反転から着手するのが安全（transform のみ、データ形式変更なし）。
- 反転コピーはメタデータ反転と role 入れ替えを伴うため、`asset.json` / `.casproj` / export への影響を確認し、`claude-opus-4-8` の設計レビューを通す。
- いずれも既存の座標系（左上原点・px・度）と原点の意味を変えない。
- 本文書の方針から外れる必要が出た場合は、実装を止めて人間確認に戻す（`docs/future/FABLELESS_DEVELOPMENT_GUIDE.md` 5 章）。

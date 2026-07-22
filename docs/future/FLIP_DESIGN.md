# 左右反転の設計方針

最終更新日: 2026-07-22
文書種別: Phase 19「左右反転」の仕様方針（実装前の設計固定）
現在の着手順: `2D_COMPLETION_ROADMAP.md`（2D-3）
関連する旧計画: `POST_PHASE17_IMPLEMENTATION_PLAN.md`（Phase 19-B）
関連: `docs/DATA_FORMAT.md`, `docs/EXPORT_FORMATS.md`

この文書は Phase 19「左右反転」の**設計方針を固定するため**のもの。

実装状況（2026-07-07 更新）:

- **通常の左右反転（transform 反映）は実装済み**（`flipLayerHorizontal` / 「選択中レイヤー」パネルの「左右反転」ボタン / Unit・E2E。schema 変更なし）。
- **左右反転コピー（アセット全体→新規アセット生成）は実装済み**（`flipCopyAsset` / 「アセット」欄の「独立左右反転コピーを作成」ボタン / Unit・E2E。schema 変更なし）。反転軸は `asset.origin.x`。layers・anchors・colliders・parts・frames・animations を反転し、左右 role / 名前を入れ替え、新規 id を採番、画像 Blob を新アセットのキーへ複製する。
- **未実装（Group 12 R1 accepted）**: リグ編集データ（`rigAnimations`・partの`bindPose` / `rotationLimit`）の反転。ADR-0022で鏡映式・完全ID map・bake同値を固定したが、bake資源上限H3と実機Gateが未決定のため製品実装は開始しない。焼き込み済み`frames`は現行flipでも反転される。

---

## 1. 結論

**通常の左右反転は `LayerTransform.scale.x` の符号反転（非破壊）を基本にする。**

加えて、右向き・左向きを別々に編集したい用途のために、**「独立左右反転コピーを作成」**を別コマンドとして提供する。

---

## 2. 通常の左右反転（基本操作）

- 対象: 選択中レイヤー
- 実装方針: `layer.transform.scale.x *= -1`（`flipLayerHorizontal(asset, layerId)`）
- 反転基準: レイヤー中心（描画・書き出しとも中心基準で `scale` を適用するため）
- 画像ピクセルは変更しない（非破壊）
- `asset.json` の version は上げない（既存 `LayerTransform` に乗るため追加フィールド不要）
- Undo / Redo に自然に乗る（`commitPanelChange('左右反転', …)` 経由）
- 拡大率（%）入力は `Math.abs(scale.x)` を表示し、値編集時も符号（反転状態）を保持する

### この方式を基本にする理由

- 元画像を破壊しない。
- Undo / Redo しやすい。
- 既存 `LayerTransform`（`position` / `scale: Vec2` / `rotation`）にそのまま乗り、データ形式の追加が不要。
- 右向き / 左向きの編集差分を増やしすぎない。
- まず作者自身の制作速度を上げる目的に合う。

### 反転コピーを「基本」にしない理由

反転コピーを基本にすると、レイヤー・フレーム・アニメーション・アンカー・当たり判定・パーツ・リグ・effect などの複製が増える。結果、右向き側を直したあと左向き側も直す必要が出やすく、ゲーム用メタデータのズレが起きる。よって**通常操作は transform 反映を基本**にする。

---

## 3. 左右反転コピーを作成（実装済み: アセット全体→新規アセット生成）

右向き・左向きで別々に編集したい場面（左右で見た目を変える、武器を持つ手を変える、左向きだけ影や服を直す、攻撃判定やアンカーを左右別に微調整する、ゲーム側へ左右別データとして渡す）のために、通常の反転とは別コマンドとして用意する。

第 1 スライスとして「アセット全体を反転した新規アセットの生成」を実装した（`flipCopyAsset`）。

- 対象: レイヤー、パーツ、フレーム、アニメーション（+ アンカー・当たり判定）
- キャラクター全体の反転軸は `asset.origin.x`（`origin` は軸なので座標不変 = 足元位置がズレない）
- アンカー・当たり判定も反転対象にする
- `hand_left` / `hand_right`、`arm_left` / `arm_right`、`leg_left` / `leg_right` の左右 role と、名前中の left/right トークンを入れ替える
- 新規 id を採番し、相互参照（part.layerIds / part.parentId / frame.layerStates.layerId / animation.frameIds）を張り替える
- 画像 Blob は `blobKeyFor(newAssetId, path)` へ複製する（texture の id / path は保持）
- 元アセットは非破壊。`asset.json` schema / version は変えない
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

## 7. Group 12 R1: rig flip契約（未実装）

反転軸を`axisX = asset.origin.x`とし、通常Layer反転や現行の独立flip copyを黙って変更せず、rig編集データを扱う別sliceを追加する。

| 対象 | 鏡映後 |
| --- | --- |
| `Part.pivot` | `{ x: 2 * axisX - x, y }` |
| bind pose / keyframe `localPosition` | `{ x: -x, y }` |
| `localRotation` | `-rotation` |
| `localScale` | 変更しない |
| `rotationLimit {min,max}` | `{ min: -max, max: -min }` |
| keyframe `time` / fps / loop / duration | 変更しない |

- Part ID、`parentId`、`layerIds`、rig poseのpart ID key、RigAnimation ID、Frame ID、event IDとeventの`frameId`を完全mapで張り替える。event名は自動変更しない。linked mirrorの内部ID維持modeは既存規則に従う。
- 未解決参照、親子循環、非有限値、H2で採用したLayer所属規則に反するdataを理由付きで拒否し、rigだけを削除して成功扱いにしない。H2決定前は実装しない。
- transformは絶対差`1e-6`以下、pixelは同寸法RGBA bufferのalphaと非透明pixelのRGB各channel差1以下をGateにする。正規化対象と`.casproj` roundtripの詳細はADR-0022を正本とする。
- 現行bakeは入力中心と出力positionの両方を修正する。入力は`center0 = position + textureSize / 2`、world pose適用後を`center1`、出力は`next.position = center1 - textureSize / 2`とする。上限値はGroup 12計画H3の実機測定・人間承認後に固定する。

正本は`docs/adr/0022-rig-flip-and-bake-parity.md`と`docs/future/2D_3_TIMELINE_RIG_PLAN.md`である。

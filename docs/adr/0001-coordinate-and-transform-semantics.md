# 0001-coordinate-and-transform-semantics

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§6.1 基準座標, §6.2 レイヤーとパーツ, §6.5 丸めと解像度）
関連 fixture: `src/core/model/contract.fixtures.test.ts`（ADR-0001）

---

## 文脈

2D 完成に向けて座標を扱う実装（grid / snap、当たり判定編集、反転コピー、将来の trim / atlas 出力）が増える。各実装が座標の意味を独自解釈すると、原点・アンカー・判定の位置がずれる事故につながる。実装前に、共通アセット座標と `LayerTransform` の変換式を「規範」として固定する必要がある。

## 決定

- 共通アセット座標は、キャンバス左上を `(0, 0)`、右方向を `x+`、下方向を `y+`、単位は px、回転は度とする。正の回転は、この y 下向き座標系における時計回り（画面上の見た目で時計回り）とする。この座標を正本とし、`origin` / `anchors` / `colliders` / フレーム内の位置情報はすべてこの座標で表す。
- `LayerTransform.position` は、テクスチャ左上のアセット座標である。
- `LayerTransform.scale` と `LayerTransform.rotation` は、テクスチャ**中心**を基準に適用する。
- `src/renderers/canvas2d/view.ts` の `layerWorldPoint` / `layerLocalPoint` を、この意味の規範実装として固定する。中心 `(cx, cy) = position + textureSize/2` を求め、ローカル座標を `scale` 倍したのち `rotation` 度で回転し、中心へ加算する式を正とする。
- grid / snap（`snapToGrid`）は UI 操作の補助であり、保存座標の単位・意味を変えない。既存データを開いただけで座標を丸めない。
- 出力先（Unity / Godot / RPG Maker / ブラウザ engine 等）が Y 軸方向や pivot 表現を変える場合も、共通アセット座標そのものは変えない。変換は将来の出力 adapter 層（2D-4）が担い、変換式と結果を README / sidecar に記録する。

## 根拠

- `layerWorldPoint` / `layerLocalPoint`（`src/renderers/canvas2d/view.ts`）が、選択枠描画（`layerScreenCorners`）・当たり判定（`hitTestLayer`）・反転（`flipCopy.ts` の `mirrorTransform`）まで一貫してこの式を前提にしている。
- `createImageAsset`（`src/core/model/factories.ts`）が生成する `LayerTransform.position` は `{x:0,y:0}`（テクスチャ左上=キャンバス左上）であり、`origin` はキャンバス座標系の別基準点として独立に持つ。両者を混同していないことが現行実装の前提である。
- `snapToGrid` は `Math.round(value / gridSize) * gridSize` のみを行い、`Asset` / `Layer` の保存値を書き換える呼び出しは伴わない（呼び出し側が UI 入力時にのみ使う）。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §6.1, §6.2, §6.5（本 ADR は同章の意味を確定するのみで内容を変えない）。
- 影響実装（変更禁止・現状維持の対象として明示）: `src/renderers/canvas2d/view.ts`、`src/core/model/factories.ts`、`src/core/model/assetOps.ts`。
- fixture: `src/core/model/contract.fixtures.test.ts` の ADR-0001 セクションで、`layerWorldPoint` に対し position / 負を含む scale / rotation の組み合わせごとに world 座標の期待値を数点固定する。

## 再検討条件

座標系原点、軸方向、単位、`LayerTransform` の基準点（中心 vs 左上）を変更する場合は、`docs/future/2D_ASSET_DATA_CONTRACT.md` §13 の gate に従い、別の設計 / migration PR を作り、Opus 4.8 の設計レビューと人間確認を経てから着手する。本 ADR だけを理由に座標変換を変更しない。

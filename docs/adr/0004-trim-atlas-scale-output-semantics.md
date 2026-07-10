# 0004-trim-atlas-scale-output-semantics

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§6.3 トリミングと atlas, §6.5 丸めと解像度）
関連 fixture: `src/core/export/contract.fixtures.test.ts`（ADR-0004）

---

## 文脈

sprite sheet / atlas 化、trim、1x/2x/3x 出力は、いずれもファイルサイズや対象 engine 都合のための「出力層」の操作である。共通アセット座標（origin / anchors / colliders / canvasSize）の保存値と混同すると、trim 後に anchor がずれる、atlas 化後に判定がずれるといった事故につながる。現行の atlas 実装が何を保証し、何をまだ保証していないかを固定する。

## 決定

- trim / atlas 化 / 解像度 scale は出力層の操作であり、共通アセット座標・`Asset.canvasSize`・`origin` / `anchors` / `colliders` の保存値を変更しない。
- 現行の atlas は **cell 単位**（trim なし、回転なし）で組み立てる。`computeSheetLayout`（`src/core/export/atlas.ts`）を配置計算の規範実装、`buildAtlas` を atlas JSON 組み立ての規範実装として固定する。
  - `computeSheetLayout` は列数 `ceil(sqrt(n))`、行数 `ceil(n / 列数)` で正方形に近いグリッドを作り、左上から行優先でセルを敷き詰める。各セルの位置は `cellWidth` / `cellHeight` の等倍グリッドであり、フレームごとの実際の不透明領域サイズは見ない。
  - `buildAtlas` の `frames[].x/y/width/height` は sheet 内の**絶対座標**（`layout.positions` そのまま、width/height は常に `layout.cellWidth/cellHeight`）であり、trim 矩形ではない。
  - `origin` / `anchors` / `colliders` は `Asset` の値をそのまま atlas JSON へ**パススルー**する（座標変換や trim オフセット補正を行わない）。
- 将来 trim を有効にする出力は、`2D_ASSET_DATA_CONTRACT.md` §6.3 のとおり次の 4 記録を必須にする: (1) trim 前の元フレームサイズ、(2) 切り出した矩形の位置とサイズ、(3) atlas 内に置いた位置とサイズ、(4) 元の `origin` / `anchors` / `colliders` を復元するための変換情報。現行の `buildAtlas` にはこの 4 記録がなく、trim 非対応の cell 出力のみをサポートする現状を本 ADR で明記する。
- atlas 内の画像回転は既定で使わない（現行 `buildAtlas` は回転を一切扱わない。これは仕様と一致する）。
- 1x / 2x / 3x は出力 adapter 側の scale として扱い、共通データの座標は変更しない（`docs/future/EXPORT_QUALITY_DESIGN.md` と整合。現行実装はまだ scale adapter を持たないため、本 ADR は「実装する場合の境界」を先に固定するのみ）。なお `ExportPreset.scale`（`src/core/model/exportPreset.ts`、`settings/export-presets.json` の保存済みフィールド）は既に存在するが現行 export では未使用である。scale を実装する場合はこの既存フィールドへ配線し、重複する新フィールドを追加しない。

## 根拠

- `computeSheetLayout` / `buildAtlas`（`src/core/export/atlas.ts`）のソース・既存テスト（`src/core/export/atlas.test.ts`）が、trim なし・回転なし・cell 単位配置・origin/anchors/colliders パススルーの挙動を裏付ける。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §6.3, §6.5、`docs/future/EXPORT_QUALITY_DESIGN.md`。
- 影響実装（現状維持）: `src/core/export/atlas.ts`。
- fixture: `src/core/export/contract.fixtures.test.ts` の ADR-0004 セクションで、5 フレームのアセットに対する `computeSheetLayout` の各セル座標（列数・行数・x/y）と、`buildAtlas` の `frames` 絶対座標・`cellSize`・`origin` / `anchors` / `colliders` のパススルーを数値で固定する。

## 再検討条件

trim を有効にする出力、atlas 内回転、対象 engine 別の scale adapter を実装する場合は、上記 4 記録の設計と `2D_EXPORT_COMPATIBILITY_MATRIX.md` の対象 engine ごとの変換確認を先に行い、Opus 4.8 の設計レビューを経てから着手する。既存の cell 単位 atlas 出力（trim なし）との後方互換を壊さないことを条件にする。

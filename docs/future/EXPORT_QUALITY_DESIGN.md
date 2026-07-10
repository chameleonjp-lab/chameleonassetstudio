# Export Quality Design

最終更新日: 2026-07-09  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
文書種別: Phase 20「書き出し品質改善」の docs-first 設計  
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/future/POST_PHASE17_REQUIREMENTS.md`, `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`  
関連文書: `docs/EXPORT_FORMATS.md`, `docs/DATA_FORMAT.md`, `docs/ENGINE_INTEGRATION.md`, `docs/future/COLLIDER_EDITING_DESIGN.md`

---

> **現状:** この文書は Phase 20 の実装前に読む設計整理であり、実装済み機能一覧ではない。この PR ではアプリ本体、TypeScript 型、JSON Schema、`asset.json` / `.casproj` / export-presets の version、export ZIP 構成、dependencies は変更しない。padding / extrude / 解像度別出力 / helper 選択出力は、この文書の推奨スライスに従って後続 PR で実装する。

## 1. 結論

Phase 20 の 3 テーマは、いずれも**デフォルト無効（現行出力と同一）の export 関数オプション**として、`atlas.json` のフィールド追加・schema 変更・version 変更なしで実装できる。推奨は次の通り。

| テーマ | 推奨 | 互換性への影響 |
|---|---|---|
| 20-A padding | セル間 spacing のみの `padding` オプション（デフォルト 0）を後続 PR で実装する。`atlas.json` の frames は絶対座標のためフィールド追加は不要。extrude は今回見送る。 | デフォルト 0 で現行と同一。`atlas.json` format / version 据え置き |
| 20-B 解像度別出力 | `scale` オプション（デフォルト 1）を export 関数層に実装する。`ExportPreset.scale` は schema に定義済みで、schema 変更は不要。 | デフォルト 1 で現行と同一。`asset.json` は常に等倍の正本のまま |
| 20-C helper 選択出力 | `exportZip` に `includeHelpers`（デフォルト true）の最小オプションを実装する。`ExportPreset` への新フィールド追加は見送る。 | デフォルト true で現行 ZIP と同一構成 |

`atlas.json` へのメタ情報追加（padding / scale の記録）、`ExportPreset` の新フィールド、extrude、パッキングアルゴリズム変更は、いずれも version / migrate 判断を伴うため今回は実装せず、必要になった時点で人間確認へ戻す（§8）。

## 2. 目的と非目的

目的:

1. 作った素材をゲームに入れる時の手直し（にじみ対策の手動加工、解像度変換、不要ファイル削除）を減らす。
2. 既存の export ZIP 利用者・生成済み helper・既存テストを一切壊さない。
3. Export Preset 管理 UI を作る前に、export 関数層の API を先に安定させる。

非目的:

- Export Preset 管理 UI の実装。
- `asset.json` / `.casproj` / export-presets / `atlas.json` の schema・version 変更。
- bin packing 等のパッキングアルゴリズム変更（現行は行優先の単純グリッド）。
- Unity / Godot / RPG Maker / Blender 向けの新しい出力形式の追加。
- テクスチャ圧縮（basis 等）や本格的な画像最適化。

## 3. 現状実装（設計判断の前提となる事実）

| 項目 | 現状 |
|---|---|
| パッキング | `src/core/export/atlas.ts` の `computeSheetLayout(frameIds, cellWidth, cellHeight)`。列数 = `ceil(sqrt(n))`、行優先、**セル間隔なし**の単純グリッド |
| `atlas.json` | `buildAtlas(asset, layout)` が生成。`format: 'chameleon-atlas'`、`version: '0.1.0'`、`texture`、`cellSize`、`frames[{ name, x, y, width, height }]`、`animations`、`origin`、`anchors`、`colliders`、`tile?`、`effect?` |
| frames の座標 | **Sprite Sheet 内の絶対座標**。Canvas helper（`getFrameRect`）と PixiJS helper（`PIXI.Rectangle`）は frame の絶対座標を直接読む |
| Phaser helper | `registerChameleonSpritesheet` が `addSpriteSheet(key, image, { frameWidth: atlas.cellSize.width, ... })` を呼ぶ、**均一グリッド前提**。padding を入れる場合はここだけ追従が必要 |
| export 関数 | `exportImage` / `exportAssetJson` / `exportSpriteSheet` / `exportZip`（`src/core/export/exportAsset.ts`）。**現在オプション引数を受け取らない**。書き出し前に `assertValidAsset` で schema 検証 |
| 解像度 | スケーリング処理は存在しない。常に等倍合成 |
| helper 同梱 | Canvas / PixiJS / Phaser の 3 種を**常に**同梱。examples/ の HTML は helper を import する。engines/ の README は helper 非依存 |
| `ExportPreset` | `src/core/model/exportPreset.ts`。`.casproj` 内 `settings/export-presets.json`（format `chameleon-export-presets` version 0.1.0、JSON Schema・migrate あり）。`scale` / `imageFormats` / `includeAssetJson` / `includeSpriteSheet` / `includeSampleHtml` を定義済みだが、**export 関数層では未使用** |
| 守られている挙動 | WebP 非対応環境では `textures/main.webp` を silent skip。書き出し失敗は `ExportError` → `role="alert"` 表示 |

## 4. 20-A: Atlas padding / extrude

### 4.1 なぜ padding か

Sprite Sheet をゲームエンジンで拡大縮小・回転すると、隣接セルのピクセルがサンプリングされて色にじみ（bleed）が出ることがある。セル間に透明の余白（padding）を入れるのが最小の対策で、エッジピクセル複製（extrude）はその強化版である。

### 4.2 推奨案: セル間 spacing のみの padding オプション

- 定義: `padding` はセルとセルの間の透明ピクセル数。**外周 margin は入れない**。したがってフレームが 1 枚のシートは padding の値に関わらず現行と同一出力になる。
- レイアウト: `x = col * (cellWidth + padding)`、`y = row * (cellHeight + padding)`。シート全体は `columns * cellWidth + (columns - 1) * padding` × 行方向同様。
- `atlas.json`: **フィールドを追加しない**。frames の絶対座標が padding 分ずれるだけで、format / version は据え置き。Canvas / PixiJS helper は frame 絶対座標を直接読むため無修正で動く。
- Phaser helper: 均一グリッド前提のため、helper 生成時に export 時の padding 値を定数として埋め込み、`addSpriteSheet` の `spacing` オプションへ渡す。helper は export のたびに生成されて同じ ZIP に入るため、ZIP 内の atlas と helper は常に整合する。既存の生成済み ZIP には影響しない。
- API: `exportSpriteSheet(asset, { padding?: number })` / `exportZip(asset, { padding?: number })`。デフォルト 0。負数と非整数は 0 へ丸める。

### 4.3 検討した代替案

| 案 | 内容 | 判断 |
|---|---|---|
| A. padding オプションのみ（推奨） | 上記 4.2 | 後続 PR で実装してよい |
| B. A + `atlas.json` に padding メタ情報を記録 | 外部ツールが spacing を機械的に読めるようになるが、`atlas.json` へのフィールド追加 = format 拡張で、version 0.2.0 化と読み手側の追従判断が必要 | 見送り。必要になったら人間確認（§8） |
| C. 見送り（現状維持） | bleed 対策をユーザーの手作業に任せる | Phase 20 の目的に反するため不採用 |

### 4.4 extrude を今回見送る理由

- padding だけで bleed の主要因（隣接セルのサンプリング）は解消できる。
- extrude は `compositeAssetToCanvas` 側でエッジピクセルの複製描画が必要になり、合成処理の変更範囲が大きい。
- extrude を後で入れる場合も frames は content 領域を指し続けるため `atlas.json` の format には影響しない。ただし `padding >= extrude * 2` の制約設計が必要になるため、padding の実利用で必要性を確認してから別 PR で判断する。

## 5. 20-B: 解像度別出力（scale）

### 5.1 推奨案: export 関数層の `scale` オプション

- API: `exportImage(asset, type, { scale?: number })` / `exportSpriteSheet(asset, { scale?: number })`。デフォルト 1。許容範囲は `ExportPreset` schema の `scale` 制約（正の数）に合わせ、上限は 4 程度を目安に UI 露出時に確定する。
- 合成: 合成キャンバスを `canvasSize * scale` で確保して描画する。ドット絵の用途を優先し、拡大時は `imageSmoothingEnabled = false`（nearest neighbor）を既定とする。滑らか補間の選択肢は UI 露出時に検討する。
- `atlas.json`: sheet と一緒に出力する場合、`cellSize` / `frames` / `origin` / `anchors` / `colliders` を **scale 反映後の px** で出力する。sheet と atlas が自己一貫するため、helper は無修正で動く。format / version は据え置き（値が変わるだけでフィールドは同一）。
- `asset.json` は**常に等倍の編集用正本**とし、scale の影響を受けない。`docs/EXPORT_FORMATS.md` にこの関係を明記する。

### 5.2 ZIP への露出は後続判断

`exportZip` へ scale を通すと「asset.json は等倍、atlas.json は scale 後」という混在を利用者に説明する必要がある。最初のスライスでは `exportImage` / `exportSpriteSheet` の関数オプションに留め、ZIP と UI への露出（1x / 2x / 3x 選択、複数解像度の同時出力の要否）は padding と合わせて次のスライスで判断する。`ExportPreset.scale` との配線も Export Preset UI の実装時まで行わない。

## 6. 20-C: helper 選択出力（includeHelpers）

### 6.1 推奨案: `exportZip` の boolean 最小オプション

- API: `exportZip(asset, { includeHelpers?: boolean })`。デフォルト true（現行 ZIP と同一構成）。
- `includeHelpers: false` のとき、`helpers/` の 3 ファイルに加えて **`examples/` の HTML 3 ファイルも除外する**（examples は helper を import しており単体で動かないため）。`engines/` の README と ZIP 直下の README は helper 非依存のため残し、README の記述は同梱内容に合わせて生成し分ける。
- Canvas / PixiJS / Phaser を個別に選ぶ案（既存の `ExportTarget` 型を再利用した `targets` オプション）も検討したが、計画書の「最小 option」の方針に従い boolean を先に入れる。個別選択は Export Preset UI と同時に判断する。
- `ExportPreset` に `includeHelpers` フィールドを追加する案は、export-presets schema の version / migrate 判断を伴うため見送る（§8）。

## 7. 互換性条件（すべてのスライスで守る）

- `atlas.json` の `format: 'chameleon-atlas'` / `version: '0.1.0'` とフィールド構成を変えない。
- デフォルト値（padding 0 / scale 1 / includeHelpers true）での出力は、ZIP 構成・atlas 座標・helper 内容とも現行と同一にする。
- `asset.json` / `.casproj` / export-presets の schema・version を変えない。`asset.json` は常に等倍の正本。
- WebP 非対応環境の silent skip、`ExportError` の表示、helper の公開 API 名（`loadChameleonAtlas` / `getFrameRect` / `applyOrigin` など）を維持する。
- 既存 unit / E2E を削除・skip・期待値緩和しない。
- 新オプションはすべて省略可能な追加引数とし、既存呼び出しをコンパイルエラーにしない。

## 8. 人間確認が必要な判断（今回は実装しない）

次は export 関数オプションの範囲を超えるため、着手前に人間確認へ戻す。

- `atlas.json` への padding / scale 等のメタ情報フィールド追加（atlas format の 0.2.0 化と migrate 方針）。
- `ExportPreset`（export-presets schema）への新フィールド追加と version / migrate。
- extrude の採用。
- パッキングアルゴリズムの変更（bin packing、回転配置など）。
- export ZIP のディレクトリ構成変更（ファイルの追加・移動・削除）。
- 複数解像度の同時出力（`textures/main@2x.png` のような命名規則の導入）。

## 9. 推奨実装スライス（後続 PR の分割）

1 PR 1 目的で次の順に分ける。各スライスは schema / version 変更を含まないため、この設計文書に沿う限り人間確認なしで実装してよい。

1. `feat: add sprite sheet cell padding export option` — `computeSheetLayout` の padding 対応、`exportSpriteSheet` / `exportZip` のオプション、Phaser helper の spacing 追従、unit test、`docs/EXPORT_FORMATS.md` 追記。
2. `feat: add export scale option for image and sprite sheet` — 関数層の scale 対応（ZIP・UI 露出なし）、unit test、docs 追記。
3. `feat: add includeHelpers option to zip export` — boolean オプション、README 生成の分岐、unit test、docs 追記。
4. UI 露出（ExportPanel への padding / scale / helper 同梱の入力追加）— スライス 1〜3 の後、E2E とともに 1 PR で。UI の既定値はすべて「現行と同じ出力」にする。

## 10. テスト方針

- unit: padding あり / なしのレイアウト座標、フレーム 1 枚時の不変性、シート全体サイズ、scale 後のキャンバスサイズと atlas 座標、`includeHelpers: false` の ZIP 構成、デフォルト値での現行出力との一致。
- E2E: 関数層のみのスライス（1〜3）では追加必須にしない（UI が変わらないため）。スライス 4 で ExportPanel の操作と ZIP 内容検証を追加する。既存の `e2e/export.spec.ts` の期待値は変更しない。
- Phaser helper のテスト: 生成された JS に `spacing` が埋め込まれることを `helpers.test.ts` の既存スタイルで検証する。

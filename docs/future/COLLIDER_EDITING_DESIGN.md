# Collider Editing Design

最終更新日: 2026-07-07  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
文書種別: Phase 19-C「判定編集強化」の docs-first 設計  
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/future/POST_PHASE17_REQUIREMENTS.md`, `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`  
関連文書: `docs/DATA_FORMAT.md`, `docs/EXPORT_FORMATS.md`, `docs/ENGINE_INTEGRATION.md`, `docs/USER_GUIDE.md`, `docs/future/FLIP_DESIGN.md`, `docs/future/ASSET_CREATION_AND_EXPORT_STRATEGY.md`, `docs/future/DECISION_LOG.md`, `REVIEW.md`

---

> **現状:** この文書は Phase 19-C の実装前に読む設計整理であり、実装済み機能一覧ではない。この PR ではアプリ本体、TypeScript 型、JSON Schema、`asset.json` version、`.casproj` 構造、export ZIP 構成、dependencies、GitHub Actions は変更しない。多角形判定、rect / circle 編集 UI、Export Preset、Unity / Godot / RPG Maker / Blender 向け出力、3D 関連は実装しない。

## 1. 結論

Phase 19-C の次の実装 PR では、**A. 多角形判定は後続フェーズに回し、まず既存の rect / circle 編集 UI と表示整理だけを行う**ことを推奨する。

理由は次の通りである。

- 現行正本では、当たり判定は矩形または円であり、`shape: "rect" | "circle"`、`purpose: "body" | "attack" | "pickup" | "sensor" | "custom"` を前提にしている。
- 多角形判定は、`asset.json` schema、TypeScript 型、`.casproj`、export ZIP、Canvas / PixiJS / Phaser helper、Unity / Godot import notes、migration、E2E に横断影響する。
- Phase 19-C の目的は「判定編集強化」であり、まず既存データ互換のまま操作速度、見やすさ、選択・移動・編集の分かりやすさを上げる方が安全である。
- 多角形判定を入れる場合は、別の docs / schema / DATA_FORMAT / EXPORT_FORMATS / migration / tests 設計 PR を作り、Opus 4.8 設計レビューと人間確認を通してから実装へ進むべきである。

## 2. Phase 19-C の目的

Phase 19-C は、ゲーム用メタデータとしての当たり判定を、壊さず、迷わず、速く編集できるようにするフェーズである。

目的:

1. 既存の rect / circle 判定の意味と互換性を維持する。
2. 判定用途ごとの色、表示、選択状態、非表示状態を明確にする。
3. キャンバス上で判定を選択、移動、リサイズ、数値編集しやすくする。
4. Phase 19-A のグリッド / スナップと自然に連動させる。
5. Phase 19-B の左右反転コピーで、判定反転が破綻しない前提を保つ。
6. 将来のフレーム別判定、多角形判定、判定プリセット、engine export 拡張の判断材料を残す。

非目的:

- 多角形判定の実装。
- `asset.json` / `.casproj` / export ZIP / schema / version の変更。
- Export Preset の追加。
- Unity / Godot / RPG Maker / Blender 向け出力の追加。
- 3D collider との統合。

## 3. 現在の rect / circle 判定の意味

現行の `Collider` は、アセット座標系上のゲーム用当たり判定である。画像ピクセルの見た目そのものではなく、ゲーム側で接触、攻撃、取得、センサーなどに使う簡易形状を表す。

| shape | 意味 | 主用途 | 互換性方針 |
|---|---|---|---|
| `rect` | `rect: { x, y, width, height }` を持つ矩形。`x` / `y` は左上、`width` / `height` は px。 | body、床・壁寄りの gimmick、pickup 範囲、攻撃範囲 | 既存 JSON の意味を変えない。左右反転時は `x + width` を反転軸に対して反転する。 |
| `circle` | `circle: { x, y, radius }` を持つ円。`x` / `y` は中心、`radius` は px。 | キャラクター周辺、取得範囲、円形 sensor、ざっくりした body | 既存 JSON の意味を変えない。左右反転時は中心 `x` を反転する。 |

共通フィールド:

- `id`: 判定の一意 ID。
- `name`: UI 表示名。
- `shape`: `rect` または `circle`。
- `purpose`: `body` / `attack` / `pickup` / `sensor` / `custom`。
- `visible`: 判定表示の ON / OFF。ゲーム側で有効かどうかではなく、編集・debug 表示のための表示状態として扱う。

## 4. 判定用途と表示色

判定用途はゲーム側の意味を表す。shape とは独立して扱う。

| purpose | 意味 | 推奨色 | 表示ルール |
|---|---|---:|---|
| `body` | 被弾、接地、壁衝突など、主本体の接触判定。 | 青 `#3B82F6` | 実線。通常表示で最優先に見える。 |
| `attack` | 攻撃、ダメージ発生、弾の有効範囲。 | 赤 `#EF4444` | 実線 + やや強い塗り。アニメーション確認時に目立つ。 |
| `pickup` | アイテム取得、回収、インタラクト範囲。 | 緑 `#22C55E` | 実線。body と重なっても区別できる。 |
| `sensor` | 接地確認、視界、トリガー、検知など、物理衝突しない範囲。 | 紫 `#A855F7` | 破線または点線。塗りは薄くし、非物理であることを示す。 |
| `custom` | ユーザー定義。ゲーム固有の意味。 | 灰 `#64748B` | 実線。name / label を必ず表示できるようにする。 |

共通表示ルール:

- 通常時は線 2px 相当、透明塗り 10〜18% 程度を目安にする。
- hover 時は線を太くし、ラベルを表示する。
- selected 時は白または黒の外側 halo、ハンドル、プロパティパネル同期で明確にする。
- `visible: false` の判定はキャンバス上では非表示。ただし一覧では薄く表示し、再表示できるようにする。
- sensor は色だけに頼らず、破線 / 点線でも区別する。
- 色覚差を考慮し、凡例、purpose 名、線種を併用する。

## 5. rect / circle 編集 UI 改善案

多角形判定をすぐ実装しない場合、Phase 19-C の実装 PR は次の範囲に限定する。

### 5.1 キャンバス上の選択

- 判定表示 ON のとき、rect / circle の輪郭または塗り領域をクリックして選択できる。
- 重なった判定は、選択中の判定を優先し、次に上位一覧順またはクリック位置に近い辺・中心を優先する。
- 選択中判定はプロパティパネルの対象と同期する。
- レイヤー、原点、アンカー、判定の選択モードが衝突する場合は、ツールまたはパネルで現在の編集対象を明示する。

### 5.2 移動とリサイズ

- rect は本体ドラッグで移動、四隅 / 辺ハンドルでリサイズする。
- circle は中心ドラッグで移動、外周ハンドルで radius を変更する。
- Shift / Alt などの修飾キー挙動は、既存キャンバス操作と衝突しない場合だけ後続で検討する。
- サイズは負数にしない。最小サイズを UI 側で丸める。
- 数値入力は現行フィールドを維持し、UI 操作と同じ更新経路で Undo / Redo に乗せる。

### 5.3 グリッド / スナップとの関係

- スナップは UI 操作補助であり、データ形式の座標単位は px のままにする。
- スナップ ON のときだけ、移動・リサイズ・数値入力の更新値を grid size に丸める。
- 既存データを開いただけで座標を自動変更しない。
- rect の `x` / `y` / `width` / `height`、circle の `x` / `y` / `radius` にスナップを適用する場合、radius の丸めは最小値を下回らないようにする。
- スナップ OFF では小数または非 grid 倍数の既存値を保持できる。

### 5.4 一覧とプリセット

- 判定一覧に shape、purpose、visible、name を表示する。
- purpose の色スワッチと凡例を追加する。
- 判定プリセットは、Phase 19-C 実装 PR では UI 候補表示までに留め、schema へ preset ID を保存しない。
- 候補例: `player_body`、`enemy_body`、`attack_melee`、`pickup_item`、`ground_sensor`、`vision_sensor`。

## 6. 左右反転時の判定

Phase 19-B の左右反転コピーは、判定も反転対象にする。Phase 19-C ではこの前提を壊さない。

- 通常の左右反転はレイヤー transform の `scale.x` 符号反転が基本であり、既存 collider 座標を自動変更しない。
- 左右別アセットを作る「左右反転コピー」では、アセット全体を反転し、colliders も反転する。
- rect は反転軸 `axisX` に対して `x' = axisX * 2 - (x + width)` とする。
- circle は `x' = axisX * 2 - x` とする。
- purpose、visible、name、id 付け替え方針は既存 flip copy の設計に従う。
- 多角形判定を後で入れる場合は、各頂点 `point.x` を同じ反転軸で反転し、点順が winding として意味を持つかを設計する必要がある。

## 7. フレーム別判定の扱い

フレーム別判定は、攻撃・被弾タイミングの確認に重要だが、現行 `Frame` は layer states を持つだけで、collider states を持たない。Phase 19-C では実装しない。

将来案:

1. **asset-level collider + frame override**  
   通常は `Asset.colliders` を正本にし、特定 frame だけ位置、サイズ、visible を上書きする。
2. **animation/frame local collider**  
   animation または frame に collider 配列を持たせる。攻撃判定には分かりやすいが、schema と helper 影響が大きい。
3. **timeline event と collider visible の連動**  
   attack window などを event として持ち、既存 collider の visible / enabled を時間で切り替える。

Phase 19-C の次実装では、フレーム別判定に備えて UI 文言を「アセット共通判定」と誤解なく表示する程度に留める。`asset.json` 構造は変えない。

## 8. 多角形判定を入れる場合の schema 候補

多角形判定を入れる場合の候補は次のように整理する。ただし、これは設計材料であり、今回実装しない。

```ts
type PolygonCollider = {
  id: string;
  name: string;
  shape: 'polygon';
  purpose: 'body' | 'attack' | 'pickup' | 'sensor' | 'custom';
  points: Array<{ x: number; y: number }>;
  visible: boolean;
};
```

検討事項:

- `points` はアセット座標の絶対座標にするか、polygon local origin + relative points にするか。
- 最小点数は 3 点。
- 自己交差を許すか禁止するか。
- clockwise / counter-clockwise の点順を正規化するか。
- convex のみに限定するか、concave も許すか。
- engine helper で衝突判定まで提供するのか、debug draw と raw data 提供に留めるのか。
- migrate を走らせず additive union にできるか。

推奨は、最初に入れるなら `points` はアセット座標の絶対座標、最小 3 点、debug draw と raw data export までに限定する案である。ただし、これは Opus 4.8 設計レビューと人間確認が必要である。

## 9. 多角形判定の export 影響

多角形判定を追加すると、少なくとも次へ影響する。

| 領域 | 影響 |
|---|---|
| `docs/DATA_FORMAT.md` | `Collider.shape` に `polygon` を追加し、points の座標系、点数、validity を定義する必要がある。 |
| TypeScript 型 | `Collider` union を拡張する必要がある。 |
| JSON Schema | `shape: "polygon"` 分岐と `points` validation を追加する必要がある。 |
| samples / tests | schema サンプル、migrate、validation、round-trip tests を追加する必要がある。 |
| `.casproj` | ZIP 構造は変えない可能性が高いが、含まれる `asset.json` の schema が変わる。 |
| export ZIP | 構成は変えない方針だが、`asset.json` / `atlas.json` 内の colliders が増える。README と examples の説明更新が必要。 |
| Canvas helper | `drawDebug` が polygon を描ける必要がある。衝突判定 helper を追加するかは別判断。 |
| PixiJS helper | `drawPixiDebug` が polygon を描ける必要がある。 |
| Phaser helper | `readColliders` が polygon を返すだけか、Phaser geometry に変換するか判断が必要。 |
| Unity import notes | PolygonCollider2D への手動変換例を書くか、raw points として扱うか判断が必要。 |
| Godot import notes | CollisionPolygon2D への手動変換例を書くか、raw points として扱うか判断が必要。 |
| RPG Maker notes | 標準機能で多角形判定を扱いにくい可能性があるため、raw metadata 扱いか plugin 前提かを明記する必要がある。 |
| E2E | 既存 rect / circle テストを弱くせず、polygon 追加分だけ増やす必要がある。 |

## 10. 互換性と migrate 条件

Phase 19-C の次実装 PR で守る条件:

- 既存 `asset.json` はそのまま読める。
- 既存 `.casproj` はそのまま読める。
- export ZIP のディレクトリ構成を変えない。
- `asset.json` version を上げない。
- JSON Schema を変えない。
- TypeScript 型を変えない。
- rect / circle の既存フィールドの意味を変えない。
- `visible` の意味を「編集・debug 表示」から勝手に「ゲーム内有効 / 無効」へ変えない。

migrate が必要になる条件:

- `Collider.shape` の union を増やし、古い validator では読めないデータを書き出す場合。
- 既存 collider の座標系、原点、単位、`visible` の意味を変える場合。
- フレーム別判定など、`Frame` / `Animation` に collider 状態を保存する場合。
- `.casproj` 内で collider を別ファイルへ分離する場合。
- export ZIP の colliders を `asset.json` 以外へ分離し、既存 helper の読み込み先を変える場合。

多角形判定を additive に追加するだけでも、古いアプリや helper との前方互換性が問題になるため、version / migrate / feature gate の判断が必要である。

## 11. 既存 E2E を弱くしない条件

Phase 19-C 実装 PR では、既存 E2E を削除、skip、期待値緩和してはならない。

守る条件:

- rect 判定を追加・編集・保存・export できる既存期待を維持する。
- circle 判定を追加・編集・保存・export できる既存期待を維持する。
- グリッド / スナップ ON / OFF の E2E を弱めない。
- 左右反転コピーの collider 反転 E2E を弱めない。
- export ZIP の基本構成検証を弱めない。
- E2E が flaky な場合は、待機・セレクタ・操作対象を改善し、仕様期待を落とさない。

追加するとよいテスト:

- purpose ごとの色スワッチまたは凡例が表示される。
- sensor が線種で区別される。
- キャンバス上で rect / circle を選択できる。
- スナップ ON 時の移動・リサイズが grid size に丸められる。
- `visible: false` の判定がキャンバス非表示、一覧から再表示可能である。

## 12. すぐ実装してよい範囲

次は Codex 実装で進めてよい。ただし 1 PR 1 目的で小さく分ける。

- 判定用途の色定義を UI 表示に使う。
- 判定凡例、色スワッチ、sensor の破線表示を追加する。
- rect / circle のキャンバス選択、hover、selected 表示を改善する。
- rect / circle の移動・リサイズ UI を改善する。
- 既存 grid / snap 設定を rect / circle 編集操作へ統一的に適用する。
- 判定一覧の shape / purpose / visible / name 表示を改善する。
- docs と user guide を、実装範囲に合わせて更新する。
- 既存 E2E を弱めず、UI 改善分の E2E を追加する。

## 13. Opus 4.8 レビュー・人間確認が必要な範囲

次は Codex だけで実装まで進めない。

- 多角形判定の schema / TypeScript 型 / JSON Schema 追加。
- `asset.json` version を上げる判断。
- migrate 実装。
- `.casproj` 構造変更。
- export ZIP 構成変更。
- helper が polygon collision 判定まで提供するかどうか。
- Phaser / PixiJS / Canvas helper API の破壊的変更。
- Unity / Godot / RPG Maker / Blender 向け出力や import notes の大幅追加。
- フレーム別判定の保存形式追加。
- `visible` とは別の `enabled` / `sensor` / `physics` semantics 追加。
- 3D collider との共通化。

## 14. Phase 19-C 実装 PR の推奨スコープ

次の実装 PR は、以下に限定する。

1. 既存 rect / circle 判定の用途色と凡例を追加する。
2. sensor を破線 / 点線で見える化する。
3. キャンバス上の rect / circle 選択、移動、リサイズを改善する。
4. 既存グリッド / スナップと同じ丸め規則を使う。
5. 既存 export / helper / schema / version / `.casproj` を変更しない。
6. 既存 E2E を弱くせず、必要な UI E2E を追加する。

多角形判定は、Phase 19-C とは別の設計レビュー済み PR に分離する。

### 2026-07 実装範囲メモ

Phase 19-C の今回実装は「表示・選択・凡例・パネル同期」までに限定する。GameDataPanel の一覧から rect / circle 判定を選択し、選択行とキャンバス上の判定を同期して強調表示する。用途色の凡例と一覧スワッチを追加し、sensor はキャンバス描画で破線、UI スワッチで縞表示にして色だけに依存しない。

第2段階では canvas 上での rect / circle ドラッグ移動のみを実装済み。判定表示 ON かつ visible な判定だけを操作対象にし、rect は x / y、circle は x / y だけを更新する。クリック対象が判定とレイヤーで重なる場合は、判定表示 ON の間は判定を優先する。スナップ ON では grid size へ丸め、スナップ OFF では通常の自由移動に近い px 単位で移動する。Undo / Redo、GameDataPanel、IndexedDB 保存に同期する。rect リサイズ、circle radius 変更、hover hit testing、resize handle、polygon / frame-specific / 3D collider は引き続き実装しない。選択状態は保存データに入れず、asset.json / .casproj / export ZIP / schema / version も変更しない。

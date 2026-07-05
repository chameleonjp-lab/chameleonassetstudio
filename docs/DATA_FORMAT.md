# Chameleon Asset Studio データ形式書

最終更新日: 2026-07-02  
対象バージョン: 0.1.0  
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md`

---

## 1. 目的

この文書は、Chameleon Asset Studio の内部データ形式を定義する。

内部形式は JSON を基本とし、画像は PNG / WebP / 元画像を別ファイル（または IndexedDB の Blob）として保持する。内部形式は UI や書き出し先の都合で壊してはいけない。

実装上の正本は次の 2 か所である。

- TypeScript 型: `src/core/model/`
- JSON Schema: `src/core/schema/`

サンプルデータは `src/core/samples/` に置き、schema 検証テスト（`src/core/schema/validate.test.ts`）で常に検証する。

---

## 2. バージョニングと migrate

すべてのトップレベル文書（asset / project / export-presets）は `format` と `version` を持つ。

- `format` は文書種別の固定文字列（例: `chameleon-asset`）。
- `version` はセマンティックバージョン文字列（例: `0.1.0`）。

破壊的な形式変更をする場合は、必ず次を行う。

1. 対象文書の現行バージョン定数（`CURRENT_ASSET_VERSION` など）を上げる。
2. `src/core/model/migrate.ts` の対応する移行手順配列（`ASSET_MIGRATIONS` など）へ `Migration` を追加する。

読み込み時の動作（`migrateDocument`）:

| 入力 version            | 動作                                     |
| ----------------------- | ---------------------------------------- |
| 現行と同じ              | そのまま返す                             |
| 古く、移行手順あり      | 順に適用し、適用ログを返す               |
| 古く、移行手順なし      | `MigrationError`                         |
| 現行より新しい          | `MigrationError`（新しい形式として拒否） |
| version なし / 形式不正 | `MigrationError`                         |

移行の適用結果は `appliedMigrations` としてログに残せる。未対応の追加プロパティは検証エラーにせず、消さずに保持する（要件 12.2）。

---

## 3. `.casproj` の構造

プロジェクトは `.casproj` という ZIP 形式で保存できるようにする。

```txt
project.casproj
├─ project.json                  … Project（project.schema.json）
├─ assets/
│  └─ asset_001/
│     ├─ asset.json              … Asset（asset.schema.json）
│     ├─ source/original.png     … 元画像（破壊的編集をしない）
│     ├─ textures/main.png       … 編集用画像
│     ├─ textures/main.webp
│     └─ thumbnails/thumb.webp   … サムネイル
├─ settings/export-presets.json  … ExportPresetFile（export.schema.json）
└─ README.md
```

UI からの読み書き（Phase 13）:

- 書き出し: 編集画面の書き出しパネル「.casproj をダウンロード」。プロジェクトと全アセット、参照する画像 Blob を同梱する（`src/features/editor/ExportPanel.tsx`）。
- 読み込み: ホーム画面「.casproj を読み込む」。既存プロジェクトや Blob キーとの衝突を避けるため、取り込み時に project / asset の ID を常に再採番して別プロジェクトとして保存する（`src/features/home/HomeScreen.tsx`）。

画像欠落の扱い（Phase 15.5-A）:

- 書き出し: 全アセットの全 `TextureRef` に対応する画像ファイルが揃っていない場合、`exportCasproj` は `.casproj` を作らず `CasprojError`（`画像 Blob が見つかりません: asset=… texture=… path=…`）を投げる。画像欠けの保存ファイルは復元不能になるため。
- 読み込み: `asset.json` が参照する texture path のファイルが ZIP 内に無くてもエラーにしない（この検証強化以前に書き出された `.casproj` を読めなくしないための互換措置）。欠落画像のレイヤーは表示されない。読み込み時は欠落一覧を `warnings`（`一部の画像が見つかりませんでした: asset=… texture=… path=…`）として返し、ホーム画面に警告表示する（Phase 17-B）。

---

## 4. 文書一覧

| 文書                | format                     | 型                 | schema                  |
| ------------------- | -------------------------- | ------------------ | ----------------------- |
| project.json        | `chameleon-project`        | `Project`          | `project.schema.json`   |
| asset.json          | `chameleon-asset`          | `Asset`            | `asset.schema.json`     |
| アニメーション単体  | なし（asset 内要素）       | `Animation`        | `animation.schema.json` |
| export-presets.json | `chameleon-export-presets` | `ExportPresetFile` | `export.schema.json`    |

検証タイミングは、プロジェクト読み込み時、自動保存前、書き出し前、テスト時とする（要件 14）。不正データ時は、どの項目が不正かを `ValidationResult.errors` で表示する。

---

## 5. Project

`project.json`。1 つ以上のアセットをまとめる作業単位。

| フィールド            | 型                    | 必須 | 説明                   |
| --------------------- | --------------------- | ---- | ---------------------- |
| format                | `"chameleon-project"` | ✔    | 文書種別               |
| version               | string                | ✔    | 形式バージョン         |
| id                    | string                | ✔    | プロジェクト ID        |
| name                  | string                | ✔    | プロジェクト名         |
| assets                | ProjectAssetEntry[]   | ✔    | 一覧用アセットサマリー |
| createdAt / updatedAt | string (date-time)    | ✔    | 作成・更新日時         |

`ProjectAssetEntry` は `id` / `name` / `displayName`（任意） / `assetType` を持つ。アセットの実体は `assets/<id>/asset.json` が持つ。

---

## 6. Asset

`asset.json`。ゲームに組み込む 1 つの素材。

| フィールド            | 型                                                                       | 必須 | 説明                                     |
| --------------------- | ------------------------------------------------------------------------ | ---- | ---------------------------------------- |
| format                | `"chameleon-asset"`                                                      | ✔    | 文書種別                                 |
| version               | string                                                                   | ✔    | 形式バージョン                           |
| id                    | string                                                                   | ✔    | アセット ID                              |
| assetType             | `character` \| `item` \| `background` \| `tile` \| `gimmick` \| `effect` | ✔    | アセット種別                             |
| name                  | string                                                                   | ✔    | 識別名（例: `tomato_player`）            |
| displayName           | string                                                                   | ✔    | 表示名                                   |
| canvasSize            | Size                                                                     | ✔    | キャンバスサイズ（px）                   |
| origin                | Vec2                                                                     | ✔    | 原点。キャラクターは足元中央を基本       |
| textures              | TextureRef[]                                                             | ✔    | 参照する画像のメタ情報                   |
| layers                | Layer[]                                                                  | ✔    | レイヤー。配列順が表示順（先頭が最背面） |
| parts                 | Part[]                                                                   | ✔    | 意味を持つ部位                           |
| anchors               | Anchor[]                                                                 | ✔    | 参照座標                                 |
| colliders             | Collider[]                                                               | ✔    | 当たり判定                               |
| frames                | Frame[]                                                                  | 任意 | アニメーション用フレーム                 |
| animations            | Animation[]                                                              | ✔    | アニメーション設定                       |
| tags                  | string[]                                                                 | ✔    | タグ                                     |
| gameAttributes        | object                                                                   | ✔    | ゲーム側で自由に使う属性                 |
| tile                  | TileSettings                                                             | 任意 | tile アセット用設定（6.7）               |
| gimmick               | GimmickSettings                                                          | 任意 | gimmick アセット用設定（6.7）            |
| effect                | EffectSettings                                                           | 任意 | effect アセット用設定（6.7）             |
| createdAt / updatedAt | string (date-time)                                                       | ✔    | 作成・更新日時                           |

座標系は、キャンバス左上を原点とし、右方向 x+、下方向 y+ とする。単位はピクセル。回転の単位は度。

ズーム倍率、選択状態、開いているパネルなどの UI 状態はアセット本体へ入れない。

### 6.1 TextureRef

| フィールド | 型                                          | 説明                                                   |
| ---------- | ------------------------------------------- | ------------------------------------------------------ |
| id         | string                                      | テクスチャ ID                                          |
| kind       | `source` \| `edit` \| `thumbnail`           | source は元画像で破壊的編集をしない                    |
| name       | string                                      | 名前                                                   |
| mimeType   | `image/png` \| `image/webp` \| `image/jpeg` | 画像形式                                               |
| size       | Size                                        | ピクセルサイズ                                         |
| path       | string                                      | `.casproj` 内の相対パス、または IndexedDB の Blob キー |

### 6.2 Layer

| フィールド       | 型                            | 説明                               |
| ---------------- | ----------------------------- | ---------------------------------- |
| id / name        | string                        | 識別子と名前                       |
| layerType        | `image` \| `shape` \| `guide` | レイヤー種別                       |
| visible / locked | boolean                       | 表示・ロック                       |
| opacity          | number (0〜1)                 | 不透明度                           |
| transform        | LayerTransform                | position / scale / rotation        |
| textureId        | string（image は必須、他は任意） | image レイヤーが参照するテクスチャ。`layerType: "image"` では schema で必須（Phase 15.5-C） |
| background       | BackgroundLayerSettings（任意） | background アセットのレイヤー用設定（6.7） |

LayerTransform の意味は次の通りとする。`position` はテクスチャ左上のアセット座標（キャンバス座標系）。`scale` と `rotation` はテクスチャ中心を基準に適用する。描画・当たり判定・書き出しはこの解釈で統一する（実装: `src/renderers/canvas2d/view.ts`）。

### 6.3 Part

`partType` は `head` / `body` / `arm_left` / `arm_right` / `leg_left` / `leg_right` / `weapon` / `eye` / `mouth` / `shadow` / `accessory` / `other`。`layerIds` で複数レイヤーをまとめる。`pivot`（任意、Vec2）はパーツの基準点で、回転や取り付けの基準に使う。

### 6.4 Anchor

`role` は `foot` / `center` / `head` / `hand_left` / `hand_right` / `weapon` / `projectile_spawn` / `damage_effect` / `shadow_center` / `custom`。`position` はキャンバス座標。

### 6.5 Collider

`shape` が `rect` のとき `rect: { x, y, width, height }` を、`circle` のとき `circle: { x, y, radius }` を必須とする。`purpose` は `body` / `attack` / `pickup` / `sensor` / `custom`。`visible` で判定だけの表示・非表示を切り替える。

### 6.6 Frame と Animation

- `Frame` は `id` / `name` / `layerStates` を持つ。`layerStates` の各要素は `layerId` 必須で、`visible` / `transform` / `opacity` を省略した場合はレイヤー本体の値を使う。
- `Animation` は `id` / `name` / `fps` / `loop` / `frameIds` を必須で持ち、`durationMs` は任意（未指定時はフレーム数と fps から導出）。
- name 候補は `idle` / `walk` / `run` / `jump` / `fall` / `attack` / `damage` / `dead` / `win` / `lose`（`ANIMATION_NAME_SUGGESTIONS`）。

### 6.7 型別設定（Phase 14）

キャラクター以外のアセット種別用の設定。すべて任意フィールドとして追加する（バージョンは 0.1.0 のまま。既存データはそのまま有効で、migrate は不要）。

**BackgroundLayerSettings**（`Layer.background`。background アセットの各レイヤーに付ける）

| フィールド    | 型                                       | 説明                                             |
| ------------- | ---------------------------------------- | ------------------------------------------------ |
| role          | `far` \| `mid` \| `near` \| `foreground` | 遠景・中景・近景・前景の役割                     |
| parallaxSpeed | Vec2                                     | パララックス速度係数（1 がカメラと等速、0 が固定） |
| loopX / loopY | boolean                                  | 各軸方向にループ描画するか                       |

**TileSettings**（`Asset.tile`。tile アセットに付ける）

| フィールド    | 型                                                        | 説明                                     |
| ------------- | --------------------------------------------------------- | ---------------------------------------- |
| tileSize      | Size                                                      | 1 タイルのピクセルサイズ                 |
| collisionType | `none` \| `solid` \| `one_way` \| `hazard` \| `custom`    | 衝突タイプ（床・壁・穴・一方通行床など） |
| visualType    | string                                                    | 見た目の分類（例: `floor` / `wall` / `hole`） |

tile アセットの Atlas 出力では、`atlas.json` に `tile` フィールドとして TileSettings をそのまま含める（ゲーム側が各コマを `tileSize` で分割するために使う。`cellSize` と各コマの配置は従来どおり Sprite Sheet の実配置を表す）。

**GimmickSettings**（`Asset.gimmick`。gimmick アセットに付ける）

| フィールド     | 型     | 説明                                                                            |
| -------------- | ------ | ------------------------------------------------------------------------------- |
| movementPreset | string | 動きプリセットの入口（候補: `none` / `horizontal` / `vertical` / `rotate` / `pendulum`。Phase 15 以降で実装） |

gimmick のタグ候補は `hazard` / `platform` / `obstacle` / `pickup_emitter`（UI 側の候補提示のみ。schema は string[] のまま）。

**item アセット**は新規フィールドを持たない。取得判定は既存 Collider の `purpose: pickup`、属性は既存 `gameAttributes` を使う。標準属性キー候補は `score` / `hp` / `attack` / `defense` / `speed` / `duration` / `effectType` / `rarity`（UI 側の候補提示のみ）。

**EffectSettings**（`Asset.effect`。effect アセットに付ける。Phase 17）

| フィールド | 型                                              | 説明                                             |
| ---------- | ------------------------------------------------ | ------------------------------------------------ |
| effectType | `spark` \| `hit` \| `explosion` \| `aura` \| `trail` \| `custom` | エフェクトの種類                 |
| durationMs | number（1 以上）                                 | 再生時間の目安（ms）                             |
| loop       | boolean                                          | ループ再生するか                                 |
| blendMode  | `normal` \| `add` \| `screen`                    | 描画時のブレンドモード                           |

本格的なエフェクトエディタ / パーティクルは対象外。ゲーム側で解釈するメタデータのみを持つ（Phase 17）。アニメーション（`Asset.animations`）を併用する場合、アニメーションの長さと `durationMs` が矛盾しないよう UI で注意を促す。

effect アセットの Atlas 出力では、`atlas.json` に `effect` フィールドとして EffectSettings をそのまま含める（ゲーム側が再生時間・blendMode を `atlas.json` だけで読めるようにするため）。

### 6.8 簡易リグ（Phase 15）

Spine / Rive の代替ではなく、パーツ単位の回転・平行移動をフレームアニメーションへ焼き込むための最小構造。すべて任意フィールドで追加する（version 0.1.0 のまま。migrate 不要）。

**Part の拡張**（`Asset.parts[]` の各要素）

| フィールド    | 型                             | 説明                                                                 |
| ------------- | ------------------------------ | -------------------------------------------------------------------- |
| parentId      | string（任意）                 | 親パーツ ID。未設定はルート。循環は禁止（UI とバリデーションで防ぐ） |
| bindPose      | PartPose（任意）               | 基準ポーズ。未設定は `{ localPosition: {x:0,y:0}, localRotation: 0, localScale: {x:1,y:1} }` |
| rotationLimit | `{ min, max }`（任意、度）     | localRotation の可動域。UI 入力時に clamp する                        |

**PartPose**

| フィールド    | 型             | 説明                                   |
| ------------- | -------------- | -------------------------------------- |
| localPosition | Vec2（任意）   | 親パーツ座標系での平行移動（px）       |
| localRotation | number（任意） | 度。パーツ pivot を中心に回転する      |
| localScale    | Vec2（任意）   | 拡縮（squash / stretch 用）            |

**RigAnimation**（`Asset.rigAnimations?: RigAnimation[]`）

| フィールド | 型                                              | 説明                                             |
| ---------- | ----------------------------------------------- | ------------------------------------------------ |
| id / name  | string                                          | 識別子と名前                                     |
| fps        | number                                          | 焼き込み時のサンプリングレート                   |
| loop       | boolean                                         | 焼き込み先 Animation の loop に引き継ぐ          |
| keyframes  | `Array<{ time: number, poses: Record<partId, PartPose> }>` | time は 0〜1 の正規化時刻。keyframe 間は線形補間 |
| durationMs | number                                          | アニメーション全体の長さ（ms）                   |

**焼き込み（bake）**: `RigAnimation` を `fps` と `durationMs` からフレーム数 `ceil(durationMs / 1000 * fps)` でサンプリングし、各時刻のパーツワールド変換（親子合成: 親の変換 → 自分の pivot 中心回転・拡縮 → localPosition 平行移動）を、パーツに属する各レイヤーの `Frame.layerStates[].transform` に変換して `frames` へ追加し、対応する `Animation` を作る。レイヤー transform の rotation はテクスチャ中心基準（6.2）のため、pivot 中心回転はレイヤー中心の移動 + rotation 加算に分解して反映する。焼き込み後のフレームは通常のフレームとして編集・書き出しできる（リグ構造は書き出し JSON にそのまま残る）。

**モーションテンプレート**: `idle_sway` / `walk_bounce` / `jump_squash` / `attack_swing` / `damage_shake` / `dead_collapse` を、パーツ種別（head / body / arm_* / leg_* / weapon）へのマッピングで `RigAnimation` として生成する。生成後は通常の keyframe として手動調整できる。

---

## 7. ExportPresetFile

`settings/export-presets.json`。

| フィールド | 型                           | 説明               |
| ---------- | ---------------------------- | ------------------ |
| format     | `"chameleon-export-presets"` | 文書種別           |
| version    | string                       | 形式バージョン     |
| presets    | ExportPreset[]               | 書き出し設定の一覧 |

`ExportPreset` は `id` / `name` / `target`（`generic` / `canvas2d` / `pixijs` / `phaser`） / `imageFormats`（`png` / `webp`） / `includeAssetJson` / `includeSpriteSheet` / `includeSampleHtml` / `scale` を持つ。

---

## 8. 検証 API

`src/core/schema/validate.ts` が Ajv による検証関数を提供する。

```ts
import { validateAsset } from './core/schema/validate';

const result = validateAsset(data);
if (!result.valid) {
  // result.errors に「どの項目が不正か」の一覧が入る
}
```

- `validateAsset(data)`
- `validateAnimation(data)`
- `validateProject(data)`
- `validateExportPresets(data)`

いずれも `{ valid: boolean; errors: string[] }` を返す。

---

## 9. 変更時の注意

- 内部データ形式を UI 都合で壊さない（要件 17）。
- 破壊的変更時は version を上げ、migrate を必ず用意する（要件 10）。
- 既存プロジェクトを読めなくする変更を入れない（要件 17）。
- 形式を変更したら、この文書、schema、型、サンプル、テストを同時に更新する。

# 2D-1A Baseline Report

最終更新日: 2026-07-10  
work package: `2D-1A-BASELINE`  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`

## 1. 文書の目的

この文書は、新しいデータ契約を決めるものではない。現行実装、型、schema、保存、`.casproj`、export ZIP、migration、sample、fixture、test から確認できる事実を固定し、後続の詳細 work package（`2D-1A-LAYERS`、`2D-1A-COORD`、`2D-1A-MOTION`、`2D-1A-TARGET`、`2D-1A-PROVENANCE`、`2D-1A-VALIDATION`、`2D-1A-MIGRATION`、`2D-1B-*`、`2D-4-*` 以降）で互換性を判断するための比較基準にする。

## 2. 調査対象commit

- 調査対象 local commit: `d47c04625da6d0ff68cc70274c1319c0c5039f90`。
- 調査時点の注意: baseline 作成環境では `gh` CLI が無く、shell から GitHub / origin への HTTPS 接続も `CONNECT tunnel failed, response 403` で失敗した。そのため調査時点では PR #49 の merge 状態、同目的 open PR、最新 `origin/main` は shell では確認できていなかった。
- 現在時点の扱い: この baseline report は PR #50 の成果物として main へマージ済みであり、PR #49 では詳細ロードマップとの統合を行った。
- ローカル文書上は `docs/IMPLEMENTATION_PLAN.md` が Phase 17 後の直近段階を `2D-1a` とし、`docs/future/2D_COMPLETION_ROADMAP.md` が `2D-1A-BASELINE` 完了後の詳細契約 work package を定義している。

## 3. 調査方法

- 必読 docs を読み、docs に書かれた内容を実装済みとは扱わず、コードと test で照合した。
- `rg` で version、schema、`.casproj`、IndexedDB、autosave、export、migration、fixture、test を追跡した。
- TypeScript 型の正本は `src/core/model/`、JSON Schema は `src/core/schema/`、保存処理は `src/core/storage/`、export は `src/core/export/`、sample は `src/core/samples/`、unit test は各 `*.test.ts`、E2E は `e2e/*.spec.ts` を確認した。

## 4. 現行version一覧

| 領域 | 現在確認できる version | 正本 / 根拠 | 備考 |
|---|---:|---|---|
| application | `0.1.0` | `package.json` `version` | package version は変更なし。 |
| Asset | `0.1.0` | `src/core/model/asset.ts` `CURRENT_ASSET_VERSION`、`src/core/samples/asset.*.json` | `asset.schema.json` は semver pattern を検証するが const では固定していない。 |
| Project | `0.1.0` | `src/core/model/project.ts` `CURRENT_PROJECT_VERSION`、`project.sample.json` | `.casproj` 内 `project.json` の version。 |
| export-presets | `0.1.0` | `src/core/model/exportPreset.ts` `CURRENT_EXPORT_PRESETS_VERSION`、`export-presets.sample.json` | `.casproj` の `settings/export-presets.json`。 |
| atlas JSON | `0.1.0` | `src/core/export/atlas.ts` `CURRENT_ATLAS_VERSION` | export ZIP 内 `atlas/atlas.json`。 |
| IndexedDB | `1` | `src/core/storage/db.ts` `DB_VERSION` | DB 名は `chameleon-asset-studio`。 |
| docs | `0.1.0` | `docs/DATA_FORMAT.md`、`docs/EXPORT_FORMATS.md` | docs は対象バージョン `0.1.0` と記載。 |
| migration current | `0.1.0` | `migrateAsset` / `migrateProject` / `migrateExportPresets` | 実 migration 配列は空。 |

## 5. TypeScript型の正本

| 型 / 領域 | 定義ファイル | 主な参照元 | JSON Schema対応 | 保存対象 | `.casproj`対象 | `asset.json` / export対象 | migration対象 | 現在のtest | 壊した場合の影響 |
|---|---|---|---|---|---|---|---|---|---|
| `Project` | `src/core/model/project.ts` | `projectStore.ts`, `casproj.ts`, `ExportPanel.tsx` | `project.schema.json` | `projects` store | `project.json` | 直接 export ZIP なし | `migrateProject` | `validate.test.ts`, `projectStore.test.ts`, `casproj.test.ts`, `e2e/casproj.spec.ts` | プロジェクト一覧、`.casproj` import/export。 |
| `Asset` | `src/core/model/asset.ts` | editor、export、storage、schema tests | `asset.schema.json` | `assets` store の `data` | `assets/<assetId>/asset.json` | export ZIP `asset.json` | `migrateAsset` | `validate.test.ts`, `assetOps.test.ts`, `flipCopy.test.ts`, `casproj.test.ts`, `export.spec.ts` | ほぼ全編集・保存・export。 |
| Asset type | `ASSET_TYPES` in `asset.ts` | `AssetTypePanel.tsx`, schema | enum in `asset.schema.json` | Asset 内 | Asset 内 | Asset / atlas tile/effect分岐 | Asset migration | `validate.test.ts` | 型別 UI、tile/effect export。 |
| `Layer` | `src/core/model/layer.ts` | Canvas/editor/export | layer definition | Asset 内 | Asset 内 | Asset / PNG合成 / sprite sheet | Asset migration | `validate.test.ts`, `assetOps.test.ts`, `layers.spec.ts` | 描画、選択、書き出し。 |
| `Part` | `src/core/model/part.ts` | part panel, rig | part definition | Asset 内 | Asset 内 | Asset | Asset migration | `assetOps.test.ts`, rig tests | パーツ、rig bake。 |
| `Frame` / `Animation` | `src/core/model/animation.ts` | timeline/export/atlas | frame/animation definitions, `animation.schema.json` | Asset 内 | Asset 内 | Asset / atlas animations | Asset migration | `validate.test.ts`, `atlas.test.ts`, `animation.spec.ts` | animation再生、sprite sheet順序。 |
| `RigAnimation` | `src/core/model/rig.ts` | rig bake/templates | rigAnimation definition | Asset 内 | Asset 内 | Asset | Asset migration | `rig.test.ts`, `motionTemplates.test.ts` | rig編集・焼き込み。 |
| `origin` | `Asset.origin` | Canvas/editor/export/readme/helpers | `vec2` | Asset 内 | Asset 内 | Asset / atlas / README / helpers | Asset migration | `validate.test.ts`, `export.spec.ts` | ゲーム配置基準、engine guide。 |
| `Anchor` | `src/core/model/anchor.ts` | anchor UI/export/atlas/helpers | anchor definition | Asset 内 | Asset 内 | Asset / atlas / README / helpers | Asset migration | `validate.test.ts`, `assetOps.test.ts` | 弾発射位置等のゲーム参照。 |
| `Collider` | `src/core/model/collider.ts` | collider UI/export/atlas/helpers | collider definition | Asset 内 | Asset 内 | Asset / atlas / README / helpers | Asset migration | `validate.test.ts`, `colliderEditing.test.ts` | 当たり判定。polygonは未実装。 |
| `ExportPreset` | `src/core/model/exportPreset.ts` | sample/schema/casproj | `export.schema.json` | 現状専用 store なし | `settings/export-presets.json` 任意 | export ZIP の挙動には未接続 | `migrateExportPresets` | `validate.test.ts`, `casproj.test.ts` | 将来の対象別 preset。 |
| `TextureRef` | `src/core/model/texture.ts` | import/export/storage/casproj | texture definition | Asset 内 + blobs store | file path として使用 | Asset / `.casproj`; export ZIP は合成画像 | Asset migration | `validate.test.ts`, `casproj.test.ts`, `export.spec.ts` | 画像欠落、表示、書き出し。 |

保存用データと UI 一時状態の境界は、`Asset` コメントで UI 状態を含めないと明記され、`Layer` コメントでも zoom / selection を含めないと明記されている。実装上も zoom、selected id、mobile view などは editor state 側にあり、`asset.json` に含めない。

## 6. JSON Schemaとruntime validation

- schema ファイルは `src/core/schema/asset.schema.json`, `project.schema.json`, `export.schema.json`, `animation.schema.json`。
- runtime validation は `src/core/schema/validate.ts` が Ajv + formats で compile した `validateAsset`, `validateProject`, `validateExportPresets`, `validateAnimation` を提供する。
- import時検証: `.casproj` は `importCasproj` が `migrateProject` / `migrateAsset` / `migrateExportPresets` の後に schema 検証する。
- export前検証: `exportAssetJson`, `exportImage`, `exportSpriteSheet`, `exportZip` は `assertValidAsset` 経由で `validateAsset` を通す。`.casproj` 書き出しは `exportCasproj` が project / asset / export-presets を検証する。
- sample検証: `src/core/schema/validate.test.ts` が minimal / character / effect / project / export-presets sample を検証する。
- unknown property: `asset.schema.json` の description と `validate.test.ts` の「未対応の追加プロパティがあっても検証エラーにしない」により、Asset の unknown property は現在拒否されない。
- invalid data のエラー経路: validation errors は `validate.ts` の `formatErrors` で path + message に整形され、storage/export/casproj の Error に含まれる。
- 構造検証と意味上の検証は完全分離されていない。schema は required / enum / numeric range などを担い、参照整合や出力対象別検証は部分的に export/casproj/storage で行われる。
- 出力対象別 validation は現時点では generic な export 関数内の検証で、Unity / Godot / RPG Maker など target profile 別の合否判定は未実装。

## 7. `.casproj`の現在の構造

- 実体は `fflate` で生成・展開する ZIP。入口は `src/core/storage/casproj.ts` `exportCasproj` / `importCasproj`。
- ZIP内構成の現行実装:
  - `project.json`
  - `README.md`
  - `assets/<asset.id>/asset.json`
  - 任意: `settings/export-presets.json`
  - 画像等: `assets/<asset.id>/<TextureRef.path>`
- thumbnail / source / edit は `TextureRef.path` と `files` に入っている限り区別なく同梱される。専用 manifest / preview file は未実装。
- 書き出し時は全 `TextureRef` の file が揃わない場合 `CasprojError` で拒否する。
- 読み込み時は texture file 欠落を互換のためエラーにせず `warnings` に返す。
- 壊れた ZIP は `ZIP として読み込めませんでした`、壊れた JSON は `<path> が JSON として読めません`、schema 不正は `<path> の内容が不正です` で失敗する。
- 未知 future version は migration が `このアプリが扱える 0.1.0 より新しい形式` として拒否する。
- 既存 project と import 途中データの分離は `HomeScreen.tsx` が import result を受けて再採番・保存する経路にある。`importCasproj` 自体は bundle を返すだけで IndexedDB へ保存しない。
- クリーンなブラウザへの移動は `e2e/casproj.spec.ts` の「`.casproj を書き出し、削除後に読み込むと画像ごと復元される`」で確認される。
- 読み込み後の再保存・再書き出しは unit round-trip と E2E で一部確認されるが、旧 version fixture に対する自動確認はない。

## 8. IndexedDBとautosaveの現在の構造

- DB 名: `chameleon-asset-studio`、DB version: `1`。
- object store: `projects` keyPath `id`; `assets` keyPath `id` + index `byProject`; `blobs` keyPath `key` + index `byProject`。
- Project は `projects` store に単体保存。Asset は `{ id, projectId, data }` record として保存され、Asset 本体には `projectId` を持たない。
- image Blob は Blob のままではなく `{ key, projectId, mimeType, bytes: ArrayBuffer, updatedAt }` として `blobs` store に保存する。
- transaction helper `runTransaction` は対象 store 群を 1 transaction で扱い、`oncomplete` / `onerror` / `onabort` を Promise 化する。
- autosave は `AutosaveQueue` が default 800ms debounce、最新 task だけ保持、保存を直列化し、`idle` / `saving` / `saved` / `error` と `lastSavedAt` / `errorMessage` を公開する。
- storage estimate / quota不足 / persistent storage request は現行コード上では確認できない。実機・ブラウザ差を含む確認が必要。
- 複数更新時は AutosaveQueue が実行中なら次 task を pending にし、完了後に続けて実行する。ただし transaction をまたぐ複数保存の全体 atomicity は保証されない。
- 削除は `deleteProject` が project / asset / blob を同一 transaction で削除する。`deleteAsset` は asset のみ削除で、関連 blob cleanup は別途保証されていない。

## 9. export ZIPの現在の構造

入口は `src/core/export/exportAsset.ts` `exportZip`。現在の ZIP は次を生成する。

| path | 状態 | 根拠 |
|---|---|---|
| `asset.json` | 実装済み。schema検証後に整形 JSON。 | `exportAssetJson` / `exportZip` |
| `textures/main.png` | 実装済み。表示状態を Canvas 合成。 | `exportImage` |
| `textures/main.webp` | 実装済み。ただし WebP 非対応環境では省略。 | `exportZip` catch |
| `atlas/spritesheet.png` | 実装済み。frames があれば全 frame、なければ `default`。 | `exportSpriteSheet` |
| `atlas/atlas.json` | 実装済み。format `chameleon-atlas`, version `0.1.0`。 | `buildAtlas` |
| `README.md` | 実装済み。座標、origin、anchor、collider説明。 | `buildExportReadme` |
| `examples/example-canvas.html` | 実装済み。 | `buildCanvasExample` |
| `examples/example-pixi.html` | 実装済み。 | `buildPixiExample` |
| `examples/example-phaser.html` | 実装済み。 | `buildPhaserExample` |
| `helpers/chameleon-helpers.js` | 実装済み。 | `buildCanvasHelpers` |
| `helpers/chameleon-pixi.js` | 実装済み。 | `buildPixiHelpers` |
| `helpers/chameleon-phaser.js` | 実装済み。 | `buildPhaserHelpers` |
| `engines/README-godot.md` / `README-unity.md` | 実装済み説明文。scene/prefab自動生成は未実装。 | `engineGuides.ts` |

- frame順序: `computeSheetLayout` が `Asset.frames` 配列順を左上から行優先で配置する。
- origin / anchor / collider / animation / tile / effect は atlas に含まれる。polygon、trim、padding、extrude、hash、warning、verification record、target別 manifest は未実装。
- scale は `ExportPreset.scale` 型には存在するが、現行 `exportZip` の実引数には未接続。

## 10. migrationの現在の状態

- 入口: `migrateDocument`, `migrateAsset`, `migrateProject`, `migrateExportPresets` in `src/core/model/migrate.ts`。
- current version: Asset / Project / export-presets は `0.1.0`。
- 実 migration 配列: `ASSET_MIGRATIONS`, `PROJECT_MIGRATIONS`, `EXPORT_PRESETS_MIGRATIONS` は空。
- current version はそのまま返す。future version、versionなし、semver形式不正、旧versionで migrationなしは `MigrationError`。
- rollback、読み込み元データ保持、migration後再保存、migration後exportの専用仕組みは未実装。
- `migrate.test.ts` はテスト内で仮 migration を渡して適用順序を検証するが、実在の旧形式 fixture は存在しない。架空の旧形式 fixture はこの PR では作成しない。

## 11. fixtureとtest coverage

| 分類 | 実在ファイル / test | 何を証明しているか | gap |
|---|---|---|---|
| sample asset | `src/core/samples/asset.minimal.json`, `asset.character.json`, `asset.effect.json` | 現行 schema を通る sample。 | 実 export ZIP fixture として固定されてはいない。 |
| schema fixture | `src/core/schema/*.schema.json` | Ajv runtime validation の正本。 | version const 固定ではなく pattern。 |
| valid fixture | samples + `validate.test.ts` | valid asset/project/export-presets/animation。 | target別 valid fixture なし。 |
| invalid fixture | `validate.test.ts` 内で clone 改変 | required / enum / range / invalid shape 等を拒否。 | ファイル fixture ではない。 |
| current `.casproj` fixture | なし。`casproj.test.ts` が実行時生成 | ZIP round-trip、欠損、危険 path、invalid JSON を検証。 | 固定 ZIP fixture なし。 |
| old `.casproj` fixture | なし | なし | `2D-1A-MIGRATION` / `2D-1B-CASPROJ` / `2D-1B-RECOVERY` で判断必要。 |
| future version fixture | `migrate.test.ts` 内の object | future version 拒否。 | `.casproj` としての future fixture なし。 |
| corrupt fixture | `casproj.test.ts` 内で broken JSON / not casproj生成 | error path。 | 破損ZIP専用 fixture file なし。 |
| missing Blob fixture | `casproj.test.ts`, `e2e/casproj.spec.ts`, `e2e/export.spec.ts` | 欠損画像の拒否/警告。 | 実ブラウザ容量不足は未検証。 |
| export ZIP fixture | なし。`e2e/export.spec.ts` が download ZIP を検証 | ZIPファイル一覧、helper/engine guide一部。 | hash / verification / target別 fixture なし。 |
| atlas fixture | `atlas.test.ts` | layout, atlas content, tile/effect同梱。 | trim/padding/extrude 未実装。 |
| migration fixture | なし。test内仮 objectのみ | migration入口の挙動。 | 実旧形式なし。 |
| IndexedDB test | `projectStore.test.ts`, E2E各種 | save/load/list/delete/blob保存。 | quota/persistence/中断の実機確認なし。 |
| import/export round-trip | `casproj.test.ts`, `e2e/casproj.spec.ts` | `.casproj` 往復。 | 読み込み後再exportの旧形式確認なし。 |
| E2E | `e2e/*.spec.ts` | UI経由保存、export、casproj、animation等。 | 端末・容量・永続ストレージは人間実機確認が必要。 |

## 12. 現在の不変条件

- `asset.json` / Project / export-presets の現行 version は `0.1.0` のまま扱う。
- `Asset.format` は `chameleon-asset`、`Project.format` は `chameleon-project`、export-presets format は `chameleon-export-presets`。
- `.casproj` は ZIP で、`project.json` と `assets/<asset.id>/asset.json` を含む。
- `.casproj` 書き出しは全 texture file が揃わない場合に失敗する。
- `.casproj` 読み込みは texture file 欠落を warnings として扱い、互換のため即エラーにはしない。
- IndexedDB store 名と DB version は現行 `projects` / `assets` / `blobs`, version `1`。
- Asset 本体に UI 一時状態を含めない。
- export ZIP の既存 path は互換対象として扱う。
- polygon collider、trim、padding、extrude、common manifest、verification record は実装済みとして扱わない。

## 13. 保証されていない内容

- source / edit / derived / export / verification の完全な層分離。
- Project / Asset Family / Variant の契約。
- ID と参照の全体整合検証。
- frame別 collider / anchor / polygon。
- trim / padding / extrude / scale / target extension の共通契約。
- quota不足、persistent storage、途中終了、複数 transaction をまたぐ atomicity。
- 旧 `.casproj` 実 fixture に対する migration。
- export ZIP の hash、warning、verification record、target別 manifest。
- import途中データの完全隔離と rollback。

## 14. docsと実装の不一致

- PR #50 作成時点では総称 `2D-1A-CONTRACT` を後続 work package として参照していたが、PR #49 との統合後は `2D-1A-LAYERS`、`2D-1A-COORD`、`2D-1A-MOTION`、`2D-1A-TARGET`、`2D-1A-PROVENANCE`、`2D-1A-VALIDATION`、`2D-1A-MIGRATION` に分解して扱う。
- `docs/DATA_FORMAT.md` は `.casproj` 構造に `thumbnails/` を例示するが、実装は `TextureRef.path` に従うだけで専用 thumbnail directory を必須化しない。
- `ExportPreset.scale` は型と schema に存在するが、現行 `exportZip` の scale処理には接続されていない。
- `docs/future/*` の source/edit/derived/export/verification、common manifest、target別 verified 条件は将来契約であり、現行実装ではない。

## 15. 変更影響表

| 領域 | 現在の正本 | 現在の挙動 | 不変条件 | 変更時に影響する範囲 | 現在のtest | 不足 | 後続work package |
|---|---|---|---|---|---|---|---|
| version | model constants + package | `0.1.0` / DB `1` | 勝手に上げない | migration/schema/docs/export | validate/migrate | version const schemaなし | `2D-1A-MIGRATION` |
| Asset型 | `asset.ts` | 保存・export正本 | UI stateを入れない | 全機能 | validate/assetOps | 参照整合 | `2D-1A-LAYERS`, `2D-1A-VALIDATION` |
| Layer | `layer.ts` | 配列順が表示順 | transform意味維持 | canvas/export | layers/export | trim/derivedなし | `2D-2` |
| Frame | `animation.ts` | frame配列順 | atlas順序維持 | animation/export | atlas/animation | frame別game data | `2D-1A-MOTION`, `2D-3-COLLIDER-OVERRIDE` |
| Animation | `animation.ts` | fps/loop/frameIds | frameIds意味維持 | player/helpers | validate/atlas | duration整合 | `2D-1A-MOTION` |
| Rig | `rig.ts` | optional編集用 | bake前契約未拡張 | rig bake | rig tests | flip/variant | `2D-1A-MOTION` |
| Origin | `Asset.origin` | atlas/readme/helperへ出る | px左上原点 | engine import | export/atlas | target別検証 | `2D-1A-COORD`, `2D-4-PREFLIGHT` |
| Anchor | `anchor.ts` | atlas/helperへ出る | role/position維持 | gameplay refs | validate/assetOps | frame別なし | `2D-1A-MOTION`, `2D-3-COLLIDER-OVERRIDE` |
| Collider | `collider.ts` | rect/circleのみ | polygon未実装 | schema/export/helper | validate/colliderEditing | polygon判断 | `2D-1A-MOTION`, `2D-3-POLYGON` |
| JSON Schema | `src/core/schema` | Ajv runtime | unknown許容を維持 | import/export/storage | validate | semantic validation | `2D-1A-VALIDATION` |
| `.casproj` | `casproj.ts` | ZIP | path互換 | backup/import | casproj/e2e | fixed fixtureなし | `2D-1B-CASPROJ`, `2D-1B-RECOVERY` |
| IndexedDB | `db.ts`, `projectStore.ts` | 3 stores | DB version変更なし | persistence | projectStore | quota/persist | `2D-1B-REVISION`, `2D-1B-CAPACITY` |
| autosave | `autosave.ts` | 800ms debounce | 直列保存 | editor save UX | autosave | crash recovery | `2D-1B-REVISION`, `2D-1B-RECOVERY` |
| migration | `migrate.ts` | 配列空 | 実旧形式を捏造しない | imports | migrate | old fixtures | `2D-1A-MIGRATION` |
| export ZIP | `exportAsset.ts` | fixed paths | 既存path維持 | users/helpers | e2e/export | verification/hash | `2D-4-CORE`, `2D-4-PACKAGE`, `2D-4-PREFLIGHT` |
| sprite sheet | `atlas.ts` | sqrt grid | frame order維持 | atlas/helpers | atlas | padding/extrude | `2D-4-SHEET`, `2D-4-SCALE` |
| atlas JSON | `atlas.ts` | format/version 0.1.0 | 既存field維持 | engines | atlas/export | target profile | `2D-4-CORE`, `2D-4-GENERIC-WEB`, `2D-4-PIXIJS`, `2D-4-PHASER` |
| helper | `helpers.ts` | 3 helper files | ZIP path維持 | external code | helpers/export | target選択 | `2D-4-GENERIC-WEB`, `2D-4-PIXIJS`, `2D-4-PHASER`, `2D-5-EVIDENCE` |
| sample | `src/core/samples` | schema samples | current only | docs/tests | validate | export fixtures | `2D-1A-LAYERS`, `2D-1A-VALIDATION` |
| fixture | test生成中心 | fixed files少 | 旧形式捏造禁止 | CI/regression | unit/e2e | current ZIP fixture | `2D-1B-GATE`, `2D-1B-CASPROJ` |

## 16. Fable5または人間の判断が必要な項目

| ID | 判断が必要な内容 | 現在確認できる事実 | 選択肢 | 影響範囲 | 推奨される後続work package |
|---|---|---|---|---|---|
| D-01 | source / edit / derived / export / verification の分離 | `TextureKind` は source/edit/thumbnail のみ。verification層なし。 | 現行維持 / 新層追加 / 別manifest化 | Asset, `.casproj`, export | `2D-1A-LAYERS` |
| D-02 | Project / Asset Family / Variant | Projectはasset summary配列のみ。family/variantなし。 | Asset内metadata / Project層追加 / 別file | schema, UI, migration | `2D-1A-LAYERS` |
| D-03 | IDと参照整合 | schemaは参照存在まで強制しない。 | schema拡張 / runtime semantic validation | import/export/storage | `2D-1A-LAYERS`, `2D-1A-VALIDATION` |
| D-04 | coordinate / trim / flip / scale | px左上原点、rotation度。trim未実装、scale型はpresetにあるが未接続。 | 現行継続 / export option / asset field | atlas/helper/engine | `2D-1A-COORD` |
| D-05 | migration復旧点 | migration入口はあるが配列空、rollbackなし。 | load時のみ / import隔離 / revision保存 | storage/casproj | `2D-1A-MIGRATION`, `2D-1B-RECOVERY`, `2D-1B-CASPROJ` |
| D-06 | common manifest | `.casproj` / export ZIPに共通manifestなし。 | 追加しない / exportだけ / casprojにも追加 | ZIP互換 | `2D-1A-TARGET`, `2D-4-PACKAGE` |
| D-07 | frame別データ | frameはlayerStates中心。frame別 collider/anchorなし。 | Asset共通のみ / frame override | schema/helper | `2D-1A-MOTION`, `2D-3-COLLIDER-OVERRIDE` |
| D-08 | polygon collider | Collider shapeは rect/circleのみ。 | 後回し / schema追加 / export-only不可 | schema/export/helper | `2D-1A-MOTION`, `2D-3-POLYGON` |
| D-09 | target extension | engine guidesは説明文のみ。verified presetなし。 | generic維持 / target profile追加 | export ZIP/docs | `2D-1A-TARGET`, `2D-5-EVIDENCE`, 対象別work package |

## 17. 後続work packageへの引き継ぎ

- `2D-1A-LAYERS`: source / edit / derived / export / verification、Project / Asset Family / Variant、ID・名前・参照の層と責務を baseline 事実から ADR / fixture / acceptance test に分解する。
- `2D-1A-COORD`: 座標、transform、pivot、trim、atlas、flip、scale、丸めの意味を baseline 事実と既存 export の互換性から固定する。
- `2D-1A-MOTION`: animation event、可変時間、rig bake、frame別上書き、polygon の採否と境界を決める。
- `2D-1A-TARGET`: target固有 extension と unknown data の扱いを決め、`2D-4-PACKAGE` / `2D-5-EVIDENCE` へ渡す。
- `2D-1A-PROVENANCE`: provenance、利用条件、AI送信記録の保存境界を決める。
- `2D-1A-VALIDATION`: 構造・意味・出力の検証を schema / runtime / preflight に分解する。
- `2D-1A-MIGRATION`: version、旧形式、rollback、fixture を扱う。実在する旧形式が必要になった場合のみ fixture 化し、架空旧形式を正本化しない。
- `2D-1B-REVISION` / `2D-1B-LAYERS` / `2D-1B-RECOVERY` / `2D-1B-CAPACITY` / `2D-1B-CASPROJ` / `2D-1B-INPUT-SAFETY` / `2D-1B-GATE`: import隔離、rollback、容量不足、永続ストレージ、削除復元、読み込み後再保存/再書き出しを実装対象にする。
- `2D-4-CORE` / `2D-4-SHEET` / `2D-4-SCALE` / `2D-4-PACKAGE` / `2D-4-PREFLIGHT` / `2D-4-GENERIC-WEB` / `2D-4-PIXIJS` / `2D-4-PHASER` / `2D-4-DOCS`: common export contract、manifest、verification record、padding/scale/trim/extrudeを対象別に設計する。

## 18. 実行した検証

この文書作成時点では、変更は docs のみである。実行結果は PR 本文と最終報告にも転記する。

- `git diff --check`
- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run test`
- `npm run e2e`: 対象外。`src/`、ブラウザ操作、E2E、Playwright設定を変更していないため。

## 19. 既知の制限

- GitHub 状態確認と CI 状態確認は、この shell 環境の GitHub 接続制約により実施できていない。
- 固定 `.casproj` / export ZIP fixture は追加していない。既存 test が実行時生成で round-trip を確認しており、今回の目的では production code 変更なしの docs baseline を優先した。
- 容量不足、persistent storage、モバイル Safari などは実機確認が必要であり、この baseline では code/test上の事実に限定した。

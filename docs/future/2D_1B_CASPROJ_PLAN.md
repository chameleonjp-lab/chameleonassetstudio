# 2D-1B-CASPROJ 実装契約

作成日: 2026-07-16
状態: `completed / PR #88 merged`
正式work package: `2D-1B-CASPROJ`
基準main: `66ba2c4096dabc297f402a9176b8c60de9c584f9`（PR #87 merge）
直前work package: `2D-1B-CAPACITY` completed（CI Run #255 success）
実装CI: Run #259 success（unit 385件、E2E 80件）
merge commit: `a9a1e27a6f69544c379fb9fcefc90a13e0928859`
最終head CI: Run #260 success

## 1. 目的

`.casproj`を、正本へ書き込む前に段階検査できる可搬バックアップとして固定する。ZIP展開、文書ごとのmigration、schema検証、Project / Asset / TextureRef / Blob整合、ID再採番、原子的保存を明示的な段階へ分離し、どの段階で失敗しても既存正本へ部分書き込みしない。

現行`0.1.0`が最初の実在形式であり、実在しない旧versionを捏造しない。現行fixtureは「固定された最初の形式」としてroundtripを検証する。将来migrationが追加された場合に備え、適用ログをUIまで伝えるが、本work packageでversionやmigration手順は追加しない。

## 2. 着手時GitHub基準

- default branch: `main`
- main: PR #87 merge commit `66ba2c4096dabc297f402a9176b8c60de9c584f9`
- PR #87: merged
- PR #87最終head: `d7b965af333821d4e73937873ed039972a6f5f04`
- CI Run #255: lint、format、build、unit test、E2Eがすべてsuccess
- open PR: 0件

## 3. 既存実装監査

| 対象 | 現在の状態 | CASPROJで補うこと |
|---|---|---|
| `casproj.ts` | ZIPを展開し、project / asset / export presetsを文書ごとにmigrate→schema検証する。画像欠落はwarning。 | migration例外の分類、asset.json配置ID、重複、文書間整合を段階検査へ含める。 |
| `casprojImport.ts` | Project未参照Assetとその配下fileを正本候補から除外する。 | 除外理由をwarningに残し、正本保存可能なcanonical bundleだけを準備する。 |
| `HomeScreen.tsx` | ID再採番、Blob変換、`saveProjectBundle`呼び出しが画面内にある。 | 準備段階をstorage coordinatorへ移し、画面はstage→commit→結果表示だけを行う。 |
| `saveProjectBundle` | Project、Asset、TextureRef、Blobの原子的保存と最終guardを持つ。 | 最終backstopとして維持し、stage失敗時には呼ばない。 |
| migration | 3文書を独立に扱い、future versionを拒否する。実migration配列は空。 | 適用ログを保持・表示する。versionとmigration配列は変更しない。 |
| fixture / E2E | v0.1.0固定JSONと画像、unit roundtrip、作成→export→importがある。 | canonical import後の再export、future version、画像欠落、未参照data、正本非変更を固定する。 |

監査で確認したgap:

- `MigrationError`が`CasprojError`へ統一されず、future versionがquarantine対象にならない。
- Project参照、asset.json、TextureRef、Blobの整合検査がimportと最終保存へ分散している。
- asset.jsonが置かれたdirectory IDと文書内Asset IDの一致を検査しない。
- Project未参照Asset / fileを除外するが、warningへ理由を追加しない。
- Projectが参照するasset.json欠落、Project summaryとAsset本体の不一致、必要Blob欠落をcommit前の1つの結果として返さない。
- ID再採番とBlob変換がReact画面内にあり、単体検証しにくい。
- Homeは`appliedMigrations`を表示しない。
- 既存画像欠落E2EはProject fixtureの参照IDとAsset fixtureのIDが異なり、参照Assetの画像欠落を検証していない。

## 4. 変更範囲

### 4.1 扱うこと

- `.casproj`入力bytesの読取りと不変保持
- ZIP展開後のproject / asset / export presets識別
- 文書ごとのmigrate→schema検証
- future versionとmigration不能の理由分類
- Project参照とasset.jsonの1対1整合
- asset.json directory IDとAsset IDの一致
- Project summaryとAsset本体のID / name / displayName / assetType一致
- TextureRefと画像fileの双方向整合
- 旧bundleの未参照Asset / fileをwarning付きで除外
- import copy用Project / Asset ID再採番
- Blob keyの再構成
- canonical bundleの原子的確定
- applied migrationとcompatibility warningのUI表示
- current v0.1.0固定fixture、future version、roundtrip、E2E
- 完了報告

### 4.2 変更しないこと

- `asset.json` / `project.json` / export presetsのschemaとversion
- `ASSET_MIGRATIONS` / `PROJECT_MIGRATIONS` / `EXPORT_PRESETS_MIGRATIONS`
- `.casproj`内部のpath、必須file、ZIP構成
- export ZIP内部構成
- DB version、IndexedDB store / index layout
- dependencies
- IDを維持した既存Project上書きimport
- downgrade / down-convert
- 架空の旧version fixture
- ZIP展開サイズ、file数、圧縮率、JSON深さ、画像寸法などの数量上限
- 2D-2 / 2D-3本実装
- 3D / WebGPU

数量上限と信頼しない入力のresource制御は、正式な後続`2D-1B-INPUT-SAFETY`で扱う。CASPROJでは論理整合とmigration境界を固定し、上限値を無断で決定しない。

## 5. 段階import契約

| 段階 | 処理 | 正本書込 |
|---|---|---|
| 1. acquire | File / Blobから入力bytesを1回取得し、処理中に変更しない。 | なし |
| 2. unpack | ZIPをメモリ上へ展開し、既知文書とfileを分類する。 | なし |
| 3. migrate | project、各asset、export presetsを独立にmigrateする。 | なし |
| 4. validate | migrate後の各文書を現行schemaで検証する。 | なし |
| 5. reconcile | Project / Asset / TextureRef / fileの参照・所有・重複・欠落を検査する。 | なし |
| 6. prepare copy | Project / Asset IDを新規採番し、Project参照とBlob keyを同じmappingで変換する。 | なし |
| 7. commit | `saveProjectBundle`でProject、Asset、Blobを1 transactionで保存する。 | この段階だけ |

規則:

- 段階1〜6の失敗では`saveProjectBundle`を呼ばない。
- 段階7の失敗は既存transaction原子性によりProject、Asset、Blobを部分保存しない。
- importは常にcopyとして新しいProject / Asset IDを採番する。既存正本を上書きしない。
- ID mappingは1回作成してProject参照、Asset本体、Blob keyへ同じ値を使う。
- 有効な入力をquarantineへ保存しない。壊れた・不正・未来version・不整合入力だけを既存quarantine経路へ渡す。
- 保存容量不足など入力自体に原因がないcommit失敗は、壊れた入力としてquarantineしない。

## 6. 整合判定

### 6.1 errorとして正本保存を拒否する

- `project.json`欠落、JSON不正、schema不正
- future version、version欠落・不正、migration chain欠落
- Project内のAsset ID重複
- Projectが参照するasset.jsonの欠落または複数存在
- asset.jsonのdirectory IDと文書内Asset IDの不一致
- Project summaryとAsset本体のname / displayName / assetType不一致
- Asset ID、TextureRef ID、canonical Blob pathの重複
- TextureRefが必要とする画像file欠落
- 同じcanonical Blob pathを別TextureRefが共有する状態
- canonical保存対象のProject / Asset / TextureRef / Blob不整合

missing imageは互換warning文字列を生成できる既存low-level APIを維持してもよいが、canonical正本へは保存しない。利用者には「画像欠落」と「正本へ保存していない」を表示する。

### 6.2 warningとして除外し、互換読込みを続ける

- Projectから参照されないasset.json
- 上記Asset directory配下のfile
- 参照Asset配下だがTextureRefから参照されない追加file
- canonical保存に使わない未知の追加file

warning対象はcanonical Project / Asset / Blobへ混ぜない。別Assetへの付け替えや推測による修復は行わない。

## 7. migration契約

- ADR-0006とADR-0015を変更しない。
- migrateをschema検証より先に実行する。
- asset / project / export presetsは独立versionとして処理する。
- current `0.1.0`は恒等で、`appliedMigrations`は空。
- currentより新しいversionはpatch差でも拒否する。
- down-convertしない。
- 実在しない旧versionや変換をfixtureへ追加しない。
- 将来migrationが適用された場合、文書種別を含む適用ログを結果へ保持し、Homeに表示する。
- migration前の元Fileは変更しない。成功時に同じbytesをIndexedDBへ重複保存する新機構は追加しない。

## 8. error分類とquarantine

CASPROJ層は最低限、次を機械判定できるerror分類を持つ。

- invalid archive / missing project
- invalid JSON / schema
- unsupported or unmigratable version
- incomplete bundle（参照文書・画像欠落）
- inconsistent bundle（ID・summary・path・重複不整合）

これらは`CasprojError`としてHomeへ返し、既存quarantineへ入力bytes、file名、理由を保存する。quarantineの件数・byte保持上限・削除挙動は変更しない。

## 9. UI契約

- 読み込み中は二重実行を防ぐ。
- 成功時はcompatibility warningとapplied migrationを別の見出しで表示する。
- migrationが無い場合に架空の適用履歴を表示しない。
- エラー時は壊れたZIP、JSON/schema不正、未来version、画像欠落、bundle不整合を理由文で区別する。
- エラー時は「既存の保存済みProjectは変更されていない」と表示する。
- import成功後は新しいcopyとしてProject一覧へ追加する。

## 10. テスト契約

### unit

- v0.1.0固定fixtureのimport→export→reimportで主要データと画像bytesを維持する。
- future project / asset / export presets versionを拒否し、入力object / bytesを変更しない。
- Project参照重複、asset欠落、directory ID不一致、summary不一致を拒否する。
- TextureRef ID / Blob path重複、画像欠落をcommit前に拒否する。
- 未参照Asset / fileとorphan fileをwarning付きで除外する。
- stage失敗時に正本storeへ書き込まない。
- copy準備でProject / Asset / Blob keyが同じmappingへ変換される。
- commit失敗時に既存正本と新規copyの部分状態を残さない。

### E2E

- 作成→`.casproj` export→元Project削除→import→画像表示→再export→再importを通す。
- future versionを理由付きで拒否し、quarantineへ表示する。
- 参照Assetの画像欠落を理由付きで拒否し、既存Projectと正本件数を維持する。
- 未参照Asset / fileをwarning表示し、canonical Projectへ混ぜない。
- 375px幅で警告・migration・error表示が横スクロールを発生させない。

### CI

- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run test`
- `npm run e2e`

すべて成功すること。CI失敗は同じbranch・同じDraft PRで修正する。

## 11. 完了条件

- 段階1〜6が正本書込なしで完了し、commitだけが正本を変更する。
- Project、Asset、TextureRef、Blobの不整合をcommit前と`saveProjectBundle`で拒否する。
- future versionと画像欠落を理由付きで拒否し、元入力と既存正本を維持する。
- 未参照旧dataをwarning付きでcanonical保存対象から除外する。
- applied migrationとcompatibility warningを区別して表示する。
- current固定fixtureとUI roundtripを通す。
- schema、version、migration配列、`.casproj`構成、DB layout、dependenciesに差分がない。
- unit、E2E、標準CIが全成功する。
- `2D_1B_CASPROJ_REPORT.md`へ実装、test、残リスク、次の`2D-1B-INPUT-SAFETY`を記録する。

## 12. 停止条件

- schema / version / migration手順の追加が必要になる。
- `.casproj`内部構成やexport ZIP構成の変更が必要になる。
- DB version / store layout変更が必要になる。
- 数量上限やresource budgetの人間判断が必要になる。
- dependency追加が必要になる。
- 既存正本を上書きするimportが必要になる。
- accepted済みの保存安全方針と両立しない。

## 13. 後続順序

```text
2D-1B-CASPROJ
→ 2D-1B-INPUT-SAFETY
→ 2D-1B-GATE
```

`2D-1B-GATE`が完了するまで、追加の2D-2 / 2D-3本実装と3D実装へ進まない。

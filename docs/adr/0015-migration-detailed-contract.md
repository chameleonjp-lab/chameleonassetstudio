# 0015-migration-detailed-contract

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§13 形式変更と migration の gate）
関連 fixture: `src/core/model/migrationContract.fixtures.test.ts`（ADR-0015）

---

## 文脈

`2D-1A-MIGRATION` は 2D-1a 契約の最後の work package であり、これが accepted になると 2D-1a のデータ契約が全て揃い、`2D-1B-*`（保存・migration・復旧の本実装）解禁の前提になる。migration の**入口挙動と復旧境界**（原子的置換・復旧点・破損 import 隔離・未知 version 拒否・IndexedDB とローカル可搬正本の関係）は ADR-0006 が既に固定した。本 ADR はその上に、ADR-0006 が「詳細契約全体は未完了」として残した**詳細な migration 契約**、すなわち (a) version 採番の意味、(b) 移行手順（`Migration`）の書き方の不変条件、(c) 3 文書の独立 version と出力 version の関係、(d) 新しい形式の拒否粒度、(e) migrate と検証の順序、(f) downgrade / rollback の境界、(g) 将来の migration PR が満たすべき fixture / gate 要件を固定する。製品機能（新しい migration 手順・version 進行）は今回実装しない（現行の全 `*_MIGRATIONS` は空配列＝恒等のまま）。

## 決定

1. **version 採番と migration 手順の対応**: `asset.json` / `project.json` / `export-presets.json` の version は `MAJOR.MINOR.PATCH`（`migrate.ts` の `parseVersion` が要求する形式）とする。**version を上げる変更は、対応する移行手順（`Migration`）を必ず伴う**。逆に、**optional・additive なフィールド追加は version を上げない**（未知フィールド許容＝ADR-0011/0012/0013 の系により旧新両方が読めるため、変換不要）。したがって version が上がっているデータは常に「旧アプリが安全に読めない構造変更が入った」ことを意味する。MAJOR/MINOR/PATCH の粒度は各 migration PR が変更内容に応じて決めるが、粒度に関わらず version 上昇 1 段ごとに移行手順 1 つを対応させる（`migrateDocument` の chain 探索が `from === currentFrom` で連続していることを要求するため）。
2. **移行手順（`Migration`）の不変条件**: `Migration { from, to, description, apply }`（`src/core/model/migrate.ts:13-18`）を書くときの不変条件を契約として固定する。
   - (i) version を必ず前進させる（`to > from`。`migrateDocument` は `compareVersions(migration.to, migration.from) <= 0` を `MigrationError` にする＝`migrate.ts:96-100`）。
   - (ii) chain は連続でなければならない（各 `from` が直前の `to` と一致。欠けると「移行手順がありません」＝`migrate.ts:91-95`）。
   - (iii) `version` フィールドはフレームワークが `migration.to` に設定する（`migrate.ts:101`）。`apply` 側で version を書き換えない。
   - (iv) `apply` は文書オブジェクト全体を受け取り、**変換対象外の既知フィールドと未知フィールドを保持する**（黙って落とさない。§13 完了条件 2「保存し直しても意味が変わらない」の前提）。現行の恒等 migration（`{ ...source }`）はこの保持を満たす。
   - (v) migrate は入力オブジェクトを破壊しない（`migrate.ts:85` の `{ ...source }` と各 `apply` の非破壊実装。既存 `migrate.test.ts` の「入力データを破壊しない」で固定済み）。
3. **3 文書の独立 version と出力 version の関係**: `asset.json`（`CURRENT_ASSET_VERSION`）/ `project.json`（`CURRENT_PROJECT_VERSION`）/ `export-presets.json`（`CURRENT_EXPORT_PRESETS_VERSION`）は**独立に version を持ち、独立の移行手順配列（`ASSET_MIGRATIONS` / `PROJECT_MIGRATIONS` / `EXPORT_PRESETS_MIGRATIONS`）を持つ**。`.casproj` バンドル内でこれらが異なる version を持ちうるため、import 時は各文書を独立に migrate する（`importCasproj` が文書ごとに migrate + 検証する現行設計）。`atlas.json` の `CURRENT_ATLAS_VERSION` は**配布物（出力）の version** であり、再取り込み・migrate の対象にしない（ADR-0007 の「配布物は常に編集元から再生成し、逆方向の取り込み経路を持たない」と一貫）。現時点で 4 つの version（asset / project / export-presets / atlas）はいずれも `0.1.0` である。
4. **新しい形式の拒否粒度**: version が現行アプリより新しい文書は、patch 差であっても一律に拒否する（`compareVersions(version, currentVersion) > 0` で `MigrationError`＝`migrate.ts:79-83`）。down-convert（新→旧への自動変換）は行わない。根拠: 決定 1 により additive な変更は version を上げないため、「現行より新しい version」は常に旧アプリが安全に扱えない構造変更を含む。呼び出し側は例外時に何も書き込まないため元ファイルは温存される（ADR-0006 (d) と一貫）。
5. **migrate と検証の順序**: 外部から読み込む文書は **migrate を先に、schema 検証（構造検証、ADR-0014）を後に**通す（`importCasproj` の現行順序）。migrate の結果が現行 version の schema を満たさない場合は検証段で失敗させ、正本へ書き込まない。移行手順は「現行 version の schema を満たす現行データ」を出力する責務を持つ。
6. **downgrade / rollback の境界**: version の downgrade（新→旧への変換）は非対応・範囲外とする。本 ADR の「rollback」は version 変換の文脈では扱わず、失敗した migrate / import が元ファイル・正本を書き換えないこと（ADR-0006 (c)(d)）のみを指す。スナップショット・ごみ箱・削除復元といった**復旧の意味での rollback は `2D-1B-RECOVERY` の範囲**であり、version migration とは別の関心事である。
7. **将来の migration PR の gate / fixture 要件**: version を上げる、または移行手順を追加する PR は、契約 §13 の完了条件と ADR-0011 の導入 gate を満たさなければならない。すなわち (1) 旧データを fixture として読み込める、(2) migrate 後に保存し直しても意味が変わらない（roundtrip）、(3) 旧・新データで export の重要情報が保たれる、(4) 壊れた入力・途中失敗・容量不足・未知の将来 version を安全に扱える、(5) `docs/DATA_FORMAT.md` / `docs/EXPORT_FORMATS.md` / 対象別 matrix / tests を同時に更新する、を満たし、Opus 4.8 の設計レビューと人間確認を通す。本 ADR はこれを、移行手順を追加する全 PR の標準要件として固定する。

## 根拠

- `migrateDocument`（`src/core/model/migrate.ts:66-107`）が、(a) version 文字列の必須・形式検査（`parseVersion`、`migrate.ts:35-41`）、(b) 現行より新しい version の拒否（`migrate.ts:79-83`）、(c) chain 探索と欠落時の `MigrationError`（`migrate.ts:89-95`）、(d) 非前進手順の拒否（`migrate.ts:96-100`）、(e) `version` をフレームワークが設定する挙動（`migrate.ts:101`）、(f) `{ ...source }` による入力非破壊（`migrate.ts:85`）を実装している。
- `ASSET_MIGRATIONS` / `PROJECT_MIGRATIONS` / `EXPORT_PRESETS_MIGRATIONS`（`migrate.ts:27,30,33`）は現在すべて空配列であり、現行データ（0.1.0）は恒等で通る。
- 独立 version: `CURRENT_ASSET_VERSION`（`src/core/model/asset.ts:13`）/ `CURRENT_PROJECT_VERSION`（`src/core/model/project.ts:7`）/ `CURRENT_EXPORT_PRESETS_VERSION`（`src/core/model/exportPreset.ts:27`）/ `CURRENT_ATLAS_VERSION`（`src/core/export/atlas.ts:55`）はいずれも独立に定義され、値は `0.1.0` である。
- migrate → 検証の順序と、失敗時に正本へ書き込まないこと: `importCasproj`（`src/core/storage/casproj.ts`）が各 `asset.json` / `project.json` を migrate + `validateAsset` / `validateProject` に通し、失敗時に `CasprojError` を投げて `bundle` を返さない。
- 旧データ fixture と roundtrip の前例: `src/core/storage/__fixtures__/v0.1.0-asset.json` / `v0.1.0-project.json` と `src/core/storage/storage.fixtures.test.ts`（v0.1.0 の `.casproj` roundtrip を確認済み）が、§13 完了条件 1・2 を満たす現行のテスト前例である。
- 入口挙動と復旧境界は ADR-0006（`docs/adr/0006-migration-and-recovery-boundaries.md`）が固定済みであり、本 ADR はその詳細契約を補完する（重複して再定義しない）。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §13（境界確定の注記のみ、本文は書き換えない）。
- 影響実装: なし（今回は実装しない。将来 version を上げる PR が `migrate.ts` の各 `*_MIGRATIONS` 配列へ手順を追加し、対応する `CURRENT_*_VERSION` と schema を変更する）。
- fixture: `src/core/model/migrationContract.fixtures.test.ts` の ADR-0015 セクションで次を実挙動から固定する。
  - 4 つの version 定数（asset / project / export-presets / atlas）がいずれも `0.1.0` であり、3 つの移行手順配列（`ASSET_MIGRATIONS` / `PROJECT_MIGRATIONS` / `EXPORT_PRESETS_MIGRATIONS`）が空であること（現行 baseline）。
  - v0.1.0 の asset fixture を `migrateAsset` に通すと恒等（`appliedMigrations` 空・version 不変）で返り、その結果が `validateAsset` を通ること（migrate → 検証のパイプラインが現行データで成立する）。
  - 現行より新しい version（例 `'0.1.1'`）の asset が `migrateAsset` で `MigrationError`（新しい形式）になり、かつ入力オブジェクトが破壊されないこと（新形式拒否 + 元ファイル温存）。
  - 非前進の移行手順（`to <= from`）が `MigrationError`（バージョンが進んでいない）になること（決定 2 (i)。既存 `migrate.test.ts` が固定していない不変条件）。

## 現状の制限

- 現行の全移行手順配列は空であり、実際の version 進行（0.1.0 → 次）を伴う migration はまだ一度も書かれていない。本 ADR は「移行手順を書くときの契約」を先に固定するもので、具体的な変換ロジックの検証は最初の version 進行 PR で行う。
- `.casproj` バンドル内で 3 文書が異なる version を持つ組み合わせの migration は、現行 fixture（すべて 0.1.0）では検証されていない。複数 version の混在は最初の version 進行 PR の fixture で扱う。
- down-convert（新→旧）と、複数アセットにまたがる原子的 rollback は範囲外（前者は本 ADR で非対応と決定、後者は ADR-0006 / `2D-1B-STORAGE` / `2D-1B-RECOVERY`）。

## 再検討条件

最初に version を上げる（移行手順を追加する）PR は、決定 7 の gate / fixture 要件（§13 完了条件 + ADR-0011 導入 gate）を満たし、`migrate.ts` の該当 `*_MIGRATIONS` への手順追加・`CURRENT_*_VERSION` 更新・schema 変更・`DATA_FORMAT.md` / `EXPORT_FORMATS.md` / 対象別 matrix / tests の同時更新・Opus 4.8 設計レビュー + 人間確認を経てから着手する。version 採番の意味（決定 1）や新形式の拒否粒度（決定 4）、migrate と検証の順序（決定 5）を変更する場合も、互換性・移行リスクへの影響が大きいため別 PR + Opus 4.8 レビュー + 人間確認とする。`.casproj` の可搬正本としての version 付けや、複数 version 混在バンドルの扱いを設計する場合は `2D-1B-CASPROJ` の設計 PR で扱う。

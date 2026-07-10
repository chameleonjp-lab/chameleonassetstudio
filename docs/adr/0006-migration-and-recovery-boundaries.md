# 0006-migration-and-recovery-boundaries

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§13 形式変更と migration の gate、§3 将来のデータの層）
関連 fixture: `src/core/model/contract.fixtures.test.ts`（ADR-0001/0006）

---

## 文脈

保存基盤（`2D-1B-STORAGE`）の実装前に、migration の入口挙動と、復旧境界（原子的置換、復旧点、破損 import の隔離、未知 version の扱い、IndexedDB とローカル可搬正本の関係）の骨子を決めておく必要がある。骨子が無いまま保存機能を作ると、途中失敗時に参照整合が壊れた中間状態が正本に残る危険がある。

## 決定

形式変更 gate は契約 §13 のリストを正とする（`asset.json` / `project.json` / export settings の version、`.casproj` 構成、座標・origin・anchor・collider・frame・animation・rig の意味、`AssetType` / Collider union / Frame・Animation の構造、export ZIP の既存ファイル・atlas 座標・helper API、派生素材・履歴・検査記録の保存方式に触れる場合は、docs-only の次に別の設計 / migration PR + Opus 4.8 レビュー + 人間確認を必須にする）。

復旧境界の骨子（`2D-1B-STORAGE` の実装前提。(a)(d) は現行実装で既に成立、(b)(c)(e) は `2D-1B-STORAGE` で実装する）:

- (a) 保存はアセット単位の原子的置換とし、参照整合が壊れた中間状態を正本に残さない。現行 `saveAsset` / `saveProject`（`src/core/storage/projectStore.ts`）は、検証済みの `Asset` / `Project` オブジェクト全体を単一の IndexedDB `put` で置き換えており、部分書き込みは発生しない。**現状の制限**: 複数アセットにまたがるトランザクション的な原子性（例: 反転コピー生成と Blob コピーを 1 つの復旧単位にする）は未実装であり、`2D-1B-STORAGE` の対象とする。
- (b) 破壊的操作前の復旧点と削除復元は `2D-1B-STORAGE` で実装する。**現状の制限**: 現行実装に復旧点・ごみ箱・削除取り消しの永続化機構は無い（Undo / Redo はセッション内の履歴管理のみ）。
- (c) 壊れた・不正な import は一時領域で隔離し正本へ混ぜない。**現状の制限**: 現行 `importCasproj`（`src/core/storage/casproj.ts`）は明示的な隔離領域を持たないが、`project.json` / 各 `asset.json` を migrate + schema 検証してからメモリ上の `bundle` として返す設計のため、検証に失敗した時点で `CasprojError` を投げて処理を打ち切り、IndexedDB への書き込みは一切行わない。結果として「不正な import が正本を汚さない」という目的は現状の実装でも満たされているが、"隔離領域に残して原因調査できる" という積極的な隔離は無く、`2D-1B-STORAGE` で明示化する。
- (d) 未知の将来 version は読み込みを拒否し元ファイルを温存する。現行 `migrateAsset` / `migrateProject`（入口: `migrateDocument`、`src/core/model/migrate.ts`）は、`compareVersions(version, currentVersion) > 0` の場合に `MigrationError` を投げて処理を止める。呼び出し側（`saveAsset` 等）は例外発生時に何も書き込まないため、元ファイルは自動的に温存される。
- (e) IndexedDB はローカル作業コピーであり、可搬正本は `.casproj`（`src/core/storage/casproj.ts` の `exportCasproj` / `importCasproj`）である。この関係は契約 §3 の記述と一致し、現行実装済みである。

`2D-1B-STORAGE` の実装 PR は、旧データ fixture・unit test・読み込み後の書き出し確認（roundtrip）を必須とする。

## 根拠

- `migrateDocument`（`src/core/model/migrate.ts`）のバージョン比較ロジックと、既存テスト `src/core/model/migrate.test.ts`（`999.0.0` を新形式として拒否する既存ケース）。
- `saveAsset` / `saveProject`（`src/core/storage/projectStore.ts`）が検証後に単一 `put` のみを行う実装。
- `importCasproj`（`src/core/storage/casproj.ts`）が migrate + validate に失敗した時点で例外を投げ、`bundle` を返さない実装。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §13, §3。
- 影響実装（現状維持、`2D-1B-STORAGE` で拡張予定）: `src/core/model/migrate.ts`、`src/core/storage/projectStore.ts`、`src/core/storage/casproj.ts`。
- fixture: `src/core/model/contract.fixtures.test.ts` の ADR-0001/0006 セクションで、現行 version の `asset.json`（サンプル）を `migrateAsset`（入口関数）へ通しても座標・構造が一切変わらないこと（deep equal）と、未知の将来 version（例 `'99.0.0'`）が `MigrationError` になることを固定する。

## 再検討条件

複数アセットにまたがる原子的操作、復旧点・削除復元、import 隔離領域の具体的な保存方式を設計する場合は、`2D-1B-STORAGE` の設計 PR で Opus 4.8 の互換性・移行リスクレビューと人間確認を経てから着手する。

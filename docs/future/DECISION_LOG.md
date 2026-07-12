# Decision Log

最終更新日: 2026-07-12
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
文書種別: 重要方針の変更経緯・決定記録
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md`, `docs/IMPLEMENTATION_PLAN.md`

---

## 1. 目的

この文書は、Chameleon Asset Studio の大きな方針変更や重要判断を、あとから Claude Code、Codex、Opus 4.8、人間が追跡できるように残す。

仕様や実装計画を変える時は、該当 docs を更新するだけでなく、なぜ変えたか、何をしないと決めたか、何が未確定かをここに残す。

---

## 2. 記録ルール

新しい判断は、次の形式で追記する。

```md
## ADR-YYYY-MM-DD-NNN: タイトル

### 状態

- proposed / accepted / superseded

### 背景

-

### 決定

-

### しないこと

-

### 影響する文書

-

### 未確定事項

-
```

`accepted` は、その判断を今後の docs / 実装レビューの前提にするという意味である。実装済みという意味ではない。

---

## ADR-2026-07-07-001: Codex 主実装と Opus 4.8 レビューで進める

### 状態

- accepted

### 背景

`claude-fable-5` に依存しない開発運用が必要になった。実装、CI、設計レビュー、修正、最終 merge 判断を分けないと、モデルごとの役割が曖昧になり、互換性破壊や docs 矛盾が起きやすくなる。

### 決定

- 通常の主実装は Codex が担当する。
- Claude Code Opus 4.8（`claude-opus-4-8`）は設計レビューと高難度判断を担当する。
- Claude Sonnet 系は、必要時の補助として扱う。
- `claude-fable-5` は使わない。
- 最終 merge は人間が判断する。
- CI 成功後に Opus 4.8 レビューを行う方針にする。ただし、Opus review workflow は現時点では未実装である。

### しないこと

- CI が失敗している PR に、Opus 4.8 の深いレビューを走らせない。
- 自動 merge を前提にしない。
- API key を docs や workflow に書かない。

### 影響する文書

- `docs/future/FABLELESS_DEVELOPMENT_GUIDE.md`
- `docs/future/CODEX_OPUS_AUTOMATION_WORKFLOW.md`
- `REVIEW.md`
- `README.md`

### 未確定事項

- Opus 4.8 review workflow の実装方式。
- Opus 4.8 レビュー結果を GitHub required check として扱うか。

---

## ADR-2026-07-07-002: Chameleon を画像取り込み専用ではなく、アセット作成・編集・修正・検品・書き出しツールとして扱う

### 状態

- accepted

### 背景

既存 docs では、Chameleon Asset Studio は 2D ブラウザゲーム用アセット制作ツールとして定義されている。これは正しい。しかし、実装者が「画像を取り込んでゲーム用 JSON に変換するツール」と狭く解釈する可能性がある。

ブラウザゲーム以外の主要ゲーム開発でも使うには、画像取り込みだけでは足りない。空キャンバス、テンプレート、図形、パーツ、既存素材の修正、sprite sheet / tileset の再整理、書き出しプリセットが必要になる。

### 決定

- 画像取り込みは、作成入口の 1 つとして扱う。
- Chameleon の長期的な役割は、ゲーム用アセットを作成、編集、修正、検品し、外部ツールへ持ち込めるファイル一式として書き出すことである。
- 機能は `Create / Import / Edit / Repair / Game Data / Validate / Export / Reopen` に分けて整理する。
- 作成可能ファイル、入力ファイル、出力ファイル、export preset を明確に分ける。
- 詳細は `docs/future/ASSET_CREATION_AND_EXPORT_STRATEGY.md` に定義する。

### しないこと

- 既存 Phase 1〜17 の完了条件を、この判断だけで勝手に広げない。
- `asset.json`、`.casproj`、export ZIP、schema をこの docs 変更だけで変えない。
- 画像編集ソフトや総合ゲームエンジンの代替を目指さない。

### 影響する文書

- `docs/future/ASSET_CREATION_AND_EXPORT_STRATEGY.md`
- `docs/future/PRODUCT_DIRECTION_2D_TO_3D.md`
- `docs/future/README.md`
- `README.md`

### 未確定事項

- 空キャンバスとテンプレートの初期 UI。
- sprite sheet / tileset import の優先度。
- `ui / icon` を正式な `assetType` にするか。
- Export Preset 管理 UI の実装時期。

---

## ADR-2026-07-07-003: Unity / Godot / RPG Maker / Blender は直接連携よりファイル出力を優先する

### 状態

- accepted

### 背景

主要なゲーム開発ツールで使えるようにするには、Unity、Godot、RPG Maker、Blender などとの関係を考える必要がある。ただし、最初から plugin、addon、project file 生成、direct API integration を作ると、実装量と検証量が大きくなる。

多くの場合、まず必要なのは、外部ツールへアップロードまたは手動 import できるファイルと説明である。

### 決定

- 初期の外部ツール連携は、`import notes` と `file preset` を優先する。
- `verified preset` を名乗るには、対象ツール名、対象バージョン、検証日、検証手順を docs に残す。
- Unity / Godot は、最初は PNG / Sprite Sheet / metadata / import-notes.md を出す。
- RPG Maker は、バージョンごとに素材規則が違う可能性があるため、version-specific preset として扱う。
- Blender は、2D では texture / material preparation、3D では Blender から export された GLB / glTF を読む方針にする。

### しないこと

- Unity Prefab 完全生成を初期実装に含めない。
- Godot Scene 完全生成を初期実装に含めない。
- RPG Maker のバージョンを未指定にしたまま「対応」と言わない。
- `.blend` 生成や Blender addon を初期実装に含めない。
- 外部ツールのプロジェクトファイルを、仕様確認なしに生成しない。

### 影響する文書

- `docs/future/ASSET_CREATION_AND_EXPORT_STRATEGY.md`
- `docs/future/PRODUCT_DIRECTION_2D_TO_3D.md`
- `docs/future/POST_PHASE17_REQUIREMENTS.md`
- `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`

### 未確定事項

- Unity の最初の検証対象バージョン。
- Godot の最初の検証対象バージョン。
- RPG Maker の最初の検証対象バージョン。
- Blender 向けに material-notes.md をどこまで書くか。

---

## ADR-2026-07-07-004: 2D と 3D は同じテイストの別画面にする

### 状態

- accepted

### 背景

2D と 3D は、どちらもゲーム用アセット制作に関わるが、扱うデータ、座標、編集対象、検品内容、書き出し内容が大きく違う。同じ編集画面に混ぜると、UI もデータ形式も複雑になり、2D の完成度を下げる危険がある。

### 決定

- 2D と 3D は同じ Home / Project Dashboard を共有してよい。
- 2D Studio と 3D Asset Preparation は別画面にする。
- 見た目、言葉遣い、export preset、validation / inspection の考え方はそろえる。
- 3D は、生成 AI ではなく GLB / glTF の読み込み、表示、検品、metadata、書き出しから始める。
- 詳細は `docs/future/PRODUCT_DIRECTION_2D_TO_3D.md` に定義する。

### しないこと

- 2D の `Layer`、`Frame`、`Animation` の意味を 3D 都合で変えない。
- 3D preview の重い dependencies を 2D 初期表示 bundle に混ぜない。
- 3D 生成 AI を初期依存にしない。

### 影響する文書

- `docs/future/PRODUCT_DIRECTION_2D_TO_3D.md`
- `docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md`
- `docs/future/ASSET_CREATION_AND_EXPORT_STRATEGY.md`

### 未確定事項

- 3D Mode の routing。
- 3D Mode の lazy load 実装方式。
- 3D dependencies の分離方式。

---

## ADR-2026-07-07-005: リポジトリは当面同一にし、分離条件を明文化する

### 状態

- accepted

### 背景

2D と 3D を将来的に分けたくなる可能性はある。特に、3D dependencies、Python / GPU 処理、外部生成モデル、CI の重さ、ライセンス確認が増えると、同一リポジトリ管理が重くなる。

一方で、今すぐ分けると docs、CI、レビュー運用、UI 方針が分断され、2D 完成の妨げになる。

### 決定

- 当面は同一リポジトリで進める。
- 3D はまず同一リポジトリ内の別画面、別 feature boundary として扱う。
- 3D dependencies が 2D bundle size や CI に悪影響を出したら、lazy load、package 分離、別 repo を検討する。
- Python / GPU / 外部生成モデルが必要になった場合は、3D external processor として別 repo を検討する。

### しないこと

- 今すぐ 2D / 3D リポジトリを分けない。
- repo 分離を目的化しない。
- repo を分けないことを理由に、2D / 3D の境界を曖昧にしない。

### 影響する文書

- `docs/future/PRODUCT_DIRECTION_2D_TO_3D.md`
- `docs/future/ASSET_CREATION_AND_EXPORT_STRATEGY.md`
- `docs/future/README.md`

### 未確定事項

- package 分離の単位。
- 3D の外部処理を置く repo 名。
- 3D CI の分離方式。

---

## ADR-2026-07-07-006: Phase 19-C は判定編集を docs-first で進め、多角形判定は別判断に分離する

### 状態

- accepted

### 背景

Phase 19-C「判定編集強化」では、多角形判定の追加検討と rect / circle 編集 UI 改善が同時に候補になっている。多角形判定をすぐ実装すると、`asset.json` schema、TypeScript 型、`.casproj`、export ZIP、Canvas / PixiJS / Phaser helper、Unity / Godot / RPG Maker import notes、migration、E2E に横断影響する。

### 決定

- Phase 19-C はまず docs-first で設計を整理する。
- Phase 19-C の次実装 PR では、多角形判定を後続フェーズに回し、既存 rect / circle の編集 UI と用途別表示の改善を優先する。
- 多角形判定を入れる場合は、別の docs / schema / DATA_FORMAT / EXPORT_FORMATS / migration / tests 設計 PR を作り、Opus 4.8 設計レビューと人間確認を通してから実装へ進む。

### しないこと

- この判断だけで `asset.json` version、JSON Schema、TypeScript 型、`.casproj` 構造、export ZIP 構成を変更しない。
- Codex だけで多角形判定を実装まで進めない。
- 既存 rect / circle の意味、座標系、`visible` の意味を変えない。

### 影響する文書

- `docs/future/COLLIDER_EDITING_DESIGN.md`
- `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`
- `docs/future/README.md`

### 未確定事項

- 多角形判定を正式に入れるか。
- 入れる場合の schema、version、migration、helper API、engine import notes の範囲。

---

## ADR-2026-07-10-007: 3D より先に 2D Pro Gate を定義して通す

### 状態

- accepted

### 背景

既存の Phase 19〜21 は、2D の編集・書き出し品質を改善するための重要な土台である。しかし、空キャンバス作成、テンプレート、素材修正、派生素材、型別の検査、対象別の検証済み出力、PC / iPad / スマホの保存・復旧までを「2D 完成」として判定する条件は、1つの上位仕様にまとまっていなかった。

旧 Phase 22〜28 は、Phase 21 の後に 3D 調査へ進む順番になっていた。この順番では、2D が画像取り込み中心の基礎ツールのまま 3D を混ぜる危険がある。

### 決定

- 2D 完成形を、`2D_COMPLETE_PRODUCT_SPEC.md`、`2D_ASSET_DATA_CONTRACT.md`、`2D_EXPORT_COMPATIBILITY_MATRIX.md`、`2D_DEVICE_RELIABILITY_SPEC.md`、`2D_COMPLETION_ROADMAP.md` の5文書で定義する。
- 今後の 2D 拡張は、作成・修正・ゲーム用情報・検査・対象別出力・再編集・端末信頼性を一続きの制作体験として扱う。
- 旧 Phase 22〜28 の 3D 実装、library 評価、dependency 追加は、2D Pro Gate を人間が承認するまで開始しない。
- 3D は削除せず、gate 通過後に `3D-0`〜`3D-6` として別画面・別データ境界で再開する。
- 現在の `asset.json`、`.casproj`、export ZIP、JSON Schema、dependencies、アプリ本体は、この docs-only 判断では変更しない。

### しないこと

- 5文書を書いたことだけで、空キャンバス、template、polygon、frame 別判定、target preset、復旧、3D を実装済みと扱わない。
- Unity / Godot / RPG Maker / Blender の互換を、対象バージョンと証拠なしに名乗らない。
- 3D 都合で 2D の型、座標、保存、出力を変えない。
- アカウント、クラウド、課金、共同編集、3D 生成 AI を 2D 完成の前提にしない。

### 影響する文書

- `README.md`
- `docs/REQUIREMENTS_SPECIFICATION.md`
- `docs/future/README.md`
- `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`
- `docs/future/PRODUCT_DIRECTION_2D_TO_3D.md`
- `docs/future/ASSET_CREATION_AND_EXPORT_STRATEGY.md`
- `docs/future/OPEN_ITEMS.md`
- 新設する5文書

### 未確定事項

- `Asset Family` / variant、操作履歴、frame 別判定、polygon、target extension の正確な保存形式。
- 最初に `verified` とする Unity / Godot / RPG Maker の対象バージョンと素材種別。
- 復旧点、削除復元、オフライン再起動、性能 budget の実装方式。
- 2D Pro Gate の実機・外部ツール検証を誰がいつ承認するか。

---

## ADR-2026-07-10-008: 2D 完成は Fable5・Codex・Opus 4.8 の Hybrid Roadmap Mode で進める

### 状態

- accepted

### 背景

2D 完成ロードマップは、データ契約、保存、作成・修正、ゲーム用情報、書き出し、対象別検証、端末品質まで長期間にわたる。すべてを1モデルへ任せると、Fable5 の利用量が増えるか、Codex が未確定仕様を判断するか、Opus 4.8 が実装とレビューを兼ねて責務が曖昧になる。

また、全段階を完全な直列で進めると遅い一方、schema、`.casproj`、export contract を複数 PR で同時変更すると競合と互換性事故が起きる。

### 決定

- `docs/future/2D_COMPLETION_ROADMAP.md` の標準運用を Hybrid Roadmap Mode とする。
- Claude Code / Fable5 は、段階開始時の仕様、優先順位、UX、データ境界、複雑な trade-off の判断に限定する。
- Codex は、判断済み work package の code、tests、docs、draft PR、CI 修正を担当する。
- Claude Code / Opus 4.8 は、CI 成功後に review-only で仕様違反、UI / UX、互換性、test gap、将来リスクを確認する。
- Opus 4.8 の `BLOCKER` / `MUST` は merge を止め、Codex が同じ PR で修正する。最終 merge は人間が判断する。
- 契約変更は同時に1 PRだけ進める。独立した機能と品質・検証は、ロードマップの条件内で並行してよい。
- open の実装 PR は原則最大3本とし、契約、機能、品質・検証の各レーンに分ける。

### しないこと

- Fable5 にファイル探索、長い差分確認、通常実装、CI 修正をさせない。
- Opus 4.8 に通常実装をさせない。CI 失敗中の PR を繰り返しレビューさせない。
- Codex に未確定の schema、migration、`.casproj`、export contract、外部 dependency を推測で決めさせない。
- 同じ目的の修正を新しい PR へ細分化し直さない。
- Fable5 が利用できないことを理由に、Opus 4.8 または Codex が仕様の最終判断を代行しない。

### 影響する文書

- `docs/DEVELOPMENT_MODES.md`
- `CLAUDE.md`
- `AGENTS.md`
- `docs/future/2D_COMPLETION_ROADMAP.md`

### 未確定事項

- 各 work package の ID と具体的な着手順。
- CI 成功後の Opus 4.8 review gate を GitHub Actions で自動化する時期。
- 実作業で conflict が増えた場合の並行数の再調整。

---

## ADR-2026-07-10-009: 2D-1A-CONTRACT: ADR 0001〜0007 で契約境界を確定（docs/adr/）

### 状態

- accepted

### 背景

`2D_COMPLETION_ROADMAP.md` の work package `2D-1A-CONTRACT`（段階 2D-1a）として、`2D_ASSET_DATA_CONTRACT.md` のうちデータ層 / ID・参照・variant / 座標・trim・flip・scale / migration・復旧境界に関わる決定を、実装前に固定する必要があった。これらは `2D-1B-STORAGE` 以降の保存基盤実装の前提になるため、docs だけでなく現行実装の意味を fixture テストで数値として固定した。

### 決定

- `docs/adr/` を新設し、0001〜0007 の ADR を作成した（座標と変形の意味、ID・名前・参照の規則、Variant・派生アセットの解釈、trim・atlas・scale の出力層の意味、左右反転の意味、migration・復旧境界、データ層の分離）。
- 各 ADR は `docs/future/2D_ASSET_DATA_CONTRACT.md` の該当章を規範とし、現行実装（`layerWorldPoint`、`flipCopyAsset`、`computeSheetLayout` / `buildAtlas`、`migrateAsset` 等）のどの関数がその意味を体現しているかを明示した。
- `src/core/model/contract.fixtures.test.ts` と `src/core/export/contract.fixtures.test.ts` を新規作成し、ADR-0001・0002・0004・0005・0006 の数値を独立した fixture として固定した。既存テストの期待値は変更していない。

### しないこと

- 製品コード、JSON Schema、`src/core/samples/` の既存ファイル、既存テストの期待値、version、dependencies は変更しない。
- `Asset Family` / `Variant`、可変フレーム時間、frame 別判定、polygon、trim / scale / padding の実装、保存基盤（`2D-1B-STORAGE`）は本 work package に含めない。

### 影響する文書

- `docs/adr/README.md`, `docs/adr/0001-*.md` 〜 `docs/adr/0007-*.md`
- `docs/future/2D_ASSET_DATA_CONTRACT.md`（参照のみ、内容変更なし）
- `docs/future/README.md`

### 未確定事項

- `2D-1B-STORAGE`（保存基盤）の具体的な実装方式（原子的操作の範囲、復旧点、import 隔離領域）。
- `Asset Family` / `Variant` を導入する場合の additive 設計の詳細。

---

## ADR-2026-07-10-010: 2D-1B-STORAGE: DB v2（additive）とごみ箱・復旧点・quarantine を実装

### 状態

- accepted

### 背景

`2D_COMPLETION_ROADMAP.md` の work package `2D-1B-STORAGE`（段階 2D-1b）として、ADR-0006・ADR-0007 が骨子として残していた復旧境界 (b)(c)(e) を実装した。「保存が途中で失敗しても整合した状態が残る」「プロジェクトを誤削除してもごみ箱から戻せる」「破壊的画像編集の前の状態へ復旧できる」「容量不足と壊れた `.casproj` が理由付きで安全に扱える」という体験を、既存の `asset.json` / `.casproj` / export ZIP / JSON Schema / version を一切変えずに満たす必要があった。

### 決定

- IndexedDB の `DB_VERSION` を 1 → 2 にし、`trash` / `snapshots`（index `byAsset`） / `quarantine` の 3 store を追加した（`src/core/storage/db.ts`）。既存の `projects` / `assets` / `blobs` ストアとレコード形式は変更していない（additive のみ）。v1 相当データを v2 コードで開いても無変換で読めることを unit test で固定した。
- `saveProjectBundle`（project + assets[] + blobs[]）を新設し、Blob → ArrayBuffer 変換をトランザクション開始前に済ませたうえで、projects / assets / blobs への put を単一トランザクションにまとめた（`src/core/storage/projectStore.ts`）。`HomeScreen.tsx` の `.casproj` 読み込みと、`EditorScreen.tsx` の左右反転コピー保存経路を、この関数へ置き換えた。`runTransaction`（`src/core/storage/db.ts`）は、コールバック内で例外（IndexedDB の同期例外を含む）が起きた場合にトランザクションを明示的に `abort()` するよう変更し、途中失敗時に一部だけがコミットされないことを fail-injection unit test で固定した。
- `deleteProject` の意味を「完全削除」から「ごみ箱へ移動」へ変更した。project / assets は正本ストアから削除するが、画像 Blob は削除せず、`trash` レコードが project + assets のスナップショットを保持する。ごみ箱は最大 5 件（`TRASH_LIMIT`）で、超過時は同一トランザクション内で最も古いプロジェクトを完全削除する（画像 Blob・当該プロジェクトの `snapshots` も含めて削除）。`listTrash` / `restoreProject` / `purgeTrash` / `purgeAllTrash` を追加し、`HomeScreen.tsx` に「ごみ箱」セクション（復元・完全削除・空にする）を追加した。削除確認ダイアログの文言を「ごみ箱へ移動します。ごみ箱から復元できます。」に変更した（既存 E2E は文言を検証しておらず、確認ダイアログを承認する挙動のみ検証しているため、既存テストの期待値変更は発生していない）。
- 破壊的画像編集（トリミング・消しゴム・色調整・パレット置換・輪郭線）の直前状態を「復旧点」として `snapshots` store に保存する（`saveSnapshot` / `listSnapshots` / `restoreSnapshot`、`src/core/storage/snapshotStore.ts`）。アセットあたり最大 3 件で、超過分は同一トランザクション内で最古から削除する。復元は Blob を書き戻したうえで、既存の `commitAssetChange`（履歴）経路に「復旧点から復元」として乗せ、セッション内 Undo できるようにした。プロジェクトがごみ箱にある間は復旧点を保持し（復元後も Undo 可能にするため）、完全削除（`purgeTrash` / `purgeAllTrash` / ごみ箱上限超過の自動 purge）のタイミングで、そのプロジェクトの全アセットの復旧点をまとめて削除する。
- `DOMException.name === 'QuotaExceededError'`（または legacy `code === 22`）を `src/core/storage/db.ts` で検出し、`StorageError` のメッセージを「保存容量が不足しています。ごみ箱を空にするか、不要なプロジェクトを削除して空き容量を確保してください。」に統一した。既存の `AutosaveQueue` の「保存失敗: …」表示にそのまま流れることを確認した。
- 壊れた・不正な `.casproj` の読み込み失敗時、正本ストアには一切書き込まず、`quarantine` store に `{ fileName, importedAt, errorMessage, size, bytes? }` を保存する（`src/core/storage/quarantineStore.ts`）。最新 3 件のみ保持し、50MB を超えるファイルは `bytes` を保存せず理由とサイズだけ残す。`HomeScreen.tsx` に「読み込みに失敗したファイル」一覧（削除ボタン付き）を追加した。
- `deleteAsset`（現状 UI 未使用）が assets ストアのみ削除し、`${assetId}/` prefix の画像 Blob を孤児として残していたバグを修正した。
- `src/core/storage/__fixtures__/` に v0.1.0 の最小プロジェクト（project.json + asset.json + 8x8 PNG）を fixture として追加し、fflate で組み立てた `.casproj` → `importCasproj` → `exportCasproj` → 再 import の roundtrip を unit test で固定した（ADR-0006 が要求する「旧データ fixture・unit test・roundtrip 確認」）。

### しないこと

- `asset.json` / `.casproj` / export ZIP / JSON Schema / version の変更。
- プロジェクト以外（アセット単位）のごみ箱 UI、quarantine からの再 import、revision 履歴 UI、自動バックアップ、GC スケジューラ、`.casproj` 形式変更。
- `saveAssetWithBlobs`（asset 単位の原子的保存関数）の実装。ハンドオフでは `saveProjectBundle` の代替として提示されていたが、実際に置き換えが必要だった 2 箇所（`.casproj` 読み込み、左右反転コピー）はどちらも project 側の更新も伴うため、`saveProjectBundle` のみで要件を満たせた。将来、project を伴わないアセット単位の原子的保存が必要になった時点で追加する。

### 影響する文書

- `docs/USER_GUIDE.md`（8.1〜8.4: ごみ箱・復旧点・容量不足・quarantine）
- `docs/DATA_FORMAT.md`（3.1: IndexedDB store 一覧、DB v2）
- `docs/adr/0006-migration-and-recovery-boundaries.md` / `0007-data-layer-separation.md`（参照のみ、内容変更なし。骨子 (b)(c)(e) の実装が本 ADR）

### 未確定事項

- ごみ箱・復旧点・quarantine の上限件数（5 / 3 / 3）は初期値であり、実運用のフィードバックで見直す可能性がある。
- quarantine からの原因調査後の再 import 導線（現状は削除のみ）。
- アセット単位のごみ箱・復旧履歴の恒久 UI 化。
- ID prefix（`anim` と `animation` の不一致など）を将来統一するかどうか。

---

## ADR-2026-07-11-011: 2D-2-CREATE-01: 空キャンバスアセットの新規作成・削除

### 状態

- accepted

### 背景

`2D_COMPLETION_ROADMAP.md` の work package `2D-2-CREATE-01`（段階 2D-2、前提: 2D-1B-STORAGE）として、「画像がなくても、型とサイズを選んで空キャンバスのアセットを新規作成し、保存・再読込しても残り、間違えたら削除で戻せる」体験を実装した。既存の `Asset` / `Project` 型、JSON Schema、`.casproj` / export ZIP 形式、座標系は変更していない。

### 決定

- `src/core/model/factories.ts` に `createBlankAsset(options)` を追加した。既存 `createImageAsset` と同じ source / edit / thumbnail の 3 `TextureRef` 構成にし、中身はすべて透明画像として扱う（実際の Blob 生成はしない。Asset JSON 部分のみを組み立てる純関数で、DOM に依存せず unit test できる）。レイヤーは 1 枚（`layerType: 'image'`、position `{0,0}`、transform は既定）。原点は既存既定の下中央（要件 11.6、`{ x: width/2, y: height }`）。
- 型別テンプレートはコード定数の map（`AssetType → (Asset) => Asset`）として factories.ts 内に持たせ、`.casproj` / asset.json には一切出さない（保存されるのは「テンプレートを適用した結果」であるフィールド値だけで、テンプレートという概念自体は保存データに現れない）。現時点では `character` のときだけ starter の矩形当たり判定「body」を 1 つ追加し、他の型は空キャンバスのみにした。当たり判定の値（キャンバス中央、幅・高さの半分）は `factories.ts` の `createDefaultRectCollider(canvasSize, purpose)`（id を含まない値部分のみを返す純関数）に一本化し、`assetOps.ts` の `addRectCollider` とこのテンプレートの両方がそれを呼ぶ形にした（初期実装では計算式をローカルに複製していたが、Opus 4.8 レビューで重複定義の指摘を受けて解消した）。依存方向は既存どおり `assetOps.ts` → `factories.ts`（`generateId` を使うため）のままで、循環 import は発生しない。`factories.test.ts` に、テンプレートの collider が `addRectCollider(asset, 'body')` の結果と id 以外 deepEqual であることを固定する unit test を追加した。
- 透明 PNG の実体 Blob 生成は、`src/features/editor/blankAsset.ts`（UI 側ユーティリティ、`createBlankAssetBundle`）でブラウザの `document.createElement('canvas')` + `toBlob('image/png')` により行う。source / edit / thumbnail の 3 Blob は、空キャンバスで内容に差がないため同じ透明画像を使い回す（サムネイル用に別途生成しない）。
- `EditorScreen.tsx` の「アセット」欄に、名前 / 種別（既存 `AssetType` 全値） / サイズ（32 / 64 / 128 / 256 の正方形プリセット、既定 64）を指定する「新規アセットを作成」フォームを追加した。作成は `saveProjectBundle(project, [asset], blobs)`（2D-1B-STORAGE）で project 更新・asset・Blob を単一トランザクション保存する。アセット種別の表示名は `AssetTypePanel.tsx` の定義と重複させないため、`src/features/editor/assetTypeLabels.ts`（コンポーネントを含まない定数専用ファイル）に切り出して両方から参照する（`react-refresh/only-export-components` 警告を避けるため）。
- 同じ「アセット」欄に「アセットを削除」ボタンを追加した。`window.confirm` の確認後、まず `autosave.flush()` で保留中の自動保存（数値編集などの 800ms デバウンス保存）を完了させてから `deleteAsset`（2D-1B-STORAGE で Blob・復旧点も削除するよう修正済み）を呼び、project 側の `assets` 参照も外して保存する。`flush()` を先に呼ばないと、判定の数値編集直後にすぐ削除した場合、削除後にデバウンス済みの保存タスクが発火して削除済みアセットを IndexedDB へ書き戻してしまう競合が起きる（Opus 4.8 レビュー指摘、`e2e/create.spec.ts` に回帰テストを追加し、`flush()` を外すと実際に失敗することを確認済み）。削除ボタンは実行中 `disabled`（`deletingAsset` state）にし、多重クリックを防いでいる。最後の 1 件を削除してもアセット 0 件の状態を許可し、アセット一覧に「アセットがありません。画像を取り込むか、新規アセットを作成してください。」という空状態を表示するようにした（既存 UI は 0 件時の表示を既に持っていたため、文言のみ変更）。
- アセットの新規作成・削除はどちらも **Undo / Redo の対象外**にした。理由は、既存の Undo/Redo（`History`）がアセット内部の変更（layers / colliders 等）を対象にした設計であり、プロジェクトのアセット一覧という別レイヤーの操作をそこへ混在させると、Undo で「削除したはずのアセットが復活する」「作成したはずのアセットが消える」といった一覧とキャンバス選択の整合が壊れやすいため。削除は確認ダイアログで誤操作を防ぐ。
- 新規作成フォームのラベルは「新規アセット名」「新規アセットの種別」「新規アセットのサイズ」とし、既存の「アセット種別」（`AssetTypePanel`）や、アンカー行の「名前」などの既存ラベルと部分一致で衝突しない文言にした（E2E の `getByLabel` が意図せず複数要素にマッチしないようにするため）。

### しないこと

- ブラシ・図形・文字などの描画ツールの追加。
- Family / Variant の実装。
- テンプレート定義自体の保存形式化（`.casproj` / asset.json への追加フィールド化）。
- `ui` / `icon` の `AssetType` 追加。
- プロジェクト新規作成フロー（プロジェクト作成フォーム）の変更。
- `Asset` / `Project` / `Layer` / `Animation` 型、JSON Schema、`.casproj` 形式、export ZIP 構成、座標系、既存テストの期待値の変更。

### 影響する文書

- `docs/USER_GUIDE.md`（2.1 / 2.2: 新規アセット作成・削除、Undo 対象外である旨）

### 未確定事項

- character 以外のテンプレート（item の score/rarity 既定値の自動付与、tile の既定 tileSize 自動付与など）を新規作成時にも適用するかどうかは未定（既存の `AssetTypePanel` の「テンプレートを適用」ボタンで後付けできるため、本 work package では見送った）。
- 新規作成フォームのキャンバスサイズを正方形プリセット以外（矩形・自由入力）にも広げるかどうか。
- character 以外の種別にも starter 当たり判定・アンカーを用意するかどうか。
- `handleDeleteAsset` は `deleteAsset`（asset + Blob + 復旧点、単一トランザクション）と `saveProject`（project の `assets` 参照更新）を別々の非同期呼び出しで行っており、両者の間は原子的ではない（間で保存に失敗すると、asset は消えたが project の参照だけ残る不整合が理論上あり得る）。Opus 4.8 レビューで指摘されたが、本 work package では実装しない。将来 `deleteAssetBundle(project, assetId)` のような project + asset を単一トランザクションで扱う関数を追加するかどうかは未定（`saveProjectBundle` の削除版に相当）。

## ADR-2026-07-11-012: PR #53・PR #55の先行実装と再監査方針

### 状態

- accepted

### 背景

PR #54 のロードマップ整合中に、PR #54 作成後の main へ PR #53（`2D-1B-STORAGE`）と PR #55（`2D-2-CREATE-01`）が先行して merge 済みであることを反映する必要が出た。両 PR は有用な実装を含むが、詳細 2D 契約 Gate の順序より先に入っているため、ロードマップ上では完了扱いではなく provisional / ahead-of-gate として扱う。

### 決定

- PR #53・PR #55はrevertしない。
- 詳細契約Gateより先にマージされたprovisional実装として扱う。
- 残りの2D-1A契約後に再監査する。
- 2D-1B-GATEは未完了。
- 2D-2-CREATE全体は未完了。
- 再監査まで追加の2D-1B / 2D-2 / 2D-3本実装を停止する。
- 次の契約作業は2D-1A-MOTION。

### しないこと

- PR #53・PR #55 の実装を revert しない。
- 先行実装を理由に `2D-1A-MOTION`、`2D-1A-TARGET`、`2D-1A-PROVENANCE`、`2D-1A-VALIDATION`、詳細 `2D-1A-MIGRATION`、`2D-1B-GATE`、`2D-2-CREATE` 全体、`2D-2-PROJECT` を完了扱いにしない。
- 未確定契約を Codex が独断で accepted にしない。
- 追加の 2D-1B / 2D-2 / 2D-3 本実装を、再監査前に進めない。

### 影響する文書

- `docs/IMPLEMENTATION_PLAN.md`
- `docs/future/2D_COMPLETION_ROADMAP.md`
- `docs/future/DECISION_LOG.md`

### 未確定事項

- `2D-1A-MOTION` 以降の契約判断。
- PR #53 の provisional 実装を、残る 2D-1A 契約後にどの PR で再監査・不足補完するか。
- PR #55 の partial `2D-2-CREATE` を、`2D-1B-GATE` 後にどの単位で completion へ進めるか。

---

## ADR-2026-07-11-014: 2D-1A-MOTION: ADR 0008〜0011 で animation event・可変時間・rig bake・frame別上書き・polygon の契約境界を確定（docs/adr/）

背景（番号注記）: `ADR-2026-07-11-013` は、closed PR #58 のブランチ上に残る proposed 実装記録として欠番とする（PR #58 は main へ取り込まれておらず、その番号を本 Decision Log では使用しない。番号衝突防止のための記録であり、PR #58 の内容を本決定へ引き継ぐものではない）。

### 状態

- accepted

### 背景

`2D_COMPLETION_ROADMAP.md` の work package `2D-1A-MOTION`（段階 2D-1a、前提: `2D-1A-LAYERS` / `2D-1A-COORD` accepted、`docs/adr/0001`〜`0007`）として、`2D_ASSET_DATA_CONTRACT.md` §8（アニメーションとイベント）・§9（当たり判定）のうち、animation event・可変フレーム時間・rig bake の正本関係・frame 別判定上書き・polygon の**契約境界**を、実装前に固定する必要があった。これらは `2D-1A-MIGRATION` 以降の schema 拡張や `2D-3-COLLIDER-OVERRIDE` / `2D-3-POLYGON`（いずれも判断必須区分）の前提になるため、docs だけでなく現行実装（`Animation.durationMs`、`RigAnimation` / `bakeRigAnimation`、`buildAtlas`、各 export helper、JSON Schema の `additionalProperties` 未指定）の挙動を fixture テストで数値として固定した。製品機能（`events` / frame `durationMs` / `colliderOverrides` / polygon）は今回実装しない。

### 決定

- `docs/adr/0008-motion-time-semantics.md`: 再生・export の時間の正本は fps × フレーム数であり、`Animation.durationMs` は現行実装で未使用の休眠フィールド（informational）であることを固定した。将来の可変フレーム時間は frame 単位の optional `durationMs` 上書きとして導入し、`2D-1A-MIGRATION` 後の契約レーン別 PR（Opus 4.8 レビュー + 人間確認必須）とする。rig 編集データ（`rigAnimations`）ではなく bake 後の `Frame[]` / `Animation` が再生・export の正本であり、bake は一方向（bake 後に `rigAnimations` を変更しても既存 `frames` は変わらない）であることを固定した。
- `docs/adr/0009-animation-event-boundary.md`: 将来の `Animation.events?: Array<{ id, name, frameId, payload? }>`（optional・additive）の形、frame 表示開始時に発火する規則、frame の id 参照（dangling は `2D-1A-VALIDATION` の意味検証で検出）、名前によるゲームロジック実行禁止、payload の JSON 安全性、export への反映は既定で出さないことを境界として固定した（実装・schema 追加は本 work package の対象外）。
- `docs/adr/0010-collider-override-and-polygon-boundary.md`: 当たり判定の正本は `Asset.colliders`（アセット共通）のまま維持し、将来の上書きは frame 単位のみ（animation 単位は同じ frame を複数 animation が共有するため不採用）、上書き対象は位置・サイズ・`visible` のみ（追加・削除・`purpose`・`shape` 変更は不可）と固定した。polygon collider は unsupported を維持し、契約 §9.3 のチェックリストを満たす別設計 PR + Opus 4.8 レビュー + 人間確認まで `Collider` union に追加しないことを再確認した。
- `docs/adr/0011-motion-forward-compatibility.md`: 上記 3 つの将来フィールドはすべて optional・additive とし、既存 0.1.0 データは無変換・意味不変で読めることを固定した。現行 JSON Schema（`animation` / `frame` / `frameLayerState` / root）が `additionalProperties` を指定しておらず未知フィールドを許容する事実を記録しつつ、旧アプリの再保存時に未知フィールドが保持されるかは編集経路依存で保証しないこと、将来フィールド導入は (1) schema/docs 更新 (2) 旧データ fixture + roundtrip (3) flip/複製/export 影響テスト (4) Opus 4.8 レビュー + 人間確認、を満たす契約レーン別 PR でのみ行うことを固定した。
- `docs/adr/README.md` の一覧表に ADR 0008〜0011 を追記し、`docs/future/2D_ASSET_DATA_CONTRACT.md` §8.2・§9.2・§9.3 に「この項目は docs/adr/0008〜0011 で決定済み」という 1〜2 行の注記を追加した（本文は書き換えていない）。
- `src/core/model/motionContract.fixtures.test.ts` を新規作成し、(1) `durationMs` を持つ animation を `buildAtlas` へ通しても出力 `animations` のキー集合が `{name, fps, loop, frames}` のみであること、(2) `bakeRigAnimation` の frameCount 境界（1000ms×8fps=8、125ms×8fps=1、1ms×8fps=1 の `max(1, ...)` 下限）、(3) bake 後に `rigAnimations` を書き換えても既存 `frames` が変わらないこと、(4) `durationMs` の有無、および `events` / `colliderOverrides` のような未知フィールドを持つデータが現行 `validateAsset` を通ることを固定した。`rigAnimations` を反転コピーで省く現行挙動は既存 `src/core/model/flipCopy.test.ts:135`〜`144` で既に固定済みのため重複追加しなかった。

### しないこと

- `events` / frame `durationMs` / `colliderOverrides` / polygon の実装。
- JSON Schema の変更、`asset.json` / `project.json` の version 変更、`.casproj` 形式変更、export ZIP 構成変更。
- 製品コード（`src/core/model/`、`src/core/rig/`、`src/core/export/`、`src/features/`）の変更。既存テストの期待値変更。
- ロードマップの状態表更新（PR 承認時に別途行う）。
- PR #58（closed）の検査機能の取り込み。

### 影響する文書

- `docs/adr/0008-motion-time-semantics.md`, `docs/adr/0009-animation-event-boundary.md`, `docs/adr/0010-collider-override-and-polygon-boundary.md`, `docs/adr/0011-motion-forward-compatibility.md`
- `docs/adr/README.md`
- `docs/future/2D_ASSET_DATA_CONTRACT.md`（§8.2, §9.2, §9.3 の参照注記のみ、本文変更なし）

### 未確定事項

- `2D-1A-TARGET` / `2D-1A-PROVENANCE` / `2D-1A-VALIDATION` / 詳細 `2D-1A-MIGRATION` の契約判断。
- `events` / frame `durationMs` / `colliderOverrides` を実装する具体的な契約レーン別 PR の着手時期。
- 旧アプリの再保存経路（`assetOps.ts` 等）が未知フィールドを実際に保持するかどうかの個別確認（ADR-0011 が先取りしなかった論点）。

---

## ADR-2026-07-12-015: 2D-1A-TARGET: ADR-0012 で target 固有 extension と unknown data の契約境界を確定（docs/adr/）

### 状態

- accepted

### 背景

`2D_COMPLETION_ROADMAP.md` の work package `2D-1A-TARGET`（段階 2D-1a、前提: `2D-1A-MOTION` accepted、`docs/adr/0008`〜`0011`、PR #60 マージ済み）として、`2D_ASSET_DATA_CONTRACT.md` §10（対象別情報と拡張領域）・§11（入力の来歴・安全性）のうち、target 固有 extension と unknown data の扱いの**契約境界**を、実装前に固定する必要があった。現行 `Asset.gameAttributes`（自由 object）と `ExportPreset.target`（`generic` / `canvas2d` / `pixijs` / `phaser`）の既存構造を出発点に、将来の `Asset.extensions` を導入する前に、(a) 出力設定と (b) 素材固有メタデータの置き場所、および unknown data の read-preserve-ignore 規範を先に定めた。製品機能（`Asset.extensions` の実装・schema 追加）は今回実装しない。

### 決定

- `docs/adr/0012-target-extension-and-unknown-data.md`: target 固有情報を (a) 出力の都合・出力設定（`ExportPreset` 側）と (b) 素材そのものに紐づく target 固有メタデータ（将来の `Asset.extensions?`、`2D-1A-MIGRATION` 後の契約レーン別 PR + Opus 4.8 レビュー + 人間確認必須）に二層分離することを固定した。`extensions` の名前空間は kebab-case とし `chameleon` / `canvas2d` / `pixijs` / `phaser` / `unity` / `godot` / `rpgmaker-mz` を予約、値は JSON として安全に検証できるものに限り秘密情報の保存を禁止することを固定した。unknown data の規範を「読める・保持する・無視する（read-preserve-ignore）」とし、現行実装では未知フィールドは validator を通るが再保存時の保持は編集経路依存で保証されない事実（ADR-0011 の系）を引き継いだ。`gameAttributes` はゲーム内で意味を持つユーザー定義値専用のままとし、target 固有の出力調整値を新たに入れないことを規範化した。`extensions` は既定で atlas.json / export ZIP へ出さないこと、0.1.0 データは無変換のままであることも固定した。
- `docs/adr/0009-animation-event-boundary.md` の「影響と fixture」に、flip copy 時の `events[].frameId` の新 ID への張り替えは ADR-0010 の決定を参照する旨を 1 行追記した（遡及レビューのフォローアップ）。
- `docs/adr/README.md` の一覧表に ADR-0012 を追記した。
- `docs/future/2D_ASSET_DATA_CONTRACT.md` §10 に「この章の境界は docs/adr/0012 で決定済み」の注記を追加した（本文は書き換えていない）。
- `src/core/model/targetContract.fixtures.test.ts` を新規作成し、(1) ネストした値を持つ `gameAttributes` が `validateAsset` を通ること、(2) 未知 root フィールド `extensions` を持つ asset が現行 validator を通ること、(3) `extensions` 付き asset を `.casproj` の `exportCasproj` → `importCasproj` した実挙動として **未知 root フィールドが保持される**ことを固定し、その事実を ADR-0012 の「現状の制限」に記録した、(4) `EXPORT_TARGETS` の現行値集合 `['generic', 'canvas2d', 'pixijs', 'phaser']`、(5) `buildAtlas` の出力トップレベルキー集合に `gameAttributes` / `extensions` が含まれないことを固定した。

### しないこと

- `Asset.extensions` の実装・schema 追加、`ExportPreset` の変更、unknown data 保持保証の実装。
- JSON Schema の変更、`asset.json` / `.casproj` / export ZIP の version・構成変更。
- 製品コード（`src/core/model/`、`src/core/storage/`、`src/core/export/`、`src/features/`）の変更。既存テストの期待値変更。
- `docs/future/2D_COMPLETION_ROADMAP.md`、`docs/DATA_FORMAT.md` の変更（別 PR #61 が変更中のため）。

### 影響する文書

- `docs/adr/0012-target-extension-and-unknown-data.md`
- `docs/adr/0009-animation-event-boundary.md`（1 行追記のみ）
- `docs/adr/README.md`
- `docs/future/2D_ASSET_DATA_CONTRACT.md`（§10 の参照注記のみ、本文変更なし）

### 未確定事項

- `Asset.extensions` を実装する具体的な契約レーン別 PR の着手時期。
- 旧アプリの他の再保存経路（`assetOps.ts` 等）が unknown data を実際に保持するかどうかの個別確認（本 ADR は `.casproj` roundtrip のみを確認した）。
- `2D-1A-PROVENANCE` / `2D-1A-VALIDATION` / 詳細 `2D-1A-MIGRATION` の契約判断。

## ADR-2026-07-12-016: 2D-1A-PROVENANCE: ADR-0013 で来歴・利用条件・AI 送信記録の契約境界を確定（docs/adr/）

### 状態

- accepted

### 背景

`2D_COMPLETION_ROADMAP.md` の work package `2D-1A-PROVENANCE`（段階 2D-1a、前提: `2D-1A-TARGET` accepted、`docs/adr/0012`、PR #62 マージ済み）として、`2D_ASSET_DATA_CONTRACT.md` §11（入力の来歴・安全性）のうち、来歴（provenance）・利用条件・AI 送信記録の保存境界の**契約境界**を、実装前に固定する必要があった。§11 が同時に定める SVG / atlas JSON / ZIP / 画像の不正入力検査は別の関心事であり、`2D-1A-VALIDATION` / `2D-1B-INPUT-SAFETY` の範囲として本 ADR の対象外と明記した。現行アプリに AI 連携・外部送信コードが存在しない事実、`assetNameFromFileName` によるファイル名正規化・source Blob の verbatim 保持・`Asset.createdAt`/`updatedAt` という「暗黙の来歴」が既に存在する事実を出発点に、将来の `Asset.provenance?` を導入する前に、置き場所・任意性・AI 送信記録との境界・秘密情報禁止・export への反映範囲・導入 gate・quarantine との役割分担を先に定めた。製品機能（`Asset.provenance` の実装・schema 追加）は今回実装しない。

### 決定

- `docs/adr/0013-provenance-and-ai-record-boundary.md`: 来歴は将来の `Asset.provenance?`（optional / additive な配列、1 レコード = 取り込み元ファイル 1 つ、source texture の id を任意で参照）とすることを固定した。記録は任意とし、既存データへ遡って推定値を自動補完しないこと、現行実装が既に持つ暗黙の来歴（ファイル名正規化・source Blob の verbatim 保持・`createdAt`/`updatedAt`）を `provenance` へ自動昇格しないことを固定した。AI 送信記録の具体的なフィールドは `2D-2-AI-BOUNDARY` の ADR に委ね、本 ADR は保存境界（provenance と同じ族として保存データに残し、外部送信の事実を隠さず、エンジン向け派生出力へは出さない）のみを固定した。provenance / AI 送信記録の値にも ADR-0012 と同一の秘密情報禁止を適用することを固定した。「既定で出さない」はエンジン向け派生出力（atlas.json、helper API、examples）を指し、export ZIP / `.casproj` に同梱される保存正本 `asset.json` の複製は strip しないことを明確化した。`provenance` / AI 送信記録は optional / additive とし、ADR-0011 の導入 gate 4 条件を導入 PR に適用することを固定した。quarantine（壊れた入力の隔離記録、IndexedDB 専用、asset.json 等に含まれない）と provenance（正常に取り込んだ素材の来歴）を混ぜないことを固定した。
- `docs/adr/0012-target-extension-and-unknown-data.md` の決定 5 に、「既定で出さない」はエンジン向け派生出力を指し、export ZIP / `.casproj` の保存正本複製は strip しないという明確化を 1〜2 文追記した（ADR-0013 と同一規範）。再検討条件に「ADR-0011 の導入 gate 4 条件は `extensions` の導入 PR にも適用する」旨を 1 行追記した（2D-1A-PROVENANCE レビューのフォローアップ）。
- `docs/adr/0007-data-layer-separation.md` の層をまたぐ規則（「編集元の schema を変えない置き場所（別ファイルまたは名前空間付き領域）を設計してから実装する」）に、この指針が ADR-0011 の導入 gate を満たす optional / additive なフィールド追加まで排除しないこと、来歴の置き場所は ADR-0013 の `Asset.provenance?` が確定・上書きすることを追記した（Opus 4.8 レビューが検出した ADR-0007 と ADR-0013 の置き場所矛盾の解消。解消方向は ADR-0013 側の維持で確定し、ADR-0013 決定 1 にも同旨を追記した）。
- `docs/adr/README.md` の一覧表に ADR-0013 を追記し、work package 列挙に `2D-1A-PROVENANCE` を追加し、§4 に同型の変更範囲段落と上位契約文書への参照注記の許可を追記した。
- `docs/future/2D_ASSET_DATA_CONTRACT.md` §11 冒頭に「この章の境界は docs/adr/0013 で決定済み」の注記を追加した（本文は書き換えていない）。
- `src/core/model/provenanceContract.fixtures.test.ts` を新規作成し、(1) 未知 root フィールド `provenance`（§11 候補フィールドを持つレコード配列）を持つ asset が `validateAsset` を通ること、(2) `textures[0]` に未知フィールド（`provenance: { source: 'local-file' }`）を足した asset が `validateAsset` を通ること（入れ子レベルの未知フィールド許容を texture について名指しで初めて固定した新事実）、(3) root `provenance` と texture 内未知フィールドの両方を持つ asset を `.casproj` の `exportCasproj` → `importCasproj` した実挙動として **両方とも保持される**ことと `appliedMigrations` が空であることを固定し、その事実を ADR-0013 の「現状の制限」に記録した、(4) `buildAtlas` の出力トップレベルキー集合に `provenance` が含まれないことを固定した。

### しないこと

- `Asset.provenance` の実装・schema 追加、import 経路（`importImage.ts` 等）の変更。
- AI 送信記録の具体的なフィールド・保存形式の確定（`2D-2-AI-BOUNDARY` の範囲）。
- SVG / atlas JSON / ZIP / 画像の不正入力検査の実装・設計（`2D-1A-VALIDATION` / `2D-1B-INPUT-SAFETY` の範囲）。
- JSON Schema の変更、`asset.json` / `.casproj` / export ZIP の version・構成変更。
- 製品コード（`src/core/model/`、`src/core/images/`、`src/core/storage/`、`src/core/export/`、`src/features/`）の変更。既存テストの期待値変更。
- `docs/future/2D_COMPLETION_ROADMAP.md`（accepted 反映は別 PR）、`docs/DATA_FORMAT.md` の変更。

### 影響する文書

- `docs/adr/0013-provenance-and-ai-record-boundary.md`
- `docs/adr/0012-target-extension-and-unknown-data.md`（2 箇所の追記のみ）
- `docs/adr/0007-data-layer-separation.md`（置き場所指針への明確化追記のみ）
- `docs/adr/README.md`
- `docs/future/2D_ASSET_DATA_CONTRACT.md`（§11 の参照注記のみ、本文変更なし）

### 未確定事項

- `Asset.provenance` を実装する具体的な契約レーン別 PR の着手時期。
- `2D-2-AI-BOUNDARY` の ADR が確定するまでの AI 送信記録の具体的なフィールド・保存形式。
- 旧アプリの他の再保存経路（`assetOps.ts` 等）が入れ子レベルの unknown data を実際に保持するかどうかの個別確認（本 ADR は `.casproj` roundtrip のみを確認した）。
- `2D-1A-VALIDATION` / `2D-1B-INPUT-SAFETY` の不正入力検査の契約判断。

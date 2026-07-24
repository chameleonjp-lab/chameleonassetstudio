# Decision Log

最終更新日: 2026-07-24
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

- `docs/USER_GUIDE.md`（2.3 / 2.4: 新規アセット作成・削除、Undo 対象外である旨）

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

---

## ADR-2026-07-12-017: 2D-1A-VALIDATION: ADR-0014 で検証の段階（構造 / 意味 / 出力）の契約境界を確定（docs/adr/）

### 状態

- accepted

### 背景

`2D_COMPLETION_ROADMAP.md` の work package `2D-1A-VALIDATION`（段階 2D-1a、前提: `2D-1A-PROVENANCE` accepted、`docs/adr/0013`、PR #63 マージ済み）として、`2D_ASSET_DATA_CONTRACT.md` §12（検証の段階）の**契約境界**を、実装前に固定する必要があった。§12 は検証を構造検証・意味検証・出力検証の三段に分けることを規範として定めるが、現行実装ではこの三段が明示的な統一パスとして存在せず、(a) ajv による構造検証、(b) `assetOps.ts` / `rig.ts` に分散した編集時の予防ガードと `casproj.ts` の export 時 Blob 完全性チェック、(c) 未実装の出力検証（preflight）に分かれている。将来、統一意味検証パスと preflight を実装する前に、三段の境界・各段の失敗時の既定動作・現行コードがどの段を担っているかを先に定めた。あわせて、ADR-0012 決定 2 / ADR-0013 決定 4 が「秘密情報検出は 2D-1A-VALIDATION の preflight に接続する」と述べていた接続点を確定した。製品機能（統一意味検証パス・preflight）は今回実装しない。

### 決定

- `docs/adr/0014-validation-staging.md`: §12 の三段（構造 / 意味 / 出力）と各段の失敗時扱いを固定した。構造検証（schema）失敗=保存・書き出しを止める、意味検証（runtime）失敗=原則修復を求め不足を示す、出力検証（preflight）失敗=preset ごとに警告 or 停止。現行コードの各段への対応づけ（構造検証=ajv validators、意味検証=分散した編集時の予防と export 時 Blob 完全性チェックのみで統一検出パスは未実装、出力検証=未実装）を記述した。意味検証の必須対象（image layer→texture 参照実在・part/frame/animation の参照切れなし・part 親子循環なし・`.casproj` の必要 Blob 完備・出力用一意名生成可）を契約化し、現行の分散ガードは「予防」で将来の統一パスがそれを補完することを明記した。失敗時の既定動作を「正本を壊さない」原則（ADR-0006/0007）と一貫させ、意味検証は自動修復で黙って直さないことを固定した。秘密情報検出を出力検証（preflight）段の一部として位置づけ（具体アルゴリズムは preflight 実装 PR）、保存自体は止めず配布物出力・外部送信前に警告する境界とした。検証の追加は read-only（データを書き換えない）とし 0.1.0 無変換だが、検証結果の保存・自動修復の既定適用はデータ形式・保存挙動に影響するため ADR-0011 の導入 gate 4 条件を適用することを固定した。不正入力検査は `2D-1B-INPUT-SAFETY`、preflight の具体実装は `2D-4-PREFLIGHT` の範囲と明記した。
- `docs/adr/0012-target-extension-and-unknown-data.md` の決定 5 冒頭文「既定で atlas.json / export ZIP へ出さない」を「既定でエンジン向け派生出力（atlas.json、helper API、examples）へ出さない」に再改稿し、後続の「保存正本 asset.json は strip しない」との字面上のテンションを解消した（PROVENANCE レビューの持ち越し軽微 1 の解消。決定内容は変えていない）。
- `docs/adr/README.md` の一覧表に ADR-0014 を追記し、work package 列挙に `2D-1A-VALIDATION` を追加し、§4 に同型の変更範囲段落を追記した。
- `docs/future/2D_ASSET_DATA_CONTRACT.md` §12 冒頭に「この章の境界は docs/adr/0014 で決定済み」の注記を追加した（本文は書き換えていない）。
- `src/core/model/validationContract.fixtures.test.ts` を新規作成し、(1) 必須フィールド（`name` / `textures`）欠落を `validateAsset` が検出すること、(2) 存在しない `textureId` を参照する image layer を持つ asset が `validateAsset` を**通る**こと（schema は参照整合性を検査しない事実。dangling ref は構造検証を通り抜ける）、(3) texture の Blob ファイルが欠落した bundle を `exportCasproj` に渡すと `CasprojError` を throw すること（現行の予防が機能）、(4) 同名 2 frame を `buildAtlas` に渡すと出力 `frames` に同名が 2 つそのまま出ること（出力用一意名検証が未実装）を実挙動から固定した。

### しないこと

- 統一意味検証パス・preflight（出力検証）の実装、`buildAtlas` の重複名検出の実装、秘密情報検出の実装。
- JSON Schema の変更、`asset.json` / `.casproj` / export ZIP の version・構成変更。
- 製品コード（`src/core/model/`、`src/core/schema/`、`src/core/storage/`、`src/core/export/`、`src/features/`）の変更。既存テストの期待値変更。
- 不正入力（信頼しない ZIP / JSON / 画像）の検査・隔離の実装・設計（`2D-1B-INPUT-SAFETY` の範囲）。
- `docs/future/2D_COMPLETION_ROADMAP.md`（accepted 反映は別 PR #64）、`docs/DATA_FORMAT.md` の変更。

### 影響する文書

- `docs/adr/0014-validation-staging.md`
- `docs/adr/0012-target-extension-and-unknown-data.md`（決定 5 冒頭文の再改稿のみ）
- `docs/adr/README.md`
- `docs/future/2D_ASSET_DATA_CONTRACT.md`（§12 の参照注記のみ、本文変更なし）

### 未確定事項

- 統一意味検証パスを実装する具体的な設計 PR の着手時期（対象範囲・エラー形式・呼び出しタイミングの確定を含む）。
- preflight（`2D-4-PREFLIGHT`）の target ごとの警告基準、`buildAtlas` の重複名検出をどの段（意味検証 / 出力検証）に置くか。
- 秘密情報検出の具体アルゴリズム（対象フィールドごとの検出ロジック・誤検知時の扱い）。

---

## ADR-2026-07-12-018: 2D-1A-MIGRATION: ADR-0015 で version 採番・移行手順・独立 version の詳細契約を確定（docs/adr/）

### 状態

- accepted

### 背景

`2D_COMPLETION_ROADMAP.md` の work package `2D-1A-MIGRATION`（段階 2D-1a、2D-1a 契約の最後。前提: `2D-1A-VALIDATION` accepted、`docs/adr/0014`、PR #65 マージ済み）として、`2D_ASSET_DATA_CONTRACT.md` §13（形式変更と migration の gate）の詳細契約を、実装前に固定する必要があった。migration の入口挙動と復旧境界は ADR-0006 が固定済みだが、roadmap は「ADR-0006 のみ partial、詳細契約全体は未完了」としていた。ADR-0006 が残した詳細（version 採番の意味、移行手順の不変条件、3 文書の独立 version と出力 version の関係、新形式の拒否粒度、migrate と検証の順序、downgrade / rollback の境界、将来の migration PR の gate / fixture 要件）を、現行 `migrate.ts` の挙動に対応づけて固定した。製品機能（version 進行・移行手順の追加）は今回実装しない（全 `*_MIGRATIONS` は空配列＝恒等のまま）。

### 決定

- `docs/adr/0015-migration-detailed-contract.md`: (1) version を上げる変更は移行手順を必ず伴い、optional・additive なフィールド追加は version を上げない（ADR-0011 の未知フィールド許容による）ことを固定。(2) 移行手順（`Migration`）の不変条件（version 前進必須・chain 連続・version はフレームワークが設定・`apply` は未知フィールドを保持・入力非破壊）を固定。(3) asset / project / export-presets の 3 文書は独立に version を持ち独立の移行手順配列を持つこと、`atlas.json` の version は再取り込みしない配布物 version であること、現時点で 4 つの version がいずれも 0.1.0 であることを固定。(4) 現行より新しい version は patch 差でも一律拒否し down-convert しないこと（additive は version を上げないため新 version は常に非互換構造を含む）を固定。(5) 外部文書は migrate を先に schema 検証を後に通し、migrate 結果が現行 schema を満たさなければ正本へ書き込まないことを固定。(6) version の downgrade は非対応・範囲外、復旧の意味での rollback は `2D-1B-RECOVERY` の範囲と切り分け。(7) version を上げる将来 PR が満たすべき gate / fixture 要件（§13 完了条件 5 点 + ADR-0011 導入 gate + Opus 4.8 レビュー + 人間確認）を標準要件として固定。
- `docs/adr/README.md` の一覧表に ADR-0015 を追記し、work package 列挙に `2D-1A-MIGRATION` を追加し、§4 に同型の変更範囲段落を追記した。
- `docs/future/2D_ASSET_DATA_CONTRACT.md` §13 冒頭に「migration 詳細契約の境界は docs/adr/0015 で決定済み、入口挙動と復旧境界は ADR-0006」の注記を追加した（本文は書き換えていない）。
- `src/core/model/migrationContract.fixtures.test.ts` を新規作成し、(1) 4 つの version 定数が 0.1.0 で 3 つの移行手順配列が空であること、(2) v0.1.0 の asset fixture を `migrateAsset` に通すと恒等で返りその結果が `validateAsset` を通ること、(3) version 0.1.1 の asset が `MigrationError`（新しい形式）になり入力が破壊されないこと、(4) 非前進の移行手順（`to <= from`）が `MigrationError`（バージョンが進んでいない）になることを実挙動から固定した。

### しないこと

- 実際の version 進行・移行手順の追加（`ASSET_MIGRATIONS` 等への手順追加）、`CURRENT_*_VERSION` の変更。
- JSON Schema の変更、`asset.json` / `project.json` / export-presets / `.casproj` / export ZIP の構成変更。
- 製品コード（`src/core/model/migrate.ts` を含む既存ファイル）の変更。既存テストの期待値変更。
- down-convert（新→旧）や複数アセットにまたがる原子的 rollback の実装（`2D-1B-STORAGE` / `2D-1B-RECOVERY` の範囲）。
- `docs/future/2D_COMPLETION_ROADMAP.md`（accepted 反映は別 PR）、`docs/DATA_FORMAT.md` の変更。

### 影響する文書

- `docs/adr/0015-migration-detailed-contract.md`
- `docs/adr/README.md`
- `docs/future/2D_ASSET_DATA_CONTRACT.md`（§13 の参照注記のみ、本文変更なし）

### 未確定事項

- 最初に version を上げる（0.1.0 → 次）具体的な migration PR の着手時期と、その変更内容（どの構造変更が最初の非互換になるか）。
- `.casproj` バンドル内で 3 文書が異なる version を持つ組み合わせの migration（現行 fixture はすべて 0.1.0）。
- `.casproj` の可搬正本としての version 付けの詳細（`2D-1B-CASPROJ` の範囲）。

---

## ADR-2026-07-20-019: 2D-2-IMPORT Slice DでTilesetとChameleon Atlas意味上roundtripの境界を確定

### 状態

- accepted

### 背景

group 11のSlice DではTilesetと既知atlas bundleを取り込む予定だったが、Chameleon Atlasは配布物であり、ADR-0007の「配布物を正本へ戻さない」原則、ADR-0015の「atlas versionはmigration対象外」という契約と衝突していた。また現行`atlas.json`だけでは元Assetのlayer topology、parts、tags、gameAttributes、rig、provenance、identityを復元できず、raw JSONを保存する既存TextureRefもない。実装前監査でこの衝突とlossを明示し、2026-07-20に人間が限定境界を承認した。

### 決定

- `docs/adr/0018-chameleon-atlas-semantic-reimport.md`をacceptedとし、Chameleon自形式atlasだけをADR-0007 / ADR-0015の限定例外として扱う。これは元Assetの完全復元ではなく、新しいIDのflattened Assetへframe pixel、frame名・順序、animation、origin、anchor、collider、tile / effect設定を復元する「意味上roundtrip」である。
- Atlas入力はbasenameがexactな`atlas.json + spritesheet.png`、`format: chameleon-atlas`、`version: 0.1.0`、`texture: spritesheet.png`のcanonical subsetに限定する。1〜16件の非空・一意frame名、整数座標、canonicalな行優先配置、実texture寸法、animation参照、anchor / collider union、tile / effect設定を厳格検証する。
- `spritesheet.png`はsource Blobとしてverbatim保持する。`atlas.json`はraw bytesを保持せず、file名、MIME、byte数、SHA-256、importedAtをprovenanceへ記録し、確定前にraw JSON非保持をloss表示する。
- Phaser / Aseprite / Tiled等の外部形式、未知field、旧版・future version、座標・参照・設定の不整合は隔離せず、理由付きで拒否する。画像signature不一致・decode失敗・寸法超過だけは既存quarantine境界を使う。
- Tilesetは独立モードとし、最大16cellを各1 edit texture / layer / frameへ展開する。`assetType: tile`、`tileSize = cellSize`を既定とし、collisionTypeとvisualTypeはAsset全体に1設定、colliderとanimationは自動生成しない。
- Asset / Project schemaとversion、migration、IndexedDB store、`.casproj`、product export ZIP、dependenciesは変更しない。

### しないこと

- 外部Atlas形式、ZIP直接取り込み、Atlas version migration、raw JSON保存、元Asset完全復元、17 frame以上、packed / multi-page Atlasへの拡張。
- Tileset map編集、cell別collision設定、collider自動生成。
- Slice Dの範囲をSVG / GIF / APNG等のSlice Eへ広げること。

### 影響する文書

- `docs/adr/0018-chameleon-atlas-semantic-reimport.md`
- `docs/adr/0007-data-layer-separation.md`, `docs/adr/0015-migration-detailed-contract.md`, `docs/adr/0016-import-optional-format-classification.md`
- `docs/future/2D_2_IMPORT_PLAN.md`, `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`, `docs/future/2D_COMPLETION_ROADMAP.md`
- `docs/DATA_FORMAT.md`, `docs/EXPORT_FORMATS.md`, `docs/USER_GUIDE.md`, `docs/TEST_PLAN.md`, `docs/IMPLEMENTATION_PLAN.md`

### 未確定事項

- 外部Atlas形式、raw JSON保存、Atlas version migration、ZIP直接取り込みを将来採用するか。採用時は別ADR、保存・version影響監査、独立レビュー、人間承認を必要とする。
- iPhone / iPad Safariのnative file picker、safe-area、メモリ圧迫を実機で確認する時期。

---

## ADR-2026-07-21-020: Slice E前提としてsource MIMEとAsset 0.2.0 migrationを確定

### 状態

- accepted（2026-07-21 人間承認、選択肢A）

### 背景

ADR-0016のF1はSVG / GIF / APNGをrasterized-importとし、ADR-0007とimport計画は元fileをsource Blobとしてverbatim保持する。一方、Asset 0.1.0のTextureRef / schemaはPNG / JPEG / WebPだけを許可するため、Slice EのUIを先に実装するとSVG / GIF原本を失うか、schema不適合のAssetを作る矛盾があった。

### 決定

- `docs/adr/0019-optional-source-mime-and-asset-0.2.0.md`をacceptedとし、Assetだけを0.2.0へ進める。Project / export-presets / Chameleon Atlas / app versionは0.1.0を維持する。
- Asset 0.1.0→0.2.0は既存フィールドを変更しないidentity migrationとし、frameworkがversionだけを更新する。旧`.casproj` fixtureに加え、IndexedDBのlive Asset / trash / snapshot copyもmigrate→現行schema検証して意味保持を固定する。
- source TextureRefはPNG / JPEG / WebP / SVG / GIFを許可し、edit / thumbnailはPNG / JPEG / WebPだけに制限する。
- APNGはPNGコンテナとしてsource TextureRef / Blobを`image/png`へcanonical化し、元の`image/apng`宣言はprovenanceへ保持する。
- SVG / GIFの実体署名、`.casproj` staged import、全canonical writeのTextureRef / Blob MIME一致、verbatim bytesを保存層で固定する。
- 通常import gate、SVG rasterize、GIF / APNG animated decode、fallback warning、unsupported UIとそのE2Eは別のSlice E製品実装PRへ分ける。本契約PRではSVG / GIF `.casproj`の実ブラウザーdecodeを最小E2Eで固定する。

### しないこと

- Project / export-presets / atlas / app version、IndexedDB version / store / index、`.casproj`配置、product export ZIP、dependencyの変更。
- SVGのベクター編集、外部resource許可、animated decodeやUIの先行実装。

### 影響する文書

- `docs/adr/0019-optional-source-mime-and-asset-0.2.0.md`
- `docs/adr/README.md`, `docs/adr/0013-provenance-and-ai-record-boundary.md`, `docs/adr/0015-migration-detailed-contract.md`, `docs/adr/0016-import-optional-format-classification.md`
- `docs/DATA_FORMAT.md`, `docs/EXPORT_FORMATS.md`, `docs/REQUIREMENTS_SPECIFICATION.md`, `docs/future/2D_ASSET_DATA_CONTRACT.md`, `docs/future/2D_2_IMPORT_PLAN.md`, `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`
- `docs/IMPLEMENTATION_PLAN.md`, `docs/future/2D_COMPLETION_ROADMAP.md`, `docs/TEST_PLAN.md`, `docs/RELEASE_CHECKLIST.md`
- `docs/future/3d/3D_ASSET_DATA_CONTRACT.md`, `docs/future/3d/3D_CURRENT_STATE_AND_IDEA_TRACEABILITY.md`（2D参照同期のみ）

### 未確定事項

- Slice E製品実装PRでのImageDecoder機能検出、全frame decode、frame duration写像、fallback warning、SVG安全fixtureと製品フロー回帰E2E。
- UTF-8以外のSVG、APNG animation chunkの厳格検査、将来追加するsource MIME。

---

## ADR-2026-07-21-021: Slice E製品挙動を1A + 2A + 3Aで確定

### 状態

- accepted（2026-07-21 人間承認、1A + 2A + 3A）

### 背景

ADR-0016でSVG / GIF / APNGの`rasterized-import`分類、ADR-0019 / PR #135でAsset 0.2.0のsource保存契約は成立した。製品実装前に、どの入口を拡張するか、animated画像のframe / duration / repeatを現行schemaへどう写すか、SVGをどの構造境界で安全に拒否するかを人間判断で固定する必要があった。

### 決定

- `docs/adr/0020-optional-import-product-behavior.md`をacceptedとする。
- 新規Assetのpicker / drag & dropだけへSVG / GIF / APNGを追加する。通常画像とのmixed batchは最大16 fileで原子的に扱い、layer追加、連番、sheet、tileset、atlasの画像gateはPNG / JPEG / WebPのまま維持する。
- SVGはUTF-8原本をverbatim保持し、DOCTYPE、active要素、event handler、外部href / src、base URL、外部CSS / URL等をsanitizeせず厳格拒否してからbrowser画像contextでPNGへrasterizeする。active構造の拒否はquarantineへ入れない。
- GIF block / PNG chunkをboundedに走査し、APNG `acTL`と`fcTL`件数を検査する。animated画像は最大16frameで、17frame以上をtruncateしない。
- `ImageDecoder`とMIME対応時は全frameを順次decodeし、API不在・MIME非対応・constructorの`NotSupportedError`だけを先頭frame fallbackへ送る。対応decoderのbad data / 途中失敗はdecode失敗としてquarantineへ接続する。
- 全durationが有効なら`clamp(round(frameCount * 1000 / totalDurationMs), 1, 240)`へ写像し、元総時間だけをinformationalな`Animation.durationMs`へ残す。duration欠損は8fpsとし、可変時間・丸め・clamp・fallbackをloss表示する。
- 無限repeatだけを`loop: true`とし、repeatなしと有限repeatは`loop: false`にする。有限回数を無限loopへ変えず、回数非保持をloss表示する。
- Aseprite / PSD / OpenRaster / Kritaは理由とPNG / WebP / 手動格子Sheet経由の代替手順を表示し、専用原本だけのreference保存は行わない。

### しないこと

- schema / version / migration、IndexedDB version / store / index、`.casproj`配置、product export ZIP、dependencyの変更。
- SVGのvector編集・sanitize・外部resource許可、17frame以上、frame単位duration、有限repeat回数の保存、unsupported形式の昇格。

### 影響する文書

- `docs/adr/0020-optional-import-product-behavior.md`, `docs/adr/README.md`
- `docs/future/2D_2_IMPORT_PLAN.md`, `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`, `docs/future/2D_COMPLETION_ROADMAP.md`
- `docs/IMPLEMENTATION_PLAN.md`, `docs/USER_GUIDE.md`, `docs/TEST_PLAN.md`, `docs/RELEASE_CHECKLIST.md`

### 未確定事項

- iPhone / iPad SafariのFiles picker MIME、`ImageDecoder`対応、native dialog、safe-area、memoryの実機結果。
- SVG vector編集、外部resource、17frame以上、frame単位duration、有限repeat回数を将来採用するか。採用時は別ADR、保存・version・security監査、独立review、人間承認を必要とする。

## ADR-2026-07-22-022: Group 12 Timeline / RigのT1 + R1 + P1中核契約を確定

### 状態

- accepted core（2026-07-22 人間承認、T1 + R1 + P1）
- H1 + H2 + H3 human decision required（当時。ADR-2026-07-22-023で解決）
- product implementation not started

### 背景

PR #145をhead `9048b11`からReady化し、merge `236571c`としてmainへ反映した後、同じmain SHAを仕様、実装・データ安全、テスト・端末の3担当が独立にread-only監査した。Frame / Animation / Part / RigAnimation / bake基盤は再利用できる一方、可変時間consumer、固定fps派生export、rig flip数式、Layer所属、同期bakeの資源上限を製品実装前に固定する必要があった。Opus 4.8 review済みとは扱わない。

### 決定

- `docs/future/2D_3_TIMELINE_RIG_PLAN.md`をGroup 12契約の正本とする。
- T1 / ADR-0021: `Frame.durationMs?`をoptional・additiveとし、各出現の実効時間を`frame.durationMs ?? 1000 / animation.fps`とする。旧fps-only Asset 0.2.0とinformationalな`Animation.durationMs`を変えず、派生exportで黙って均一化しない。
- R1 / ADR-0022: rig flipを既存flipとは別sliceとし、Part / pose / limitの鏡映式、完全ID map、`flip(bake(original))`と`bake(flipRig(original))`の同値をGateにする。
- P1 / ADR-0023: 初回part replaceを既存`Part.layerIds`だけの静的置換に限定し、他field、既存bake、schema、version、Family recipeを変えない。時間依存状態は別ADRへ送る。
- 現行実装・ADR・fixtureの`max(1, round(...))`をbake frame数の正本とし、`DATA_FORMAT.md`の旧`ceil`記載を訂正する。
- 固定SHA監査のMUSTを契約計画、ADR、data / export / flip / test / roadmap文書へ同期する。本PRはdocs-onlyとする。

### しないこと

- 製品コード、型、schema、version、migration、IndexedDB、`.casproj`配置、Atlas / ZIP形式、dependencyの変更。
- Group 12製品実装、Group 12契約PRのReady化・merge。
- GIF / APNG importの可変時間保持、Atlasへのduration / event追加、resample、linked rig refresh、時間依存衣装、native rig export、collider override / polygon、IK / mesh / physics / state machine。

### 影響する文書

- `docs/future/2D_3_TIMELINE_RIG_PLAN.md`
- `docs/adr/0021-frame-duration-semantics.md`, `0022-rig-flip-and-bake-parity.md`, `0023-part-layer-replacement.md`, `docs/adr/README.md`
- `docs/future/2D_ASSET_DATA_CONTRACT.md`, `FLIP_DESIGN.md`, `2D_EXPORT_COMPATIBILITY_MATRIX.md`, `2D_COMPLETION_ROADMAP.md`
- `docs/DATA_FORMAT.md`, `docs/EXPORT_FORMATS.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/TEST_PLAN.md`, `docs/RELEASE_CHECKLIST.md`

### 未確定事項

- H1: 可変時間 / eventを持つAnimationについて固定fps派生exportを理由付きで止めるE1か、明示loss確認後に限るE2か。
- H2: `Part.layerIds`を非空・1 Layer 1 Partにし、他Part所有Layerを暗黙移動せず拒否するL1か、空detachを許すL2か。複数Part共有L3はbake競合のため非推奨。採用規則決定前はR1 / P1を実装しない。
- H3: 120 Frame超warning / 240 Frame hard cap候補と、LayerState / serialized bytes / sheet pixel上限。PC Chromium、iPad Safari、iPhone Safariの実測後に人間が決める。

上記H1〜H3はADR-2026-07-22-023の人間判断で解決した。履歴上のpending記録は消さず、後続判断を正本とする。

## ADR-2026-07-22-023: Group 12 H1=E1、H2=L1、H3=M1を確定

### 状態

- accepted（2026-07-22 人間承認、H1=E1 + H2=L1 + H3=M1）
- H3 numeric budget not decided
- product implementation not started

### 背景

契約監査PR #146はfinal head `20871f7`、merge `cb21ea4`としてmainへ反映された。PR headのCI Run #457とmerge後CI Run #458は成功し、製品コード変更はなかった。固定headの仕様、実装・データ安全、テスト・端末の独立read-only reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。merge後のmainを再監査すると、#146の同期とH1〜H3の人間判断が製品実装前のGateとして残った。

### 決定

- **H1=E1:** export対象Animationが参照するFrameに将来の`durationMs`がある、または対象Animationにeventがある場合、固定fpsの`atlas.json`、それを含むproduct ZIP、helpers、examplesを理由付きで拒否する。未参照Frameのoverrideだけでは拒否しない。PNG / WebP、単体`asset.json`、`.casproj`は許可する。loss確認付き均一化E2は採らず、resample E3は2D-4へ送る。
- **H2=L1:** 各`Part.layerIds`は1件以上、各Layerは高々1 Partへ所属する。未所属Layerは許可する。他Part所有Layerを使う操作は理由付きで拒否し、対象外Partから暗黙に移動・削除しない。既存の空・共有dataは自動migrationせずread-only inspectionで示し、新規操作とbake preflightで拒否する。
- **H3=M1:** 数値上限をまだ決めず、`docs/future/2D_3_H3_MEASUREMENT_PROTOCOL.md`と`tools/h3/`で再現可能なNode / browser core計測を先に行う。120 warning / 240 hard capはmatrix上の候補であり、製品定数、acceptance limit、完了主張にしない。
- T1 / R1 / P1の製品実装は別の明示指示とslice PRを必要とする。特にR1のnumeric preflightと上限定数は、実機測定と後続の数値人間承認まで実装しない。

### しないこと

- 製品コード、型、schema、version、migration、IndexedDB、`.casproj`配置、product export、dependencyの変更。
- 120 / 240または別のFrame / LayerState / byte / pixel数値の採用。
- Node結果によるiPhone Safari、React、History、保存、reload、実sheet生成の代替。
- PRのReady化、merge、製品機能実装。

### 証拠と後続Gate

- `docs/future/2D_3_H3_MEASUREMENT_PROTOCOL.md`をM1の測定正本とする。
- `tools/h3/result.schema.json`準拠のraw sample、環境、fixture SHA-256、median、nearest-rank p95を残す。
- PC Chromium、iPhone 17 Pro Safari、iPhone 11 Pro Safari、iPad Pro 2018 Safariのcore結果を揃えた後、製品実装後のproduct-path Gateを別に行う。
- numeric warning / hard capは結果を比較して人間が別途承認するまで未決定とする。

## ADR-2026-07-22-024: H3実機計測ページは24時間だけ公開する

### 状態

- accepted（2026-07-22 人間承認）
- B0 measurement publication preparation only
- product implementation and H3 numeric budget not decided

### 背景

PR #147 final head `1ba671f7`は、H1=E1 / H2=L1 / H3=M1の記録、`tools/h3/`、結果schema、手順を追加し、CI Run #460成功と3担当の最終`BLOCKER 0 / MUST 0`を経てmerge `24a089c`としてmainへ反映された。merge後CI Run #461も全job成功した。一方、物理iPhone / iPadから`localhost`を開けないため、B0実測には同一commitを配る一時HTTPS originが必要である。14日間の継続公開は不要と判断した。

### 決定

- GitHub Pagesの公開は手動workflow開始から24時間とする。Draft PR、PR CI、main pushだけでは公開しない。
- buildへ開始・終了時刻とsource commitを埋め込み、画面は終了時刻以降の新規計測を拒否する。
- 期限判定は公開画面自身が毎秒行い、終了時刻以降の新規計測を拒否する。恒久的な定期workflowや24時間待機jobは追加しない。
- 結果を保存できた場合は`close-now`で24時間より前に終了してよい。URL自体を消すUnpublishはrepository Settingsで人間が行う。
- 結果JSONは端末へdownloadし、この会話へ添付して非公開保管する。Pages、Actions artifact、repositoryへ自動送信しない。

### しないこと

- 製品`src/`、型、schema、version、migration、storage、product export、dependencyの変更。
- 120 / 240その他のH3数値採用、B0完了、Safari実機合格の主張。
- token、secret、Project、画像、結果JSON、端末情報の公開配信物への保存。
- Draft PRのReady化、merge、Pagesの実公開。

### 後続Gate

1. 本配信準備PRをCIと固定head reviewで確認し、人間がmergeを判断する。
2. Pagesの配信元を初回だけ`GitHub Actions`に設定する。
3. mainの`publish-24h`を手動実行し、PC Chromium、iPhone 17 Pro / 11 Pro Safari、iPad Pro 2018 Safariを1 caseずつ測る。
4. 保存済みJSONを比較し、H3の暫定数値を別の人間判断へ戻す。

## ADR-2026-07-23-025: Pages rootはサービス本体、H3は`/h3/`へ分離する

### 状態

- accepted（2026-07-23 人間承認）
- Pages配信構成の補修だけ
- product implementation and H3 numeric budget not decided

### 背景

PR #148 merge `fbdeb357`の初回配信では、H3計測画面がPages rootを占有し、利用者がChameleon Asset Studio本体を開けなかった。人間は、サービス本体をroot、H3を別pathへ分ける案を採用した。初回H3枠はsource commit `fbdeb357`、`2026-07-22T20:30:26Z`開始、`2026-07-23T20:30:26Z`終了として配信された。

### 決定

- ADR-024の24時間制限と期限後の新規計測拒否は維持する。通常終了時のUnpublishの扱いだけは本ADRを優先し、サービス全体を止める明示判断がない限り行わない。
- GitHub Pagesのroot `/chameleonassetstudio/`でサービス本体を配信する。
- H3計測画面は`/chameleonassetstudio/h3/`で配信する。
- Pages artifactは本体とH3を1つにまとめ、`publish-24h`と`close-now`のどちらでも本体を含める。
- `close-now`は`/h3/`だけを終了画面へ置き換え、本体は公開を維持する。
- 通常の計測終了ではUnpublishしない。Unpublishはサービス全体を止める別の人間判断とする。
- 移設後のB0結果は、新しい同一source commitと新しい24時間枠で最初から収集し、移設前の結果と混在させない。
- Draft PR、PR CI、mainへのmergeだけではPagesを更新しない。配信の手動実行は引き続き人間判断後とする。

### 対象外

- H3の120 / 240その他の数値採用。
- T1 / R1 / P1の製品実装。
- 保存、schema、version、migration、product export、dependencyの変更。
- Ready化、merge、Pagesの実配信。

## ADR-2026-07-23-026: 正式B0を保留し、サービス公開と非依存Sliceを優先する

### 状態

- accepted（2026-07-23 人間承認）
- サービス公開とGroup 12の進行順だけを変更
- H3 numeric budget、warning、hard capは未決定のまま

### 背景

ADR-025後、移設前commitのiPhone 17 Pro baseline結果2件はハーネスの参考動作確認として得られたが、正式B0の4端末結果や数値budgetを決める証拠には不足していた。一方、H3数値に依存しないT1 Slice AとP1 Slice Cを停止する必要はないと人間が判断した。

### 決定

- 現在のH3確認はいったん完了とし、正式B0は公開利用で性能または端末固有の再現可能な問題が見えた時に再開する。
- 移設前commitの結果2件は参考記録に限り、正式B0や数値採用へ使わない。
- サービス本体はPages rootで継続公開し、H3は通常閉じた状態を維持する。必要時だけADR-024 / 025の同じ手順で24時間開く。
- 数値warning / hard capはH3結果と別の人間承認が揃うまで実装しない。
- 数値budgetへ依存しないT1 Slice AとP1 Slice Cは進めてよい。
- 公開利用から新しい問題が見つかった場合、その再現fixtureをM1 protocolまたは製品path Gateへ追加する。

### 対象外

- H3数値の採用。
- Slice Bの数値上限、R1、bake共通preflight、Group 12全体の完了判定。
- `asset.json`、`.casproj`、export ZIP、IndexedDB layout、dependencyの変更。
- Ready化、merge、Pagesの実配信。

## 2026-07-24: P1 Slice Cのマージ後closeout

### 状態

- post-merge fact recorded
- P1 Slice C: implemented / CI-passed / independently-verified / merged
- next product decision pending

### 証拠

- PR #154 final head `fdf75f0`
- CI #492: unit 732件、Chromium 159件、H3 1件、Pages公開・閉鎖各1件成功
- 固定head独立review: `BLOCKER 0 / MUST 0 / SHOULD 0`
- merge commit `1c700e7`
- 2026-07-24の`main@1c700e7`再監査: open PR 0件、P1の製品差分とPR headのtreeは同一

### closeout

- P1 Slice Cを`implemented / verified / merged`へ同期する。
- 物理iPhone Safari、safe area、software keyboard、実機reloadはGroup 12 closeout Gateとして残す。
- ADR-2026-07-23-026の対象外を維持し、R1、bake共通preflight、H3数値budgetをこの記録だけで開始しない。
- 次の製品作業は、H3非依存R1を独立sliceへ分けるか、Slice BをH3再開まで一体で保留するかの人間判断後に固定する。

### 変更しないこと

- 製品コード、型、schema、version、migration、保存、export、dependency。
- H3数値、warning、hard cap。
- R1、Slice B、Slice Dの製品実装。
- Ready化、merge、Pages配信。


## ADR-2026-07-24-027: Slice BをB1 / B2へ分け、B1を先行する

### 状態

- accepted（2026-07-24 人間承認、A1）
- 対象: Group 12 `2D-3-TIMELINE + 2D-3-RIG` のR1 / Slice B
- 基準main: `ba3f7b1526adbf54a137a77e3ca7c663bad6cce7`
- B1 product implementation not started（決定時点。実装結果は下記closeoutを参照）
- B2 numeric budget / warning / hard cap pending

### 確認できた事実

- R1の鏡映式、完全ID map、bake parityはADR-0022でaccepted済みである。
- 未決定なのは生成Frame / LayerState / serialized bytes / sheet pixelの採用上限と、warning / hard cap、採用上限での実機合格値である。
- 座標式修正、有限値・参照・循環・H2=L1と算出後frameCountの有限・安全整数を確認する構造検査、独立rig反転コピーは採用上限を使わず実装できる。

### 決定

- A1を採用し、Slice BをB1とB2へ分ける。
- B1は、accepted座標式への`bakeRigAnimation`修正、有限値・参照・循環・H2=L1と算出後frameCountの有限・安全整数を確認する構造preflight、rig編集データを保持した独立左右反転コピー、再採番対象とTextureRef保持を明示した完全ID remap、transform / pixel parity、保存・reload・`.casproj` roundtripを扱う。
- B1の反転は現在と同じ「新しいAssetを作る操作」として画面から利用できるようにする。元Assetを変更せず、Undo / Redo対象外とし、新しいentryを追加せず既存のUndo / Redo stackも変更しない。保存失敗時はProject参照、Asset、Blob、画面stateへの新Asset追加を全て取り消す。
- B1は数値warning、hard cap、H3の候補値を製品定数へ入れず、Group 12完了を名乗らない。
- B1の安全整数検査を通る非常に大きい生成量の停止リスクはB2まで残る。B1だけで資源安全や任意入力への応答保証を証明したとは扱わない。
- B2は生成Frame / LayerState / serialized bytes / sheet pixelの採用値、warning、hard cap、資源超過の原子的拒否、採用上限でのPC / iPhone / iPad product-path実測、Group 12完了判定を扱う。

### 実装順

1. 本決定をdocs-only Draft PRで正本へ反映する。
2. そのPRがmainへ入った後、B1を1 branch / 1 Draft PR / 単一writerで実装する。
3. B1のCIと独立検証後も、B2とGroup 12 closeoutはH3数値の後続判断まで保留する。

### 変更しないこと

- 製品コード、型、schema、version、migration、IndexedDB、`.casproj`配置、export ZIP、dependency。
- H3数値、warning、hard capの採用。
- linked Familyのrig refresh、rebakeによる既存Frame置換、native rig export、collider override / polygon、IK、mesh、physics、state machine。
- Slice D、Ready化、merge、Pages配信変更。

## PR #157 merge後closeout（ADR-2026-07-24-027実装記録）

### 状態

- B1: `implemented / CI-passed / independently-verified / merged`
- B2: numeric budget / warning / hard cap pending
- Group 12: incomplete

### 証拠

- docs-only PR #156でA1を正本化し、B1をPR #157で実装した。
- final head `834cc38397c300895f50c1efdb86d94f3870a0a8`に対応するCI Run #501は、unit 758件、Chromium E2E 165件、H3、Pages open / closed routeを含め全job成功した。
- 非GitHub・非Opusの固定head独立reviewは、仕様・判断、実装・データ安全、テスト・iPhone境界の3方向すべて`BLOCKER 0 / MUST 0 / SHOULD 0`だった。
- merge `bf13cac3db854c30b33e9b2ef97d389a2372e961`でmainへ反映済みである。

### 未完了と次のGate

- B2のH3数値、warning、hard cap、物理iPhone / iPad Safariのproduct-path、Group 12完了判定は未完了のまま維持する。
- Slice DをB2より先に扱うかは未決定であり、Timeline UXの契約監査と人間の明示判断なしに製品実装を開始しない。
- Group 13はGroup 12完了に依存するため開始しない。

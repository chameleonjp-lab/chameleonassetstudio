# Decision Log

最終更新日: 2026-07-07  
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

# Chameleon Asset Studio 最終完成までの実装計画書

最終更新日: 2026-07-10
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md`

---

## 1. 目的

この文書は、Chameleon Asset Studio を MVP、v1.0.0、2D Pro Gate まで段階的に実装するための入口である。Phase 0〜17 の履歴と、現在優先する 2D 完成ロードマップをつなぐ。

詳細な作業内容は、次の分割文書を正本として扱う。

- `docs/implementation/PHASES_00_05.md`
- `docs/implementation/PHASES_06_13.md`
- `docs/implementation/PHASES_14_17.md`
- `docs/implementation/TEST_AND_RELEASE.md`
- `docs/future/2D_COMPLETION_ROADMAP.md`（Phase 17 後の着手順、担当モデル、並行実行、2D Pro Gate の正本）

2D Pro の完成条件は `docs/future/2D_COMPLETE_PRODUCT_SPEC.md`、データ、対象別出力、端末品質は同ディレクトリの専門文書を正本とする。

---

## 2. 基本方針

- まずデータ形式を決める。
- 次に保存、読み込み、書き出しを作る。
- その後に UI と編集機能を作る。
- WebGPU、3D、Unity、Godot、Spine、Rive の完全対応は初期版に入れない。
- スマホ、iPad、PC の操作を最初から意識する。
- 仕様変更が必要な場合は、先に docs を更新する。

---

## 3. フェーズ一覧

| Phase | 名称 | 詳細文書 |
|---:|---|---|
| 0 | 開発基盤 | `PHASES_00_05.md` |
| 1 | データ形式 | `PHASES_00_05.md` |
| 2 | 保存と読み込み | `PHASES_00_05.md` |
| 3 | 最小 UI | `PHASES_00_05.md` |
| 4 | 画像取り込み | `PHASES_00_05.md` |
| 5 | キャンバス編集 | `PHASES_00_05.md` |
| 6 | 画像編集 | `PHASES_06_13.md` |
| 7 | レイヤーとパーツ | `PHASES_06_13.md` |
| 8 | 原点、アンカー、当たり判定 | `PHASES_06_13.md` |
| 9 | アニメーション | `PHASES_06_13.md` |
| 10 | 書き出し | `PHASES_06_13.md` |
| 11 | サンプル生成 | `PHASES_06_13.md` |
| 12 | モバイル調整 | `PHASES_06_13.md` |
| 13 | MVP 固定 | `PHASES_06_13.md` |
| 14 | 背景、アイテム、タイル、ギミック | `PHASES_14_17.md` |
| 15 | 簡易リグとテンプレート | `PHASES_14_17.md` |
| 16 | エンジン連携補助 | `PHASES_14_17.md` |
| 17 | v1.0.0 品質化 | `PHASES_14_17.md` |

Phase 17 後は、旧 Phase 18〜28 の順番ではなく次を優先する。

| 現在の段階 | 名称 | 主な完成内容 | 主担当 | 並行方針 |
|---|---|---|---|---|
| `2D-0` | 完成仕様の固定 | 上位4仕様、対象ユーザー、対応範囲、完成条件、判断待ちを承認可能な状態にする。完了済み。 | Fable5 / 人間判断 + Codex docs + Opus 4.8 review | 完了後に `2D-1a` へ進む。 |
| `2D-1A-BASELINE` | 現行実装 baseline | 現行 version、型、schema、`.casproj`、IndexedDB、autosave、export ZIP、migration、fixture/test coverage を `docs/future/2D_1A_BASELINE_REPORT.md` に固定する。PR #50で完了・mainへマージ済み。 | Codex docs + Opus 4.8 review | product code、schema、version、保存形式、export ZIPを変更しない完了済み前段。 |
| `2D-1a` | データ・座標・migration・復旧設計 | 5つのデータ層、Family / Variant、ID、座標、trim / flip / scale、animation / collider、target 拡張、検証、migration 契約を固定する。現在の契約上の次段階は `2D-1A-LAYERS` と `2D-1A-COORD`。 | Fable5、Codex が ADR / fixture 化 | `2D-6-PERFORMANCE` / `2D-6-A11Y` の現状基準計測だけ準備可。 |
| `2D-1b` | 保存・migration・復旧実装 | 改訂単位の整合保存、履歴・backup・trash・rollback、容量警告、安全な staged `.casproj` import と旧形式互換を実装する。 | Codex、Opus 4.8 必須 review | すべての `2D-1A-*` が accepted になるまで開始しない。`2D-2` / `2D-3` の prototype と test 設計だけ可。 |
| `2D-2` | 新規作成・取り込み・修正 | 複数 Asset、空キャンバス、template、画像 import、基本描画、非破壊修正、派生 variant、一括変更、任意形式と AI の境界を完成させる。 | Codex | `2D-1B-GATE` merge までは `2D-2-CREATE` / `2D-2-RASTER` の既存コード調査、prototype、acceptance test 設計に限定する。 |
| `2D-3` | 動き・ゲーム用情報 | timeline、可変時間、event、簡易 rig、origin / anchor / collider、素材種別 profile、ゲーム風 preview、理由付き検査、変更影響を完成させる。 | Codex、仕様変更時だけ Fable5 | `2D-1B-GATE` merge までは調査、prototype、test設計に限定する。 |
| `2D-4` | 共通書き出し・検査 | 決定的な再出力、sheet / atlas、scale、manifest / report / record、preflight、Generic Web / Canvas 2D / PixiJS / Phaser を完成させる。 | Fable5 が契約固定、Codex 実装、Opus 4.8 必須 review | `2D-5` の手順準備と `2D-6` だけ可。 |
| `2D-5` | 対象別 preset・実ツール検証 | 証拠形式と対応ラベルを固定し、Unity 2D、Godot 2D、RPG Maker MZ への持ち込みを対象バージョン付きで検証する。 | Codex、Opus 4.8 必須 review | 共通 exporter 固定後、target PR を最大2本並行可。 |
| `2D-6` | 端末・復旧・性能・アクセシビリティ | PC / iPad / スマホの全工程、入力、復旧、offline / update、性能、安全性、アクセシビリティ、代表 project と最終証拠を通す。 | Codex + 人間実機確認 + Opus 4.8 audit | `2D-2`〜`2D-5` と継続並行し、完了判定は最後。 |


現在位置:

- `2D-0`: 完了。
- `2D-1A-BASELINE`: PR #50で完了し、baseline reportはmainへマージ済み。
- `2D-1A-LAYERS`: PR #52で accepted。ADR-0002（ID・参照）、ADR-0003（Family / Variant の現行解釈）、ADR-0007（データ5層）で固定した。
- `2D-1A-COORD`: PR #52で accepted。ADR-0001（座標と transform）、ADR-0004（trim / atlas / scale 境界）、ADR-0005（flip規則）で固定した。
- `2D-1A-MOTION`: 次の契約作業。animation event、可変時間、rig bake、frame別上書き、polygon の境界は未決定であり、Codexだけで新規決定しない。
- `2D-1A-TARGET`: 未着手。
- `2D-1A-PROVENANCE`: 未着手。
- `2D-1A-VALIDATION`: 未着手。
- `2D-1A-MIGRATION`: ADR-0006で migration・復旧境界の骨子を一部固定したが、work package 全体は未完了。
- `2D-1B-*`: 開始禁止。すべての `2D-1A-*` が accepted になるまで保存・migration・復旧の本実装を開始しない。
- `2D-1A-CONTRACT`: PR #52で使われた歴史的な総称。現在の正式な進捗管理は、細分化された `2D-1A-*` IDを使用する。PR #52で `2D-1a` 全体が完了したとは扱わない。
- Codexだけで並行可能な準備作業: `2D-6-PERFORMANCE` / `2D-6-A11Y` の現状基準計測、`2D-2-CREATE` / `2D-2-RASTER` の既存コード調査・prototype・acceptance test設計。これらは実装済み扱いにしない。

詳細な依存関係、同時に変更してはいけない契約、最大3本の PR レーンは `docs/future/2D_COMPLETION_ROADMAP.md` を参照する。2D Pro Gate を人間が承認するまで、旧 Phase 22〜28 の 3D へ進まない。

---

## 4. 初期実装時の記録

次はプロジェクト開始時に Phase 0 と Phase 1 を実装した時の記録であり、現在の次タスクではない。

作業内容:

- Vite + React + TypeScript の開発基盤を作る。
- ESLint、Prettier、Vitest を設定する。
- `src/core/model` に主要な型を作る。
- `src/core/schema` に JSON Schema を作る。
- サンプル asset JSON を作る。
- schema 検証テストを作る。
- `docs/DATA_FORMAT.md` を作る。
- README に起動手順を追記する。

完了条件:

- `npm install` が通る。
- `npm run build` が通る。
- `npm run test` が通る。
- サンプル asset JSON が schema 検証を通る。
- README から開発開始手順が分かる。

---

## 5. 完成の判断

このプロジェクトの完成は、見た目の画面ができた時ではない。

v1.0.0 の完成とは、ゲーム用アセットを作り、ゲーム用メタデータを付け、保存して再開し、書き出してゲームへ組み込める状態である。さらに PC、スマホ、iPad で破綻せず、データ形式とテストが文書化されていることを条件とする。

2D Pro の完成は、空から作る、既存素材を直す、ゲーム用情報を付ける、対象別に検査・書き出す、別端末で再編集する流れを満たし、`docs/future/2D_COMPLETION_ROADMAP.md` の 2D Pro Gate を人間が承認した時とする。

---

## 6. 現在の標準運用

2D 完成計画は `docs/DEVELOPMENT_MODES.md` の Hybrid Roadmap Mode で進める。

1. Fable5 または人間が段階開始時の判断と work package を固定する。
2. Codex が code、tests、docs を1つの draft PRへ実装する。
3. CI が成功した後、Opus 4.8 が review-only で確認する。
4. `BLOCKER` / `MUST` は Codex が同じ PRで修正する。
5. 最終 merge は人間が判断する。

Fable5 は通常実装、Opus 4.8 は通常のコード修正、Codex は未確定仕様の最終判断を担当しない。

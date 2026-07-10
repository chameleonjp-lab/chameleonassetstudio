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

| 現在の段階 | 名称 | 主担当 | 並行方針 |
|---|---|---|---|
| `2D-0` | 完成仕様の固定 | Fable5 / 人間判断 + Codex docs + Opus 4.8 review | 完了後に `2D-1a` へ進む。 |
| `2D-1a` | データ・座標・migration・復旧設計 | Fable5、Codex が ADR / fixture 化 | `2D-6` の基準計測だけ準備可。 |
| `2D-1b` | 保存・migration・復旧実装 | Codex、Opus 4.8 必須 review | `2D-2` / `2D-3` の prototype と test 設計だけ可。 |
| `2D-2` | 新規作成・取り込み・修正 | Codex | 契約が重ならない `2D-3`、対象画面の `2D-6` と並行可。 |
| `2D-3` | 動き・ゲーム用情報 | Codex、仕様変更時だけ Fable5 | 契約が重ならない `2D-2`、`2D-4` の fixture 設計、`2D-6` と並行可。 |
| `2D-4` | 共通書き出し・検査 | Fable5 が契約固定、Codex 実装、Opus 4.8 必須 review | `2D-5` の手順準備と `2D-6` だけ可。 |
| `2D-5` | 対象別 preset・実ツール検証 | Codex、Opus 4.8 必須 review | 共通 exporter 固定後、target PR を最大2本並行可。 |
| `2D-6` | 端末・復旧・性能・アクセシビリティ | Codex + 人間実機確認 + Opus 4.8 audit | `2D-2`〜`2D-5` と継続並行し、完了判定は最後。 |

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

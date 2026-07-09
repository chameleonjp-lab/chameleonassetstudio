# Fable-aware / Fableless Development Guide

最終更新日: 2026-07-09  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
文書種別: Fable5 可用性に応じた開発運用書  
上位文書: `CLAUDE.md`, `AGENTS.md`, `docs/REQUIREMENTS_SPECIFICATION.md`, `docs/IMPLEMENTATION_PLAN.md`

---

## 1. 目的

この文書は、Chameleon Asset Studio を Fable5 が使える時も使えない時も継続して進めるための運用ルールを定義する。

実行時の主指示は次の 2 つに分離する。

- Claude Code Primary Mode: `CLAUDE.md`
- Codex Fallback Mode: `AGENTS.md`

Fable5 が使える間は Claude Code を主担当にする。Fable5 が制限されている間、またはユーザーが明示した場合は Codex へ退避する。

---

## 2. 運用モード

### 2.1 Claude Code Primary Mode

Fable5 / `claude-fable-5` が使える間は、Claude Code を開発の中心にする。

Claude Code 内の役割:

| 役割 | 担当 | 用途 |
|---|---|---|
| Director | Fable5 / `claude-fable-5` | 仕様判断、優先順位、方針決定、複雑なトレードオフ判断 |
| Implementation | Sonnet5 / `claude-sonnet-5` | 既存設計に沿う実装、UI、TypeScript、CSS、テスト追加 |
| Quality Review | Opus 4.8 / `claude-opus-4-8` | 設計整合、バグ原因、エッジケース、互換性レビュー |
| Scanner | Haiku / `claude-haiku-4-5` | ファイル探索、docs 要約、ログ分類、軽い確認 |

このモードでは Codex は通常使わない。Codex は退避先であり、主担当ではない。

ユーザーが Claude Code 用のプロンプトを求めた場合は、Claude Code 内で完結する前提で書く。Codex 依頼文を作るのは、ユーザーが Codex 退避を明示した場合、または Fable5 制限により Codex Fallback Mode に切り替える場合だけにする。

### 2.2 Codex Fallback Mode

Fable5 が制限されている、使えない、または Claude Code で継続するより Codex の方が安定する場合は、Codex Fallback Mode に切り替える。

Codex Fallback Mode では `AGENTS.md` を主指示にする。

このモードでの役割:

- Codex: 最小実装、テスト追加、docs 更新、差分説明。
- Claude Code: Codex 依頼文作成、PR レビュー、失敗原因分析、次の方針整理。
- 人間確認: 互換性破壊、Phase 範囲拡大、事業方針変更、判断割れの最終確認。

Fable5 が戻った場合は、重要な方針判断を Claude Code Primary Mode に戻して確認する。

---

## 3. Fable5 の使い方

Fable5 を常用しない。Fable5 は Director として、判断だけに使う。

Fable5 を使う場面:

- 全体アーキテクチャ判断。
- 制作体験の方向性判断。
- 新規メカニクスや根本仕様変更。
- 複雑なトレードオフ判断。
- 複数案の優先順位付け。
- 他モデルで解決できなかった根本問題の再考。

Fable5 でしてはいけないこと:

- 具体的なコード実装。
- ファイル探索。
- 長いログ読み。
- 単純な docs 更新。
- 軽微な UI / CSS / テスト修正。

---

## 4. モデルに判断を丸投げしない

弱いモデルに高度な設計判断を代行させない。

代わりに、次の順番で進める。

1. 既存 docs を読む。
2. 既存コードの関係ファイルだけを調査する。
3. 変更範囲を小さくする。
4. 仕様判断が必要な点を箇条書きで分ける。
5. 破壊的変更を避ける。
6. 変更後に tests と docs を更新する。
7. 高難度レビューを Opus 4.8 で行う。
8. それでも判断が割れる場合だけ、人間判断に戻す。

---

## 5. 必ず docs を確認する作業

次に該当する場合は、実装前に docs を確認する。

- `asset.json` を変更する。
- `.casproj` を変更する。
- JSON Schema を変更する。
- 書き出し ZIP の構成を変更する。
- 座標系を変更する。
- 原点、アンカー、当たり判定、リグ、アニメーションに影響する。
- 既存 E2E の期待値を変更する。
- Phase の完了条件を変更する。
- 外部 dependency を追加する。
- 3D 関連へ触れる。

該当 docs:

- `docs/REQUIREMENTS_SPECIFICATION.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/DATA_FORMAT.md`
- `docs/EXPORT_FORMATS.md`
- `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`
- `docs/future/COLLIDER_EDITING_DESIGN.md`
- `docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md`
- `docs/future/LIBRARY_EVALUATION_LOG.md`

---

## 6. 1 PR 1 目的

1 つの PR では、1 つの目的だけを扱う。

良い例:

- `fix: reject missing texture blob during export`
- `feat: add effect asset minimal settings`
- `docs: split Claude Code and Codex instructions`

悪い例:

- `feat: finish phase 19`
- `fix everything`
- `refactor editor and update docs and add 3d`

開始前に open PR を確認し、同じ目的の PR を重複作成しない。

---

## 7. 人間確認に戻すべき判断

次に該当する場合は、実装を止めて人間確認に戻す。

- `asset.json` の version を上げる。
- `.casproj` の構造を変える。
- 既存 `.casproj` を読めなくする可能性がある。
- 座標系の定義を変える。
- 原点の意味を変える。
- frame / animation の意味を変える。
- rig bake の座標変換を変える。
- export ZIP の既存ファイルを削除または移動する。
- ライセンスが未確認の外部ライブラリを dependencies に追加する。
- 3D 生成 AI を標準機能として組み込む。
- WebGPU 必須化を検討する。
- SaaS / アカウント / クラウド / 課金 / ランキング / Supabase を導入する。
- Fable5、Opus、Sonnet、Codex の判断が割れる。

---

## 8. 実装前の標準チェック

すべての実装タスクは、次のテンプレートから始める。

```md
## 今回の目的
-

## 運用モード
- Claude Code Primary Mode / Codex Fallback Mode
- 理由:

## 今回やらないこと
-

## 読んだ docs
-

## 関係ファイル
-

## 変更予定ファイル
-

## model / agent
- 方針判断:
- 調査:
- 実装:
- テスト:
- docs:
- 最終レビュー:

## 人間確認が必要か
- 不要 / 必要
- 理由:

## 停止条件
-
```

Fable5 を使う場合だけ、次を明示する。

```md
【Fable5判断】
- 判断対象:
- 結論:
- 理由:
- 委譲内容:
```

---

## 9. 実装後の標準報告

```md
## 実装内容
-

## 変更ファイル
-

## 実行したテスト
- `npm run build`:
- `npm run test`:
- `npm run e2e`:
- `npm run lint`:
- `npm run format:check`:

## docs 更新
- あり / なし

## 仕様との差分
- なし / あり

## 互換性への影響
- `asset.json`:
- `.casproj`:
- export ZIP:
- JSON Schema:

## 残課題
-

## 次にやる最小タスク
-
```

---

## 10. レビューの段階化

### 10.1 機械的レビュー

担当: Haiku

確認:

- format。
- lint。
- test failure の分類。
- 変更ファイルの一覧。
- docs 更新漏れ。

### 10.2 実装レビュー

担当: Sonnet5 / Codex

確認:

- 実装が既存設計に沿っているか。
- テストがあるか。
- 既存機能を壊していないか。
- 変更範囲が大きすぎないか。

Claude Code Primary Mode では Sonnet5 が実装側を担う。Codex Fallback Mode では Codex が実装側を担う。

### 10.3 設計レビュー

担当: Opus 4.8

確認:

- docs と矛盾していないか。
- `asset.json` / `.casproj` / export ZIP の互換性を壊していないか。
- Phase の範囲を超えていないか。
- 次の実装者が誤解しないか。

### 10.4 戦略レビュー

担当: Fable5 または人間確認

確認:

- 仕様変更が妥当か。
- 複数案の優先順位が妥当か。
- 制作体験やゲーム用途の方向性と合うか。

Fable5 が使えない場合は、Opus 4.8 レビュー後に人間確認へ戻す。

---

## 11. 外部ライブラリ採用時のルール

外部ライブラリを採用する場合は、実装前に `docs/future/LIBRARY_EVALUATION_LOG.md` を作るか、既存の評価表に追記する。

最低限、次を書く。

```md
## ライブラリ名

- 用途:
- 採用対象フェーズ:
- npm / Python / binary / external service:
- ライセンス:
- 商用利用条件:
- ブラウザ対応:
- Node.js 対応:
- 必要な GPU / CPU / メモリ:
- 入力形式:
- 出力形式:
- セキュリティ上の注意:
- 代替候補:
- 採用判断:
- 採用しない場合の理由:
```

ライセンスが未確認なら、コードに入れてはいけない。

README に書かれた説明だけで商用利用可能と判断してはいけない。採用前に、公式 LICENSE ファイル、モデルカード、利用規約、関連する重みファイルのライセンスを確認する。

---

## 12. 3D 関連実装時の追加ルール

3D 関連は、特に実装を急いではいけない。

禁止:

- 3D 生成 AI をいきなり本体へ組み込む。
- Python GPU 処理をブラウザ側に持ち込む。
- ライセンス未確認のモデル重みを使う。
- 生成モデルの出力品質を前提に UI を作る。
- 2D アセットの既存データ形式を 3D 都合で壊す。

先に作るもの:

1. GLB / glTF の読み込み。
2. 表示と検品。
3. メタデータ付与。
4. 軽量化候補の評価。
5. 外部 3D 生成連携は最後に設計だけ行う。

---

## 13. 現在の進め方

Phase 17 までの既存機能を壊さず、Phase 18 以降は小さな PR に分ける。

Phase 19-C の当たり判定編集では、多角形判定や schema 変更を急がない。既存 rect / circle の UI 操作、表示、選択、移動、安定したテストを先に整える。

Fable5 が使える間は Claude Code Primary Mode で進める。Fable5 が制限されている間は Codex Fallback Mode に切り替える。
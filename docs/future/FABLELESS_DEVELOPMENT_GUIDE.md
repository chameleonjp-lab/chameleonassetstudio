# Fableless / Fable-aware Development Guide

最終更新日: 2026-07-09  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
文書種別: Fable5 可用性に依存しない開発運用書  
上位文書: `CLAUDE.md`, `AGENTS.md`, `docs/REQUIREMENTS_SPECIFICATION.md`, `docs/IMPLEMENTATION_PLAN.md`

---

## 1. 目的

この文書は、Chameleon Asset Studio を Fable5 が使える時も使えない時も継続して進めるための運用ルールを定義する。

実行時の主指示は次の 2 つに分離する。

- Claude Code: `CLAUDE.md`
- Codex: `AGENTS.md`

この文書は、Phase 18 以降、設計レビュー、Fable5 代替運用、複数 agent の責務分離を確認するための補助文書である。

---

## 2. 基本方針

### 2.1 Fable5 を常用しない

Fable5 / `claude-fable-5` が一時的に使える場合でも、常用しない。

Fable5 は次に限定する。

- 全体アーキテクチャ判断
- ゲーム / 制作体験の方向性判断
- 新規メカニクスや根本仕様変更
- 複雑なトレードオフ判断
- 複数案の優先順位付け
- 他モデルで解決できなかった根本問題の再考

Fable5 で次をしてはいけない。

- 具体的なコード実装
- ファイル探索
- 長いログ読み
- 単純な docs 更新
- 軽微な UI / CSS / テスト修正

### 2.2 Fable5 が使えない場合

Fable5 が使えない場合でも、作業は止めない。

代替運用は次の通り。

1. Haiku で探索・関係ファイル抽出を行う。
2. Sonnet または Codex で最小実装を行う。
3. Opus で設計整合・エッジケース・互換性をレビューする。
4. Opus でも判断が割れる場合は人間確認に戻す。

### 2.3 モデルに判断を丸投げしない

弱いモデルに高度な設計判断を代行させない。

代わりに、次の順番で進める。

1. 既存 docs を読む。
2. 既存コードの関係ファイルだけを調査する。
3. 変更範囲を小さくする。
4. 仕様判断が必要な点を箇条書きで分ける。
5. 破壊的変更を避ける。
6. 変更後に tests と docs を更新する。
7. 高難度レビューを Opus で行う。
8. それでも判断が割れる場合だけ、人間判断に戻す。

---

## 3. モデル割り当て

| 作業 | 原則担当 | 備考 |
|---|---|---|
| コード探索 | Haiku / `claude-haiku-4-5` | 編集禁止。関係ファイルと仕様箇所の抽出まで |
| docs 要約 | Haiku / `claude-haiku-4-5` | 判断ではなく要約 |
| 軽微修正 | Haiku または Sonnet | docs / CSS / lint 程度 |
| 通常の主実装 | Codex または Sonnet | 1 PR 1 目的。既存設計に沿う |
| 中程度の実装レビュー | Sonnet | 既存設計との整合を見る |
| テスト失敗分類 | Haiku または Opus | 単純分類は Haiku、複雑原因は Opus |
| 高難度レビュー | Opus / `claude-opus-4-8` | 互換性、エッジケース、設計整合 |
| 戦略判断 | Fable5 / `claude-fable-5` | 使用量を最小化。使えない場合は人間確認 |
| 最重要判断 | 人間確認 | データ形式破壊や事業方針変更など |

---

## 4. 必ず docs を確認する作業

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

## 5. 1 PR 1 目的

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

## 6. 人間確認に戻すべき判断

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

## 7. 実装前の標準チェック

すべての実装タスクは、次のテンプレートから始める。

```md
## 今回の目的
-

## 今回やらないこと
-

## 読んだ docs
-

## 関係ファイル
-

## 変更予定ファイル
-

## model / agent
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

## 8. 実装後の標準報告

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

## 9. レビューの段階化

### 9.1 機械的レビュー

担当: Haiku

確認:

- format
- lint
- test failure の分類
- 変更ファイルの一覧
- docs 更新漏れ

### 9.2 実装レビュー

担当: Codex / Sonnet

確認:

- 実装が既存設計に沿っているか
- テストがあるか
- 既存機能を壊していないか
- 変更範囲が大きすぎないか

### 9.3 設計レビュー

担当: Opus

確認:

- docs と矛盾していないか
- `asset.json` / `.casproj` / export ZIP の互換性を壊していないか
- Phase の範囲を超えていないか
- 次の実装者が誤解しないか

### 9.4 戦略レビュー

担当: Fable5 または人間確認

確認:

- 仕様変更が妥当か
- 複数案の優先順位が妥当か
- 制作体験やゲーム用途の方向性と合うか

Fable5 が使えない場合は、Opus レビュー後に人間確認へ戻す。

---

## 10. 外部ライブラリ採用時のルール

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

## 11. 3D 関連実装時の追加ルール

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

## 12. 現在の進め方

Phase 17 までの既存機能を壊さず、Phase 18 以降は小さな PR に分ける。

Phase 19-C の当たり判定編集では、多角形判定や schema 変更を急がない。既存 rect / circle の UI 操作、表示、選択、移動、安定したテストを先に整える。

Fable5 が一時的に使える場合も、実装は Codex / Sonnet、探索は Haiku、検証は Opus に委譲し、Fable5 は「何をどう作るべきか」の判断だけに使う。

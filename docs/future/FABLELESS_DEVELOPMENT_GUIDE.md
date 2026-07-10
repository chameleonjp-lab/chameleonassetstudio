# Fable-aware / Fableless Development Guide

最終更新日: 2026-07-10
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
文書種別: Phase 18 以降の補助運用書
上位文書: `docs/DEVELOPMENT_MODES.md`, `CLAUDE.md`, `AGENTS.md`

---

## 1. 目的

この文書は、Phase 18 以降の実装で迷いやすい点を補助するための運用書である。

開発モードとモデル割り当ては `docs/DEVELOPMENT_MODES.md` を正本にする。

- Fable5 が使える間: Claude Code Primary Mode（`CLAUDE.md`）
- Fable5 が制限中、またはユーザーが明示した場合: Codex Fallback Mode（`AGENTS.md`）

この文書には、Phase 18 以降で特に注意する作業範囲、PR 粒度、レビュー観点だけを残す。

---

## 2. Phase 18 以降の基本方針

- Phase 1〜17 の既存機能を壊さない。
- ローカル中心の制作ツールとして進める。
- SaaS、アカウント、クラウド同期、課金は入れない。
- 3D 生成 AI を本体の標準機能として組み込まない。
- 2D アセット制作体験、書き出し品質、保存・端末信頼性を `2D_COMPLETION_ROADMAP.md` の順番で完成させる。3D の読み込み・検品・軽量化は 2D Pro Gate の人間承認後にだけ扱う。
- 仕様判断が必要な場合は、実装を大きく進める前に判断点を分ける。

---

## 3. 必ず docs を確認する作業

次に該当する場合は、実装前に関係 docs を確認する。

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
- `docs/future/2D_COMPLETE_PRODUCT_SPEC.md`
- `docs/future/2D_ASSET_DATA_CONTRACT.md`
- `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`
- `docs/future/2D_DEVICE_RELIABILITY_SPEC.md`
- `docs/future/2D_COMPLETION_ROADMAP.md`
- `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`（旧計画。3D は 2D Pro Gate 後）
- `docs/future/COLLIDER_EDITING_DESIGN.md`
- `docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md`

---

## 4. 1 PR 1 目的

1 つの PR では、1 つの目的だけを扱う。

これは、1 ファイル、1 ボタン、1 テストごとに PR を分ける意味ではない。同じ目的を完成させる実装、テスト、docs、CI 安定化は 1 つの PR にまとめてよい。

良い例:

- `fix: reject missing texture blob during export`
- `feat: add effect asset minimal settings`
- `docs: optimize development mode routing`

悪い例:

- `feat: finish phase 19`
- `fix everything`
- `refactor editor and update docs and add 3d`

開始前に open PR を確認し、同じ目的の PR を重複作成しない。

次は影響範囲が大きいため、通常の UI 改善とは別 PR にする。

- JSON Schema / `asset.json` version。
- `.casproj` 構造。
- export ZIP 構造。
- dependencies 追加。
- 3D 関連。
- 外部ツール向け出力形式。

---

## 5. テストの扱い

- テストは変更禁止の仕様書ではなく、現在の仕様を確認する手段として扱う。
- 仕様・UI が意図して変わった場合は、理由と新しい期待値を記録してテストを更新してよい。
- テストの準備、待機、IndexedDB 読み取り、座標依存などに欠陥がある場合は、実装を無理にテストへ合わせず、テストを安定化する。
- 失敗を隠すための削除や skip は行わない。
- 一時的な skip には、原因、復帰条件、未検証範囲を書く。
- Markdown 文書だけの変更では、コード用の build / unit / E2E を必須にしない。

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
- Fable5、Opus 4.8、Sonnet5、Codex の判断が割れる。

---

## 7. 実装前の標準チェック

```md
## 今回の目的
-

## 運用モード
- Claude Code Primary Mode / Codex Fallback Mode
- 理由:

## 今回やらないこと
-

## 読んだ docs / files
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

担当: Haiku / Codex

確認:

- format。
- lint。
- test failure の分類。
- 変更ファイルの一覧。
- docs 更新漏れ。

### 9.2 実装レビュー

担当: Sonnet5 / Codex

確認:

- 実装が既存設計に沿っているか。
- テストがあるか。
- 既存機能を壊していないか。
- 変更範囲が大きすぎないか。

Claude Code Primary Mode では Sonnet5 が実装側を担う。Codex Fallback Mode では Codex が実装側を担う。

### 9.3 設計レビュー

担当: Opus 4.8

確認:

- docs と矛盾していないか。
- `asset.json` / `.casproj` / export ZIP の互換性を壊していないか。
- Phase の範囲を超えていないか。
- 次の実装者が誤解しないか。

最終承認のための設計レビューは、必要な CI 成功後に行う。ただし、CI の失敗原因を調べる診断レビューは CI 失敗中でも行ってよい。

### 9.4 戦略レビュー

担当: Fable5 または人間確認

確認:

- 仕様変更が妥当か。
- 複数案の優先順位が妥当か。
- 制作体験やゲーム用途の方向性と合うか。

Fable5 が使えない場合は、Opus 4.8 レビュー後に人間確認へ戻す。

---

## 10. 外部ライブラリ採用時のルール

外部ライブラリを採用する場合は、実装前に採用する PR 内で評価記録を新規作成するか、既存の評価記録に追記する。

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

この節は、`2D_COMPLETION_ROADMAP.md` の 2D Pro Gate を人間が承認した**後**にだけ適用する。承認前は、3D の library 評価、dependency 追加、画面、schema、実装を開始してはいけない。

承認後も、3D 関連は特に実装を急いではいけない。

禁止:

- 3D 生成 AI をいきなり本体へ組み込む。
- Python GPU 処理をブラウザ側に持ち込む。
- ライセンス未確認のモデル重みを使う。
- 生成モデルの出力品質を前提に UI を作る。
- 2D アセットの既存データ形式を 3D 都合で壊す。

先に作るもの:

1. GLB / glTF の読み込み。
2. 3D プレビュー。
3. bounds / 原点 / 足元 / metadata 表示。
4. 3D 検品。
5. 必要なら軽量化候補の評価。

3D 生成連携は、外部ツールへ渡す export / import notes から検討する。

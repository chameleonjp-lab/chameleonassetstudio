# Chameleon Asset Studio

Chameleon Asset Studio は、ブラウザゲームで使う 2D アセットを作成・編集・ゲーム用データ化するための Web ツールです。

このリポジトリでは、最初に実装へ入る前の正本として、以下の 2 つの文書を置きます。

- [要件仕様書](docs/REQUIREMENTS_SPECIFICATION.md)
- [最終完成までの実装計画書](docs/IMPLEMENTATION_PLAN.md)

AI エージェント向けの上位運用は [`docs/DEVELOPMENT_MODES.md`](docs/DEVELOPMENT_MODES.md) に集約しています。Fable5 が使える間は [`CLAUDE.md`](CLAUDE.md) に沿って Claude Code Primary Mode で進め、Fable5 制限時またはユーザーが明示した場合だけ [`AGENTS.md`](AGENTS.md) に沿って Codex Fallback Mode へ退避します。

使い方は [ユーザーガイド](docs/USER_GUIDE.md)、テストは [テスト計画書](docs/TEST_PLAN.md)、リリース判定は [リリースチェックリスト](docs/RELEASE_CHECKLIST.md) を参照してください。

Phase 17 完了後の将来計画は [docs/future/](docs/future/README.md) にあります。まず [2D 完成形仕様](docs/future/2D_COMPLETE_PRODUCT_SPEC.md) と [2D 完成ロードマップ](docs/future/2D_COMPLETION_ROADMAP.md) に従い、空キャンバス作成、テンプレート、修正、検品、対象別の書き出し、端末・復旧までを 2D Pro Gate として完成させます。**この gate を人間が承認するまでは、旧 Phase 22〜28 の 3D 実装を開始しません。**

将来方針として、Chameleon Asset Studio を画像取り込み専用の変換ツールには限定しません。空キャンバス、テンプレート、図形、パーツ、既存素材の修正から作成し、Unity / Godot / RPG Maker / Blender などには、まず直接連携ではなく持ち込み可能なファイルと import notes を出す方針です。完成形、保存・座標の契約、対象別の検証条件、端末品質は、[2D 完成形仕様](docs/future/2D_COMPLETE_PRODUCT_SPEC.md)、[データ契約](docs/future/2D_ASSET_DATA_CONTRACT.md)、[互換性表](docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md)、[端末・信頼性仕様](docs/future/2D_DEVICE_RELIABILITY_SPEC.md) を参照してください。

## このプロジェクトの目的

このツールは、一般的な画像編集ソフトや総合ゲームエンジンではありません。

目的は、画像・手描き・図形・パーツ・テンプレート・既存素材を元に、キャラクター、アイテム、背景、ギミック、エフェクトとしてゲームに組み込める形へ変換することです。

最初の重要な成果物は、見た目の編集機能ではなく、次の 4 点です。

1. アセットを作る。
2. アニメーションを作る。
3. 当たり判定、原点、アンカーなどのゲーム用情報を付ける。
4. PNG / WebP / JSON / ZIP として書き出し、必要に応じて外部ツールへ持ち込む説明を添える。

## 実装者への注意

実装に入る前に、`docs/REQUIREMENTS_SPECIFICATION.md` と `docs/IMPLEMENTATION_PLAN.md` を確認してください。小さな修正では、関係する箇所を優先して読んで構いません。

Fable5 / `claude-fable-5` が使える間は Claude Code を主担当とし、Claude Code 内で Fable5（方針判断）、Sonnet5（実装）、Opus 4.8（レビュー）、Haiku（探索）を使い分けます。Fable5 が制限されている間、またはユーザーが明示した場合は Codex Fallback Mode として `AGENTS.md` に沿って Codex へ退避します。詳しい使い分けは `docs/DEVELOPMENT_MODES.md` を参照してください。

Phase 18 以降の作業、または `asset.json` / `.casproj` / export ZIP / 座標系 / 原点 / アンカー / 当たり判定 / リグ / 3D 関連に触れる作業では、`docs/future/FABLELESS_DEVELOPMENT_GUIDE.md`、`docs/future/2D_COMPLETION_ROADMAP.md`、関係する 2D 完成仕様を確認してください。旧 `POST_PHASE17_IMPLEMENTATION_PLAN.md` は実装済み範囲と旧計画の記録として残しています。

作成方法、作成可能ファイル、外部ツール向け書き出し、2D / 3D の画面分離、リポジトリ分離判断に触れる場合は、`docs/future/ASSET_CREATION_AND_EXPORT_STRATEGY.md`、`docs/future/PRODUCT_DIRECTION_2D_TO_3D.md`、`docs/future/DECISION_LOG.md` も参照してください。

仕様に迷った場合は、推測で大きく進めないでください。小さな実装なら前提を明記して進め、互換性や方針に影響する場合だけ未確定事項として docs に追記し、人間確認へ戻してください。

## 開発の始め方

必要環境: Node.js 20 以上（推奨 22）と npm。

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動（http://localhost:5173）
npm run dev

# 型チェック + プロダクションビルド
npm run build

# ユニットテスト（Vitest）
npm run test

# E2E テスト（Playwright。初回は npx playwright install chromium が必要）
npm run e2e

# Lint / フォーマット
npm run lint
npm run format
```

## ディレクトリ構成

```txt
src/
├─ app/        … アプリの画面（UI）
├─ core/       … データ形式と共通ロジック（UI に依存しない）
│  ├─ model/   … TypeScript 型と migrate 関数
│  ├─ schema/  … JSON Schema と検証関数
│  └─ samples/ … schema 検証を通るサンプルデータ
├─ features/   … 編集機能（取り込み、キャンバス、書き出しなど）
├─ renderers/  … Canvas 2D / PixiJS 描画層
└─ workers/    … Web Worker（重い画像処理）
docs/          … 仕様書、実装計画書、データ形式書
e2e/           … Playwright E2E テスト
```

データ形式の詳細は [データ形式書](docs/DATA_FORMAT.md) を参照してください。

## 実装状況

- [x] Phase 0: 開発基盤（Vite + React + TypeScript、ESLint、Prettier、Vitest、Playwright、CI）
- [x] Phase 1: データ形式（型、JSON Schema、サンプル、migrate 入口、検証テスト）
- [x] Phase 2: 保存・読み込み（IndexedDB、自動保存キュー、`.casproj` 読み書き基盤、ストレージ使用量）
- [x] Phase 3: 最小 UI（ホーム画面、新規作成・一覧・削除、編集画面の枠、スマホ用下部ナビ）
- [x] Phase 4: 画像取り込み（PNG / JPG / WebP、D&D、元画像・編集用・サムネイル分離、サイズ制限）
- [x] Phase 5: キャンバス編集（Canvas 2D 表示、市松模様、ズーム / パン、選択、ドラッグ移動、数値入力、Undo / Redo）
- [x] Phase 6: 画像編集（トリミング、背景透過、消しゴム、HSL 色調整、パレット置換、輪郭線、Web Worker 実行）
- [x] Phase 7: レイヤーとパーツ（レイヤーパネル、並べ替え・表示・ロック・削除、画像/ガイドレイヤー追加、パーツ作成・種別・pivot）
- [x] Phase 8: 原点・アンカー・当たり判定（原点ツール + ガイド表示、アンカー追加/移動/用途、矩形・円判定と表示切替）
- [x] Phase 9: アニメーション（フレーム取り込み・並べ替え・複製・削除、アニメーション作成・fps/ループ編集、再生・停止・先頭へ、キャンバスプレビュー）
- [x] Phase 10: 書き出し（PNG / WebP / asset.json / Sprite Sheet + Atlas JSON / ZIP、書き出し前 schema 検証、Blob URL ダウンロード）
- [x] Phase 11: サンプルコード生成（Canvas 2D / PixiJS / Phaser の最小例、原点・アンカー・当たり判定のデバッグ表示、アニメーション再生例）
- [x] Phase 12: モバイル最適化（スマホ縦横 / iPad レイアウト、下部ナビ、タッチ操作、iOS 入力ズーム防止、タップ対象サイズ確保）
- [x] Phase 13: MVP 固定（`.casproj` の UI 読み書き、MVP チェックリスト消化、iPad 主要編集 E2E、docs 更新）
- [x] Phase 14: 背景・アイテム・タイル・ギミック（型別設定、ゲーム属性エディタ、背景パララックスプレビュー、tile 設定の atlas 同梱）
- [x] Phase 15: 高度編集（簡易リグ: パーツ親子・バインドポーズ・可動域・キーフレーム・拡大率・フレーム焼き込み、モーションテンプレート 6 種）
- [x] Phase 15.5: 品質補修（画像 Blob 欠落の検出、image レイヤーの textureId 必須化、画像デコードの Safari 系フォールバック、Blob URL 解放の安全化）
- [x] Phase 16: エンジン連携補助（helpers/ 組み込み用 snippet 3 種、engines/ Godot・Unity 取り込みガイド、Rive / Spine の関係を docs 化）
- [x] Phase 17: v1.0.0 品質化（文書整備、effect アセットの最小対応、`.casproj` 読み込み時の画像欠落警告、画像デコードの共通フォールバック統合。実機ブラウザ確認は `docs/RELEASE_CHECKLIST.md` の手動確認推奨項目）

## 初期方針

- 初期版は 2D アセット制作に集中する。
- 3D、Unity 完全連携、Godot 完全連携、Spine 完全互換、WebGPU 必須化は初期範囲に入れない。
- PC、スマホ、iPad で開ける Web アプリにする。
- v1.0.0 ではスマホの軽編集、確認、テンプレート適用、書き出しを優先した。2D Pro では、画面構成を分けつつ、作成から再読み込みまでの全工程に到達できることを目標にする。
- データ形式を先に固定し、UI は後から改善できる構造にする。

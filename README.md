# Chameleon Asset Studio

Chameleon Asset Studio は、ブラウザゲームで使う 2D アセットを作成・編集・ゲーム用データ化するための Web ツールです。

このリポジトリでは、最初に実装へ入る前の正本として、以下の 2 つの文書を置きます。

- [要件仕様書](docs/REQUIREMENTS_SPECIFICATION.md)
- [最終完成までの実装計画書](docs/IMPLEMENTATION_PLAN.md)

使い方は [ユーザーガイド](docs/USER_GUIDE.md)、テストは [テスト計画書](docs/TEST_PLAN.md)、リリース判定は [リリースチェックリスト](docs/RELEASE_CHECKLIST.md) を参照してください。

## このプロジェクトの目的

このツールは、一般的な画像編集ソフトや総合ゲームエンジンではありません。

目的は、画像・手描き・図形・パーツを取り込み、キャラクター、アイテム、背景、ギミック、エフェクトとしてゲームに組み込める形へ変換することです。

最初の重要な成果物は、見た目の編集機能ではなく、次の 4 点です。

1. アセットを作る。
2. アニメーションを作る。
3. 当たり判定、原点、アンカーなどのゲーム用情報を付ける。
4. PNG / WebP / JSON / ZIP として書き出す。

## 実装者への注意

実装に入る前に、必ず `docs/REQUIREMENTS_SPECIFICATION.md` と `docs/IMPLEMENTATION_PLAN.md` を読んでください。

仕様に迷った場合は、推測で実装しないでください。  
まず仕様書に未確定事項として追記し、その後に実装してください。

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
- [x] Phase 15: 高度編集（簡易リグ: パーツ親子・バインドポーズ・可動域・キーフレーム・フレーム焼き込み、モーションテンプレート 6 種）
- [x] Phase 16: エンジン連携補助（helpers/ 組み込み用 snippet 3 種、engines/ Godot・Unity 取り込みガイド、Rive / Spine の関係を docs 化）
- [ ] Phase 17: v1.0.0 品質化 — 文書整備（USER_GUIDE / TEST_PLAN / RELEASE_CHECKLIST）と自動テスト側は完了。**実機ブラウザ確認と性能・メモリ計測が未実施**のため未完（残項目は `docs/RELEASE_CHECKLIST.md` を参照）

## 初期方針

- 初期版は 2D アセット制作に集中する。
- 3D、Unity 完全連携、Godot 完全連携、Spine 完全互換、WebGPU 必須化は初期範囲に入れない。
- PC、スマホ、iPad で開ける Web アプリにする。
- スマホは全機能編集ではなく、軽編集、確認、テンプレート適用、書き出しを優先する。
- データ形式を先に固定し、UI は後から改善できる構造にする。

# Chameleon Asset Studio 最終完成までの実装計画書

最終更新日: 2026-07-02  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md`

---

## 1. 目的

この文書は、Chameleon Asset Studio を MVP から v1.0.0 まで段階的に実装するための入口である。

詳細な作業内容は、次の分割文書を正本として扱う。

- `docs/implementation/PHASES_00_05.md`
- `docs/implementation/PHASES_06_13.md`
- `docs/implementation/PHASES_14_17.md`
- `docs/implementation/TEST_AND_RELEASE.md`

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

---

## 4. 最初の実装範囲

最初の実装では Phase 0 と Phase 1 だけを行う。

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

完成とは、ゲーム用アセットを作り、ゲーム用メタデータを付け、保存して再開し、書き出してゲームへ組み込める状態である。さらに PC、スマホ、iPad で破綻せず、データ形式とテストが文書化されていることを v1.0.0 の条件とする。

# Fableless Development Guide

最終更新日: 2026-07-05  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
文書種別: `claude-fable-5` 非依存の実装・レビュー運用書  
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md`, `docs/IMPLEMENTATION_PLAN.md`

---

## 1. 目的

この文書は、`claude-fable-5` を使わずに、Chameleon Asset Studio の実装品質を落とさずに開発を進めるための運用ルールを定義する。

`claude-fable-5` は今後使用しない。高難度の設計判断や最終レビューは `claude-opus-4-8` で行い、`claude-opus-4-8` でも判断が割れる場合は人間確認に戻す。実装は `claude-sonnet-5`、調査・軽微修正・docs・テスト分類は `claude-haiku-4-5` を使い、設計判断を文書化しながら進める。

---

## 2. 基本方針

### 2.1 モデルに判断を丸投げしない

弱いモデルに高度な設計判断を代行させてはいけない。

代わりに、次の順番で進める。

1. 既存 docs を読む。
2. 既存コードの関係ファイルだけを調査する。
3. 変更範囲を小さくする。
4. 仕様判断が必要な点を箇条書きで分ける。
5. 破壊的変更を避ける。
6. 変更後に tests と docs を更新する。
7. 最終レビューを `claude-opus-4-8` で行う。
8. それでも判断が割れる場合だけ、人間判断に戻す。

### 2.2 実装より前に docs を確認する

次に該当する場合は、実装前に必ず docs を確認する。

- `asset.json` を変更する。
- `.casproj` を変更する。
- JSON Schema を変更する。
- 書き出し ZIP の構成を変更する。
- 座標系を変更する。
- 原点、アンカー、当たり判定、リグ、アニメーションに影響する。
- 既存 E2E の期待値を変更する。
- Phase の完了条件を変更する。

### 2.3 1 PR 1 目的

1 つの PR では、1 つの目的だけを扱う。

良い例:

- `fix: reject missing texture blob during export`
- `feat: add effect asset minimal settings`
- `docs: clarify Phase 16 helper scope`

悪い例:

- `feat: finish phase 17`
- `fix everything`
- `refactor editor and update docs and add 3d`

---

## 3. モデル割り当て

| 作業 | 原則モデル | 使う agent | 備考 |
|---|---|---|---|
| コード探索 | `claude-haiku-4-5` | `cas-codebase-explorer` | 編集禁止 |
| 軽微修正 | `claude-haiku-4-5` | `cas-light-editor` | docs / CSS / lint |
| 中程度の実装 | `claude-sonnet-5` | `cas-implementation-worker` | 既存設計に沿う実装のみ |
| テスト実行 | `claude-haiku-4-5` | `cas-test-runner` | 失敗原因の分類まで |
| docs 更新 | `claude-haiku-4-5` | `cas-docs-maintainer` | 仕様変更判断は不可 |
| 高難度レビュー | `claude-opus-4-8` | `cas-architect-reviewer` | 主レビュー。`claude-fable-5` は使わない |
| 最重要判断 | 人間確認 | — | `claude-fable-5` は使わない |

---

## 4. `claude-opus-4-8` が担う判断

高難度レビューは `claude-opus-4-8` で行う。次はすべて `claude-opus-4-8` の担当とする。

- docs と実装の差分確認
- PR マージ前レビュー
- helper snippet の設計確認
- effect アセットの最小設定の確認
- 3D Asset Preparation Mode の初期要件レビュー
- ライブラリ候補の採用可否の一次判断
- 大きすぎない JSON Schema の任意フィールド追加レビュー

ただし、`claude-opus-4-8` でも判断が割れる場合や、下記「5. 人間確認に戻すべき判断」に該当する場合は、そのまま確定扱いにせず人間確認に戻す。

---

## 5. 人間確認に戻すべき判断

次に該当する場合は、実装を止めて人間確認に戻す（`claude-fable-5` は使わない）。

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

---

## 6. 実装前の標準チェック

すべての実装タスクは、次のテンプレートから始める。

```md
## 今回の目的

- 

## 今回やらないこと

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

- 不要 / 必要（`claude-fable-5` は使わない。判断が割れる場合は人間確認）
- 理由:

## 停止条件

- 
```

---

## 7. 実装後の標準報告

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

## 残課題

- 

## 次にやる最小タスク

- 
```

---

## 8. レビューの段階化

レビューは 3 段階に分ける。

### 8.1 機械的レビュー

担当: `claude-haiku-4-5`

確認:

- format
- lint
- test failure の分類
- 変更ファイルの一覧
- docs 更新漏れ

### 8.2 実装レビュー

担当: `claude-sonnet-5`

確認:

- 関数が既存設計に沿っているか
- テストがあるか
- 既存機能を壊していないか
- 変更範囲が大きすぎないか

### 8.3 設計レビュー

担当: `claude-opus-4-8`

確認:

- docs と矛盾していないか
- `asset.json` / `.casproj` / export ZIP の互換性を壊していないか
- Phase の範囲を超えていないか
- 次の実装者が誤解しないか

---

## 9. 外部ライブラリ採用時のルール

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

## 10. 3D 関連実装時の追加ルール

3D 関連は、特に実装を急いではいけない。

禁止:

- 3D 生成 AI をいきなり本体へ組み込む。
- Python GPU 処理をブラウザ側に持ち込む。
- ライセンス未確認のモデル重みを使う。
- 生成モデルの出力品質を前提に UI を作る。
- 2D アセットの既存データ形式を 3D 都合で壊す。

先に作るもの:

1. GLB / glTF の読み込み。
2. 3D ファイルの検品。
3. 軽量化。
4. 3D 用メタデータ。
5. 書き出し。
6. 外部 3D 生成モデルとの接続。

---

## 11. CI 失敗時の運用

CI が失敗している PR は ready にしない。

まず `cas-test-runner` で失敗の種類を分類する。

| 失敗 | 担当 |
|---|---|
| format | `cas-light-editor` |
| lint | `cas-light-editor` または `cas-implementation-worker` |
| unit test | `cas-implementation-worker` |
| e2e | `cas-implementation-worker` |
| build / type | `cas-implementation-worker` |
| docs 矛盾 | `cas-docs-maintainer` + `cas-architect-reviewer` |
| 設計矛盾 | `cas-architect-reviewer` |

同じ失敗を 2 回直しても解決しない場合は、実装を止める。

---

## 12. まとめ

`claude-fable-5` は今後使用しない。それでも開発は止めないが、判断を粗くして進めてはいけない。

小さく実装し、docs を先に確認し、テストを通し、`claude-opus-4-8` で設計レビューを行い、`claude-opus-4-8` でも判断が割れる場合や互換性に関わる重大判断は人間確認に戻す。

これを守る限り、Chameleon Asset Studio は `claude-fable-5` 非依存で継続開発できる。

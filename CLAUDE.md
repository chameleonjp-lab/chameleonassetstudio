# Claude Code Instructions

最終更新日: 2026-07-09  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
用途: Claude Code 向けの常時参照指示書

---

## 0. このファイルの位置づけ

- Claude Code はこの `CLAUDE.md` を主指示として読む。
- Codex 向けの主指示は `AGENTS.md` に分ける。
- 共有の仕様・計画は `docs/REQUIREMENTS_SPECIFICATION.md`、`docs/IMPLEMENTATION_PLAN.md`、`docs/future/` を正本とする。
- Claude Code で実装・レビュー・調査を行う場合、このファイル、README、関係 docs の順に確認する。
- `AGENTS.md` は Codex 向けの作業契約であり、Claude Code の主指示として扱わない。Codex との引き継ぎ確認が必要なときだけ参照する。

---

## 1. プロジェクト概要

Chameleon Asset Studio は、ブラウザゲームで使う 2D アセットを作成・編集・ゲーム用データ化する Web ツールである。

このリポジトリは、一般的な画像編集ソフト、総合ゲームエンジン、SaaS、クラウド制作基盤ではない。

重要な成果物は次の 4 点である。

1. アセットを作る。
2. アニメーションを作る。
3. 当たり判定、原点、アンカーなどのゲーム用情報を付ける。
4. PNG / WebP / JSON / ZIP として書き出し、外部ツールへ持ち込める情報を添える。

---

## 2. 必読ドキュメント

実装前に必ず読む。

- `README.md`
- `docs/REQUIREMENTS_SPECIFICATION.md`
- `docs/IMPLEMENTATION_PLAN.md`

次に該当する作業では追加で読む。

- Phase 18 以降: `docs/future/FABLELESS_DEVELOPMENT_GUIDE.md`, `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`
- データ形式: `docs/DATA_FORMAT.md`, `docs/EXPORT_FORMATS.md`
- `asset.json` / `.casproj` / export ZIP / JSON Schema / migration: 関連 docs と実装の両方
- 座標系 / 原点 / アンカー / 当たり判定 / リグ / アニメーション: `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md` と該当設計 docs
- Phase 19-C の当たり判定編集: `docs/future/COLLIDER_EDITING_DESIGN.md`
- 3D 関連: `docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md`, `docs/future/PRODUCT_DIRECTION_2D_TO_3D.md`
- 外部ライブラリ採用: `docs/future/LIBRARY_EVALUATION_LOG.md` を作成または更新してから判断する

---

## 3. Fable5 Director Orchestration

### 3.1 最上位方針

Fable5 / `claude-fable-5` が一時的に使える場合でも、使用は戦略的・判断的タスクに限定する。実装、探索、ログ確認、軽微修正は低コストまたは実務向けモデルへ委譲する。

Claude Code は毎ターン開始時に内部で次を行う。

1. タスクの本質を 1 文で定義する。
2. タスク種別を分類する。
3. 担当モデルまたは担当 agent を選ぶ。
4. Fable5 を使う必要が本当にあるか確認する。
5. 必要ならサブタスクへ分解する。

ルーティング結果は原則としてユーザーに出力しない。出力するのは次の場合だけ。

- Fable5 を使う場合
- 担当モデルまたは方針を途中で変更する場合
- 判断が割れる場合
- ユーザーがルーティング理由を求めた場合

### 3.2 モデル別責務

| 担当 | 用途 | 禁止 |
|---|---|---|
| Fable5 / `claude-fable-5` | 全体方向性、新規メカニクス、仕様変更、複雑な優先順位判断、他モデルで解けない根本問題 | コード実装、ファイル探索、ログ読み、軽微修正 |
| Sonnet5 / `claude-sonnet-5` | 既存設計に沿う中程度の実装、HTML / CSS / TypeScript 修正、リファクタ、実装レビュー補助 | 根本的な仕様決定 |
| Opus / `claude-opus-4-8` | 高難度レビュー、バグ原因特定、エッジケース、互換性、設計と実装の整合確認 | 大量の単純実装 |
| Haiku / `claude-haiku-4-5` | コード探索、関係ファイル列挙、docs 要約、軽微修正、テスト失敗分類 | 最終設計判断 |
| Codex | 通常の主実装、最小差分、テスト追加、docs 更新 | 戦略判断、曖昧仕様の独断決定 |

Fable5 が使えない場合は作業を止めない。Claude Code 上で Opus / Sonnet / Haiku を使って判断を小さく分解し、根本判断だけ人間確認に戻す。

---

## 4. ハード制約

- `main` へ直接変更しない。必ず作業ブランチと PR を使う。
- 1 PR 1 目的。目的外のリファクタをしない。
- 実装前に変更対象ファイルを列挙する。
- 既存仕様を壊さない。
- 不明点を推測で実装しない。未確定事項として明示する。
- 既存テストを削除、skip、期待値緩和しない。失敗時は原因を分類する。
- UI 仕様を勝手に変えない。
- `asset.json` / `.casproj` / export ZIP / JSON Schema / migration / 座標系 / 原点 / アンカー / 当たり判定 / リグの意味を変える場合は、先に docs とレビュー方針を整える。
- SaaS、アカウント、クラウド同期、課金、ランキング、Supabase などを勝手に導入しない。
- 外部 dependency はライセンス確認前に追加しない。
- 3D 生成 AI、WebGPU 必須化、外部モデル重みの組み込みは行わない。
- 開始前に open PR を確認し、同じ目的の PR を重複作成しない。

---

## 5. 実装前の標準出力

実装タスクでは、編集前に次を簡潔に出す。

```md
## 今回の目的
-

## 今回やらないこと
-

## 関係ファイル
-

## 変更予定ファイル
-

## ルーティング
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

Fable5 を使う場合だけ、次の形式で明示する。

```md
【Fable5判断】
- 判断対象:
- 結論:
- 理由:
- 委譲内容:
```

---

## 6. 実装ルール

- 既存構造に沿う。大きな設計変更を混ぜない。
- React / TypeScript の型安全を保つ。
- UI state と保存データを混同しない。
- 保存形式に入れない一時状態は `.casproj` / `asset.json` / export ZIP へ含めない。
- Canvas / GameDataPanel / IndexedDB / export の責務を混ぜない。
- Undo / Redo に影響する操作は、既存の履歴管理経路に乗せる。
- E2E は可能な限り role / accessible name / DOM 状態で安定化する。canvas 座標依存のテストは必要最小限にする。
- Playwright ブラウザ取得など環境都合で E2E が実行できない場合は、失敗理由と未検証範囲を明記する。

---

## 7. 検証コマンド

変更内容に応じて実行する。

```bash
npm run lint
npm run format:check
npm run build
npm run test
npm run e2e
```

E2E が環境要因で実行できない場合でも、lint / build / unit test は可能な範囲で実行する。

---

## 8. 実装後の標準報告

```md
## 実装内容
-

## 変更ファイル
-

## 実行したテスト
- `npm run lint`:
- `npm run format:check`:
- `npm run build`:
- `npm run test`:
- `npm run e2e`:

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

## 9. 人間確認に戻す判断

次は Claude Code 内で確定しない。

- `asset.json` の version を上げる。
- `.casproj` の構造を変える。
- 既存 `.casproj` を読めなくする可能性がある。
- 座標系、原点、frame、animation、rig bake の意味を変える。
- export ZIP の既存ファイルを削除または移動する。
- dependency を追加するがライセンスや商用利用条件が不明。
- 3D 生成 AI を標準機能にする。
- SaaS / アカウント / クラウド / 課金を入れる。
- Fable5 / Opus / Sonnet / Codex の判断が割れる。

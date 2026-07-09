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
- `AGENTS.md` は Codex 退避運用のための作業契約であり、Claude Code の主指示として扱わない。Codex へ切り替える場合、または Codex から戻ってきた PR を確認する場合だけ参照する。

---

## 1. 運用モードの最上位ルール

このリポジトリでは、Fable5 の可用性によって開発の主担当を切り替える。

### 1.1 Claude Code Primary Mode

Fable5 / `claude-fable-5` が使える間は、Claude Code を開発の主担当にする。

このモードでは、Claude Code 内で次のように役割を分ける。

| 役割 | 担当 | 用途 |
|---|---|---|
| Director | Fable5 / `claude-fable-5` | 仕様判断、優先順位、方針決定、複雑なトレードオフ判断 |
| Implementation | Sonnet5 / `claude-sonnet-5` | 既存設計に沿う実装、UI、TypeScript、CSS、テスト追加 |
| Quality Review | Opus 4.8 / `claude-opus-4-8` | 設計整合、バグ原因、エッジケース、互換性レビュー |
| Scanner | Haiku / `claude-haiku-4-5` | ファイル探索、docs 要約、ログ分類、軽い確認 |

このモードでは、Codex は通常使わない。ユーザーが明示的に Codex を指定した場合、または Claude Code 側の制限・失敗により退避が必要な場合だけ Codex に切り替える。

重要: ユーザーが「Claude Code 用のプロンプト」を求めている場合、Codex 依頼文を作らない。Claude Code 内で Fable5 / Sonnet5 / Opus 4.8 / Haiku を使い分け、調査・判断・実装・レビューまで完結する前提で書く。

### 1.2 Codex Fallback Mode

Fable5 が制限されている、使えない、または Claude Code での継続が効率を落とす場合は、実装の主担当を Codex に切り替える。

このモードでは次を守る。

- Codex は `AGENTS.md` を主指示として読む。
- Codex は最小実装、テスト追加、docs 更新を担当する。
- Claude Code は必要に応じて、Codex 用の依頼文作成、PR レビュー、失敗原因分析、次の方針整理を担当する。
- Codex は戦略判断や根本仕様変更を独断しない。
- Fable5 が戻ったら、重要な方針判断は Claude Code Primary Mode に戻して確認する。

### 1.3 モード切り替えの明示

Claude Code は、内部で毎回ルーティングを行う。通常はユーザーに出力しない。

ただし次の場合は、簡潔に明示する。

- Fable5 を使う場合。
- Claude Code Primary Mode から Codex Fallback Mode に切り替える場合。
- Codex Fallback Mode から Claude Code Primary Mode に戻す場合。
- モデル間で判断が割れる場合。
- ユーザーがルーティング理由を求めた場合。

---

## 2. プロジェクト概要

Chameleon Asset Studio は、ブラウザゲームで使う 2D アセットを作成・編集・ゲーム用データ化する Web ツールである。

このリポジトリは、一般的な画像編集ソフト、総合ゲームエンジン、SaaS、クラウド制作基盤ではない。

重要な成果物は次の 4 点である。

1. アセットを作る。
2. アニメーションを作る。
3. 当たり判定、原点、アンカーなどのゲーム用情報を付ける。
4. PNG / WebP / JSON / ZIP として書き出し、外部ツールへ持ち込める情報を添える。

---

## 3. 必読ドキュメント

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

## 4. Claude Code Primary Mode の作業順

Fable5 が使える間は、Claude Code 内で完結することを原則にする。

標準の順番:

1. Haiku で関係ファイル、既存 docs、既存 PR 状態を確認する。
2. Fable5 で、実装方針・優先順位・スコープを必要最小限だけ判断する。
3. Sonnet5 で実装する。
4. Haiku で機械的な確認、変更ファイル整理、テスト失敗分類を行う。
5. Opus 4.8 で設計整合、互換性、エッジケース、レビューを行う。
6. Fable5 は、方針が変わる場合か判断が割れる場合だけ再度使う。

Fable5 でしてはいけないこと:

- 具体的なコード実装。
- ファイル探索。
- 長いログ読み。
- 単純な docs 更新。
- 軽微な UI / CSS / テスト修正。

Sonnet5 でしてはいけないこと:

- 根本的な仕様決定。
- Phase 範囲の拡大。
- 互換性を壊す可能性がある判断の独断。

Opus 4.8 でしてはいけないこと:

- 大量の単純実装を主担当として進めること。
- レビュー中に目的外の大規模リファクタを始めること。

Haiku でしてはいけないこと:

- 最終設計判断。
- 複雑なデバッグの確定判断。
- 保存形式や schema に影響する判断。

---

## 5. Codex Fallback Mode へ切り替える条件

次に該当する場合は、Codex Fallback Mode を使う。

- Fable5 の利用制限に達した。
- Fable5 が使えない期間に実装を進める必要がある。
- Claude Code で実装を続けるより、Codex の方が安定して差分を作れる。
- ユーザーが Codex で進めるよう明示した。

この場合、Claude Code は次を行う。

1. 実装目的を 1 つに絞る。
2. `AGENTS.md` に沿う Codex 依頼へ切り出す。
3. Codex に渡す禁止事項、変更範囲、検証条件を明確にする。
4. Codex が作った PR を Opus 4.8 または Claude Code でレビューする。

Codex Fallback Mode では、Claude Code が無理に Fable5 代替として振る舞わない。根本判断が必要な場合は、人間確認に戻す。

---

## 6. ハード制約

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

## 7. 実装前の標準出力

実装タスクでは、編集前に次を簡潔に出す。

```md
## 今回の目的
-

## 運用モード
- Claude Code Primary Mode / Codex Fallback Mode
- 理由:

## 今回やらないこと
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

Fable5 を使う場合だけ、次の形式で明示する。

```md
【Fable5判断】
- 判断対象:
- 結論:
- 理由:
- 委譲内容:
```

---

## 8. 実装ルール

- 既存構造に沿う。大きな設計変更を混ぜない。
- React / TypeScript の型安全を保つ。
- UI state と保存データを混同しない。
- 保存形式に入れない一時状態は `.casproj` / `asset.json` / export ZIP へ含めない。
- Canvas / GameDataPanel / IndexedDB / export の責務を混ぜない。
- Undo / Redo に影響する操作は、既存の履歴管理経路に乗せる。
- E2E は可能な限り role / accessible name / DOM 状態で安定化する。canvas 座標依存のテストは必要最小限にする。
- Playwright ブラウザ取得など環境都合で E2E が実行できない場合は、失敗理由と未検証範囲を明記する。

---

## 9. 検証コマンド

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

## 10. 実装後の標準報告

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
- JSON Schema:

## 残課題
-

## 次にやる最小タスク
-
```

---

## 11. 人間確認に戻す判断

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
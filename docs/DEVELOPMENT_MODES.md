# Development Modes

最終更新日: 2026-07-10  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
用途: Claude Code と Codex を、Fable5 の可用性に応じて使い分けるための上位運用書

---

## 1. 目的

この文書は、GitHub 上の仕様書・計画書・実装指示書を参照して開発を進めるときに、どの環境とモデルを使うかを決めるための上位ルールである。Claude Code だけで完結する運用、Codex へ退避する運用、Fable5・Codex・Opus 4.8 を分業する運用を区別する。

目的は次の 3 つである。

1. Fable5 の使用量を節約する。
2. Claude Code と Codex を状況に応じて使い分ける。
3. 実装速度と品質を両立する。

この文書は入口であり、実際の作業では次の文書も読む。

- Claude Code Primary Mode: `CLAUDE.md`
- Hybrid Roadmap Mode: 方針・レビューは `CLAUDE.md`、実装は `AGENTS.md`
- Codex Fallback Mode: `AGENTS.md`
- 共通の仕様正本: `docs/REQUIREMENTS_SPECIFICATION.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/future/`

---

## 2. 3 つの開発モード

### 2.1 Claude Code Primary Mode

使用条件:

- Fable5 / `claude-fable-5` が使える。
- 仕様判断、設計判断、優先順位判断を含む。
- Claude Code 内で調査、判断、実装、レビューまで進めたい。

このモードでは Claude Code を主担当にする。Codex は通常使わない。

Claude Code 内の役割:

| 役割 | 担当 | 主な用途 | 節約ルール |
|---|---|---|---|
| Scanner | Haiku / `claude-haiku-4-5` | ファイル探索、docs 要約、PR 状態確認、ログ分類 | 最初に使い、Fable5 に長文を読ませない |
| Director | Fable5 / `claude-fable-5` | 仕様判断、優先順位、方針決定、複雑なトレードオフ判断 | 最初の方針決定と判断割れ時だけ使う |
| Implementation | Sonnet5 / `claude-sonnet-5` | TypeScript / React / CSS 実装、テスト追加、docs 追従 | 既存設計に沿う実装を担う |
| Quality Review | Opus 4.8 / `claude-opus-4-8` | 設計整合、互換性、バグ原因、エッジケース、PR レビュー | 実装後または原因特定が難しい時に使う |

標準ルート:

```txt
Haiku で探索
↓
Fable5 で必要最小限の方針判断
↓
Sonnet5 で実装
↓
Haiku で機械的確認
↓
Opus 4.8 でレビュー
↓
判断が割れる場合だけ Fable5 または人間確認
```

Fable5 を使う場面:

- 新しい仕様や制作体験の方向性を決める。
- 複数案の優先順位を決める。
- 互換性、使いやすさ、実装コストのトレードオフを判断する。
- Sonnet5 / Opus 4.8 では判断が割れた。

Fable5 でやらないこと:

- ファイル探索。
- 長いログ読み。
- 具体的なコード実装。
- 単純な docs 更新。
- 軽微な CSS / lint / test 修正。

---

### 2.2 Codex Fallback Mode

使用条件:

- Fable5 が制限中、または利用できない。
- Claude Code で進めるより Codex の方が安定して差分を作れる。
- ユーザーが Codex で進めるよう明示した。

このモードでは Codex を実装担当にする。Codex は `AGENTS.md` を主指示として読む。

役割:

| 役割 | 担当 | 主な用途 |
|---|---|---|
| 依頼整理 | Claude Code | 実装目的、禁止事項、検証条件を明確にする |
| 実装 | Codex | 最小差分、テスト追加、docs 追従、PR 作成 |
| レビュー | Claude Code / Opus 4.8 | PR 差分、互換性、失敗原因、次の方針確認 |
| 最終判断 | 人間確認 | 仕様変更、互換性破壊、判断割れ |

Codex に渡す依頼は、必ず目的を 1 つに絞る。

Codex に任せてよいこと:

- 既存設計に沿う TypeScript / React / CSS 修正。
- ユニットテスト追加。
- E2E 追加または安定化。
- docs の実装追従更新。
- CI 失敗原因の分類と最小修正。

Codex に任せないこと:

- プロダクト方針の最終判断。
- 新規メカニクスや根本仕様変更。
- `asset.json` / `.casproj` / export ZIP / JSON Schema の破壊的変更。
- ライセンス未確認の dependency 追加。
- SaaS / アカウント / クラウド / 課金の導入。
- 3D 生成 AI、外部モデル重み、WebGPU 必須化。

---

### 2.3 Hybrid Roadmap Mode

使用条件:

- Fable5 の判断力は使いたいが、実装は Codex へまとめて任せた方が速い。
- Claude Code / Opus 4.8 を実装ではなく品質レビューへ集中させたい。
- `docs/future/2D_COMPLETION_ROADMAP.md` のように、段階開始時の判断と複数の実装 PR を分離できる。

このモードは、2D Pro 完成ロードマップの標準運用である。

| 役割 | 担当 | 実行時点 |
|---|---|---|
| Director | Claude Code / Fable5 | 段階開始時、仕様・優先順位・data boundary の判断時だけ |
| Implementation Owner | Codex | 判断済み work package の code、tests、docs、draft PR、CI 修正 |
| Quality Reviewer | Claude Code / Opus 4.8 | CI 成功後。仕様違反、UI / UX、互換性、test gap、将来リスクを review-only で確認 |
| Final Decision | 人間確認 | `BLOCKER` / `MUST` 解消後の merge、仕様変更、互換性判断 |

標準ルート:

```txt
Fable5 または人間が work package を固定
↓
Codex が実装して draft PR を作成
↓
CI 成功
↓
Opus 4.8 が review-only で確認
↓
Codex が同じ PR で BLOCKER / MUST を修正
↓
人間が merge
```

Fable5 は毎 PR で使わない。段階開始時、契約変更、判断割れ時だけ使う。Opus 4.8 は通常実装を行わず、CI 失敗中の PR を繰り返しレビューしない。Fable5 が利用できない時は、人間が未決定事項を確定するまで、Codex は確定済み work package だけを進める。

Claude Code 内で実装まで完結させたい場合は Claude Code Primary Mode、Fable5 が使えず既存仕様内の実装だけを進める場合は Codex Fallback Mode を選ぶ。

---

## 3. タスク別ルーティング

| タスク | Claude Code Primary | Hybrid Roadmap | Codex Fallback |
|---|---|---|---|
| 仕様・方針の決定 | Fable5 | Fable5。利用不可なら人間確認 | Claude Code または人間確認へ戻す |
| ファイル探索 | Haiku | Codex が work package の範囲だけ調査 | Codex が最小限調査 |
| docs 要約 | Haiku | Codex が必要範囲を整理 | Codex が必要範囲のみ読む |
| 通常実装 | Sonnet5 | **Codex** | Codex |
| 軽微な docs / CSS 修正 | Haiku または Sonnet5 | Codex | Codex |
| 複雑な不具合原因特定 | Opus 4.8 | Codex が一次調査、Opus 4.8 が確認 | Codex が一次調査、Claude Code / Opus 4.8 が確認 |
| 実装レビュー | Opus 4.8 | **CI 成功後に Opus 4.8** | Claude Code / Opus 4.8 |
| CI 失敗分類 | Haiku、必要なら Opus 4.8 | Codex。CI 成功まで Opus 4.8 を呼ばない | Codex が分類し、必要なら Claude Code へ戻す |
| 互換性判断 | Opus 4.8、必要なら Fable5 | Opus 4.8 がリスク提示、Fable5 または人間が決定 | Claude Code または人間確認へ戻す |
| 3D / dependency 採用判断 | Fable5 + Opus 4.8 + 人間確認 | Fable5 + Opus 4.8 + 人間確認 | Codex 単独では判断しない |

---

## 4. トークン節約ルール

### 4.1 共通

- 最初から全ファイルを読まない。
- まず README、該当 docs、関係ファイルだけを読む。
- 過去 PR やログは、必要な箇所だけ要約してから上位モデルへ渡す。
- 同じ説明を毎回出さない。ルーティングの詳細は、必要なときだけ出す。
- 実装前に「今回やらないこと」を決め、作業範囲を広げない。

### 4.2 Claude Code Primary Mode

- Fable5 は常用しない。
- Fable5 は最初の方針判断と、最後の判断割れ確認だけに使う。
- ファイル探索、ログ確認、docs 要約は Haiku に任せる。
- 実装は Sonnet5 に任せる。
- レビューと難しい原因特定は Opus 4.8 に任せる。
- Fable5 に長い差分全文を読ませない。Haiku または Opus 4.8 で要約してから渡す。

### 4.3 Codex Fallback Mode

- Codex には目的を 1 つだけ渡す。
- Codex に複数案の戦略判断をさせない。
- Codex には、読むべき docs と変更禁止範囲を明示する。
- PR 作成後は、Claude Code / Opus 4.8 でレビューする。

### 4.4 Hybrid Roadmap Mode

- Fable5 へ渡すのは、段階開始時の判断点、候補比較、制約、推奨案だけにする。
- Fable5 の決定は work package handoff と ADR に残し、後続 PR で同じ判断を繰り返さない。
- Codex は1つの利用者体験または1つの危険な契約変更を、code + tests + docs のまとまりとして実装する。
- Opus 4.8 は CI 成功後にだけ呼び、`BLOCKER` / `MUST` / `SHOULD` を区別する。
- `BLOCKER` / `MUST` の修正は同じ PR で Codex が行い、別 PR を作り直さない。
- 並行数と merge 順は `docs/future/2D_COMPLETION_ROADMAP.md` を正本にする。

---

## 5. GitHub 作業ルール

GitHub のルールは、開発を止めるための硬いゲートではなく、事故を減らすためのガードレールである。

原則:

- `main` へ直接 push しない。
- 作業ブランチと PR を使う。
- 1 PR 1 目的で進める。
- 既存 open PR と同じ目的の PR を重複作成しない。
- 既存テストを失敗隠しのために削除、skip、期待値緩和しない。

ただし、次は許可する。

- ユーザーが明示した PR close、branch 作成、PR 作成、docs 修正。
- 失敗した PR を close したうえで、main から同じ目的を作り直すこと。
- 同じ目的を完成させる実装、テスト、docs、CI 安定化を 1 PR にまとめること。
- docs-only / instruction-only の変更を、テスト未実行で報告すること。
- テストの準備、待機、読み取り方法に欠陥がある場合、理由と代替検証を記録してテストを直すこと。

必ず止める場合:

- 既存データの互換性を壊す可能性がある。
- `asset.json` / `.casproj` / export ZIP / JSON Schema / version に影響する。
- dependency 追加が必要だが、ライセンスや商用利用条件が未確認。
- 3D 生成 AI、外部モデル重み、WebGPU 必須化を入れようとしている。
- SaaS / アカウント / クラウド / 課金を入れようとしている。
- 指示された目的と実装内容が食い違っている。

---

## 6. 検証方針

変更内容に応じて検証を選ぶ。

| 変更内容 | 必要な確認 |
|---|---|
| docs-only / instruction-only | 内容確認。コード用 test は必須にしない |
| TypeScript / React / CSS | lint, format, build, unit test |
| ブラウザ挙動 / canvas / IndexedDB / routing | E2E も確認 |
| CI workflow / dependencies | build, unit, E2E, workflow 結果 |
| schema / export / `.casproj` | docs, unit, migration / compatibility review, 必要なら人間確認 |

Playwright のブラウザ取得失敗など環境要因で E2E が実行できない場合は、未検証範囲と CI に委ねる範囲を報告する。

---

## 7. 迷った時の戻し先

- 実装の迷い: Sonnet5 または Codex。
- 探索の迷い: Haiku。
- バグ原因の迷い: Opus 4.8。
- 仕様の迷い: Fable5。
- Fable5 が使えない時の仕様判断: 人間確認。
- 互換性破壊の可能性: 人間確認。

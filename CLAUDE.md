# Claude Code Instructions

最終更新日: 2026-07-10  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
用途: Claude Code Primary Mode / Hybrid Roadmap Mode の常時参照指示書

---

## 0. このファイルの位置づけ

- Claude Code はこの `CLAUDE.md` を主指示として読む。
- 上位の運用モードは `docs/DEVELOPMENT_MODES.md` を正本とする。
- Codex 向けの退避指示は `AGENTS.md` に分ける。
- `AGENTS.md` は Hybrid Roadmap Mode で Codex へ実装を渡す場合、Codex Fallback Mode へ切り替える場合、または Codex から戻ってきた PR を確認する場合に参照する。
- ユーザーが Claude Code 用の作業を求めている場合、Codex 依頼文に置き換えない。

---

## 1. Claude Code Primary Mode と Hybrid Roadmap Mode

最初に `docs/DEVELOPMENT_MODES.md` で運用モードを選ぶ。Claude Code Primary Mode では Claude Code 内で判断・実装・レビューを進める。Hybrid Roadmap Mode では、Claude Code は Fable5 の方針判断と Opus 4.8 のレビューを担当し、実装は Codex へ渡す。

Claude Code 内で次を使い分ける。

| 役割 | 担当 | 用途 | 節約ルール |
|---|---|---|---|
| Scanner | Haiku / `claude-haiku-4-5` | ファイル探索、docs 要約、PR 状態確認、ログ分類 | 最初に使い、Fable5 に長文を読ませない |
| Director | Fable5 / `claude-fable-5` | 方針判断、優先順位、仕様変更、複雑なトレードオフ判断 | 最初の方針決定と判断割れ時だけ使う |
| Implementation | Sonnet5 / `claude-sonnet-5` | 既存設計に沿う TypeScript / React / CSS 実装、テスト追加、docs 追従 | 実装の主担当 |
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

Claude Code Primary Mode では Codex を通常使わない。`docs/future/2D_COMPLETION_ROADMAP.md` は Hybrid Roadmap Mode を既定とし、Fable5 が段階開始時の判断、Codex が実装、Opus 4.8 が CI 成功後の review-only を担当する。Fable5 が制限中で確定済み実装だけを進める場合は、`AGENTS.md` に沿って Codex Fallback Mode を使う。

---

## 2. 必読ドキュメント

最初に読む。

- `README.md`
- `docs/DEVELOPMENT_MODES.md`
- `docs/REQUIREMENTS_SPECIFICATION.md`
- `docs/IMPLEMENTATION_PLAN.md`

関係するときだけ追加で読む。

- 2D Pro（Phase 18 以降）: `docs/future/FABLELESS_DEVELOPMENT_GUIDE.md`, `docs/future/2D_COMPLETE_PRODUCT_SPEC.md`, `docs/future/2D_ASSET_DATA_CONTRACT.md`, `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`, `docs/future/2D_DEVICE_RELIABILITY_SPEC.md`, `docs/future/2D_COMPLETION_ROADMAP.md`
- データ形式: `docs/DATA_FORMAT.md`, `docs/EXPORT_FORMATS.md`
- Phase 19-C の当たり判定編集: `docs/future/COLLIDER_EDITING_DESIGN.md`
- 3D 関連: `docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md`, `docs/future/PRODUCT_DIRECTION_2D_TO_3D.md`（2D Pro Gate の人間承認前は実装・library 評価・dependency 追加を開始しない）
- 外部ライブラリ採用: 採用する PR で評価記録を新規作成し、ライセンス・商用利用・browser 対応・bundle size を確認する。

docs 確認は作業を止めるためではなく、誤実装を避けるために行う。小さな修正では、関係箇所だけを読んで進めてよい。

---

## 3. Fable5 の使い方

Fable5 は Director であり、実装担当ではない。

使う場面:

- 新しい仕様や制作体験の方向性を決める。
- 複数案の優先順位を決める。
- 互換性、使いやすさ、実装コストのトレードオフを判断する。
- Sonnet5 / Opus 4.8 では判断が割れた。

使わない場面:

- ファイル探索。
- 長いログ読み。
- 具体的なコード実装。
- 単純な docs 更新。
- 軽微な CSS / lint / test 修正。

Fable5 を使う場合だけ、次の形式で明示する。

```md
【Fable5判断】
- 判断対象:
- 結論:
- 理由:
- 委譲内容:
```

通常のルーティングは内部で行い、毎回ユーザーへ長く出力しない。

---

## 4. GitHub 作業ルール

GitHub のルールは、開発を止めるための硬いゲートではなく、事故を減らすためのガードレールである。ユーザーが明示した目的を通すことを優先する。

原則:

- `main` へ直接 push しない。
- 作業ブランチと PR を使う。
- 1 PR 1 目的で進める。
- 既存 open PR と同じ目的の PR を重複作成しない。
- 既存仕様を壊さない。
- 既存テストを失敗隠しのために削除、skip、期待値緩和しない。

許可される例外:

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

## 5. 実装前の標準出力

```md
## 今回の目的
-

## 運用モード
- Claude Code Primary Mode
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

## 6. 実装ルール

- 変更範囲を小さくする。
- UI state と保存データを混同しない。
- 保存データに入れない一時状態は `.casproj` / `asset.json` / export ZIP へ含めない。
- Canvas / GameDataPanel / IndexedDB / export の責務を混ぜない。
- Undo / Redo に影響する操作は、既存の履歴管理経路に乗せる。
- E2E は可能な限り role / accessible name / DOM 状態 / IndexedDB 読み取りで安定化する。
- canvas 座標依存の E2E は必要最小限にする。

---

## 7. 検証方針

変更内容に応じて実行する。

```bash
npm run lint
npm run format:check
npm run build
npm run test
npm run e2e
```

- docs-only / instruction-only: 内容確認。コード用 test は必須にしない。
- TypeScript / React / CSS: lint, format, build, unit test。
- ブラウザ挙動 / canvas / IndexedDB / routing: E2E も確認。
- schema / export / `.casproj`: docs, unit, compatibility review、必要なら人間確認。

Playwright ブラウザ取得など環境都合で E2E が実行できない場合は、失敗理由と未検証範囲を明記する。

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
- JSON Schema:

## 残課題
-

## 次にやる最小タスク
-
```

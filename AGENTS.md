# Codex Instructions

最終更新日: 2026-07-10  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
用途: Codex 向けの退避実装指示書

---

## 0. このファイルの位置づけ

- Codex はこの `AGENTS.md` を主指示として扱う。
- Claude Code 向けの主指示は `CLAUDE.md` に分ける。
- Codex は、Fable5 が制限されている期間、Claude Code で継続するより Codex の方が安定する場合、またはユーザーが明示した場合の退避実装担当である。
- Fable5 が使える間は、原則として Claude Code Primary Mode を使う。Codex は通常の主担当ではない。
- ユーザーが Claude Code 用のプロンプトや Claude Code 内での実装を求めている場合、Codex 用の依頼に置き換えない。
- Codex は戦略判断の最終決定者ではない。仕様判断に迷う場合は、推測で実装せず確認事項として出す。

---

## 1. Codex Fallback Mode の目的

Codex Fallback Mode は、Fable5 / Claude Code 主導で進められない期間に、実装を止めないための運用である。

Codex がやること:

- 目的が絞られた実装。
- 既存設計に沿う最小差分。
- TypeScript / React / CSS の修正。
- ユニットテスト追加。
- E2E 追加または安定化。
- docs の実装追従更新。
- README / instructions / future docs の整合修正。
- 変更差分、検証結果、残リスクの報告。

Codex がやらないこと:

- プロダクト方針の最終判断。
- 新規メカニクスや根本仕様変更。
- `asset.json` / `.casproj` / export ZIP / JSON Schema の破壊的変更。
- SaaS / アカウント / クラウド / 課金 / ランキング / Supabase 導入。
- 外部 dependency のライセンス未確認採用。
- Fable5 / Claude Code / 人間確認が必要な判断の独断決定。

---

## 2. 基本契約

今回の作業を 1 ターンとして扱う。

前提:

- 今回達成することを明確にする。
- 既存仕様を壊さない。
- 不明点は推測で実装しない。
- 実装前に変更対象ファイルを分かる範囲で列挙する。
- 原則として `main` へ直接変更しない。
- 原則として 1 PR 1 目的で進める。

重要:

- これらは作業を止めるための禁止事項ではなく、事故を減らすための原則である。
- ユーザーまたは Claude Code から明示された目的を通すことを優先する。
- docs-only / instruction-only / README-only の修正は、テスト未実行でもよい。その場合は docs-only と報告する。
- 失敗した PR を close したうえで main から作り直すことは、重複 PR ではなく再作成として扱う。

---

## 3. 必読ドキュメント

実装前に読む。

- `README.md`
- `AGENTS.md`
- `docs/REQUIREMENTS_SPECIFICATION.md`
- `docs/IMPLEMENTATION_PLAN.md`

Phase 18 以降、または次に触れる場合は追加で読む。

- `docs/future/FABLELESS_DEVELOPMENT_GUIDE.md`
- `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`
- `docs/DATA_FORMAT.md`
- `docs/EXPORT_FORMATS.md`
- `docs/future/COLLIDER_EDITING_DESIGN.md`（当たり判定編集）
- `docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md`（3D 関連）
- `docs/future/LIBRARY_EVALUATION_LOG.md`（外部ライブラリ採用）

`CLAUDE.md` は Claude Code Primary Mode の主指示である。Codex は通常参照しなくてよい。ただし、Claude Code から引き継いだ依頼でモードや責務の確認が必要な場合だけ読む。

---

## 4. GitHub 作業ルール

GitHub のルールは、実装を止めるための硬いゲートではなく、事故を減らすためのガードレールである。

### 4.1 原則

- 原則として `main` へ直接 push しない。
- 原則として作業ブランチと PR を使う。
- 原則として 1 PR 1 目的にする。
- 既存 open PR と同じ目的の重複 PR は避ける。
- 既存テストを理由なく削除、skip、期待値緩和しない。

### 4.2 許可される例外

次は進めてよい。

- ユーザーまたは Claude Code が明示した PR close、PR 作成、branch 作成、docs 修正。
- 失敗した PR を close したうえで、同じ目的を main から作り直すこと。
- docs-only / instruction-only の修正を、関連ファイルまとめて 1 PR にすること。
- テストに関係しない文書修正を、テスト未実行で報告すること。
- 実装目的を通すために必要な最小 docs 更新を同じ PR に含めること。

### 4.3 必ず止める場合

次は作業を止めて確認事項を出す。

- 既存データの互換性を壊す可能性がある。
- `asset.json` / `.casproj` / export ZIP / JSON Schema / version に影響する。
- dependency 追加が必要だが、ライセンスや商用利用条件が未確認。
- 3D 生成 AI、外部モデル重み、WebGPU 必須化を入れようとしている。
- SaaS / アカウント / クラウド / 課金を入れようとしている。
- 指示された目的と実装内容が食い違っている。

---

## 5. 作業順

Codex は次の順で進める。

1. 仕様確認。
2. 既存コードと関係ファイルの調査。
3. 原因調査または実装対象の特定。
4. 実装方針の提示。
5. 最小変更。
6. 検証。
7. 差分報告。
8. 残リスク。
9. 次回に引き継ぐメモ。

---

## 6. 禁止事項

- 目的外の大規模リファクタ。
- UI 仕様の勝手な変更。
- データ形式の勝手な変更。
- `asset.json` / `.casproj` / export ZIP / JSON Schema / version の勝手な変更。
- 既存座標系、原点、アンカー、当たり判定、リグ、アニメーションの意味変更。
- 既存 E2E の理由なき削除、skip、期待値緩和。
- テスト失敗を未確認のまま成功扱いにすること。
- SaaS、アカウント、クラウド同期、課金、ランキング、Supabase の導入。
- 3D 生成 AI、WebGPU 必須化、外部モデル重みの組み込み。

---

## 7. 実装前に出す内容

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

## 実装方針
-

## 互換性への影響見込み
- `asset.json`:
- `.casproj`:
- export ZIP:
- JSON Schema:

## 停止条件
-
```

---

## 8. 実装ルール

- 変更範囲を最小化する。
- 既存の責務分離に従う。
- UI state と保存データを混同しない。
- 保存データに入れない選択状態や一時状態を export に含めない。
- 既存の Undo / Redo 経路がある操作は、その経路に乗せる。
- Canvas 操作の E2E は不安定化しやすいため、可能な限り role / accessible name / IndexedDB 読み取りなど安定した検証を使う。
- 失敗するテストがある場合は、失敗理由を分類し、環境要因と実装要因を分ける。
- Claude Code から渡されたスコープを勝手に広げない。

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

Playwright Chromium の取得失敗など環境要因で E2E が実行できない場合は、エラーメッセージ、未検証範囲、CI に委ねる範囲を明記する。

---

## 10. 実装後の報告形式

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

## 残リスク
-

## 次回に引き継ぐメモ
-
```

---

## 11. Claude Code / Fable5 へ戻す条件

次に該当したら、Codex は実装を止めて確認事項を出す。

- 仕様書同士が矛盾している。
- 実装すると既存データの互換性を壊す可能性がある。
- 複数案の優劣判断が必要で、単純な実装判断ではない。
- Fable5 / Opus / Sonnet / Codex の責務分担が曖昧。
- Phase 範囲を超える可能性がある。
- dependency 追加が必要だが、ライセンスや商用利用条件が未確認。
- 既存 open PR と衝突し、解消方針が不明。
- Claude Code Primary Mode へ戻すべき方針判断が発生した。

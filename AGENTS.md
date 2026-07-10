# Codex Instructions

最終更新日: 2026-07-10
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
用途: Codex Fallback Mode / Hybrid Roadmap Mode の実装指示書

---

## 0. このファイルの位置づけ

- Codex はこの `AGENTS.md` を主指示として扱う。
- 上位の運用モードは `docs/DEVELOPMENT_MODES.md` を正本とする。
- Claude Code 向けの主指示は `CLAUDE.md` に分ける。
- Codex は、Codex Fallback Mode の退避実装担当、または Hybrid Roadmap Mode の Implementation Owner である。
- Hybrid Roadmap Mode では、Fable5 が段階開始時の判断、Codex が確定済み work package の実装、Opus 4.8 が CI 成功後の review-only を担当する。
- Claude Code Primary Mode を選んだ場合、Codex は通常の主担当ではない。
- Codex は戦略判断の最終決定者ではない。仕様判断に迷う場合は、推測で実装せず確認事項として出す。

---

## 1. Codex 実装モードの目的

Codex Fallback Mode は、Fable5 / Claude Code 主導で進められない期間に実装を止めないための運用である。Hybrid Roadmap Mode では、Fable5 または人間が固定した work package を Codex が実装し、CI 成功後に Opus 4.8 のレビューへ渡す。

Codex がやること:

- 目的が絞られた実装。
- 既存設計に沿う最小差分。
- TypeScript / React / CSS の修正。
- ユニットテスト追加。
- E2E 追加または安定化。
- docs の実装追従更新。
- CI 失敗原因の分類と最小修正。
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

- 今回達成することを明確にする。
- 変更範囲を最小化する。
- 既存仕様を壊さない。
- 不明点は推測で実装しない。
- 実装前に変更対象ファイルを分かる範囲で列挙する。
- 原則として `main` へ直接 push しない。
- 原則として 1 PR 1 目的で進める。同じ目的を完成させる実装、テスト、docs、CI 安定化は同じ PR に含めてよい。
- 既存 open PR と同じ目的の PR は、まず既存 PR を更新する。再利用できない場合は、理由を記録して close してから作り直す。

これらは作業を止めるための禁止事項ではなく、事故を減らすための原則である。ユーザーまたは Claude Code から明示された目的を通すことを優先する。

---

## 3. 必読ドキュメント

最初に読む。

- `README.md`
- `docs/DEVELOPMENT_MODES.md`
- `AGENTS.md`
- `docs/REQUIREMENTS_SPECIFICATION.md`
- `docs/IMPLEMENTATION_PLAN.md`

関係するときだけ追加で読む。

- Phase 18 以降: `docs/future/FABLELESS_DEVELOPMENT_GUIDE.md`, `docs/future/2D_COMPLETION_ROADMAP.md`, `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`
- 2D 完成形、保存、対象別出力、端末・復旧: `docs/future/2D_COMPLETE_PRODUCT_SPEC.md`, `docs/future/2D_ASSET_DATA_CONTRACT.md`, `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`, `docs/future/2D_DEVICE_RELIABILITY_SPEC.md`
- データ形式: `docs/DATA_FORMAT.md`, `docs/EXPORT_FORMATS.md`
- Phase 19-C の当たり判定編集: `docs/future/COLLIDER_EDITING_DESIGN.md`
- 3D 関連: `docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md`（2D Pro Gate の人間承認前は実装・library 評価・dependency 追加を開始しない）
- 外部ライブラリ採用: 採用する PR で評価記録を新規作成し、ライセンス・商用利用・browser 対応・bundle size を確認する。

`CLAUDE.md` は Claude Code Primary / Hybrid Roadmap Mode の主指示である。Codex は通常参照しなくてよい。ただし、Claude Code から引き継いだ依頼でモードや責務の確認が必要な場合だけ読む。

---

## 4. GitHub 作業ルール

GitHub のルールは、実装を止めるための硬いゲートではなく、事故を減らすためのガードレールである。

原則:

- `main` へ直接 push しない。
- 作業ブランチと PR を使う。
- 1 PR 1 目的で進める。
- 既存 open PR と同じ目的の重複 PR は避ける。
- 既存テストを理由なく削除、skip、期待値緩和しない。

許可される例外:

- ユーザーまたは Claude Code が明示した PR close、PR 作成、branch 作成、docs 修正。
- 失敗した PR を close したうえで、同じ目的を main から作り直すこと。
- docs-only / instruction-only の修正を、関連ファイルまとめて 1 PR にすること。
- テストに関係しない文書修正を、テスト未実行で報告すること。
- 実装目的を通すために必要な最小 docs 更新を同じ PR に含めること。
- テストの準備、待機、読み取り方法に欠陥がある場合、理由と代替検証を記録してテストを直すこと。

必ず止める場合:

- 既存データの互換性を壊す可能性がある。
- `asset.json` / `.casproj` / export ZIP / JSON Schema / version に影響する。
- dependency 追加が必要だが、ライセンスや商用利用条件が未確認。
- 3D 生成 AI、外部モデル重み、WebGPU 必須化を入れようとしている。
- SaaS / アカウント / クラウド / 課金を入れようとしている。
- 指示された目的と実装内容が食い違っている。

---

## 5. 作業順

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

## 6. 実装前に出す内容

```md
## 今回の目的
-

## 今回やらないこと
-

## 読んだ docs / files
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

## 7. 実装ルール

- 変更範囲を最小化する。
- 既存の責務分離に従う。
- UI state と保存データを混同しない。
- 保存データに入れない選択状態や一時状態を export に含めない。
- 既存の Undo / Redo 経路がある操作は、その経路に乗せる。
- Canvas 操作の E2E は不安定化しやすいため、可能な限り role / accessible name / IndexedDB 読み取りなど安定した検証を使う。
- 失敗するテストがある場合は、失敗理由を分類し、環境要因と実装要因を分ける。
- テストは変更禁止の仕様書ではない。仕様・UI が意図して変わった場合、またはテストの準備・待機・読み取り方法に欠陥がある場合は、理由と代替検証を記録して既存テストを修正または置き換えてよい。
- 一時的に skip する場合は、原因、復帰条件、未検証範囲を PR に記録する。説明のない skip は行わない。
- Claude Code から渡されたスコープを勝手に広げない。

---

## 8. 検証方針

変更内容に応じて実行する。文書だけの変更では、コード用の検証は必須にしない。

```bash
npm run lint
npm run format:check
npm run build
npm run test
npm run e2e
```

CI の基準:

- Markdown 文書だけの変更: 変更分類だけを実行し、build / unit / E2E は省略してよい。
- コードまたは設定の変更: lint / format / build / unit を実行する。
- `src/`、`e2e/`、ブラウザ表示、依存関係、Playwright、Vite、CI workflow に触れる変更: E2E も実行する。

Playwright Chromium の取得失敗など環境要因で E2E が実行できない場合は、エラーメッセージ、未検証範囲、CI に委ねる範囲を明記する。

---

## 9. 実装後の報告形式

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

## 10. Claude Code / 人間確認へ戻す条件

次に該当したら、Codex は実装を止めて確認事項を出す。

- 仕様書同士が矛盾している。
- 実装すると既存データの互換性を壊す可能性がある。
- 複数案の優劣判断が必要で、単純な実装判断ではない。
- Fable5 / Opus / Sonnet / Codex の責務分担が曖昧。
- Phase 範囲を超える可能性がある。
- dependency 追加が必要だが、ライセンスや商用利用条件が未確認。
- 既存 open PR と衝突する。
- Claude Code Primary Mode へ戻すべき方針判断が発生した。

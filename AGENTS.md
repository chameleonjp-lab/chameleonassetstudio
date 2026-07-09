# Codex Instructions

最終更新日: 2026-07-09  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
用途: Codex 向けの実装指示書

---

## 0. このファイルの位置づけ

- Codex はこの `AGENTS.md` を主指示として扱う。
- Claude Code 向けの主指示は `CLAUDE.md` に分ける。
- Codex は主実装担当であり、戦略判断の最終決定者ではない。
- 仕様判断に迷う場合は、推測で実装せず、確認事項として出す。

---

## 1. 基本契約

今回の作業を 1 ターンとして扱う。

目的:

- 今回達成することを 1 つに絞る。

前提:

- 既存仕様を壊さない。
- 不明点は推測で実装しない。
- 実装前に変更対象ファイルを列挙する。
- `main` へ直接変更しない。
- 1 PR 1 目的で進める。

---

## 2. 必読ドキュメント

実装前に読む。

- `README.md`
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

---

## 3. Codex の担当範囲

Codex が担当する。

- 具体的な TypeScript / React / CSS 実装
- 既存コードの最小修正
- ユニットテスト追加
- E2E 追加または安定化
- docs の実装追従更新
- 変更差分の説明

Codex が担当しない。

- プロダクト方針の最終判断
- 新規メカニクスや根本仕様変更
- `asset.json` / `.casproj` / export ZIP / JSON Schema の破壊的変更
- SaaS / アカウント / クラウド / 課金 / ランキング / Supabase 導入
- 外部 dependency のライセンス未確認採用
- Fable5 / Claude Code / 人間確認が必要な判断の独断決定

---

## 4. 作業アイテム

Codex は次の順で進める。

1. 仕様確認
2. 既存コードと関係ファイルの調査
3. 原因調査または実装対象の特定
4. 実装方針の提示
5. 最小変更
6. 検証
7. 差分報告
8. 残リスク
9. 次回に引き継ぐメモ

---

## 5. 禁止事項

- 目的外のリファクタ
- UI 仕様の勝手な変更
- データ形式の勝手な変更
- `asset.json` / `.casproj` / export ZIP / JSON Schema / version の勝手な変更
- 既存座標系、原点、アンカー、当たり判定、リグ、アニメーションの意味変更
- 既存 E2E の削除、skip、期待値緩和
- テスト失敗を未確認のまま成功扱いにすること
- 既存 PR と同じ目的の重複 PR 作成
- `main` への直接 push
- SaaS、アカウント、クラウド同期、課金、ランキング、Supabase の導入
- 3D 生成 AI、WebGPU 必須化、外部モデル重みの組み込み

---

## 6. 実装前に必ず出す内容

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

## 7. 実装ルール

- 変更範囲を最小化する。
- 既存の責務分離に従う。
- UI state と保存データを混同しない。
- 保存データに入れない選択状態や一時状態を export に含めない。
- 既存の Undo / Redo 経路がある操作は、その経路に乗せる。
- Canvas 操作の E2E は不安定化しやすいため、可能な限り role / accessible name / IndexedDB 読み取りなど安定した検証を使う。
- 失敗するテストがある場合は、失敗理由を分類し、環境要因と実装要因を分ける。

---

## 8. 検証コマンド

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

## 10. Claude Code / Fable5 へ戻す条件

次に該当したら、Codex は実装を止めて確認事項を出す。

- 仕様書同士が矛盾している。
- 実装すると既存データの互換性を壊す可能性がある。
- 複数案の優劣判断が必要で、単純な実装判断ではない。
- Fable5 / Opus / Sonnet / Codex の責務分担が曖昧。
- Phase 範囲を超える可能性がある。
- dependency 追加が必要だが、ライセンスや商用利用条件が未確認。
- 既存 open PR と衝突する。

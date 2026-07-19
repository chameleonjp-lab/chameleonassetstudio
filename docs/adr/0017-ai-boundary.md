# 0017-ai-boundary

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§11 入力の来歴・安全性）、`docs/adr/0013-provenance-and-ai-record-boundary.md`（決定 3）、`docs/future/2D_COMPLETE_PRODUCT_SPEC.md`（§7 AI と外部サービスの位置付け）、`docs/future/2D_2_IMPORT_PLAN.md`（§4 A、G1+L1+Q1+P1+F1+A1+W1+S1 accepted 2026-07-19）
関連 fixture: `src/core/model/aiBoundaryContract.fixtures.test.ts`（ADR-0017）

---

## 文脈

2D 完成ロードマップの `2D-2-AI-BOUNDARY` は判断必須 work package であり、consent、provenance、外部送信、new layer / variant、Undo、手動代替を ADR で固定するまで AI 関連の実装を扱わない（ROADMAP §6.5: 外部送信、利用条件、provenance、費用、プライバシーを判断してから扱う）。

現行実装に AI 連携・外部送信コードは存在しない（ADR-0013 根拠で確認済み。`src/` 内の外部 URL は export した example HTML 内の CDN 参照と JSON Schema `$id` のみで、アプリ実行時の外部送信ではない）。ADR-0013 決定 3 は AI 送信記録の保存境界（provenance と同じ族として保存し、engine 向け派生出力へ出さない）のみを固定し、具体的な境界の確定を本 ADR へ委ねた。製品仕様 §7 は「AI は正本ではなく補助」「2D 完成の条件を AI 生成の成功に依存させない」ことを求めている。

本 ADR は境界のみを固定し、AI 機能の実装は行わない。

## 決定

1. **外部送信ゼロが既定**: アプリは既定でいかなる画像・文章・メタデータも外部サービスへ送信しない。将来 AI 連携を追加する場合は、送信先・送る内容・保存期間の表示と、操作ごとの明示的な consent UI を前提条件とする（製品仕様 §7）。consent なしの送信・暗黙の再送信・バックグラウンド送信は導入しない。この前提条件を満たす実装は本 ADR の再検討（別 ADR + 人間承認）を経るまで開始しない。
2. **AI 出力の受け入れ経路**: AI 出力（生成画像・修正候補等）を取り込む場合は、new layer または new variant（Family manual variant）としてのみ追加する。既存 layer・source Blob・手動調整済みデータの直接上書きを禁止する。受け入れは既存の取り込み・保存経路（History / Undo / snapshot）に乗せ、1 回の Undo で取り消せるようにする。
3. **AI 送信記録の保存境界**: 送信記録（送信先・モデル名・生成日時・承認状態）を保存する場合は、ADR-0013 決定 3 のとおり provenance と同じ族（asset に紐づく optional / additive なメタデータ）として保存し、外部送信の事実を隠さない。engine 向け派生出力（atlas.json、helper API、examples）へは出さない。具体的な field は `Asset.provenance?` の導入（`2D_2_IMPORT_PLAN.md` P1、Slice B）と同じ設計原則（optional / additive / 非捏造）に従い、AI 連携を実際に導入する ADR で確定する。
4. **秘密情報の禁止**: API key・アクセストークン・認証情報付き URL・個人情報を `.casproj` / `asset.json` / export ZIP / ログへ保存しない（ADR-0012 決定 2、ADR-0013 決定 4 の準用）。
5. **手動代替原則**: すべての AI 補助機能（背景除去、フレーム分割、判定候補、命名候補、色違い案等）は、同じ結果へ到達できる手動操作を持つ候補提示として設計する。AI の成功を保存・書き出し・完成条件の前提にしない（製品仕様 §7）。
6. **SaaS 境界**: AI 連携を理由とした SaaS / アカウント / クラウド保存 / 課金 / 外部 API 必須化を導入しない。ローカルファースト（IndexedDB + `.casproj`）の正本構成を変えない。

## 根拠

- 外部送信コードの不在: ADR-0013 根拠に記録済みの確認結果（`src/` 内の外部 URL は `src/core/export/examples.ts:257,404` の CDN 参照テンプレートと schema `$id` のみ。アプリ実行時の fetch はローカル atlas 読み込みテンプレート）。
- 保存境界の前例: ADR-0013 決定 3（AI 送信記録は provenance と同族・engine 出力へ出さない）、ADR-0012 決定 2（秘密情報の保存禁止）。
- 受け入れ経路の前例: Family manual variant（`kind: 'manual'`、`src/core/model/family.ts`）は「関係を追えるが自動更新されない」variant として group 10 で確立済みであり、AI 出力の受け皿として追加 schema を要しない。layer 追加取り込み（`importImageAsLayer`、`src/core/images/importImage.ts:244-310`）は new layer 経路の既存実装である。
- 手動代替・非依存の規範: 製品仕様 §7（AI は補助、成功に依存させない）、§2.2（生成画像や外部素材が失敗しても手動で修正して完成へ進める）。
- unknown data の保持: `provenanceContract.fixtures.test.ts`（ADR-0013）が root `provenance` 配列の validator 通過と `.casproj` roundtrip 保持を固定済みであり、AI 送信記録を同族として保存する場合の受け皿挙動が既に確認されている。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §11（本 ADR への参照注記のみ、本文は書き換えない）、`docs/future/2D_2_IMPORT_PLAN.md`（状態行）。
- 影響実装: なし（本 ADR は境界の固定のみ。consent UI・AI 連携・送信記録 field の実装は行わない）。
- fixture: `src/core/model/aiBoundaryContract.fixtures.test.ts` の ADR-0017 セクションで次を固定する。
  - AI 送信記録候補 field（送信先・モデル名・生成日時・承認状態）を含む provenance レコードを持つ asset が `validateAsset` を通ること（同族保存の受け皿確認）。
  - 同 asset が `.casproj` export → import で保持されること。
  - `buildAtlas` 出力のトップレベルキー集合に provenance / AI 送信記録が含まれないこと（engine 出力へ出さない境界）。

## 現状の制限

- 本 ADR は AI 連携の実装可否そのものを承認しない。実際の AI 連携（外部送信を伴う機能）の導入には、送信先・費用・プライバシー・利用条件の評価を含む別 ADR と人間承認が必要である（決定 1）。
- AI 送信記録の具体的な field 名・形式は未確定であり、決定 3 の境界のみが有効である（ADR-0013 現状の制限と同じ扱い）。

## 再検討条件

- AI 連携機能（外部送信を伴う）を導入する場合: 送信先・送る内容・保存期間・費用・プライバシー・利用条件の評価記録、consent UI 設計、送信記録 field の確定を含む別 ADR + Opus 4.8 レビュー + 人間承認を経る。
- ローカル実行のみの AI 補助（外部送信なし、例: ブラウザ内モデル）でも、bundle size・dependency・WebGPU 非必須の制約評価を含む別 ADR を経る（3D 生成 AI・外部モデル重みは 2D Pro Gate の人間承認前に扱わない）。

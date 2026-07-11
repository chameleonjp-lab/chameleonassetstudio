# 0011-motion-forward-compatibility

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§8.2 可変時間とイベント、§9.2 将来の拡張順、§13 形式変更と migration の gate）
関連 fixture: `src/core/model/motionContract.fixtures.test.ts`（ADR-0011）

---

## 文脈

ADR-0008〜0010 は、frame 別 `durationMs` 上書き・`Animation.events`・`Frame.colliderOverrides` という 3 つの将来フィールドの境界を定義した。これらを実際に導入する際、既存 0.1.0 データが無変換で読めることと、schema が実際に未知フィールドを許容する実装になっていることを、先に事実として確認・記録しておく必要がある。

## 決定

- 本契約の将来フィールド（frame 単位 `durationMs` / `Animation.events` / `Frame.colliderOverrides`）は**すべて optional・additive** とし、不在時の既定挙動は現行挙動（fps 再生、イベントなし、アセット共通判定のみ）と一致させる。これにより、**既存 0.1.0 データは無変換・意味不変で読める**（migrate は恒等のまま）。
- 現行 JSON Schema は `animation` / `frame` / `frameLayerState` / root（`asset.schema.json` トップレベル）のいずれも `additionalProperties` を指定していない（= 未知フィールドを許容する）という事実を記録する。
- ただし「旧アプリが新データを再保存したとき、未知フィールドが保持されるか」は編集経路の実装依存であり、本 ADR では**保証しない**。将来フィールドを正式導入する際、既存編集経路（`assetOps.ts` 等のオブジェクトスプレッド）が未知フィールドを保持するかどうかを個別に確認し、必要なら version を上げるかどうかを `2D-1A-MIGRATION` の契約で判断する（本 ADR は先取りしない）。
- 将来フィールドの導入 gate: いずれの将来フィールドも、(1) schema / `DATA_FORMAT.md` / `EXPORT_FORMATS.md` の更新、(2) 旧データ fixture + roundtrip テスト、(3) flip / 複製 / export への影響テスト、(4) Opus 4.8 設計レビュー + 人間確認、をすべて満たす契約レーン別 PR でのみ導入できる。

## 根拠

- `src/core/schema/animation.schema.json`（`animation` の `properties` に `additionalProperties: false` が存在しない）。
- `src/core/schema/asset.schema.json` の `frame`（438〜456 行目）、`frameLayerState`（417〜437 行目）、root オブジェクト（1〜129 行目のトップレベル `type: "object"`）のいずれにも `additionalProperties` キーワードが無い。トップレベルの `description` にも「未対応の追加プロパティは検証エラーにせず保持する」と明記されている（`asset.schema.json:5`）。
- `src/core/model/animation.ts:40` の `durationMs?: number;` が、schema 上 optional なフィールドを型定義でも additive に扱っている既存の前例である。
- ADR-0006（`docs/adr/0006-migration-and-recovery-boundaries.md`）が固定した「現行 version の `asset.json` を `migrateAsset` に通しても座標・構造が一切変わらない」という恒等 migrate の事実。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §8.2, §9.2, §13。
- 影響実装: なし（今回は実装しない）。
- fixture: `src/core/model/motionContract.fixtures.test.ts` の ADR-0011 セクションで、(1) `durationMs` 付き animation / `durationMs` 無し animation の両方が `validateAsset` を通ること、(2) `events: []` を持つ animation データ、`colliderOverrides: []` を持つ frame データを含むアセットが**現行 validator を通る**こと（`additionalProperties` 未指定の事実の固定）を数値・真偽値で固定する。

## 再検討条件

将来フィールドを実際に導入する場合は、本 ADR が示す 4 条件（schema/docs 更新、旧データ fixture + roundtrip、flip/複製/export 影響テスト、Opus 4.8 レビュー + 人間確認）をすべて満たす契約レーン別 PR で行う。`additionalProperties` を `false` に変更する（= 未知フィールドを拒否する方針へ転換する）場合も、互換性への影響が大きいため同様に別 PR + Opus 4.8 レビュー + 人間確認を経てから着手する。

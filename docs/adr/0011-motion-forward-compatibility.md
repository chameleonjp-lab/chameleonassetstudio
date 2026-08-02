# 0011-motion-forward-compatibility

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§8.2 可変時間とイベント、§9.2 将来の拡張順、§13 形式変更と migration の gate）
関連 fixture: `src/core/model/motionContract.fixtures.test.ts`（ADR-0011）

---

## 文脈

ADR-0008〜0010 は、frame 別 `durationMs` 上書き・`Animation.events`・`Frame.colliderOverrides` という3つの将来フィールドの境界を定義した。本ADRは、それらを導入する際に旧dataが意味不変で読めることと、schemaが未知フィールドを許容する実装だったことを先に記録した。`Frame.durationMs?`と`Animation.events?`はGroup 12で実装済み、`Frame.colliderOverrides?`はGroup 13 O1 Slice BのADR-0024で詳細契約中である。

## 決定

- 本契約の追加フィールド（frame 単位 `durationMs` / `Animation.events` / `Frame.colliderOverrides`）は**すべて optional・additive** とし、不在時の既定挙動はfps再生、イベントなし、アセット共通判定だけと一致させる。`Frame.colliderOverrides?`を追加するO1でもAsset `0.2.0`を維持し、このfieldのためのmigrationを追加しない。
- 現行 JSON Schema は `animation` / `frame` / `frameLayerState` / root（`asset.schema.json` トップレベル）のいずれも `additionalProperties` を指定していない（= 未知フィールドを許容する）という事実を記録する。
- ただし「旧アプリが新データを再保存したとき、未知フィールドが保持されるか」は編集経路の実装依存であり、本 ADR では**保証しない**。将来フィールドを正式導入する際、既存編集経路（`assetOps.ts` 等のオブジェクトスプレッド）が未知フィールドを保持するかどうかを個別に確認し、必要なら version を上げるかどうかを `2D-1A-MIGRATION` の契約で判断する（本 ADR は先取りしない）。
- 追加フィールドの導入gate: schema / `DATA_FORMAT.md` / `EXPORT_FORMATS.md`、旧data fixture + roundtrip、flip / 複製 / export影響、独立review + 人間確認を満たす契約レーン別PRでのみ導入できる。O1はADR-0024のdocs-only Slice Bを先にmainへ置き、その後のSlice Cで実装する。

## 根拠

- `src/core/schema/animation.schema.json`（`animation` の `properties` に `additionalProperties: false` が存在しない）。
- `src/core/schema/asset.schema.json` の `frame`（438〜456 行目）、`frameLayerState`（417〜437 行目）、root オブジェクト（1〜129 行目のトップレベル `type: "object"`）のいずれにも `additionalProperties` キーワードが無い。トップレベルの `description` にも「未対応の追加プロパティは検証エラーにせず保持する」と明記されている（`asset.schema.json:5`）。
- `src/core/model/animation.ts:40` の `durationMs?: number;` が、schema 上 optional なフィールドを型定義でも additive に扱っている既存の前例である。
- ADR-0006（`docs/adr/0006-migration-and-recovery-boundaries.md`）が固定した「現行 version の `asset.json` を `migrateAsset` に通しても座標・構造が一切変わらない」という恒等 migrate の事実。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §8.2, §9.2, §13。
- 影響実装: `durationMs` / `events`は実装済み。O1 Slice Bはdocs-onlyで、`colliderOverrides`の製品実装はSlice Cへ分離する。
- fixture: `src/core/model/motionContract.fixtures.test.ts` の ADR-0011 セクションは、`durationMs`の有無、`events`、`colliderOverrides`のような追加fieldをvalidatorが扱う前提を固定する。O1 Slice Cでは、`colliderOverrides`が参照するAsset colliderをfixtureへ追加して意味上validにし、無効参照を許可する根拠には使わない。

## 再検討条件

追加fieldを実装する場合は、本ADRが示す4条件（schema/docs、旧data fixture + roundtrip、flip / 複製 / export影響、独立review + 人間確認）を満たす契約レーン別PRで行う。`additionalProperties`を`false`へ変える場合も、互換性への影響が大きいため別PRと人間確認を経てから着手する。O1の具体条件はADR-0024を優先する。

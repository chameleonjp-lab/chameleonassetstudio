# 0003-variant-and-derived-asset-interpretation

ステータス: accepted（2026-07-17再検討、`F1+C1+V1+T1`を追加採用）
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§4 概念上の構造, §7 派生素材の契約）
関連 fixture: `src/core/model/familyContract.fixtures.test.ts`

---

## 文脈

本ADRの初回採用時、`2D_ASSET_DATA_CONTRACT.md` §4が定義する`Asset Family` / `Asset Variant`は`Project` / `Asset`型に存在しなかった。左右反転コピー（`flipCopyAsset`）や将来の色違い・装備違い作成を実装する前に、「現行の単独`Asset`を何と解釈するか」「派生関係をどこまで自動保存するか」を固定した。

2026-07-17、PR #116で`2D-2-VARIANT + 2D-2-BATCH`契約監査がmainへ入り、`docs/future/2D_2_VARIANT_BATCH_PLAN.md` §8で人間が`F1+C1+V1+T1+B1+O1+H1+L1`を採用した。本ADRの再検討条件が成立したため、独立Assetの既存意味を維持したままoptionalなProject-level Family registryを追加する。

## 決定

- 現行の単独 `Asset` は、「`Asset Family` / `Asset Variant` を持たない独立アセット」と解釈する。`Project.assets` の各要素は、それ自体で完結した編集対象として扱う。
- 左右反転コピー（`flipCopyAsset`）・複製は、元アセットとの派生関係（親子関係、同期対象、Family ID）を一切保存しない**独立アセット**を作る。生成後は元アセットと無関係な `Asset` として編集・削除・書き出しできる（現行実装を維持）。
- `Asset Family` / `Asset Variant`を導入する場合は、契約レーンの別PR（`docs/future/2D_ASSET_DATA_CONTRACT.md` §13 gate対象）とし、既存単独Assetのadditive読込、手動調整保護、複製・左右反転コピー・色違い作成との関係を先に固定する。
- 派生素材（左右向き、色違い、装備違い、解像度違い、アニメーション差分）の自動一括更新は行わない。契約 §7 のとおり、更新対象・手動調整の保護範囲・再生成の前後比較をユーザーが確認して選ぶ設計を前提にする。現行実装（反転コピーが独立アセットを作るのみで、元アセットへの逆反映や自動追従を一切行わない）は、この「自動更新しない」原則と整合する。

### 2026-07-17の再検討結果

- `F1`: 関係の正本はoptionalな`Project.families`へ置く。1 Familyは1 base + 0件以上のvariantを持ち、1 Assetは高々1 Family・1役割に所属する。Asset本体は単独編集・product export可能なまま維持する。
- `C1`: `families`はoptional・additive fieldとし、`CURRENT_PROJECT_VERSION = 0.1.0`、migrationなし、ZIP内pathとDB store / index変更なしを維持する。field不在は全Asset standaloneであり、自動的に「1 Family 1 Variant」へ変換しない。
- `V1`: linked variantは種別別内部`idMap`、明示`writeSet`、最後に同期したbase / variant fingerprintを必須で保存する。base保存時のbackground更新は行わず、明示preview / refreshまで上書きしない。Asset IDと内部要素IDの名前空間を混ぜない。
- `T1`: linked recipeはmirrorとpaletteから開始する。装備・手修正版解像度は`manual`として追跡できるが自動再生成しない。既存の独立copy / flip copyはFamilyへ自動登録しない。
- base削除はrebaseまたはFamily解除まで拒否し、variant削除はFamily参照とAsset / Blobを同じtransactionで除去する。Family解除はmember Assetを削除せずstandaloneへ戻す。
- Family metadataは再編集用`.casproj`の`project.json`だけに含め、ゲーム向け`asset.json`、画像、atlas、engine向けZIPへ追加しない。

Slice Aは型、schema、参照意味検査、fixture、`.casproj` / storage境界、文書同期だけを扱う。fingerprint計算、stale / manual-adjusted判定、管理UI、linked refreshはSlice C、複数Asset原子保存はSlice B、batch体験はSlice Dで実装する。

## 根拠

- `Asset`型（`src/core/model/asset.ts`）には引き続きFamily / Variant / 親アセット参照を置かず、Project-level registryを正本にするため、個別Assetとproduct exportの独立性を維持できる。
- `flipCopyAsset`（`src/core/model/flipCopy.ts`）は新規 `id`（`generateId('asset')`）を持つ完全に独立した `Asset` を返し、元アセットへの参照フィールドを一切持たせない（`docs/future/FLIP_DESIGN.md` 3 章と一致）。
- accepted `F1+C1+V1+T1`は、初回ADRのadditive・自動一括更新しない原則を変更せず、導入前に要求していた関係正本、互換、更新保護、copy境界を具体化している。

## 影響と fixture

- 影響docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §4 / §7、`docs/future/2D_2_VARIANT_BATCH_PLAN.md`、`docs/DATA_FORMAT.md`、`docs/USER_GUIDE.md`。
- 影響実装: `Project.families`、Family型 / schema / 意味検査、保存・読込・`.casproj`境界。`Asset`、version、migration、ZIP path、DB layout、product export形式は変更しない。
- fixture: `familyContract.fixtures.test.ts`でfield不在0.1.0、unknown field、参照不変条件、内部IDを保持するimport remap、独立copy / flip copy、product export非変更を固定する。

## 再検討条件

今回の実装は、PR #116後の人間判断記録に従いSlice Aから開始した。各SliceはDraft PRでCIを全成功させ、その後Opus 4.8互換性レビューと人間確認を通す。PR #116のGitHub review / thread / commentは0件であり、Opusレビュー済みとは記録しない。Slice AのOpusレビューもCI成功後までpendingである。

今後、Project versionを上げる、Asset側にも重複metadataを置く、background自動同期、field単位3-way merge、rig / 装備 / 解像度の自動再生成、engine向けFamily exportへ進む場合は、本ADRと`2D_2_VARIANT_BATCH_PLAN.md`を再検討し、新しい人間判断を得る。

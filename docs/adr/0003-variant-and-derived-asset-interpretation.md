# 0003-variant-and-derived-asset-interpretation

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§4 概念上の構造, §7 派生素材の契約）
関連 fixture: なし（本 ADR は解釈の固定のみで、現行コードの新しい振る舞いを持たないため fixture 対象がない）

---

## 文脈

`2D_ASSET_DATA_CONTRACT.md` §4 は将来 `Asset Family` / `Asset Variant` という概念を定義するが、現在の `Project` / `Asset` 型にはこの概念が存在しない。左右反転コピー（`flipCopyAsset`）や将来の色違い・装備違い作成を実装する前に、「現行の単独 `Asset` を何と解釈するか」「派生関係をどこまで自動保存するか」を決めておかないと、後から Family / Variant を追加したときに既存データの意味づけが破綻する。

## 決定

- 現行の単独 `Asset` は、「`Asset Family` / `Asset Variant` を持たない独立アセット」と解釈する。`Project.assets` の各要素は、それ自体で完結した編集対象として扱う。
- 左右反転コピー（`flipCopyAsset`）・複製は、元アセットとの派生関係（親子関係、同期対象、Family ID）を一切保存しない**独立アセット**を作る。生成後は元アセットと無関係な `Asset` として編集・削除・書き出しできる（現行実装を維持）。
- `Asset Family` / `Asset Variant` を導入する場合は、契約レーンの別 PR（`docs/future/2D_ASSET_DATA_CONTRACT.md` §13 gate 対象）とし、次を必須にする。
  - 既存の単独 `Asset` を「1 Family 1 Variant」として無変換で読める additive 設計（既存 `.casproj` / `asset.json` の migration 不要、または安全な自動 migration）。
  - 元を直したときに派生へ自動反映する範囲と、手動調整を保護する範囲の明記。
  - 複製・左右反転コピー・色違い作成との関係の再整理。
- 派生素材（左右向き、色違い、装備違い、解像度違い、アニメーション差分）の自動一括更新は行わない。契約 §7 のとおり、更新対象・手動調整の保護範囲・再生成の前後比較をユーザーが確認して選ぶ設計を前提にする。現行実装（反転コピーが独立アセットを作るのみで、元アセットへの逆反映や自動追従を一切行わない）は、この「自動更新しない」原則と整合する。

## 根拠

- `Asset` 型（`src/core/model/asset.ts`）に Family / Variant / 親アセット参照に相当するフィールドは存在しない。
- `flipCopyAsset`（`src/core/model/flipCopy.ts`）は新規 `id`（`generateId('asset')`）を持つ完全に独立した `Asset` を返し、元アセットへの参照フィールドを一切持たせない（`docs/future/FLIP_DESIGN.md` 3 章と一致）。
- `docs/future/2D_ASSET_DATA_CONTRACT.md` §4 は Family / Variant を「現在の型には存在しない将来概念」と明記しており、本 ADR はその前提を追認するのみで型変更を行わない。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §4, §7。
- 影響実装: なし（現行 `Asset` / `flipCopyAsset` の解釈を文書化するのみで、コード変更を伴わない）。
- fixture: 本 ADR は新しい数値的振る舞いを導入しないため、専用 fixture は作らない。ID・参照の非破壊性は ADR-0002 の fixture（`flipCopyAsset` が独立 ID を持つことの確認）で間接的に裏付けられる。

## 再検討条件

`Asset Family` / `Asset Variant` を実装する場合は、本 ADR の「additive・自動一括更新しない」原則を前提とした別の設計 PR を作り、Fable5（または人間）の方針判断と Opus 4.8 の互換性レビューを経てから着手する。

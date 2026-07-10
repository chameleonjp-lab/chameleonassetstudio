# 0002-id-name-reference-rules

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§5.1 ID、名前、参照）
関連 fixture: `src/core/model/contract.fixtures.test.ts`（ADR-0002）

---

## 文脈

layer / part / texture / frame / animation / anchor / collider は相互に参照し合う。複製・左右反転コピー・`.casproj` 読み込みで ID を付け替える処理が増えるほど、参照の張り替え漏れや Blob key の不整合が起きやすい。実装前に、ID・名前・参照の規則と「何を規範実装とするか」を固定する。

## 決定

- `id` は機械用の安定した識別子であり、`generateId(prefix)`（`src/core/model/factories.ts`）が生成する `${prefix}_${uuid}` 形式（`crypto.randomUUID` 非対応環境では `${prefix}_${timestamp}${random}` 形式）を規範とする。表示名（`name` / `displayName`）の変更で `id` は変えない。
- prefix は呼び出し側が種別ごとに選ぶ自由文字列であり、現行コードでは `asset` / `tex` / `layer` / `part` / `anchor` / `col` / `frame` / `anim`（`assetOps.ts` / `flipCopy.ts`）を主に使う。ただし `src/core/rig/rig.ts` の焼き込み処理のみ `animation`（`anim` ではない）を使っており、prefix は「衝突しない安定 ID を作るための接頭辞」であって全種別横断で単一表記に統一されたルールではない。この差異は将来の意味検証（`2D_ASSET_DATA_CONTRACT.md` §12）でも `id` の一致判定に影響しないため、本 ADR では prefix 文字列そのものではなく「`id` は生成後に不変」という点のみを契約にする。
- layer、part、texture、frame、animation、anchor、collider 間の参照は、名前ではなく `id` を使う（`Part.layerIds`、`Frame.layerStates[].layerId`、`Animation.frameIds`、`Layer.textureId` はすべて `id` 参照）。
- 複製・左右反転コピー・`.casproj` 読み込みで `id` を付け替える場合、参照・Blob key を一貫して更新する。`src/core/model/flipCopy.ts` の `flipCopyAsset` を規範実装として固定する。同関数は `layerIdMap` / `partIdMap` / `frameIdMap` を先に作り、`layers` / `parts` / `frames` / `animations` の相互参照をすべて新 ID へ張り替えたうえで旧 ID を一切残さない。
- `name` / `displayName` は人間向けであり、外部出力のファイル名やキーにそのまま使うとは限らない。ただし現行の atlas 出力（`buildAtlas`）は `Frame.name` を出力キーとしてそのまま使う。この現行挙動は維持し、名前の一意性・使用可能文字の検証、対象別の一意キー生成は 2D-3 / 2D-4 の検査機能・出力契約（`2D_ASSET_DATA_CONTRACT.md` §5.1 末尾, §12）で扱う。本 ADR では規則のみを確定し、検証機能は実装しない。

## 根拠

- `generateId`（`src/core/model/factories.ts`）が ID 生成の唯一の入口である。
- `flipCopyAsset`（`src/core/model/flipCopy.ts`）は `layerIdMap.get(layer.id)!` のように必ず新 ID へ張り替えており、`part.layerIds` / `frame.layerStates[].layerId` / `animation.frameIds` の参照も同じマップ経由で解決する。texture の `id` / `path` のみ元のまま保持し、画像 Blob は呼び出し側が新アセット ID のキーへコピーする前提（テクスチャ実体は参照のみで id 自体は変えない設計）。
- `buildAtlas`（`src/core/export/atlas.ts`）は `nameById.get(position.frameId) ?? position.frameId` で `Frame.id` から `Frame.name` を解決し、出力 JSON のキーに使う。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §5.1。
- 影響実装（現状維持）: `src/core/model/factories.ts`、`src/core/model/flipCopy.ts`、`src/core/export/atlas.ts`。
- fixture: `src/core/model/contract.fixtures.test.ts` の ADR-0002 セクションで、`flipCopyAsset` 後に parts→layers、frames→layers、animations→frames の全参照が新 ID で解決でき、旧 ID がどのフィールドにも残らないことを確認する。

## 再検討条件

`id` 生成方式、prefix 規則の統一、名前の一意性検証、出力キー生成方式を変更する場合は、別 PR + Opus 4.8 設計レビューを経る。特に `id` prefix を全種別で統一する変更は `src/core/rig/rig.ts` を含む複数箇所に影響するため、本 ADR だけで先行実装しない。

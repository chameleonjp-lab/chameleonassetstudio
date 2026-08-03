# 0010-collider-override-and-polygon-boundary

ステータス: accepted / O1 implemented-in-main / polygon unsupported
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§9.2 将来の拡張順、§9.3 polygon を追加する条件）
関連 fixture: `src/core/model/motionContract.fixtures.test.ts`（additive前提）、`src/core/model/frameColliderOverrides.test.ts`（O1正式fixture）

---

## 文脈

将来、frame ごとに当たり判定を微調整したい（攻撃モーションの一部だけ攻撃判定を出す等）要望が見込まれる。しかし上書き単位（frame か animation か）と許可する上書き範囲（位置・サイズだけか、追加削除まで許すか）を先に決めないと、frame を複数 animation が共有する現行構造（`Frame.layerStates` と同様に `Animation.frameIds` が frame を参照する構造）で意味が分裂する。あわせて polygon collider の採用可否も `docs/future/COLLIDER_EDITING_DESIGN.md` / ADR-0006 の gate を再確認し、境界として固定する。

## 決定

- 当たり判定の正本は **`Asset.colliders`（アセット共通）**を維持する（契約 §9.2 の拡張順 1）。
- 将来の上書きは **frame 単位のみ**（`Frame.colliderOverrides?` 相当の optional・additive フィールド）とする。**animation 単位の上書きは導入しない**。理由は、同じ `frame`（`Asset.frames` の 1 要素）を複数の `Animation.frameIds` が共有し得る現行構造で、animation 単位の上書きを許すと「どの animation 経由で表示されたか」によって同一 frame の判定が変わってしまい、frame という単位の意味が分裂するため。
- 優先順位は「frame 上書き > アセット共通」。
- 第一段階で許可する上書きは **位置・サイズ（rect: `x`/`y`/`width`/`height`、circle: `x`/`y`/`radius`）と `visible` のみ**。collider の追加・削除、`purpose` 変更、`shape` 変更は上書きでは行えない（対象となる collider は `Asset.colliders` に既存のものに限る）。
- **polygon collider は unsupported を維持**する（採用しない）。契約 §9.3 のチェックリスト（点の座標系が絶対値か相対値か、最小点数・自己交差・凸/凹・頂点順の規則、左右反転後の頂点順、JSON Schema・migration・helpers・export・target adapter・E2E への影響、既存 rect/circle と古い `.casproj` との互換性）をすべて満たす別の設計 PR + Opus 4.8 レビュー + 人間確認を通すまで、`Collider` union に polygon を追加しない（ADR-0006 の migration gate、および `docs/future/COLLIDER_EDITING_DESIGN.md` の既定判断の再確認）。
- flip copy との関係: `colliderOverrides`の上書き座標も ADR-0005 の反転式（rect は `newRectX = mirrorX - ((oldX + width) - mirrorX)`、circle は中心 `x` を `newX = mirrorX - (oldX - mirrorX)`）に従う。event の `frameId`（ADR-0009）は flip copy の id 張り替え（ADR-0002 の規範実装、`flipCopyAsset`）の対象に含める。
- 2026-08-02のGroup 13人間判断でO1を採用した。canonicalな`Frame.colliderOverrides?`の永続形、field単位fallback、構造・意味検証、UI、複製・反転・resize、保存・rollback、export拒否はADR-0024を正本とする。polygonはP1により2D Pro Gateまで`unsupported`を維持する。

## 根拠

- `Collider` は現行 `rect` / `circle` の union のみで（`src/core/schema/asset.schema.json` の `collider` 定義、404〜487行目）、polygon は存在しない。
- `Frame`（`src/core/model/animation.ts:13`〜19）は`layerStates`と任意の`durationMs`を持つが、collider上書き用fieldは存在しない。`Animation`（同51〜61）もcollider情報を持たない。
- ADR-0005（`docs/adr/0005-flip-semantics.md`）が固定した rect / circle の反転式は、将来の frame 別上書きにもそのまま適用できる形（矩形は右端基準、円は中心基準）である。
- `docs/future/COLLIDER_EDITING_DESIGN.md` と ADR-0006（`docs/adr/0006-migration-and-recovery-boundaries.md`）が、`Collider` union の構造変更を migration gate 対象として明示している。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §9.2, §9.3。
- 影響実装: O1 Slice B / PR #218で正式契約を固定し、Slice Cの型、schema、resolver、共通意味検証、編集、保存、変換、export preflight、testsはPR #219 / #220でmainへ反映した。E2E待機安定化PR #221 / merge `65df697e36f53ee20464d7bb74940f8713317d65`まで検証し、Group 13をcloseoutした。
- fixture: ADR-0011 の fixture（`src/core/model/motionContract.fixtures.test.ts`）はadditive前提を固定する。O1の正式fixtureは参照先Asset colliderを持つ意味上validなdata、schema / resolver / roundtrip / export拒否を`src/core/model/frameColliderOverrides.test.ts`ほかで固定する。

## 再検討条件

`Frame.colliderOverrides`はADR-0024とPR #218〜#221の契約・実装・検証を経てmainへ反映済みである。polygonを追加する場合は、契約 §9.3 のチェックリストを満たす別設計PR、独立review、人間確認を経てから着手する（`2D-3-POLYGON`、P1により2D Pro Gateまで延期）。

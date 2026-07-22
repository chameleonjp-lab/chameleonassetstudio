# 0022-rig-flip-and-bake-parity

ステータス: accepted（2026-07-22 人間承認、R1）
上位文書: `docs/future/2D_3_TIMELINE_RIG_PLAN.md`（§4、§6 H3、§7）、`docs/future/FLIP_DESIGN.md`
関連 fixture: 将来のR1実装sliceで追加（本ADRはdocs-only）

---

## 文脈

現行のアセット全体flipは、焼き込み済みFrameを反転する一方、`rigAnimations`を除外し、Partの`bindPose`と`rotationLimit`を削除する。Group 12のrig flipは、この既存挙動を黙って変えるのではなく、リグ編集データを完全に鏡映する独立sliceとして契約化する必要がある。

## 決定

- 反転軸は`asset.origin.x`とする。
- `Part.pivot.x' = 2 * axisX - pivot.x`、yは変えない。
- bind poseとkeyframe poseは`localPosition.x' = -x`、`localRotation' = -rotation`、`localScale' = localScale`とする。
- `rotationLimit {min,max}`は`{min: -max, max: -min}`へ変換する。
- keyframe time、fps、loop、durationは変えない。
- Part ID、`parentId`、`layerIds`、rig poseのpart ID key、RigAnimation ID、Frame ID、eventの`frameId`を完全mapで張り替える。event名は自動変更しない。
- 未解決参照、重複Layer所属、親子循環、非有限値を黙って落としたり旧IDのまま残したりせず、理由付きで拒否する。
- ID、日時、表示名を正規化した上で、`flip(bake(original))`と`bake(flipRig(original))`の全Frame transformと最終pixelが許容誤差内で一致することを完了条件にする。
- bake前に有限値、参照、循環、生成Frame / LayerState / serialized bytes / sheet pixelを共通preflightで検査し、上限超過は1件も割り当てる前に原子的に拒否する。

## 根拠

- ADR-0005の既存flip境界と、asset originを全体反転軸にする座標契約を維持できる。
- 水平鏡映の前後で回転符号と可動域の端点を入れ替え、scaleを二重反転しない式になる。
- bake parityをGateにすると、編集用rigと再生・export正本である焼き込みFrameの見た目を同じfixtureで検証できる。

## 影響と fixture

- 将来の実装: rig flip、完全ID remap、bake座標修正、共通preflight、inspector、Undo / Redo、保存roundtrip。
- fixture: 親子3段以上、非zero pivot、bind pose、rotation limit、部分keyframe、負scale、非等方scale、double flip、source不変、全Frame parityを含める。
- 現行`bakeRigAnimation`のLayer中心計算はaccepted座標契約と不一致であるため、R1実装より先にrendererと同じ式へ直す。
- 本docs-only PRでは製品コード、schema、上限定数を変更しない。

## 再検討条件

最大Frame数と関連資源上限は`2D_3_TIMELINE_RIG_PLAN.md`のH3で、browserとiPhone Safariの測定後に人間が決める。H3未決定の間はR1製品実装を開始しない。shearの永続表現、linked Familyのrig refresh、rebake置換、native rig export、IK、mesh、physicsを追加する場合は別ADRとする。

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
- Part ID、`parentId`、`layerIds`、rig poseのpart ID key、RigAnimation ID、Frame ID、event IDとeventの`frameId`を完全mapで張り替える。event名は自動変更しない。linked mirrorの内部ID維持modeは既存規則に従う。
- 未解決参照、親子循環、非有限値、H2で採用したLayer所属規則に反するdataを黙って落としたり旧IDのまま残したりせず、理由付きで拒否する。H2決定前は実装しない。
- 対応Layerのposition x / y、scale x / y、`[-180, 180)`へ正規化したrotationは絶対差`1e-6`以下、配列順、visible、opacity、参照、時間はexact一致とする。relative toleranceは使わない。
- pixelは同寸法RGBA bufferの全alpha差を1以下、どちらかのalphaが0より大きいpixelのRGB各channel差を1以下とする。両方が完全透明のpixelだけRGBを比較対象外にする。
- parityで正規化できるのは完全mapで対応が証明された各ID、`createdAt / updatedAt`、自動copy表示名だけとし、配列順、参照、時間、transform、visible、opacity、pixelは正規化しない。
- `.casproj` ZIP decode直後・製品namespace再採番前はcanonical `asset.json`とBlob bytes / hashをexport直前とexact一致させる。製品import後は、既存契約が要求するProject ID / Asset ID、FamilyのAsset参照、Asset IDをprefixに持つBlob storage keyの対応mapだけを許可する。
- 製品import後もPart / Layer / Frame / Animation / RigAnimation / eventの内部ID、参照、時間、transform、配列順、Blob bytes / hashはexact一致とする。許可したcontainer mapを逆適用してcanonical Assetを比較し、reload後にもbake parityを再実行する。
- bake前に有限値、参照、循環、生成Frame / LayerState / serialized bytes / sheet pixelを共通preflightで検査し、上限超過は1件も割り当てる前に原子的に拒否する。

## 根拠

- ADR-0005の既存flip境界と、asset originを全体反転軸にする座標契約を維持できる。
- 水平鏡映の前後で回転符号と可動域の端点を入れ替え、scaleを二重反転しない式になる。
- bake parityをGateにすると、編集用rigと再生・export正本である焼き込みFrameの見た目を同じfixtureで検証できる。

## 影響と fixture

- 将来の実装: rig flip、完全ID remap、bake座標修正、共通preflight、inspector、Undo / Redo、保存roundtrip。
- fixture: 親子3段以上、非zero pivot、bind pose、rotation limit、部分keyframe、負scale、非等方scale、double flip、source不変、全Frame parity、`.casproj` roundtripを含める。
- 現行`bakeRigAnimation`は入力中心と出力positionの両方がaccepted座標契約と不一致である。入力を`center0 = position + textureSize / 2`、world pose適用後を`center1`、出力を`next.position = center1 - textureSize / 2`として、R1実装より先にrendererと同じ式へ直す。
- 本docs-only PRでは製品コード、schema、上限定数を変更しない。

## 再検討条件

最大Frame数と関連資源上限は`2D_3_TIMELINE_RIG_PLAN.md`のH3で、browserとiPhone Safariの測定後に人間が決める。H3未決定の間はR1製品実装を開始しない。shearの永続表現、linked Familyのrig refresh、rebake置換、native rig export、IK、mesh、physicsを追加する場合は別ADRとする。

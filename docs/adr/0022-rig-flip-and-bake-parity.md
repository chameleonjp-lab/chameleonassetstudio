# 0022-rig-flip-and-bake-parity

ステータス: accepted（2026-07-22 人間承認、R1 + H2=L1 + H3=M1 method。2026-07-24 ADR-2026-07-24-027でB1先行を承認）
上位文書: `docs/future/2D_3_TIMELINE_RIG_PLAN.md`（§4、§6 H3、§7）、`docs/future/FLIP_DESIGN.md`
関連 fixture: R1 Slice B1で追加（本ADRとADR-2026-07-24-027が実装境界）

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
- 未解決参照、親子循環、非有限値、H2=L1（各Partは非空、各Layerは高々1 Partへ所属）に反するdataを黙って落としたり旧IDのまま残したりせず、理由付きで拒否する。未所属Layerは許可し、既存違反dataを自動migrationしない。
- 対応Layerのposition x / y、scale x / y、`[-180, 180)`へ正規化したrotationは絶対差`1e-6`以下、配列順、visible、opacity、参照、時間はexact一致とする。relative toleranceは使わない。
- pixelは同寸法RGBA bufferの全alpha差を1以下、どちらかのalphaが0より大きいpixelのRGB各channel差を1以下とする。両方が完全透明のpixelだけRGBを比較対象外にする。
- parityで正規化できるのは完全mapで対応が証明された各ID、`createdAt / updatedAt`、自動copy表示名だけとし、配列順、参照、時間、transform、visible、opacity、pixelは正規化しない。
- `.casproj` ZIP decode直後・製品namespace再採番前はcanonical `asset.json`とBlob bytes / hashをexport直前とexact一致させる。製品import後は、既存契約が要求するProject ID / Asset ID、FamilyのAsset参照、Asset IDをprefixに持つBlob storage keyの対応mapだけを許可する。
- 製品import後もPart / Layer / Frame / Animation / RigAnimation / eventの内部ID、参照、時間、transform、配列順、Blob bytes / hashはexact一致とする。許可したcontainer mapを逆適用してcanonical Assetを比較し、reload後にもbake parityを再実行する。
- B1ではbake前に有限値、参照、循環、H2=L1など入力の正しさを構造preflightで検査し、拒否時はAsset、Blob、History、autosaveを変更しない。
- B2では生成Frame / LayerState / serialized bytes / sheet pixelを割当前に見積もり、後続承認した上限超過を原子的に拒否する。

## 根拠

- ADR-0005の既存flip境界と、asset originを全体反転軸にする座標契約を維持できる。
- 水平鏡映の前後で回転符号と可動域の端点を入れ替え、scaleを二重反転しない式になる。
- bake parityをGateにすると、編集用rigと再生・export正本である焼き込みFrameの見た目を同じfixtureで検証できる。

## 影響と fixture

- B1の実装: rig編集データを保持した独立左右反転コピー、完全ID remap、bake座標修正、構造preflight、inspector、保存・reload・`.casproj` roundtrip。独立copyは新Asset作成操作として画面から利用でき、元AssetとHistoryを変更せず、保存失敗時は新Asset追加を全て取り消す。
- fixture: 親子3段以上、非zero pivot、bind pose、rotation limit、部分keyframe、負scale、非等方scale、double flip、source不変、全Frame parity、`.casproj` roundtripを含める。
- 現行`bakeRigAnimation`は入力中心と出力positionの両方がaccepted座標契約と不一致である。入力を`center0 = position + textureSize / 2`、world pose適用後を`center1`、出力を`next.position = center1 - textureSize / 2`として、R1実装より先にrendererと同じ式へ直す。
- ADR-2026-07-24-027を反映するdocs-only PRでは製品コード、schema、上限定数を変更しない。B1製品実装は、この決定がmainへ入った後の別Draft PRで行う。

## 再検討条件

H3=M1により測定方法は決定したが、最大Frame / LayerState / serialized bytes / sheet pixelの数値は未決定である。ADR-2026-07-24-027により、数値に依存しないB1の座標修正、構造preflight、独立rig反転コピー、完全ID remap、保存・reload・parityは先行できる。`2D_3_H3_MEASUREMENT_PROTOCOL.md`に従うbrowserとiPhone / iPad Safari測定、および後続の数値人間承認までは、B2のnumeric warning / hard capと上限定数、Group 12完了判定を実装しない。shearの永続表現、linked Familyのrig refresh、rebake置換、native rig export、IK、mesh、physicsを追加する場合は別ADRとする。

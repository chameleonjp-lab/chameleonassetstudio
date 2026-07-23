# 0023-part-layer-replacement

ステータス: accepted（2026-07-22 人間承認、P1 + H2=L1）
上位文書: `docs/future/2D_3_TIMELINE_RIG_PLAN.md`（§5、§6 H2）、`docs/future/2D_ASSET_DATA_CONTRACT.md`（§8.3）
関連 fixture: `src/core/model/assetOps.test.ts`、`assetInspection.test.ts`、`src/core/rig/rig.test.ts`、`src/core/storage/casproj.test.ts`、`e2e/part-layer-replacement.spec.ts`、`e2e/rig.spec.ts`

---

## 文脈

現行Partは`layerIds`で所属Layerを持つが、製品UIに安全な差し替え操作がなく、空、重複、存在しないID、複数Part共有の意味も固定されていない。時間依存の衣装・状態切替へ広げず、最初のpart replaceを既存構造だけで実装できる境界に限定する。

## 決定

- 初回part replaceは、1 Asset内の1つの既存Partについて`layerIds`を既存Layer IDの集合へ置き換える静的操作だけとする。
- Partの`id / name / partType / parentId / pivot / bindPose / rotationLimit`を維持する。
- Layer、Texture、Blob、Frame、Animation、RigAnimationを作成、削除、再採番しない。
- すでにbakeしたFrameを変更せず、次回bakeだけが新しいLayer集合を使う。
- 置換IDは存在と一意性をpreflightで検査し、保存時は`Asset.layers`順へ正規化する。
- H2=L1として、置換後の`layerIds`は1件以上とし、各Layerは高々1 Partへ所属する。未所属Layerは許可する。別Partが所有するLayerは理由付きで拒否し、そのPartから暗黙に移動・削除しない。
- 永続dataのwrite-setは対象Partの`layerIds`と通常のcommitで更新する`Asset.updatedAt`だけとし、対象外Partを含むその他のdomain fieldを変更しない。
- 1回の確定を1 History操作とし、取消、Undo / Redo、保存・reloadを原子的に扱う。
- schema、version、migration、Family recipe、product exportを変更しない。装備違いはmanual variantのままにする。
- 時間依存の衣装、表情、状態切替、keyframe別所属、state machineは別ADRへ分離する。

## 根拠

- 既存`Part.layerIds`だけをwrite-setにすれば、新しい保存概念やmigrationを追加せずに部品差し替えを提供できる。
- 既存bake済みFrameを遡及変更しない規則は、rig編集データとbake後Frameを分離するADR-0008に一致する。
- 時間依存状態を分離することで、Group 13のcollider override / polygonやGroup 10のlinked recipeを先取りしない。

## 影響と fixture

- P1 Slice Cの実装: Part編集UI、置換preflight、read-only inspection、次回bake、History、保存roundtrip。
- fixture: missing / duplicate / empty拒否 / order / 単一ownership / 未所属許可、対象Partの`layerIds`と`Asset.updatedAt`以外のfield不変、既存bake不変、次回bakeだけへの反映、1 History、Undo / Redo、`.casproj`を固定する。
- 既存の空・共有dataを自動migrationせず、read-only inspectionで示し、新規操作とbake preflightからL1を適用する。
- 本docs-only PRでは型、schema、製品UI、保存処理を変更しない。

## 再検討条件

空`layerIds`と1 Layerの複数Part所属はH2=L1で不許可と決定した。L2 / L3へ変更する場合、または時間依存状態、linked装備recipe、Part自動生成、Layer削除を伴う差し替えを追加する場合は別ADRとする。P1製品実装は本ADRだけでは開始せず、別の明示指示と実装PRを必要とする。

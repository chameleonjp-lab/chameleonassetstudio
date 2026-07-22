# 0023-part-layer-replacement

ステータス: accepted（2026-07-22 人間承認、P1）
上位文書: `docs/future/2D_3_TIMELINE_RIG_PLAN.md`（§5、§6 H2）、`docs/future/2D_ASSET_DATA_CONTRACT.md`（§8.3）
関連 fixture: 将来のP1実装sliceで追加（本ADRはdocs-only）

---

## 文脈

現行Partは`layerIds`で所属Layerを持つが、製品UIに安全な差し替え操作がなく、空、重複、存在しないID、複数Part共有の意味も固定されていない。時間依存の衣装・状態切替へ広げず、最初のpart replaceを既存構造だけで実装できる境界に限定する。

## 決定

- 初回part replaceは、1 Asset内の1つの既存Partについて`layerIds`を既存Layer IDの集合へ置き換える静的操作だけとする。
- Partの`id / name / partType / parentId / pivot / bindPose / rotationLimit`を維持する。
- Layer、Texture、Blob、Frame、Animation、RigAnimationを作成、削除、再採番しない。
- すでにbakeしたFrameを変更せず、次回bakeだけが新しいLayer集合を使う。
- 置換IDは存在と一意性をpreflightで検査し、保存時は`Asset.layers`順へ正規化する。
- 1回の確定を1 History操作とし、取消、Undo / Redo、保存・reloadを原子的に扱う。
- schema、version、migration、Family recipe、product exportを変更しない。装備違いはmanual variantのままにする。
- 時間依存の衣装、表情、状態切替、keyframe別所属、state machineは別ADRへ分離する。

## 根拠

- 既存`Part.layerIds`だけをwrite-setにすれば、新しい保存概念やmigrationを追加せずに部品差し替えを提供できる。
- 既存bake済みFrameを遡及変更しない規則は、rig編集データとbake後Frameを分離するADR-0008に一致する。
- 時間依存状態を分離することで、Group 13のcollider override / polygonやGroup 10のlinked recipeを先取りしない。

## 影響と fixture

- 将来の実装: Part編集UI、preflight、inspection、次回bake、History、保存roundtrip。
- fixture: missing / duplicate / empty / order / ownership境界、他field不変、既存bake不変、次回bakeだけへの反映、1 History、Undo / Redo、`.casproj`を固定する。
- 既存dataを自動migrationせず、新規操作のpreflightとread-only inspectionから導入する。
- 本docs-only PRでは型、schema、製品UI、保存処理を変更しない。

## 再検討条件

空`layerIds`を許すか、1 Layerを複数Partへ所属させるかは`2D_3_TIMELINE_RIG_PLAN.md`のH2で人間判断する。H2未決定の間はP1製品実装を開始しない。時間依存状態、linked装備recipe、Part自動生成、Layer削除を伴う差し替えを追加する場合は別ADRとする。

# 2D-2-PROJECT + 2D-2-CREATE 後続slice 実装報告

作成日: 2026-07-16
状態: `implementation completed on branch / Draft PR #100 / CI pending`
採用判断: `A+B+X`
契約PR: #99（merge commit `261bc2dcd3635c2741323727c6364de579e668c2`）
実装branch: `agent/2d2-create-abx-implementation`

## 1. 実装内容

- 幅・高さ1〜4096の整数と総pixel数を、Canvas / Blob生成前に検査する純粋なvalidator
- 既存正方形preset、256 x 128横長、128 x 256縦長、自由入力
- `blank`と現行6種starterの明示template selector
- template IDを保存せず、適用後の通常Assetフィールドだけを保存
- character基本templateの任意body Part。親子階層、bind pose、rigは追加しない
- 既存`saveProjectBundle`によるProject・Asset・Blobの原子的追加

## 2. Template fixture

- character-basic: body collider、任意body Part
- item-pickup: pickup collider、item tag
- background-loop: main layerのmid背景、横loop、視差速度
- tile-floor: 32 x 32、solid、floor
- gimmick-platform: movement none、body collider、platform tag
- effect-spark: spark、500ms、非loop、normal blend

## 3. 安全境界

schema、data version、DB version、migration、IndexedDB layout、`.casproj`、export ZIP、dependenciesを変更していない。Family / Variant、linked update、batch、永続shape / text、raster編集、rig階層、3D、WebGPUも実装していない。

不正sizeは無断clampせず、Canvas / Blob生成前に拒否する。保存成功前にReact stateを追加しない既存経路を維持する。

## 4. テスト

- 全6種のblank / starter fixture
- template不一致とbody Part境界
- sizeの最小値、最大値、小数、非有限値、上限超過
- 自由矩形tileの保存・reload
- character body Partの明示作成
- 上限外size拒否時にAsset / Blob / UIを追加しないこと
- 既存create、reload、`.casproj`回帰

CI失敗は同じDraft PR #100で補修し、最終headとCI Runを本報告へ追記する。Opus reviewと人間確認前にready化、merge、auto-mergeを行わない。

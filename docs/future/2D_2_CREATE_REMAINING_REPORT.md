# 2D-2-PROJECT + 2D-2-CREATE 後続slice 実装報告

作成日: 2026-07-16
状態: `completed / PR #100 + PR #101 merged / CI Run #306 + #308 success`
採用判断: `A+B+X`
契約PR: #99（merge commit `261bc2dcd3635c2741323727c6364de579e668c2`）
実装PR: #100（merge commit `5f72c5f3f94df27a293b0131c88cc6550b5c76f0`）
review補修PR: #101（merge commit `33ebb60c0f78e40439a4c16393ec3e82b4b532eb`）
実装branch: `agent/2d2-create-abx-implementation`
実装final head: `0151295089a1259e4b4c27e2a64ac55816c5dedb`

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

実装補助に使用した一時workflow、診断payload、CI jobはcode head作成時に削除し、最終差分へ残していない。

## 4. テスト

- 全6種のblank / starter fixture
- template不一致とbody Part境界
- sizeの最小値、最大値、小数、非有限値、上限超過
- 自由矩形tileの保存・reload
- character body Partの明示作成
- 上限外size拒否時にAsset / Blob / UIを追加しないこと
- 既存create、reload、`.casproj`回帰

## 5. PR #100 CI証拠

PR #100の最終head `0151295089a1259e4b4c27e2a64ac55816c5dedb`に対するCI Run #306（workflow run ID `29472360055`）は次をすべて成功した。

- lint
- format check
- build
- unit test
- E2E

PR #100はmerge commit `5f72c5f3f94df27a293b0131c88cc6550b5c76f0`でmainへ反映された。

## 6. Opus 4.8事後監査

PR #100マージ後のOpus 4.8監査結果は次だった。

- BLOCKER: 0
- MUST: 0
- SHOULD: 1
- NOTE: 3

製品挙動を変える指摘はなく、次の軽微補強をPR #101で反映した。

1. body Part付きcharacter starterの出力が`validateAsset`を通ることをunit testで固定。
2. 負数とInfinityをsize validatorの明示的な拒否caseへ追加。
3. 総pixel検査が将来の上限変更にも独立して効く意図をコメントで固定。

## 7. PR #101 CI証拠

- final head: `a5492c298baaf08f60773b61d4104a15ff91dc71`
- merge commit: `33ebb60c0f78e40439a4c16393ec3e82b4b532eb`
- CI Run #308（workflow run ID `29493566533`）: lint、format、build、unit test、E2Eが全成功
- 変更: 3ファイル、6行追加、製品挙動変更なし

## 8. 完了判定

accepted A+B+Xの実装、CI、Opus監査、軽微指摘補強、main反映が完了した。`2D-2-CREATE`の今回sliceはcloseoutする。

Family / Variantと、shape / textを含むraster編集は引き続き別work packageで扱う。次の正式work packageは`2D-2-RASTER + 2D-2-REPAIR`であり、契約正本は`docs/future/2D_2_RASTER_REPAIR_PLAN.md`とする。

# 2D-3-TYPE-PROFILES + 2D-3-INSPECT 実装報告

作成日: 2026-07-16
状態: `completed / PR #97 merged / CI Run #293 success / reviewed`
正式work package: `2D-3-TYPE-PROFILES + 2D-3-INSPECT`
採用判断: `A+B+X`
契約PR: #96（merge commit `2e35d4d4d8913198ce0fffe7f52c0256fc9f2258`）
実装branch: `agent/2d3-type-profiles-inspector`
実装PR: #97
実装基準main: `ab66aa8b0f5b374887e18dea16bcb3b9821e41f9`
最終head: `3e237e3186317095c73cdf411aa13d39e4ac8e6c`
merge commit: `500397ac7d04b23ac88cd17a6e79843c8405a557`

## 1. 実装した内容

### 読み取り専用Asset inspector

`src/core/model/assetInspection.ts`に、選択中の`Asset`から一時的な検査結果を計算する`inspectAsset(asset)`を追加した。

各issueは次を持つ。

- 安定した`code`
- 表示上の`severity`（`error` / `warning` / `info`）
- 短い`message`
- 問題または確認が必要な`reason`
- ユーザーが手動で行う`action`
- Editor上の確認場所とAsset内の`target.path`

検査は引数を読み取るだけで、Asset、Project、Blob、History、保存状態を変更しない。検査結果もAsset JSON、Project、`.casproj`へ保存しない。

### 共通検査

現行6種で共通して、次を検査する。

- 正のキャンバスサイズ
- 原点がキャンバス内にあるか
- Texture、Layer、Part、Anchor、Collider、Frame、Animation、RigAnimationのID重複
- LayerからTexture、FrameからLayer、AnimationからFrame、PartからLayer / 親Partへの参照
- RigAnimationのposeからPartへの参照
- Part親子関係の循環
- Collider名とFrame名の重複
- AnimationのFPS、明示再生時間、空フレーム

### 現行6種のbalanced profile

| 型 | 必須不足・矛盾 | 推奨確認 |
|---|---|---|
| character | 共通参照、canvas size | body collider、animation、anchor |
| item | 共通参照、canvas size | pickup collider、item tagまたはgame attribute |
| background | 共通参照、canvas size | background設定済みlayer、loop / parallax |
| tile | tile設定、tileSize、canvas内整合 | canvas分割余り、collisionType、visualType |
| gimmick | gimmick設定 | movement preset、body / sensor collider、用途tag |
| effect | effect設定、正のduration | animation、duration / loop整合、発生位置anchor |

### Editor表示

`src/features/editor/InspectionPanel.tsx`を追加し、`GameAttributesPanel`から表示する。

表示には、必須確認・推奨確認・情報の件数、issue code、理由、直し方、確認場所を含める。修正ボタンや自動修復は追加していない。ユーザーが既存Editorで手動修正すると、選択中Assetの変更に応じて検査結果が再計算される。

## 2. 変更していない範囲

次は変更していない。

- `AssetType`、schema、data version、DB version、migration
- IndexedDB store / index layout
- `.casproj`内部構成、export ZIP内部構成
- 保存、autosave、History、snapshot、trash、復元、容量管理
- dependencies
- UI / iconの保存表現
- Family / Variant、preflight、raster、3D、WebGPU

inspectorのseverityを保存またはexportの停止判定APIにはしていない。

## 3. テスト

### Unit test

`src/core/model/assetInspection.test.ts`で次を固定した。

- 現行6種すべてのprofile
- 共通参照切れとPart親子循環
- inspectorがAssetを変更しないこと
- 同じAssetから同じissue idを返すこと
- 必須確認が推奨確認より先に並ぶこと
- 各issueがreason、action、targetを持つこと

### E2E

`e2e/asset-inspection.spec.ts`で、新規tile Assetに`tile.settingsMissing`が表示され、既存の「タイル設定を追加」操作で手動修正するとissueが消えることを確認した。自動修復や保存停止を経由せず、既存Editorの操作だけで結果が更新される。

### CI

最終head `3e237e3186317095c73cdf411aa13d39e4ac8e6c`のCI Run #293（workflow run ID `29466869457`）は次をすべて成功した。

- lint
- format check
- build
- unit test
- E2E

## 4. Reviewと完了

2026-07-16にユーザーから、Opus 4.8 reviewと人間確認が完了し、問題なしと報告された。少なくとも追加の`BLOCKER` / `MUST`相当の指摘は引き継がれていない。

PR #97はmerge commit `500397ac7d04b23ac88cd17a6e79843c8405a557`でmainへmerge済みである。これにより`2D-3-TYPE-PROFILES + 2D-3-INSPECT`を正式完了とする。

後続は、保留していた`2D-2-CREATE`の矩形・自由size、型別template、初期Part、図形・文字の境界を契約監査する。正本は`docs/future/2D_2_CREATE_REMAINING_PLAN.md`とする。

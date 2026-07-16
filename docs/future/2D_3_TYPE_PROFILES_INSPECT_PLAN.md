# 2D-3-TYPE-PROFILES + 2D-3-INSPECT 契約監査・実装計画

作成日: 2026-07-16
状態: `A+B+X accepted / implementation completed on branch / Draft PR #97 / CI pending`
正式work package: `2D-3-TYPE-PROFILES + 2D-3-INSPECT`
契約基準main: `2e35d4d4d8913198ce0fffe7f52c0256fc9f2258`（PR #96 merge）
実装基準main: `ab66aa8b0f5b374887e18dea16bcb3b9821e41f9`
直前slice: `2D-2-PROJECT + 2D-2-CREATE` accepted C-slice completed
採用判断: `A+B+X`
実装Draft PR: #97

## 1. 目的

Asset種別ごとに、ゲーム素材として不足している情報、問題になる理由、ユーザーが取れる修正方法を同じ規則で示す。残る`2D-2-CREATE`の型別template、後続のgame data、preview、export検査が別々の「完成条件」を持たないよう、先にprofileと検査境界を固定する。

Family / Variantはaccepted Cの境界どおり別契約へ保留する。本work packageからFamily / Variant、linked更新、schema migrationへ進まない。

## 2. 採用判断

2026-07-16の人間判断により、次の組み合わせを正式に採用する。

- `A`: 最初のsliceは現行6種だけを対象とする。UI / iconは専用schema契約まで保留し、対応済みとは表示しない。
- `B`: balanced profileを採用する。必須不足・矛盾と、用途依存の推奨warningを分離する。
- `X`: inspectorはread-onlyとする。保存、autosave、`.casproj`、exportを新たに停止しない。

この採用は、UI / icon、schema、version、migration、preflight、Family / Variantの実装許可を意味しない。

## 3. 現行実装の監査結果

| 対象 | 現状 | 不足 / 境界 |
|---|---|---|
| Asset type | `character`、`item`、`background`、`tile`、`gimmick`、`effect`の6種をTypeScript、JSON Schema、Project要約、`.casproj`が共有する。 | 完成仕様にあるUI / iconは正式な`assetType`ではない。追加はschema、version、migration、可搬形式の判断を伴う。 |
| 新規作成template | `character`だけstarter body colliderを持ち、他5種は透明な空キャンバスで開始する。 | 型別templateの完成条件は本契約に従って後続sliceで固定する。 |
| 型別編集UI | tile、gimmick、effect、background、itemには部分的な設定UIがある。characterは共通のorigin / anchor / collider / animation編集を使う。 | 各設定が必須か推奨かを統一判定する入口がない。 |
| 構造検証 | `validateAsset`などのAJV検証が保存・`.casproj`境界で動く。 | JSON形状の妥当性であり、ゲーム素材としての不足を説明しない。 |
| 意味検証 | 参照整合性の予防guardやBlob完全性検査が分散している。 | ADR-0014で予定された統一検出pathはない。自動修復は禁止されている。 |
| 出力検証 | export時にschemaと一部Blobを検査する。 | preset別preflightは`2D-4-PREFLIGHT`であり、本work packageで先取りしない。 |
| 検査UI | 専用の検査結果一覧はない。 | issue、理由、修正方法、対象位置を一貫して表示する必要がある。 |

## 4. 変更しない安全境界

本work packageでは、次を変更しない。

- schema、data version、DB version、IndexedDB store / index layout、migration
- `.casproj`内部構成、export ZIP内部構成、dependencies
- `AssetType`列挙、Project要約のasset type、UI / iconの保存表現
- 保存可否、autosave、History、snapshot、trash、復元、容量管理の確定済み挙動
- Family / Variant、linked variant、batch、2D-2-RASTER、2D-3の他work package
- 3D / WebGPU

検査は正本を書き換えず、自動修復・自動削除・無断template適用を行わない。修正操作を将来追加する場合も、既存の保存成功後確定、History、autosave guardを通す。

## 5. A: 対象Asset type

最初の実装sliceは現行6種だけを対象とする。

- `character`
- `item`
- `background`
- `tile`
- `gimmick`
- `effect`

UI / iconは専用schema契約まで保留する。既存`item`や`effect`のpreset / tagへ仮に割り当てず、UI上でも正式対応済みのAsset typeとして表示しない。

## 6. B: balanced profile

検査結果は、必須不足・矛盾と、推奨warningを分離する。

- 必須側は、現行6種の型固有データ、正の値、参照整合性など、そのAssetを現在の契約に従って解釈するために必要な不足・矛盾を示す。
- 推奨warning側は、ゲームで使う際に有用だが用途によって不要になり得る情報を示す。
- 推奨warningは自動修正せず、保存必須にも、export停止条件にも使わない。
- target / preset固有の厳格化は後続`2D-4-PREFLIGHT`で別契約にする。

## 7. X: read-only inspector

inspectorはissueを計算して表示するだけとし、Asset、Project、Blob、History、保存状態を変更しない。

表示上のseverityとして`info` / `warning` / `error`を持てるが、severity自体を保存・exportの強制判定APIにしない。既存の構造検証やBlob検査がすでに停止している不正入力は従来どおり拒否するが、本inspectorを理由に保存、autosave、`.casproj`、exportを新たに停止しない。

強制判定はpreflight契約後に別入口として追加する。

## 8. accepted profile

| 型 | 必須不足・矛盾 | 推奨warning |
|---|---|---|
| character | 参照整合性、正のcanvas size | body collider、animation、用途anchor |
| item | 参照整合性、正のcanvas size | pickup collider、item tag / game attribute |
| background | 参照整合性、正のcanvas size | background設定済みlayer、loop / parallax確認 |
| tile | tile設定、正のtileSize、canvas内整合 | collisionType確認、canvasがtileSizeで割り切れること |
| gimmick | gimmick設定 | movement preset、sensor / body collider、用途tag |
| effect | effect設定、正のduration | animation長との整合、発生位置anchor、blend / loop確認 |

共通の参照整合性は型profileとは別の意味検査として共有する。型別issueは、少なくとも安定したcode、severity、短いmessage、理由、修正方法、対象pathを持つ一時的な計算結果とし、Asset JSON、Project、`.casproj`へ保存しない。

## 9. 最初の実装slice

最初のproduct code Draft PRは次を扱う。

1. side effectのない純粋なAsset inspectorと安定issue codeを追加する。
2. 現行6種のaccepted profileだけを実装し、構造検証、意味検証、出力preflightを混同しない。
3. Editorへ理由・修正方法付きの検査結果一覧を追加する。
4. issue選択で対象パネルへ案内できる範囲を明示し、自動修復は行わない。
5. 保存、autosave、reload、`.casproj`、exportがinspector issueによって新たに停止しないことを回帰テストで固定する。
6. 6種のunit fixture、非変更回帰、E2E、ユーザーガイド、実装報告を追加する。
7. 同じbranch・同じDraft PRでCIを成功させ、Opus reviewと人間確認を待つ。

Draft PR #97では、`src/core/model/assetInspection.ts`、Editor表示、6種のunit test、E2E、`docs/future/2D_3_INSPECT_USER_GUIDE.md`、`docs/future/2D_3_TYPE_PROFILES_INSPECT_REPORT.md`を同じbranchへ実装した。CI失敗はPR #97で補修し、成功後もOpus reviewと人間確認まではDraftを維持する。

## 10. 完了条件

1. `A+B+X`が採用判断として文書に記録される。
2. 現行6種について、必須不足・矛盾と推奨warningが分離される。
3. 各issueが不足情報、理由、修正方法、対象を表示する。
4. inspector実行がAsset、Project、Blob、History、保存状態を変更しない。
5. inspector issueが保存、autosave、`.casproj`、exportを新たに停止しない。
6. UI / iconを対応済みと扱わず、専用schema契約まで保留する。
7. accepted範囲外のschema、version、migration、preflight、Family / Variantを実装しない。
8. unit test、E2E、lint、format、build、GitHub Actionsが成功する。
9. Opus reviewと人間確認前にready化、merge、auto-mergeを行わない。

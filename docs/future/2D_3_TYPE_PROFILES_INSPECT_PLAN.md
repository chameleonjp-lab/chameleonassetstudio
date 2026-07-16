# 2D-3-TYPE-PROFILES + 2D-3-INSPECT 契約監査・実装計画

作成日: 2026-07-16
状態: `contract audit / human decision pending`
正式work package: `2D-3-TYPE-PROFILES + 2D-3-INSPECT`
基準main: `5b0d16478d0b0140e6e56db63b5b89c52fd0f608`（PR #94 merge）
直前slice: `2D-2-PROJECT + 2D-2-CREATE` accepted C-slice completed

## 1. 目的

Asset種別ごとに、ゲーム素材として不足している情報、問題になる理由、ユーザーが取れる修正方法を同じ規則で示す。残る`2D-2-CREATE`の型別template、後続のgame data、preview、export検査が別々の「完成条件」を持たないよう、先にprofileと検査境界を固定する。

Family / Variantはaccepted Cの境界どおり別契約へ保留する。本work packageからFamily / Variant、linked更新、schema migrationへ進まない。

## 2. 現行実装の監査結果

| 対象 | 現状 | 不足 / 境界 |
|---|---|---|
| Asset type | `character`、`item`、`background`、`tile`、`gimmick`、`effect`の6種をTypeScript、JSON Schema、Project要約、`.casproj`が共有する。 | 完成仕様にあるUI / iconは正式な`assetType`ではない。追加はschema、version、migration、可搬形式の判断を伴う。 |
| 新規作成template | `character`だけstarter body colliderを持ち、他5種は透明な空キャンバスで開始する。 | 型別templateの完成条件はprofile判断後に固定する必要がある。 |
| 型別編集UI | tile、gimmick、effect、background、itemには部分的な設定UIがある。characterは共通のorigin / anchor / collider / animation編集を使う。 | 各設定が必須か推奨かを統一判定する入口がない。 |
| 構造検証 | `validateAsset`などのAJV検証が保存・`.casproj`境界で動く。 | JSON形状の妥当性であり、ゲーム素材としての不足を説明しない。 |
| 意味検証 | 参照整合性の予防guardやBlob完全性検査が分散している。 | ADR-0014で予定された統一検出pathはない。自動修復は禁止されている。 |
| 出力検証 | export時にschemaと一部Blobを検査する。 | preset別preflightは`2D-4-PREFLIGHT`であり、本work packageで先取りしない。 |
| 検査UI | 専用の検査結果一覧はない。 | issue、理由、修正方法、対象位置を一貫して表示する必要がある。 |

## 3. 変更しない安全境界

人間判断がacceptedとなるまで、次を変更しない。

- schema、data version、DB version、IndexedDB store / index layout、migration
- `.casproj`内部構成、export ZIP内部構成、dependencies
- `AssetType`列挙、Project要約のasset type、UI / iconの保存表現
- 保存可否、autosave、History、snapshot、trash、復元、容量管理の確定済み挙動
- Family / Variant、linked variant、batch、2D-2-RASTER、2D-3の他work package
- 3D / WebGPU

検査は正本を書き換えず、自動修復・自動削除・無断template適用を行わない。修正操作を将来追加する場合も、既存の保存成功後確定、History、autosave guardを通す。

## 4. 判断1: UI / iconの表現

| 選択肢 | 方針 | 利点 / 制約 |
|---|---|---|
| `A`（推奨） | 最初のsliceは現行6種だけを実装し、UI / iconは専用schema契約まで未対応として明示する。 | schema / version / migrationを変えず、現行0.1.0でprofileと検査UIを先に安全に完成できる。UI / iconは未完了のまま残る。 |
| `B` | `ui`と`icon`を正式なAssetTypeとして同時追加する。 | 完成仕様へ直接近づくが、TypeScript、Project / Asset schema、migration、`.casproj`、export、全fixtureの互換性設計が先に必要。 |
| `C` | UI / iconを既存`item`または`effect`のpreset / tagとして扱う。 | 形式変更は避けやすいが、保存上の種別と画面表示がずれ、後の正式型追加で意味変換が必要になるため推奨しない。 |

`A`を選んでもUI / iconの完成を主張しない。`B`は本計画をschema設計PRへ切り替え、実装前にversion / migration GateとOpus互換性reviewを行う。`C`はUI上で正式AssetTypeに見せてはならない。

## 5. 判断2: profileの厳格度

| 選択肢 | 方針 | 例 |
|---|---|---|
| `A` | 最小profile。型固有フィールドの欠落・矛盾だけを検査する。 | tile設定欠落、effect設定欠落、tileSizeがcanvasを割り切らない。 |
| `B`（推奨） | balanced profile。型固有フィールドを必須候補、ゲーム用情報を推奨warningとして分離する。 | itemのpickup collider、characterのbody collider / animation、background設定を「推奨」として理由・修正方法付きで示す。 |
| `C` | strict game-ready profile。型別の推奨情報も揃うまでerror扱いにする。 | characterにbody colliderやanimationがなければ未完成error。用途によって不要な素材にも偽陽性が出やすい。 |

`B`でも推奨warningを自動修正せず、用途依存の項目を保存必須にはしない。target / preset固有の厳格化は後続`2D-4-PREFLIGHT`へ送る。

## 6. 判断3: 検査結果の強制境界

| 選択肢 | 方針 | 保存 / exportへの影響 |
|---|---|---|
| `X`（推奨） | 最初のsliceはread-only inspectorとし、issueを表示するだけにする。 | 保存・autosave・`.casproj`・exportを新たに止めない。構造検証など既存blockerは維持する。 |
| `Y` | inspectorの`error`だけexportを止める。 | 保存は続けられるが、preset共通の停止条件を先に決める必要があり、`2D-4-PREFLIGHT`と重なる。 |
| `Z` | semantic errorがあるAssetの保存も止める。 | ADR-0014の修復要求を強く適用できるが、既存0.1.0の保存挙動を変え、空キャンバスや旧データを保存不能にする危険が高い。 |

`X`ではissueのseverityを表示上の`info` / `warning` / `error`として扱うが、このseverity自体は保存・exportの強制判定APIにしない。強制判定はpreflight契約後に別入口として追加する。

## 7. profile候補（判断前・未accepted）

| 型 | 必須候補 | 推奨warning候補 |
|---|---|---|
| character | 参照整合性、正のcanvas size | body collider、animation、用途anchor |
| item | 参照整合性、正のcanvas size | pickup collider、item tag / game attribute |
| background | 参照整合性、正のcanvas size | background設定済みlayer、loop / parallax確認 |
| tile | tile設定、正のtileSize、canvas内整合 | collisionType確認、canvasがtileSizeで割り切れること |
| gimmick | gimmick設定 | movement preset、sensor / body collider、用途tag |
| effect | effect設定、正のduration | animation長との整合、発生位置anchor、blend / loop確認 |

共通の参照整合性は型profileとは別の意味検査として共有する。型別issueは、少なくとも安定したcode、severity、短いmessage、理由、修正方法、対象pathを持つ一時的な計算結果とし、Asset JSON、Project、`.casproj`へ保存しない。

## 8. accepted後の最初の実装slice

判断がacceptedとなった後、最初のproduct code Draft PRは次を扱う。

1. side effectのない純粋なAsset inspectorと安定issue codeを追加する。
2. accepted profileだけを実装し、構造検証、意味検証、出力preflightを混同しない。
3. Editorへ理由・修正方法付きの検査結果一覧を追加する。
4. issue選択で対象パネルへ案内できる範囲を明示し、自動修復は行わない。
5. 6種のunit fixture、保存・reload非変更回帰、E2E、ユーザーガイド、実装報告を追加する。
6. 同じbranch・同じDraft PRでCIを成功させ、Opus reviewと人間確認を待つ。

## 9. 完了条件

1. 人間判断が`UI / icon表現 + profile厳格度 + 強制境界`の組で記録される。
2. 各issueが不足情報、理由、修正方法、対象を表示する。
3. inspector実行がAsset、Project、Blob、History、保存状態を変更しない。
4. accepted範囲外のschema、version、migration、preflight、Family / Variantを実装しない。
5. unit test、E2E、lint、format、build、GitHub Actionsが成功する。
6. Opus reviewと人間確認前にready化、merge、auto-mergeを行わない。

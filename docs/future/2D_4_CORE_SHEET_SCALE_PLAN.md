# Chameleon Asset Studio Group 15 契約監査

最終更新日: 2026-08-12  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
文書種別: docs-only 契約監査・人間判断 handoff
状態: `accepted: G15-C1 A + G15-C2 A + G15-C3 A / implemented: 2D-4-CORE + 2D-4-SHEET / CI-passed / independently-verified / merged / next: 2D-4-SCALE`
上位文書: `docs/IMPLEMENTATION_PLAN.md`, `docs/future/2D_COMPLETION_ROADMAP.md`
関連文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`, `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`, `docs/EXPORT_FORMATS.md`, `docs/future/EXPORT_QUALITY_DESIGN.md`

> この文書はGroup 15の契約、採用記録、実装handoff、実装closeoutを管理する正本である。2026-08-11に人間が `G15-C1 A + G15-C2 A + G15-C3 A` を明示採用し、G15-H1〜H3の実装handoffも固定した。`2D-4-CORE`と`2D-4-SHEET`は実装・CI・独立確認・mainへのmergeを完了し、次の許可作業は採用済みG15-H3 Aに基づく `2D-4-SCALE` である。schema、version、保存、既存書き出し、Atlas拒否解除は変更しない。

## 0. 今回の目的

Group 15 `2D-4-CORE + 2D-4-SHEET + 2D-4-SCALE`について、共通export core、決定的な再出力、sheet / atlas、trim、padding、extrude、scale、既存出力との境界を、人間が採用できる粒度まで分解する。

今回の記録は、CORE完了後のhandoffに従うSHEET実装PR #236とpost-merge closeoutを反映するものである。既存legacy出力を保ったまま新distributionのfixed-grid / packed / trim / padding / multi-pageを実装し、SCALEとdistribution UIは後続PRへ分ける。

## 1. GitHub確認済みの現在地

| 項目 | 確認結果 |
|---|---|
| 基準main | `4d55e898d78729c92fd4c9c55188edaa64eba8e5`（PR #236 merge） |
| PR #232 | Group 15の実装handoff文書を修正し、2D-4-CORE実装開始条件をmainへ同期。merge済み（merge commit `08e09cea7c48923da40e8302411905da6070ffd0`） |
| Group 14 | completed、進捗16/27。CI Run #689と固定headの3方向read-only reviewを完了 |
| SHEET closeout後のopen PR | 0件。PR #236 merge後に確認した。 |
| PR #233 | `2D-4-CORE`を実装し、CI Run #707成功後にmainへmerge済み。merge commitは`4ae44f647d66c184c55febfbe8577e682be2877f` |
| Group 15契約 | `accepted: G15-C1 A + G15-C2 A + G15-C3 A`。G15-H1〜H3 Aを維持し、COREとSHEETはCI-passed / independently-verified / merged。次はSCALE。 |
| 製品実装 | `implemented: 2D-4-CORE + 2D-4-SHEET / CI-passed / independently-verified / merged`。次の単一writer作業は`2D-4-SCALE`で、既存Atlas `0.1.0`・legacy ZIP・保存形式を維持する。 |

## 2. GitHub正本で確認した既存事実

### 2.1 現行の書き出し境界

- `src/core/export/atlas.ts`は、frameを行優先の固定gridへ配置し、`chameleon-atlas` `0.1.0`の`atlas.json`を組み立てる。
- 現行の`exportAsset.ts`は、PNG / WebP / `asset.json` / Sprite Sheet / ZIPを書き出す。ZIPのファイルパスとhelper・exampleの構成は既存仕様で固定されている。
- 現行の`ExportPreset`には`scale`項目があるが、export関数層へ配線済みとは扱わない。設定ファイルのschema・versionをGroup 15で推測変更しない。
- `asset.json`と`.casproj`は編集用のcanonical dataであり、出力scaleを混ぜない境界が既存文書にある。
- 現行Atlas / helper / exampleは、可変Frame時間・Animation event・Frame別collider上書きを表現できない。Group 12・13で固定された理由付き拒否を、Group 15の実装中も解除しない。

### 2.2 旧Phase 20設計との関係

`docs/future/EXPORT_QUALITY_DESIGN.md`には、paddingとscaleを省略可能な関数オプションとして扱い、既定値で現行出力を維持する案がある。これはGroup 15の候補案であり、最新ロードマップが求める次の判断を完了したことにはならない。

- common manifestをどの配布物に置くか。
- Generic Web / Canvas 2D / PixiJS / Phaserの優先順位と、直接生成しない範囲。
- 決定性をbyte同一で定義するか、意味・entry順・canonical JSON・hashの一致で定義するか。
- pack順、同率時のtie-break、rotation、page上限、multi-pageの扱い。
- trim座標、完全透明Frame、padding、extrudeの意味。
- 1x / 2x / 3xの単一出力・同時出力、命名、丸め。
- manifest / atlas version、既存ZIP互換、export-presets schema / migration。

## 3. 今回の対象と対象外

### 3.1 対象

- Group 15で採用する共通export core・sheet・scaleの意味。
- 既存Atlas `0.1.0`、既存ZIP、`asset.json`、`.casproj`との互換境界。
- 後続実装で検証可能なfixture、unit、E2E、CI、iPhone確認の受入条件。
- Group 16以降へ送るpackage、preflight、target-specific検証との境界。

### 3.2 対象外

- 製品コード、UI、TypeScript型、JSON Schema、Asset / Project / Atlas version。
- migration、IndexedDB、History、autosave、Blob、`.casproj`の構造。
- 既存export ZIPの実装変更、Atlas拒否の解除、helper APIの変更。
- Unity、Godot、RPG Maker MZの直接生成、外部parser、dependency追加。
- 3D、WebGPU、SaaS、外部アカウント。

### 3.8 Group 15 2D-4-SHEET（実装・CI・独立確認・merge完了）

`2D-4-SHEET`では、SHEET用の純関数レイアウトと新distribution ZIPのページ画像生成を実装した。fixed-grid / packed / trim / padding / multi-page、rotationなし、extrude=0、2048×2048・最大4ページ、複数page helper、legacy ZIP不変を受入条件とした。distribution UI、scale、物理iPhone Safariは後続Gateへ残す。

- `fixed-grid`と明示profileの`packed`を追加し、packedは高さ降順、幅降順、canonical frame順でshelf配置する。
- 不透明画素のtrim、完全透明Frameの保持、source size / content rect / content offset、セル間padding、rotationなし、extrude=0、2048×2048・最大4ページを固定する。
- `exportZip`、Atlas `0.1.0`、`asset.json`、`.casproj`、schema、version、migration、保存処理は変更しない。
- distribution helperは複数pageとmanifest frame参照を扱い、legacy helper APIは維持する。

必須証拠は、fixed-grid / packedの純unit、5 frame fixture、透明Frame、page上限、manifest semantic、packed distribution ZIP、legacy ZIPの不変、sheet artifactであり、PR #236とCI Run #716で確認した。

## 4. 採用記録（Gate B）

採用日: `2026-08-11`  
人間の明示判断: `G15-C1 A + G15-C2 A + G15-C3 A`  
採用結果: 3つのA案を採用。B案とC案は採用しない。  
採用範囲: canonical sourceとdistribution出力を分離し、既存Atlas / ZIPをlegacy/defaultとして保ち、fixed gridを既定にし、packedを明示profileへ分け、trimと1x / 2x / 3xを後続実装で扱う。  
実装状態: `implemented: 2D-4-CORE / CI-passed / independently-verified / implementation-handoff-complete`

以下の各表は、採用したA案の内容と、比較対象として保持する不採用案を記録する。

### G15-C1: 共通出力境界・互換性

| 案 | 内容 | 影響 |
|---|---|---|
| A（採用） | `asset.json` / `.casproj`をcanonical sourceとして保持し、共通manifestはdistribution側の派生物だけに置く。既存ZIPとAtlas `0.1.0`はlegacy/defaultとして維持し、Generic Web / Canvas 2D / PixiJS / PhaserをGroup 15〜17のP0対象にする。特定engineのproject全体は直接生成しない。 | 既存再編集と旧配布物を守りやすい。新manifestのpath・versionは実装handoffで固定する。 |
| B | 現行`atlas.json`へpadding、scale、trim、page情報を追加し、Atlas versionを上げずに読ませる。 | 既存readerが未知fieldをどう扱うか不明で、互換性リスクが高い。不採用候補。 |
| C | 新しいversioned package / manifestを導入し、旧ZIPとは別profileとしてdual outputする。旧出力と新出力の関係、version、migration・命名を別途固定する。 | 安全な分離はできるが、実装量と検証対象が増える。 |

### G15-C2: sheet・trim・padding・extrude

| 案 | 内容 | 影響 |
|---|---|---|
| A（採用） | 既定は現行fixed grid・行優先・rotationなし。新しいpackedは明示profileに分け、同率tie-breakを固定する。trimは元のsource sizeとcontent offsetをmanifestへ保持し、完全透明Frameも消さない。paddingはセル間spacing・外周なしを基本とし、extrudeは初回は未採用または明示0にする。multi-pageはpage境界と上限を実装handoffで固定する。 | 既存出力を保ちながら、trimの意味を失わない。packed、multi-page、extrudeを一度に曖昧に実装しない。 |
| B | fixed gridのみを正式対応とし、packed・multi-page・extrudeは2D Pro Gate後へ送る。 | 実装と互換性確認は小さくなるが、Group 15の完成範囲が狭くなる。 |
| C | packed、rotation、multi-page、trim、padding、extrudeを同時に採用する。 | 出力面積は効率化できるが、座標、helper、page選択、回転復元、検証が大きく増える。 |

### G15-C3: scale・決定性・複数出力

| 案 | 内容 | 影響 |
|---|---|---|
| A（採用） | 1x / 2x / 3xの整数倍率を個別出力する。`asset.json` / `.casproj`は常に等倍の正本とする。座標・origin・anchor・collider・source sizeの丸め規則を1つに固定し、canonical JSON・entry順・manifest hashを検査する。ブラウザや画像codecをまたぐPNG byte完全一致は保証せず、意味同一とentry単位hashを正本にする。 | 受入条件を現実的にでき、異なる実行環境のPNG encoder差を誤って不具合扱いしない。 |
| B | 任意の正数scaleと複数倍率の同時出力を採用し、`@2x`等の命名規則を固定する。 | 表現力は高いが、丸め、容量、ZIP構成、UI、検証が増える。 |
| C | 同じ入力から生成したZIPのbyte完全一致を全ブラウザで保証する。 | Canvas / PNG encoder差を含むため、現行実装だけでは実現可能性が未確認。別の画像生成方式や依存追加が必要になる可能性がある。 |

### 実装handoff（G15-H1〜H3 A）

handoff日: `2026-08-11`  
基準main SHA: `0adb67a4192d6684e5e4679c87b2a758cff40654`（PR #231 merge）  
handoff状態: `complete / implemented: 2D-4-CORE + 2D-4-SHEET / CI-passed / independently-verified / merged / next: 2D-4-SCALE`

G15-H1〜H3のA案を、次の固定値で実装担当へ渡す。これは新しい仕様候補ではなく、採用済みG15-C1〜C3を実装可能な粒度へ落としたhandoffである。

| Handoff | 固定内容 |
|---|---|
| **G15-H1 A: common manifest** | 新しいdistribution profileのパッケージ直下に `manifest.json` を置く。形式名は `chameleon-distribution`、versionは `0.1.0`。manifestはcanonical sourceではなく派生物で、`asset.json` / `.casproj`を置き換えない。既存のlegacy/default ZIPには追加せず、既存Atlas `0.1.0`のpath・field・helper APIも変更しない。manifestはscale、profile、page、frame rect、source size、content offset、animation、origin、anchor、collider、参照ファイルを意味上保持し、canonical JSONとentry順をhash検査の対象にする。 |
| **G15-H2 A: packed / page** | 既定は現行fixed grid・行優先・rotationなし。packedは明示profileだけで使い、height降順 → width降順 → canonical sourceのframe順の順に並べる安定shelf配置（左から右、上から下、page順）とする。pageは出力pixelで `2048×2048`、最大`4`ページ、pathは `atlas/pages/page-000.png` から3桁連番とする。rotationは常に無効。paddingはセル間のみ・外周なしの非負整数、extrudeは初回`0`。1 frameがpageに収まらない、または5ページ目が必要な場合は、canvas / Blob / ZIP生成 / downloadより前に理由付きで拒否する。 |
| **G15-H3 A: scale / naming / rounding** | scaleは整数の`1`、`2`、`3`から1つだけ選んで出力し、同時複数出力は行わない。新distribution ZIPの名前は既存の安全なasset名を使った `{assetName}-distribution-{scale}x.zip` とし、ZIP内のlegacy-like path（`textures/main.png`、`atlas/...`）はscaleごとに変えず、manifestのscaleで識別する。画像寸法とframe rect、source size、content offset、origin、anchor、colliderなどの出力pixel値はscale後に最近傍整数へ丸め、同率は絶対値が大きい側へ丸める。長さ・寸法・半径は0未満にしない。scaleは `asset.json` / `.casproj`へ混ぜず、拡大描画はnearest-neighborを既定とする。 |

固定境界:

- 既存 `exportZip(asset)` の既定出力、既存ZIP entry、Atlas `0.1.0`、現行の理由付き拒否は変更しない。
- `src/core/model/exportPreset.ts`、JSON Schema、version、migration、IndexedDB、History、autosave、Blob保存は今回の実装PRでも対象外とする。scaleはまずexport関数層へ渡す。
- H1のmanifestは新distributionの派生物であり、`asset.json` / `.casproj`へmanifest fieldを追加しない。
- packedのlossやpage上限に該当した場合は、理由を表示し、Blob読込・canvas合成・ZIP生成・downloadを開始しない。

実装PRの変更予定ファイル（このhandoffの基準。追加・削除が必要になった場合は実装を止め、handoffを更新する）:

- `src/core/export/atlas.ts`
- `src/core/export/exportAsset.ts`
- `src/core/export/helpers.ts`
- `src/core/export/atlas.test.ts`
- `src/core/export/exportAsset.test.ts`
- `src/core/export/helpers.test.ts`
- `src/core/export/contract.fixtures.test.ts`
- `e2e/export.spec.ts`
- `.github/workflows/ci.yml`
- `docs/EXPORT_FORMATS.md`
- `docs/future/2D_4_CORE_SHEET_SCALE_PLAN.md`

実装順は、`2D-4-CORE` → `2D-4-SHEET` → `2D-4-SCALE`。各PRは単一writer、code + tests + docsを同じDraft PRへ入れ、CI成功後に独立検証する。

## 5. 実装PRの受入条件

G15-C1〜C3のA案を採用したため、次のIDを実装PRの必須受入条件として固定する。既存Atlas / ZIPの互換性と、現行形式で表現できない入力の理由付き拒否は省略しない。

| ID | 確認内容 | 必須証拠 |
|---|---|---|
| G15-CORE-LEGACY | 既定設定で既存Atlas / ZIPの意味とpathを維持する | 旧fixtureとのmanifest・entry一覧比較、差分理由0 |
| G15-CORE-NOLOSS | 可変時間、event、Frame別collider上書き、polygonなど現行形式で表現できない入力を、Blob読込・canvas・ZIP生成より前に理由付き拒否する | unit + export API test + UI alert / download 0 |
| G15-CORE-REPEAT | 同一入力・同一条件の再出力が、採用した決定性定義を満たす | canonical JSON、entry順、hash、必要なら同一環境byte比較 |
| G15-SHEET-GRID | 1 / 2 / 5 / 16 frameの行優先配置と1 frameの不変性 | pure unit fixture |
| G15-SHEET-PACK | packedを採用する場合の同率tie-break、rotation、page分割、page上限 | pure unit fixture + manifest schema/semantic test |
| G15-SHEET-TRIM | content rect、source size、offset、完全透明Frameの扱い | fixture PNG + manifest比較 |
| G15-SHEET-BLEED | padding、extrude、外周、Frame rectとhelperの整合 | pixel fixture + helper test |
| G15-SCALE-123 | 1x / 2x / 3xの画像寸法・Atlas座標・ゲーム情報の整合 | unit + export bytes / metadata comparison |
| G15-COMPAT | 既存`atlas.json` `0.1.0`と既存ZIPを新形式が黙って壊さない | old fixture import / export compatibility evidence |
| G15-MOBILE | 375×667で、出力開始、エラー、download完了、長いwarningが操作可能 | Chromium E2E、必要な範囲のiPhone Safari確認 |

CI証拠の最低条件:

- Group 15の対象head SHAとworkflow runを明示的に紐付ける。
- failed / flaky / skipped / retry を0件とし、既存のテストをskip・only・期待値弱体化・timeout緩和で隠さない。
- fixture hash、manifest hash、before / after / reload、download件数をartifactへ残す。artifact欠落はwarningではなく失敗として扱う。
- 物理iPhone Safariの確認はリリース全体の端末Gateとして記録し、Group 15のChromium 375×667必須確認とは分ける。

## 6. 実装開始Gate

採用判断とhandoff、`2D-4-CORE`の実装・CI・独立確認を完了した。SHEET / SCALEは、COREの記録をmainへ同期した後、個別PRとして進める。

1. 完了: G15-C1〜C3の人間判断が明示され、decision IDとして本正本へ記録されている。
2. 完了: `asset.json`、`.casproj`、export ZIP、Atlas version、export-presets schema / migrationへの影響を、採用案の境界内で対象外として固定した。
3. 完了: 既存Atlas / ZIPを維持し、現行の理由付き拒否を製品実装前に解除しない。
4. 完了: 実装対象ファイル、対象外ファイル、unit / E2E / fixture、決定性の測定方法、CI証拠をG15-H1〜H3 handoffへ固定した。
5. 完了: `2D-4-CORE`のDraft PRへcode・tests・docsを集約し、CI Run #707成功後に独立read-only検証を完了した。

## 7. 次の実装handoffと分割

契約採用後の分割は、実際の決定内容に合わせて確定する。現時点の候補は次のとおり。

1. `2D-4-CORE`: 共通出力モデル、決定性、legacyとの分離、preflight境界。
2. `2D-4-SHEET`: fixed grid、packed、trim、padding、extrude、multi-pageのうち採用した範囲。
3. `2D-4-SCALE`: 1x / 2x / 3x、丸め、命名、single / multi outputのうち採用した範囲。
4. 各実装はcode、unit、必要なE2E、docsを同じDraft PRへまとめ、CI成功後に独立reviewを行う。

## 8. Group 15で変更しないもの

- JSON Schema、version、migration、保存形式、ExportPreset、既存UIのdistribution配線。
- `asset.json`、`.casproj`、IndexedDB、History、autosave、Blob、既存export ZIP、Atlas `0.1.0`。
- 現行の可変時間・event・Frame別collider上書きのAtlas / ZIP拒否。
- dependencies、GitHub Actions、3D、WebGPU。

## 9. 次の許可された作業

- `2D-4-SCALE`のDraft PRでCIとartifactを確認し、採用済みG15-H3 Aの実装証拠を確定する。
- SCALEの固定headを独立read-only検証し、`BLOCKER 0 / MUST 0`を記録する。
- SCALE完了後にdistribution UI、375×667 product-path E2E、engine読込検証を進める。
- `src/core/model/exportPreset.ts`、schema、version、migration、保存形式、既存Atlas / ZIP、現行拒否境界は、別のaccepted判断なしに変更しない。

## 10. 次回への引き継ぎ

- 契約状態は `accepted: G15-C1 A + G15-C2 A + G15-C3 A` とする。
- 実装状態は `implemented: 2D-4-CORE + 2D-4-SHEET / CI-passed / independently-verified / merged`、次の実装は`2D-4-SCALE`である。
- G15-H1〜H3 Aの固定値、実装対象ファイル、対象外境界、受入ID、CI証拠に加え、CORE sliceの実装範囲を本書へ記録した。
- iPhone SafariはGroup 15だけの追加停止Gateにせず、375×667のChromium E2EをGroup 15必須、物理iPhone Safariをリリース全体の端末Gateとして扱う。

## 11. 2D-4-CORE 実装記録

実装基準はmain `08e09cea7c48923da40e8302411905da6070ffd0`（PR #232 merge）とし、専用branchで単一writerが実装した。PR #233のmerge後の最新mainは`e43fca92be77a01d95120e5e979cfa0bee714fdf`である。

- `src/core/export/atlas.ts`にdistribution manifestの型、canonical JSON、fixed-gridの共通manifest組み立てを追加した。
- `src/core/export/exportAsset.ts`に`exportDistributionZip`を追加した。legacy `exportZip`は変更せず、distribution側だけに`manifest.json`とSHA-256 integrityを付与する。
- `src/core/export/helpers.ts`の既存legacy helper APIを維持したまま、distribution manifestを読む導線を生成helperへ追加した。
- export unitはlegacy manifest不在、manifest形式、canonical bytes、entry順、hash、preflightのBlob読込前拒否を確認する。CI成功時は`test-results/group15-core-evidence.json`をartifactとして保存し、欠落を失敗扱いにする。
- legacy ZIPのE2Eは既存entry pathを完全一致で確認し、WebP対応時の`textures/main.webp`だけを任意entryとして許可し、`manifest.json`混入を拒否する。Playwright retryは0とする。
- CI Run #707（workflow ID `31478935075`）は`classify-changes`、`build-and-test`、`e2e`の全jobがsuccess。CORE証拠artifactはID `9096417804`、digest `sha256:d6868ce878edbc03ad5c9a5986c08c1812691a6c0738df79275ada3529a5b1c7`、Playwright artifactはID `9096547560`、digest `sha256:dd88d6496a683190d4264d17a0649f4b7dd7f1bc383c7ef83b406e5b56248077`である。
- 固定head `d6f28dab5bcbeb38a44ce50caddfe32732c69acc`を親担当がread-onlyで独立確認した。GitHub上のreview登録は0件だが、legacy出力・拒否境界・manifest分離・CI artifact・テスト範囲を確認し、判定は`BLOCKER 0 / MUST 0`とする。ローカル再現でもCORE対象unit 38/38、lint、format:check、buildが成功した。

SHEET sliceの検証は完了した。PR #236の最終head `d3a178b5614a00f72f1bd0e706b95e28d4c5189b`、merge `4d55e898d78729c92fd4c9c55188edaa64eba8e5`、CI Run #716（Actions ID `31510296044`）は全job成功。SHEET artifact ID `9108792430`（digest `sha256:4115f8382b18f4d02f1fb8320ab50f5d271040ce1d1439f514b66615fac51513`）、CORE artifact ID `9108792006`（digest `sha256:ddc802084338a77e3377df350bfcd1e7e3c7fae6d10d07a3526efbff7b05e078`）、Playwright artifact ID `9108931876`（digest `sha256:1e81e587f82d0c26d519de558bd0114c263c046b250163e734d977f3432342fe`）を記録した。固定headの3方向read-only確認は`BLOCKER 0 / MUST 0`で、次の許可作業は`2D-4-SCALE`である。packed、trim、padding / extrude、multi-pageはSHEETで完了し、scale 1x / 2x / 3x、distribution UI、375×667のdistribution product-path証拠、engine読込、物理iPhone Safariは後続範囲である。


## 12. 2D-4-SHEET post-merge closeout

- 対象PR: #236（`feat: add Group 15 distribution sheet layouts`）
- 最終head: `d3a178b5614a00f72f1bd0e706b95e28d4c5189b`
- merge commit / 現在のmain: `4d55e898d78729c92fd4c9c55188edaa64eba8e5`
- CI: Run #716（Actions ID `31510296044`）、`classify-changes` / `build-and-test` / `e2e` 全成功
- artifact: SHEET `9108792430`（`sha256:4115f8382b18f4d02f1fb8320ab50f5d271040ce1d1439f514b66615fac51513`）、CORE `9108792006`（`sha256:ddc802084338a77e3377df350bfcd1e7e3c7fae6d10d07a3526efbff7b05e078`）、Playwright `9108931876`（`sha256:1e81e587f82d0c26d519de558bd0114c263c046b250163e734d977f3432342fe`）
- 独立確認: 固定headに対する3方向read-only監査は`BLOCKER 0 / MUST 0`。GitHubレビュー登録は0件で、Opusレビュー済みとは扱わない。
- 互換性: legacy `exportZip`、Atlas `0.1.0`、schema、version、migration、保存形式は維持。
- 後続: `2D-4-SCALE`を次の単一writer作業とし、distribution UI、375×667 product-path E2E、engine読込、物理iPhone Safariは後続Gateへ残す。

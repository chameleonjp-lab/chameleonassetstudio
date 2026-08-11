# Chameleon Asset Studio Group 15 契約監査

最終更新日: 2026-08-11  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
文書種別: docs-only 契約監査・人間判断 handoff
状態: `accepted: G15-C1 A + G15-C2 A + G15-C3 A / product-not-started / implementation-handoff-pending`
上位文書: `docs/IMPLEMENTATION_PLAN.md`, `docs/future/2D_COMPLETION_ROADMAP.md`
関連文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`, `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`, `docs/EXPORT_FORMATS.md`, `docs/future/EXPORT_QUALITY_DESIGN.md`

> この文書はGroup 15の契約候補、採用記録、実装handoffを管理する正本である。2026-08-11に人間が `G15-C1 A + G15-C2 A + G15-C3 A` を明示採用した。契約はacceptedだが、製品実装はまだ開始していない。具体的な実装固定値と受入証拠をhandoffへ固定するまで、product code、schema、version、保存、書き出し、Atlas拒否解除は変更しない。

## 0. 今回の目的

Group 15 `2D-4-CORE + 2D-4-SHEET + 2D-4-SCALE`について、共通export core、決定的な再出力、sheet / atlas、trim、padding、extrude、scale、既存出力との境界を、人間が採用できる粒度まで分解する。

今回のdocs-only変更は、Gate Bの採用記録と、製品実装前に固定すべきhandoff条件を正本へ同期する作業である。製品実装PRではない。

## 1. GitHub確認済みの現在地

| 項目 | 確認結果 |
|---|---|
| 基準main | `cc428f154ab193353a09c920afdd8fb03fda5286`（PR #230 merge） |
| PR #230 | Group 15の契約状態をdocs-onlyでmainへ同期。merge済み（merge commit `cc428f154ab193353a09c920afdd8fb03fda5286`） |
| Group 14 | completed、進捗16/27。CI Run #689と固定headの3方向read-only reviewを完了 |
| open PR | 0件。今回の採用記録・実装用の重複PRなし |
| Group 15契約 | `accepted: G15-C1 A + G15-C2 A + G15-C3 A`。製品実装は未開始で、具体値のhandoff待ち |
| 製品実装 | 未開始。現行Atlas系の事前拒否を維持 |

## 2. GitHub正本で確認した既存事実

### 2.1 現行の書き出し境界

- `src/core/export/atlas.ts`は、frameを行優先の固定gridへ配置し、`chameleon-atlas` `0.1.0`の`atlas.json`を組み立てる。
- 現行の`exportAsset.ts`は、PNG / WebP / `asset.json` / Sprite Sheet / ZIPを書き出す。ZIPのファイルパスとhelper・exampleの構成は既存仕様で固定されている。
- 現行の`ExportPreset`には`scale`項目があるが、export関数層へ配線済みとは扱わない。設定ファイルのschema・versionをGroup 15で推測変更しない。
- `asset.json`と`.casproj`は編集用のcanonical dataであり、出力scaleを混ぜない境界が既存文書にある。
- 現行Atlas / helper / exampleは、可変Frame時間・Animation event・Frame別collider上書きを表現できない。Group 12・13で固定された理由付き拒否を、Group 15の契約採用前に解除しない。

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

## 4. 採用記録（Gate B）

採用日: `2026-08-11`  
人間の明示判断: `G15-C1 A + G15-C2 A + G15-C3 A`  
採用結果: 3つのA案を採用。B案とC案は採用しない。  
採用範囲: canonical sourceとdistribution出力を分離し、既存Atlas / ZIPをlegacy/defaultとして保ち、fixed gridを既定にし、packedを明示profileへ分け、trimと1x / 2x / 3xを後続実装で扱う。  
実装状態: `product-not-started / implementation-handoff-pending`

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

### 採用範囲と実装開始前の未固定値

- `G15-C1 A`: `asset.json` / `.casproj`をcanonical sourceとして維持し、common manifestはdistribution側の派生物に限定する。既存ZIPとAtlas `0.1.0`はlegacy/defaultとして残し、特定engineのproject全体は直接生成しない。
- `G15-C2 A`: fixed grid・行優先・rotationなしを既定にする。packedは明示profileに分け、trimはsource size・content offsetを保持し、完全透明Frameを消さない。paddingはセル間spacing・外周なし、extrudeは初回未採用とする。
- `G15-C3 A`: 1x / 2x / 3xを個別出力し、canonical sourceは常に等倍とする。PNG byte完全一致は保証せず、canonical JSON・entry順・manifest hash・意味同一性を検査する。
- 具体的なmanifest path / version、packedの同率tie-break、page境界と上限、scaleの命名と丸め、distribution ZIPへの露出は、実装handoffで固定する。ここを推測で埋めず、固定前は製品コードを変更しない。
- 実装対象候補は `src/core/export/atlas.ts`、`src/core/export/exportAsset.ts`、`src/core/model/exportPreset.ts`と関連するunit / E2E / fixture / docs。ただし実装PRの基準mainで実在と呼び出し経路を再確認する。`src/core/export/exportPreset.ts`は基準main上の実在pathとして扱わない。
- `G15-MOBILE`は375×667のChromium touch / warning / refusal / download完了をGroup 15で必須とし、物理iPhone Safariはリリース全体の端末Gateに残す。

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

採用判断は完了したが、次のhandoff条件を満たすまでproduct codeへ進まない。

1. 完了: G15-C1〜C3の人間判断が明示され、decision IDとして本正本へ記録される。
2. 未完了: `asset.json`、`.casproj`、export ZIP、Atlas version、export-presets schema / migrationへの影響を、採用案の境界内で確認する。
3. 完了: 既存Atlas / ZIPを維持し、現行の理由付き拒否を製品実装前に解除しない。
4. 未完了: 実装対象ファイル、対象外ファイル、unit / E2E / fixture、決定性の測定方法、CI証拠をhandoffへ固定する。
5. 実装handoff完了後にmainを再確認し、別branch・別Draft PR・単一writerで実装を始める。

## 7. 次の実装handoffと分割

契約採用後の分割は、実際の決定内容に合わせて確定する。現時点の候補は次のとおり。

1. `2D-4-CORE`: 共通出力モデル、決定性、legacyとの分離、preflight境界。
2. `2D-4-SHEET`: fixed grid、packed、trim、padding、extrude、multi-pageのうち採用した範囲。
3. `2D-4-SCALE`: 1x / 2x / 3x、丸め、命名、single / multi outputのうち採用した範囲。
4. 各実装はcode、unit、必要なE2E、docsを同じDraft PRへまとめ、CI成功後に独立reviewを行う。

## 8. 今回のdocs-only採用記録で変更しないもの

- product code、tests、UI、TypeScript型、JSON Schema、version、migration。
- `asset.json`、`.casproj`、IndexedDB、History、autosave、Blob、既存export ZIP、Atlas `0.1.0`。
- 現行の可変時間・event・Frame別collider上書きのAtlas / ZIP拒否。
- dependencies、GitHub Actions、3D、WebGPU。

## 9. 次の許可された作業

- 今回の採用記録PRをmainへ反映する。
- merge後にmainを再確認し、実装handoffで具体的なpath/version、packedのtie-break、page境界と上限、extrude、命名、丸め規則、実装対象ファイルを固定する。
- handoffが固定されるまで、`atlas.ts`、`exportAsset.ts`、`src/core/model/exportPreset.ts`、schema、UI、ZIP生成を変更しない。

## 10. 次回への引き継ぎ

- 契約状態は `accepted: G15-C1 A + G15-C2 A + G15-C3 A` とする。
- 実装状態は `product-not-started`、検証状態は未開始である。
- 現行のExportPreset定義は `src/core/model/exportPreset.ts` として再確認済み。実装担当は着手時にmainの実在ファイルを再確認し、存在しないpathをhandoffへ持ち込まない。
- iPhone SafariはGroup 15だけの追加停止Gateにせず、375×667のChromium E2EをGroup 15必須、物理iPhone Safariをリリース全体の端末Gateとして扱う。

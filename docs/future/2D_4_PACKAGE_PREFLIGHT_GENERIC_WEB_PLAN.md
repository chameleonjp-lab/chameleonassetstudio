# Chameleon Asset Studio Group 16 契約監査

最終更新日: 2026-08-13
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
正式work package: `2D-4-PACKAGE + 2D-4-PREFLIGHT + 2D-4-GENERIC-WEB`
初回契約監査基準main SHA: `d69103113384f24c85d99ae8541769c2dfd8cfd9`  
五視点レビュー統合基準main SHA: `b5401529a552c38147d308d7209ad8483ffd85c4`
文書種別: docs-only 契約監査・人間判断 handoff
状態: `proposed / human-decision-pending / product implementation not started`
docs-only監査状態: `merged`（PR #240 / merge `b5401529a552c38147d308d7209ad8483ffd85c4`）

上位文書: `docs/IMPLEMENTATION_PLAN.md`, `docs/future/2D_COMPLETION_ROADMAP.md`
関連文書: `docs/future/2D_4_CORE_SHEET_SCALE_PLAN.md`, `docs/EXPORT_FORMATS.md`, `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`, `docs/adr/0014-validation-staging.md`, `docs/future/2D_FIVE_PERSPECTIVE_REVIEW_ACTION_PLAN_2026-08-13.md`

> この文書はGroup 16の仕様候補を整理するための監査文書である。ここに書いた推奨案は、ユーザーが採用するまで製品仕様にならない。今回のPRでは、製品コード、テスト、JSON Schema、version、migration、保存形式、既存Atlas `0.1.0`、legacy ZIPを変更しない。

## 1. 今回の目的

Group 15で、共通distribution manifest、fixed-grid / packed sheet、trim、padding、multi-page、scale 1 / 2 / 3までを実装し、mainへmergeした。Group 16では、その出力を人が持ち込める一つのgeneric packageとして説明し、書き出し前に問題を一覧化し、Generic Web / Canvas 2Dで読み込めることを確認する。

ただし、Group 16はロードマップ上の次工程であり、具体的なpackage構成、preflightの停止基準、Generic Webの合格証拠はまだacceptedではない。先に3つの判断を固定する。

## 2. GitHubと現行実装で確認した事実

| 項目 | 確認した事実 | 今回の意味 |
|---|---|---|
| 基準main | `d691031`。PR #239のmerge後でopen PRは0件。 | この文書はこのSHAから分岐する。 |
| Group 15 | `2D-4-CORE + 2D-4-SHEET + 2D-4-SCALE`は`implemented / CI-passed / independently-verified / merged`。 | Group 15の互換性境界を維持する。 |
| 現行distribution | `exportDistributionZip`はlegacy ZIPを基礎に`manifest.json`とdistribution pageを追加し、既存のREADME、examples、helpers、engine guideを同梱する。 | Group 16では、generic packageとして必要な参照・説明・証拠を明示する必要がある。 |
| 現行manifest | `chameleon-distribution` `0.1.0`。profile、scale、pages、frames、metadata、entry path、manifest hashを持つ。 | 既存manifestを変更するか、外側のpackage manifestを追加するかを選ぶ必要がある。 |
| 現行preflight | schema検証、可変時間・event、Frame別collider上書き、page上限などの個別拒否はある。統一した問題一覧、重複名、target別警告、秘密情報検出の具体実装はない。 | `2D-4-PREFLIGHT`の契約を先に決める必要がある。 |
| 現行UI | `ExportPanel`にdistribution packageの製品UIはまだ配線されていない。 | 今回はUIを実装せず、関数層とfixtureの契約に限定する。 |
| Generic Web | Canvas 2D sampleとhelperは存在するが、Generic Web profileとして対象ブラウザ・確認項目・証拠を固定した`verified`記録はない。 | `generic`、`candidate`、`verified`を混同しない。 |

## 3. 今回の対象と対象外

### 3.1 対象

- packageの入口、ファイル参照、sidecar、README、import notes、verification recordの候補。
- preflightの問題形式、severity、停止順、既存拒否との接続。
- Generic Web / Canvas 2D fixtureの実行条件、確認項目、artifact。
- 実装後に必要なunit、E2E、CI証拠、375×667 viewport確認。

### 3.2 対象外

- 人間が採用する前のproduct code、UI、実装テスト。
- `asset.json`、`.casproj`、JSON Schema、version、migration、IndexedDB、History、autosave。
- 既存`exportZip`、既存Atlas `0.1.0`、legacy helper API、現行の理由付き拒否。
- PixiJS / Phaserの対象別実行確認。これはGroup 17で扱う。
- Unity、Godot、RPG Maker MZの直接生成や`verified`化。
- 外部dependency追加、外部サービス、3D、WebGPU。

## 4. 判断IDと候補

### G16-C1: packageの入口と互換境界

Group 15の`manifest.json`はdistributionの配置・frame・metadataを示す。Group 16では、sidecar、import notes、verification recordまでをどの入口からたどるかを決める。

| 案 | 内容 | 影響 |
|---|---|---|
| **A（推奨）** | 既存の`manifest.json` `0.1.0`を変更せず、package専用の`package-manifest.json`を外側へ追加する。`package-manifest.json`から`manifest.json`、`asset.json`、`targets/generic-web.json`、`import-notes/generic-web.md`、`verification/record.json`、README、画像、examples、helpersを参照する。sidecarはcanonical Asset dataではなく、Generic Webへの持ち込み情報だけを持つ。 | Group 15のreaderとlegacy出力を守りやすい。新しいpackage入口が一つ増える。 |
| B | 既存`manifest.json`へsidecar、import notes、verification recordの参照を追加し、version `0.1.0`のまま運用する。 | ファイル数は少なくなるが、既存readerが未知fieldを扱う保証が必要になる。 |
| C | distribution manifestを`0.2.0`へ上げ、Group 15の`0.1.0`と別readerで扱う。 | 形式境界は明確だが、version、reader、互換性、移行説明が増える。 |

推奨案Aでは、packageの候補構成を次のようにする。実際の採用後に、ファイル名と内容をhandoffへ固定する。

```text
package-manifest.json
manifest.json
asset.json
atlas/atlas.json
atlas/pages/page-000.png ...
textures/main.png
textures/main.webp（対応環境のみ）
targets/generic-web.json
examples/example-generic-web.html
helpers/chameleon-generic-web.js
import-notes/generic-web.md
verification/record.json
README.md
```

`asset.json`はcanonical sourceの複製であり、sidecarやverification recordを混ぜない。packageの中にある`manifest.json`と`package-manifest.json`は派生情報であり、編集用正本を置き換えない。

### G16-C2: preflightの停止・警告・秘密情報検出

preflightはassetを変更せず、問題を安定した順序で返す読み取り専用の検査とする。既存のloss拒否は置き換えず、共通結果へ接続する。

| 案 | 内容 | 影響 |
|---|---|---|
| **A（推奨）** | `block`と`warning`を分ける。schema不正、参照切れ、重複frame名、unsafeな出力名・path、非有限値、page上限、現行形式で表現できないlossは`block`。任意metadataの欠落、透明Frame、WebP非対応など、代替出力があるものは`warning`または既存の個別処理にする。検査結果は`code`、`severity`、`path`、`message`を持ち、自動修復・マスク・dedupはしない。秘密情報らしい値は対象pathを示して`block`とし、値はログ・packageへ複製しない。 | 壊れたpackageを作らず、利用者が直す場所を把握できる。誤検知時も正本を勝手に変えない。 |
| B | 既存のloss拒否以外はすべてwarningにし、package生成は続ける。 | 操作は止まりにくいが、参照切れや重複名を配布物へ残す危険がある。 |
| C | preflight中に名前の修正、dedup、値の丸め、秘密情報のマスクを自動適用する。 | 見かけ上は成功しやすいが、非破壊編集・正本不変・再現性を壊すため、今回の方針と合わない。 |

推奨案Aでの検査順は、次の順に固定する候補である。

1. 構造とschema。
2. 参照整合性、名前、path、有限値、対象種別。
3. 現行Atlas / ZIPが表現できない情報のloss。
4. distribution page、scale、trim、padding、file sizeの出力制約。
5. package参照、verification record、Generic Web fixtureに必要な入口。

どの段階でも`block`があればBlob読込、画像decode、canvas合成、ZIP生成、downloadを開始しない。問題の並び順は同じ入力から同じ結果になるようにする。

### G16-C3: Generic Web / Canvas 2Dの受入証拠

Generic Webは特定engineの互換を意味しない。対象profile名、ブラウザ、確認項目、fixture、既知の制限を記録して初めて`verified`と呼ぶ。

| 案 | 内容 | 影響 |
|---|---|---|
| **A（推奨）** | 外部dependencyなしの`generic-web-v1` fixtureを作り、HTTP経由でpackage-manifest、manifest、複数page、sidecarを読み込む。Canvas 2Dでframe、trim offset、scale、origin、anchor、rect / circle、animation順を表示し、Chromiumの通常viewportと`375×667`で最終表示を確認する。ブラウザ版、fixture hash、manifest hash、console error、download件数をCI artifactへ残す。 | 再現しやすく、自動確認できる。物理iPhone Safariのrelease Gateとは分けられる。 |
| B | unitとcanonical JSONの比較だけでGeneric Webを確認する。 | 実際のfetch、画像読込、Canvas描画、複数pageの失敗を見逃す。 |
| C | 物理iPhone Safariだけで確認し、Chromium fixtureを作らない。 | 実機の価値はあるが、再現性とCIでの回帰確認が不足する。 |

推奨案Aでは、Generic Webの状態を次のように記録する。

- 自動fixtureが成功しても、対象は`generic-web-v1 / candidate`から開始する。
- package内の`verification/record.json`は、対象profile、source commit、fixture hash、manifest hash、期待結果、CI artifact参照だけを安定して記録する。ブラウザversion、実行日時、console error、download件数など動的な実行情報はCI artifactへ分離し、package本体のhash境界と証拠のhash境界を区別する。該当範囲を`verified`へ進めるには両方を対応付ける。
- PixiJS、Phaser、Unity、Godot、RPG Maker MZの互換をこの証拠から推測しない。

## 5. 採用後の実装handoff候補

人間がG16-C1〜C3を採用した後、次の範囲を一つの実装Draft PRへ固定する。採用前にはこの一覧を実装に使わない。

### 5.1 変更予定ファイル候補

- 新規: `src/core/export/packageManifest.ts` と対応unit。
- 新規: `src/core/export/preflight.ts` と対応unit / fixture。
- 更新候補: `src/core/export/exportAsset.ts`、`src/core/export/atlas.ts`、`src/core/export/helpers.ts`。
- 新規: `e2e/generic-web.spec.ts` とfixture用の最小HTML / resource。
- 更新候補: `.github/workflows/ci.yml`、`docs/EXPORT_FORMATS.md`、`docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`、`docs/TEST_PLAN.md`。

実装時にこの一覧以外のschema、保存、migration、UI、dependencyへ触れる必要が出た場合は、同じPRで推測して広げず、handoffを更新して停止する。

### 5.2 受入ID候補

| ID | 受入内容 |
|---|---|
| G16-PACKAGE-SEPARATION | Group 15のdistribution manifestとlegacy ZIPを壊さず、package入口から全entryを辿れる。 |
| G16-PACKAGE-SIDECAR | sidecarはtarget情報だけを持ち、canonical Asset dataを上書き・複製拡張しない。 |
| G16-PACKAGE-NOTES | READMEとGeneric Web import notesが座標系、profile、制限、起動方法を説明する。 |
| G16-PACKAGE-RECORD | verification recordとCI evidenceの役割を分け、再現に必要なhashとcheck IDを残す。 |
| G16-PREFLIGHT-ORDER | 同じ入力で同じ順の問題一覧が返る。 |
| G16-PREFLIGHT-BLOCK | blockがあるとBlob、decode、canvas、ZIP、downloadを開始しない。 |
| G16-PREFLIGHT-NOLOSS | 可変時間、event、Frame別collider上書き、polygonなどの既存拒否を維持する。 |
| G16-WEB-LOAD | HTTP経由でpackage入口、manifest、sidecar、複数page、画像を読み込める。 |
| G16-WEB-METADATA | frame、trim、scale、origin、anchor、rect / circle、animationの意味が表示と一致する。 |
| G16-WEB-MOBILE | `375×667`で横overflow、長いwarning、Canvas、検証結果の表示が崩れない。 |
| G16-PREFLIGHT-PATH | 絶対path、`../`、Windows drive、UNC、URL scheme、制御文字、逆向き区切りを自動修復せず拒否する。 |
| G16-PREFLIGHT-COLLISION | 完全一致、ASCII大小文字、Unicode NFC同値のentry名・Frame名衝突をZIP生成前に拒否する。 |
| G16-PREFLIGHT-SECRET | 秘密情報らしい非空値とPEM / Bearer形式を拒否し、値を画面、log、artifact、packageへ出さない。 |
| G16-PACKAGE-CLOSURE | ZIP生成後かつdownload前に全JSON、全参照、entry hash、画像寸法、複数pageを再確認し、失敗時のdownloadを0件にする。 |
| G16-REPEAT | 同一入力で問題code・順序、canonical JSON、entry順、各entryの意味を一致させる。PNGは同一環境のpixel一致を証拠にする。 |
| G16-STATUS-TRUTH | Generic Webで実行確認した範囲だけを記録し、PixiJS / PhaserはGroup 17完了まで`candidate`を維持する。 |
| G16-ASYNC-ONCE | 高速二重操作でも生成とdownloadは各1回とし、失敗時は完了表示を出さず再試行可能にし、Blob URL生成数と解放数を一致させる。 |
| G16-EVIDENCE | package内には安定した対象範囲・source commit・fixture / manifest hash・artifact参照を残し、browser情報、実行日時、console error、download件数は同じheadのartifactへ分離する。 |

## 6. CI・独立確認・人間確認

このdocs-only監査PRでは、コード用lint、build、unit、E2Eは実行対象にしない。Markdownの差分検査とdocs-only分類だけを確認する。

Group 16のproduct implementationへ進む条件は次のとおりである。

1. 人間が`G16-C1`、`G16-C2`、`G16-C3`の案を明示採用する。
2. 採用内容をhandoff文書へ反映し、契約状態を`accepted`へ更新する。
3. 単一writerが同じwork packageのcode、tests、docs、CI evidenceを一つのDraft PRへ作る。
4. CIが対象headで成功し、writer以外の固定head確認で`BLOCKER 0 / MUST 0`になる。
5. 人間がReady化・mergeを判断する。

## 7. 人間への判断依頼

次の形式で回答してほしい。

```text
G16-C1 [A/B/C] + G16-C2 [A/B/C] + G16-C3 [A/B/C]
```

推奨は `G16-C1 A + G16-C2 A + G16-C3 A` である。採用回答があるまで、Group 16のproduct code、unit、E2E、CI workflow変更は開始しない。

## 8. 監査結論

- BLOCKER: Group 16の具体契約が未採用のため、product implementationは開始不可。
- MUST: package入口、preflight severity、Generic Web受入証拠を人間が決める。
- SHOULD: Group 15のdistribution manifest `0.1.0`とlegacy出力は変更しない案を優先する。
- NOTE: 進捗は17/27のまま。物理iPhone Safari、PixiJS / Phaser、target別検証は後続工程で扱う。

---

## 9. 2026-08-13 五視点レビュー追補（proposal-only）

PR #240 / merge `b5401529a552c38147d308d7209ad8483ffd85c4`により、この契約監査文書はmainへ反映済みである。これはdocs-only監査のGate A完了であり、`G16-C1`〜`G16-C3`の採用ではない。契約状態は`proposed / human-decision-pending`、製品実装は`not-started / unverified`、進捗は17/27のままとする。

五視点レビューの横断結果と後続割当は、`docs/future/2D_FIVE_PERSPECTIVE_REVIEW_ACTION_PLAN_2026-08-13.md`を参照する。Group 16内では、unsafe pathと名前衝突、秘密値の非表示、古いpreflight結果、決定的な問題順序、package再読込、二重download、`verified`範囲、動的な検証記録とpackage hashの分離を、採用後handoffで固定する。この節だけを根拠に実装しない。

distribution製品UIはGroup 21A、`.casproj`再開・再生成はGroup 21B、性能・アクセシビリティ・安全性とEditor責務の段階分離はGroup 21C、代表projectと初回成功ループはGroup 22へ送る。Group 16の`375×667`確認はGeneric Web fixtureの表示確認であり、製品UIや物理Safariの合格を意味しない。


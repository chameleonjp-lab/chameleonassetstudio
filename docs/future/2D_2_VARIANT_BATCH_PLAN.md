# 2D-2-VARIANT + 2D-2-BATCH 契約監査・実装計画

作成日: 2026-07-17
状態: `F1+C1+V1+T1+B1+O1+H1+L1 accepted (2026-07-17) / Slice A merged / Slice B implementing`
正式work package: `2D-2-VARIANT + 2D-2-BATCH`（2D完成ロードマップ PR group 10）
契約監査基準main: `1838f58918a2958f9ebce2f8379f87a45fb17c26`（PR #115 merge）
Slice A実装基準main: `f08ec3f108e877dfbd6edc7106946f6e3519644a`（PR #116 merge）
Slice B実装基準main: `015064c6ae6b9e2a0f28e84c9ac447b9f9e0a8d1`（PR #117 merge）
前段: `2D-2-RASTER + 2D-2-REPAIR`の現在実装可能なsliceは完了。frameずれ修正はaccepted `M`契約どおり`2D-3-TIMELINE`後へ保留する。

## 1. 目的

同じ素材の通常、色違い、左右向き、装備違い、解像度違いを単なる複製ではなく追跡可能な派生として管理し、複数Assetへ安全に変更を適用できるようにする。

本監査では、product codeへ進む前に次を固定する。

1. Family / Variant関係の正本をProjectとAssetのどちらへ置くか。
2. 既存`0.1.0`の独立Assetをどう読み、version / migrationをどう扱うか。
3. linked variantの更新時期、再生成recipe、手動調整の保護単位。
4. 左右向き、色違い、装備違い、解像度違いの初回対応範囲。
5. batchの対象preview、除外、失敗、原子性、Undo / Redo。
6. source Blob、snapshot、`.casproj`、exportへの影響。
7. Desktop / touch / iPhone SE級viewportと性能上限。

この文書は判断候補を提示したdocs-only監査を経て、§8で推奨組み合わせがaccepted済みである。Slice Aの型、schema、意味検査、fixture、文書同期はPR #117でmainへmerge済みである。現在は§5の直列順に従いSlice Bの原子revision / recovery基盤を実装し、Family / Variant UIとlinked refreshはSlice C、preview / progress / 取消を持つbatch体験はSlice Dまで開始しない。

## 2. 前段closeoutと開始条件

- PR #115 final head: `63d92a1dd56679edc047fa62ab450ad743323cfc`
- CI Run #384: `classify`、lint、format、build、unit test、実ブラウザE2Eが全成功
- PR #115 merge commit: `1838f58918a2958f9ebce2f8379f87a45fb17c26`
- 2026-07-17時点でGitHub上のreview、review thread、PR commentは0件。merge済みの事実は記録するが、Opus review実施済みとは扱わない。
- schema、version、migration、`.casproj`構成、export ZIP構成、dependenciesはPR #115で変更されていない。
- frameずれ修正は`2D-3-TIMELINE`後へ送るaccepted契約であり、Group 10のdocs-only監査開始を妨げない。

PR #115がreview記録なしでmergeされた点は運用上の例外として残し、後続PRのready化・merge条件を緩める前例にはしない。

## 3. 現状監査

| 対象 | 現状 | 不足 / 境界 |
|---|---|---|
| Project | `Project.assets`は`id`、名前、表示名、asset typeの要約だけを持つ。Family、base、variant role、派生recipeはない。 | 横断関係の正本と、Asset削除・複製・import時の参照整合が必要。 |
| Asset | `Asset`は1つの独立編集対象で、Family ID、source Asset ID、同期状態、手動調整保護を持たない。 | Asset単位metadataにするとmembership重複と循環参照の横断検査が必要。 |
| 独立copy | `duplicateAsset`はAssetと内部IDを再採番し、Blobも別keyへcopyする。Project級追加のためUndo / Redo対象外。 | 現行挙動は維持し、利用者がlinked variantと誤認しない表示が必要。 |
| 左右反転copy | `flipCopyAsset`は独立Assetを返す。origin、layer、anchor、collider、part、frameを反転するが、rig編集データは省く。 | rigを持つlinked mirror variantは`2D-3-RIG`側の意味が固まるまで安全に再生成できない。 |
| 色変更 | 単一layerの`replaceColor`、HSL、palette抽出は実装済みで、edit Blobを改訂する。 | 複数Asset / layerのrecipe、対象選択、前後比較、原子的保存がない。 |
| 解像度 | layer image resizeとcanvas resizeは別操作として実装済み。1x / 2x / 3xは共通データではなく出力scaleとする契約がある。 | 低解像度向け手修正をVariantにする境界と、単なるexport scaleとの区別が必要。 |
| 装備差分 | Part、layer、anchorは存在するが、共有部分と専用部分、part replace、linked更新の保存契約はない。 | 初回から自動mergeすると参照と手動調整を壊すため、manual variant境界が必要。 |
| 保存 | `saveProjectBundle`は新規Asset追加を原子的に行い、`saveAssetRevision`は既存Asset 1件を改訂する。 | 複数の既存AssetとBlobを1 transactionで改訂する公開APIがない。 |
| History / snapshot | 通常Historyは1 Assetのbefore / afterを積む。snapshotは1 Asset・1 edit Blob単位。 | batch 1操作のUndo / Redoと、複数Blobの復旧点を原子的に扱う設計がない。 |
| `.casproj` | `project.json`と`assets/<id>/asset.json`をそのまま保存し、unknown fieldは現行roundtripで保持される。 | Family関係を追加する場合、同じZIP配置のadditive fieldで済むか、version / migrationが必要かを固定する必要がある。 |
| 入力・端末上限 | 直接画像batchは16件上限。画像は1辺4096px上限。 | 編集batch用のtarget数、decoded pixel、Blob byte、取消、progress、mobile memory上限が未定義。 |

## 4. 判断候補

### 判断1: Family / Variant関係の正本

- **F1（推奨）**: `Project`へoptional・additiveな`families` registryを置き、既存Asset IDをmemberとして参照する。1 Assetは高々1 Familyへ所属し、Familyは1つのbase Assetと0件以上のvariantを持つ。Family削除はAssetを削除しない。
- F2: 各`Asset`へfamily / base / variant metadataを置く。Asset単体で読めるが、重複membership、循環、base欠落を全Asset横断で検査する必要がある。
- F3: Familyを保存せず、独立copyだけを継続する。互換性リスクは低いが`2D-2-VARIANT`を完成できない。

F1では関係の正本を一箇所にし、Asset本体は引き続き単独で編集・export可能にする。Project内の同一Asset IDをbaseとvariantへ同時指定しない。base自身をvariant一覧へ重複登録せず、family / source参照の循環を拒否する。

Family解除はmember Assetを削除せずstandaloneへ戻す。base Assetの削除は、別baseへの付替えまたはFamily解除を先に行うまで拒否する。variant Assetを削除する場合はFamily参照とAsset / Blobを同じtransactionで除去し、他memberを連鎖削除しない。

### 判断2: 既存0.1.0とversion

- **C1（推奨）**: `families`をoptional・additive fieldとして追加し、`CURRENT_PROJECT_VERSION = 0.1.0`を維持する。field不在の既存Projectは全Assetをstandaloneとして無変換で読む。schema、型、`DATA_FORMAT.md`、fixture、`.casproj` roundtripは同時更新する。
- C2: Project versionを上げ、既存Assetごとに1 Family 1 Variantへmigrationする。不要な自動関係を大量に作り、ADR-0003のstandalone解釈を変えるため非推奨。

C1はADR-0015の「optional・additive fieldはversionを上げない」に従う。ZIP内pathは変更せず、`project.json`のadditive fieldだけを可搬保存へ含める。旧アプリによるunknown fieldの再保存リスクはfixtureとユーザー警告の要否を契約実装PRで確認する。

### 判断3: linked更新と手動調整保護

- **V1（推奨）**: linked variantはrecipeと最後に同期したbase / variantのfingerprintを保存する。background自動更新は行わず、base変更後に「更新候補」としてpreviewする。recipeが書き換える範囲を1つの保護単位とし、同期後にその範囲が変わっていれば`manual-adjusted`として既定除外する。利用者が明示的に再生成を選ぶまで上書きしない。
- V2: layer / field単位の3-way mergeを初回から実装する。手動部分を細かく残せるが、pixel Blob、ID参照、frame、rigを横断するmerge契約が大きすぎる。
- V3: base保存のたびに全linked variantを自動更新する。失敗、容量、手動調整、Undoの境界を壊すため採用しない。

V1のfingerprintはProject / Asset ID、表示名、`updatedAt`へ依存せず、recipeが読むAsset構造と対象Blobの決定的hashから作る。このため`.casproj` importでProject / Asset IDを付け替えても値を保持できる。fingerprint不一致を自動競合解消に使わず、更新可否と警告の根拠にだけ使う。

linked recipeは作成時にbase側IDとvariant側IDの対応を固定する。refreshでtarget Asset ID、既存TextureRef / Layer / Part / Frame / Animation等のIDを再採番しない。baseへrecipe対象のderived要素が追加された場合だけ新しいtarget IDを一度生成して対応表へ追加し、削除はpreviewへ明示する。source TextureRef / Blobの追加・削除・上書きが必要な差分はrefresh対象にせず、理由付きineligibleとして明示的なvariant再作成へ戻す。現行`flipCopyAsset`をrefreshごとにそのまま呼び、全内部IDを入れ替える実装は禁止する。

各recipeは書き換えるfield / Blobを明示する。targetの`id`、`name`、`displayName`、`createdAt`、Family membershipと、recipe対象外fieldは常に保持する。write set内に手動変更が1件でもあればwrite set全体を保護し、初回からfield単位の自動mergeは行わない。

### 判断4: variant種別の初回範囲

- **T1（推奨）**: linked recipeは左右反転とpalette置換から開始する。装備違いと低解像度の手修正版はFamily内の`manual` variantとして追跡するが、自動merge / 再生成しない。現行の「独立コピー」はFamilyへ自動登録しない。
- T2: 左右反転、palette、装備、解像度をすべて自動再生成対象にする。part replace、rig、resize、手動差分mergeが未確定のため危険。
- T3: Family membershipだけを実装し、linked recipeを持たない。関係表示はできるがlinked variant要件を満たさない。

T1でも、rig編集データ、未対応frame別game data、欠落Blobを持つ左右反転は理由付きでineligibleにする。解像度違いでは通常の1x / 2x / 3x export scaleをVariantとして複製せず、低解像度専用の手修正Assetだけをmanual variantとして扱う。

### 判断5: batchの失敗と原子性

- **B1（推奨）**: 実行前previewで全targetを`ready / warning / ineligible / manual-adjusted`に分類し、利用者が対象を確認・除外する。commit対象は全件原子的に保存し、validation、Blob生成、容量確認、transactionのいずれかが失敗したら全件を無変更にする。
- B2: Assetごとにbest-effortで保存し、成功と失敗を混在させる。部分成功の説明とUndoが複雑になり、Familyの同期状態が分裂する。
- B3: metadataだけをbatch対象にし、pixel / Blob変更は1件ずつ行う。安全だがpaletteやlinked refreshの完成体験にならない。

B1における「部分失敗対応」は、実行前にineligible targetを理由付き表示して明示除外できることを指す。commit開始後の部分成功は許可しない。

### 判断6: 初回batch操作

- **O1（推奨）**: linked variant refresh、明示Asset / layerへのpalette置換、Asset canvas resizeを初回registryへ登録する。各操作は既存の純関数・warning契約を再利用し、source Blobを変更しない。
- O2: 現行Editorの全操作を汎用batch化する。操作ごとの座標、Blob、selection、game data境界が異なり、初回scopeが過大になる。
- O3: linked variant refreshだけをbatch化する。最小だが一般的な安全な一括変更の受け入れ条件を十分に検証できない。

O1のcanvas resizeは各Assetごとの外部対象warningをpreviewへ表示し、palette置換はAssetとlayerを明示する。暗黙に全layer、全Family、全Projectへ広げない。

### 判断7: 保存、History、snapshot

- **H1（推奨）**: 複数の既存Asset、Project要約、edit Blobを1つのIndexedDB transactionで確定する`saveAssetBatchRevision`相当の高水準APIを追加する。batchは1 History entryとし、Undo / Redoも同じ原子APIを使う。Blob変更前は対象ごとの復旧点を作り、snapshot作成失敗時はcommitしない。
- H2: `saveAssetRevision`をtargetごとに順番に呼ぶ。途中失敗で部分確定が起きるためB1と両立しない。

Historyはsession内、snapshotはreload後も使える復旧導線という既存境界を維持する。source TextureRef / Blobの作成、上書き、削除はbatchの対象外とする。

### 判断8: target数、進捗、mobile

- **L1（推奨）**: 1回のbatch targetは既存の画像batch上限と同じ16件以下とし、画像decode / Worker処理は1 targetずつ進める。全targetの検証と出力Blob準備が完了するまで正本を変更せず、対象別progress、取消、推定変更byte、容量警告を表示する。
- L2: target数を無制限にする。iPhone級端末のmemory、長時間処理、取消、履歴保持が保証できない。
- L3: 4件以下に固定する。安全側だが既存16件importとの一貫性と量産用途を損なう。

L1は16件すべてを同時decodeする意味ではない。4096px / 総pixel制限、保存容量警告、mutation競合拒否を再利用し、実測でより低い端末別上限が必要なら`2D-6-PERFORMANCE`へ記録して契約を再検討する。

### 推奨組み合わせ

`F1 + C1 + V1 + T1 + B1 + O1 + H1 + L1`

この組み合わせは、Project-levelのadditive Family registry、明示更新型linked variant、全体単位の手動調整保護、原子的batchを採用する。自動background同期、fine-grained merge、rig mirror、装備 / 解像度の自動再生成は初回から行わない。

## 5. accepted後のPR分割

schemaと保存transactionを変更するため、1本の実装PRへ混在させず、契約レーンを直列に進める。

### Slice A: Family / Variant additive contract

1. Project-level Family / Variant型、schema、参照invariant、fixtureを追加する。
2. 既存0.1.0 field不在、unknown field、`.casproj` roundtrip、複製、削除、import ID付替えを検証する。
3. `DATA_FORMAT.md`、ユーザーガイド、ADR-0003の再検討結果を同期する。
4. schemaは変えるがversion、migration、ZIP内path、DB store / indexは変えない。

Slice Aで固定するrecipeの永続境界は次のとおりとする。

- `idMap`はTexture / Layer / Part / Anchor / Collider / Frame / Animationごとに名前空間を分け、base内部IDからvariant内部IDを引く。Asset IDは含めない。
- `writeSet`はvariant側の同じ内部要素種別と、TextureRefの相対`path`でBlob対象を明示する。Asset ID込みのBlob keyは保存しない。
- palette recipeは`baseLayerIds`、1件以上の色置換、0〜255の`tolerance`を持つ。暗黙に全layerへ広げない。
- linked mirror / paletteはrecipeとfingerprintを必須とし、manual variantはどちらも持たない。
- `.casproj` importではProject / Asset参照だけを付け替え、Family ID、内部`idMap`、`writeSet`、相対Blob path、fingerprintを保持する。

C1の旧client再保存リスクは、現行`0.1.0`のmigration・schema・storage・`.casproj`経路が未知root fieldを削除せず保持することをfixtureで固定するため、version bumpや読み込みblocking warningは追加しない。ただし旧buildはFamily関係を表示・管理できないため、ユーザーガイドではFamily付き`.casproj`を現行buildで扱い、編集前にbackupするよう案内する。

### Slice B: Atomic revision and recovery foundation

1. 複数の既存Asset、ProjectのFamily関係・要約、edit Blobを1 transactionで確定する原子revision APIを追加する。
2. 保存前の正本一致を確認し、validation、欠落Blob、競合、容量不足、transaction abortで全件を無変更にする。
3. 複数Asset / Blobの復旧点と、同じ原子APIを使うgroup Undo / Redoの基盤を追加する。
4. 既存の単一Asset保存、source不変性、snapshot / recovery、`.casproj`を後退させないstorage testを追加する。

Slice Bの初回基盤は既存snapshot形式（1 Asset + 1 edit Blob）を再利用する。1 targetで複数edit Blobを同時に変更すると1件の復旧点からAsset / Blob全体を整合復元できないため、新しい永続形式を推測せず理由付きで拒否する。複数Assetそれぞれの1 edit Blobとmetadata-only targetは同じtransactionで扱える。source TextureRef / Blob、DB version / store / index、Project / Asset schema、`.casproj`、product exportは変更しない。

### Slice C: Variant management and recipes

1. Family作成、base / member選択、manual variant登録、linked mirror / palette variant作成を実装する。
2. recipe fingerprint、stale / manual-adjusted判定、前後preview、明示refreshを実装する。
3. rig等のineligible理由、独立copyとの表示差、削除 / Family解除を実装する。
4. Desktop / touch / iPhone SE級viewport E2Eを追加する。

### Slice D: Atomic batch experience

1. target preview、除外、warning、progress、取消、16件上限を実装する。
2. linked refresh、palette置換、canvas resizeを1 History entryで実行・Undo / Redoする。
3. 保存失敗、容量不足、reload、snapshot、`.casproj`退避を確認する。
4. Desktop / touch / iPhone SE級viewportで原子的成功・失敗・取消をE2E確認する。

各sliceは最新mainからbranchを作り、前sliceのmerge後に開始する。契約レーンがopenの間、別PRでFamily / Variantの将来形式を推測して実装しない。

## 6. 受け入れ条件

### contract / fixture

- `families`不在の既存0.1.0 Projectが無変換・意味不変で読める。
- Family ID、base Asset ID、variant Asset IDがProject内で一意・実在し、重複membership、self reference、循環、欠落参照を拒否する。
- `.casproj` export → import → save → exportでFamily、recipe、fingerprint、standalone Assetが保持される。
- 独立copy / flip copyの既存挙動は変わらず、明示操作なしにFamilyへ登録されない。
- product exportはFamily metadataを既定で新しいengine向け形式へ追加しない。

### variant

- base変更だけではlinked variantを自動変更しない。
- refresh previewが変更対象、warning、ineligible、manual-adjustedを理由付きで表示する。
- manual-adjusted variantは既定除外され、明示確認なしに上書きされない。
- linked mirror / paletteの再生成が決定的で、source Blobを変更しない。
- linked refreshでtarget Asset IDと既存内部IDが変わらず、base追加要素のtarget IDだけが一度生成される。
- recipe対象外fieldとtargetの名前・表示名をrefreshが変更しない。
- manual equipment / resolution variantは関係を追えるが、自動更新されると誤表示しない。

### batch / storage

- 0件、17件以上、欠落Asset、欠落Blob、validation失敗、容量不足、transaction abortを理由付きで拒否し、全targetを無変更にする。
- previewで除外したtargetを変更しない。
- 1回のUndoで全Asset / Blob / Project要約が戻り、Redoで全件を再適用する。途中失敗でHistoryを積まない。
- source Blob、未選択layer、standalone Asset、export ZIP構成を変更しない。
- reload後に確定状態が維持され、破壊的Blob変更はsnapshotから復旧できる。

### E2E / mobile

- Family作成、linked / manual variant作成、stale表示、preview、除外、refresh、Undo / Redo、reloadを通す。
- paletteとcanvas resizeのbatchで対象別preview、warning、取消、原子的失敗を通す。
- touch contextとiPhone SE級viewportでtarget選択、長い名前、warning、progress、取消へ到達でき、横スクロールとhover依存がない。
- lint、format、build、unit、E2E、GitHub Actionsが全成功する。

## 7. 安全境界

本audit PRでは次を変更しない。

- product code、JSON Schema、version、migration
- IndexedDB store / index、保存transaction
- `.casproj`内部構成、export ZIP内部構成、engine向けmanifest
- source / edit / thumbnail Blob、既存Asset / Project data
- dependencies、3D、WebGPU、外部API

accepted後の実装でも、次は別契約まで行わない。

- base保存時のbackground自動同期
- pixel / layer / field単位の自動3-way merge
- rig編集データの左右反転、frame別game dataの推測更新
- 装備差分と解像度差分の自動merge / 自動再生成
- Familyをまたぐ暗黙batch、Project全体を既定targetにする操作
- source Blobの上書き・削除
- Family metadataのengine向けexport

## 8. 人間判断の記録

- 判断日: 2026-07-17
- 採用: `F1 + C1 + V1 + T1 + B1 + O1 + H1 + L1`（推奨組み合わせをそのまま採用）
- 非採用: F2 / F3、C2、V2 / V3、T2 / T3、B2 / B3、O2 / O3、H2、L2 / L3（各判断の代替案。理由は §4 の各判断に記載）
- review条件: 各sliceはDraft PRで進め、CI全成功後にOpus 4.8レビューを実施し、指摘を同一PRで解消してから人間確認を得る。ready化・merge・auto-mergeは人間の明示指示まで行わない。sliceは§5の順（A → B → C → D）で直列に進め、前sliceのmerge前に次sliceを開始しない。
- 本記録により、Slice A（Family / Variant additive contract、schema変更を含む危険契約PR）から実装を開始する。

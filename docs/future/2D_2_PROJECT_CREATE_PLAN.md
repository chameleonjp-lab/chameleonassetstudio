# 2D-2-PROJECT + 2D-2-CREATE 契約監査・実装計画

作成日: 2026-07-16
状態: `C slice completed / remaining CREATE A+B+X completed / Family-Variant Slice A merged / Slice B implementing`
正式work package: `2D-2-PROJECT + 2D-2-CREATE`
基準main: `f1fcdf1fbd05f33810206ee0ebfbfd49cba784f0`（PR #92 merge）
直前完了work package: `2D-3-TYPE-PROFILES + 2D-3-INSPECT`
現在のFamily / Variant後続正本: `docs/future/2D_2_VARIANT_BATCH_PLAN.md`

## 1. 目的

1つのProject内で複数Assetを安全に作成・選択・管理できる入口を完成させ、Family / Variantを導入する場合のデータ意味と互換性境界を実装前に固定する。同時に、PR #55の空キャンバス作成を再監査し、`2D-2-CREATE`に残る複製、型別template、図形、パーツ、文字からの作成を後続実装へ分割する。

本計画はwork packageを新設しない。正式な`2D-2-PROJECT + 2D-2-CREATE`の中で、現行0.1.0を変えずに実装できる範囲と、人間判断後にだけ変更できる範囲を分ける。

## 2. 着手条件

- PR #91 merge commit `71c568d6c38846d5795b5e70fdea476336596e57`
- PR #91最終head `51a5a2baf6171e80a52fa5823df25fb5d33f95d8`
- CI Run #269: lint、format、build、unit test、E2Eがすべてsuccess
- 2026-07-16: ユーザー報告によりOpus 4.8 review完了・問題なし。少なくとも`BLOCKER 0 / MUST 0`、その他の指摘報告なし
- 2026-07-16: 上記結果を人間確認し、後続対応開始を明示
- PR #92 merge commit `f1fcdf1fbd05f33810206ee0ebfbfd49cba784f0`
- CI Run #271: success

これにより`2D-1B-GATE`の完了条件が揃い、2D-2 / 2D-3の正式キューを解禁した。3D / WebGPUは2D Pro Gateの人間承認まで解禁しない。

後続の型別template判断に必要だった`2D-3-TYPE-PROFILES + 2D-3-INSPECT`は、PR #96、#97で完了した。PR #97の最終head `3e237e3186317095c73cdf411aa13d39e4ac8e6c`に対するCI Run #293は全成功し、merge commitは`500397ac7d04b23ac88cd17a6e79843c8405a557`である。2026-07-16にOpus reviewと人間確認の完了・問題なしが報告された。

## 3. 現行実装監査

### 3.1 既に成立する範囲

- `Project.assets`は複数の`ProjectAssetEntry`を保持し、Editorは複数Assetを読み込んで選択できる。
- 画像batch import、空Asset作成、左右反転copyは、Project要約、新Asset、必要なBlobを`saveProjectBundle`で原子的に追加する。
- 左右反転copyはADR-0003どおり、元との派生関係や自動追従を持たない独立Assetを作る。
- Asset削除はautosaveをflushした後、Project参照、Asset、Blob、snapshotを`deleteAssetBundle`で単一transaction更新する。PR #55時点の「完全な単一transactionが未完了」という記録は後続の保存基盤補修により解消済みである。
- `saveProjectBundle`はProject内のAsset ID重複、保存対象Assetの参照漏れ、TextureRefとBlobの不整合、既存ID / Blob key衝突を拒否する。

### 3.2 本実装前に直すべき独立Asset管理の欠落

| 項目 | 現状 | 必要な契約 |
|---|---|---|
| Project要約同期 | `saveAsset` / `saveAssetRevision`はAsset本体だけを保存し、`saveProjectBundle`も新規追加時にProject要約とAsset metadataの一致までは検査しない。Asset種別変更などの後に`Project.assets`要約が古くなり、`.casproj`整合検査で拒否され得る。 | 名前、表示名、asset typeを変える操作はProject要約とAssetを同一transactionで確定し、新規追加時もmetadata一致を検査する。失敗時は両方とも直前正本を維持する。 |
| Asset管理UI | Editor下部の平坦な選択listだけで、型表示、明示的複製、並び替え、検索・絞り込みがない。 | 最初の実装では選択、型表示、独立複製、複数Assetのreload整合を必須にする。検索・並び替えはAsset数と端末UIの検証結果で採否を決める。 |
| 作成size | 空Assetは32 / 64 / 128 / 256の正方形だけを選べる。 | 矩形presetと安全な自由size入力を追加し、INPUT-SAFETY上限、正の整数、失敗時無変更を共有する。 |
| 型別template | characterだけが初期colliderを持ち、他型は実質空templateである。 | 各型の必須情報は`2D-3-TYPE-PROFILES`判断と重複させない。2D-2では作成入口と明示template適用に限定する。 |
| 図形・文字 | 作成入口として未実装。後続`2D-2-RASTER`にもshape / textが定義されている。 | 2D-2-CREATEでは新規Assetへ最初の編集要素を置く入口まで、編集tool本体は`2D-2-RASTER`へ送る。 |
| パーツ | Asset作成後のPart追加は存在するが、パーツから開始する作成flowがない。 | 初期Part構成を選べる入口と、既存Part編集機能を再利用する。 |

## 4. Family / Variantの当時の停止境界

以下は2026-07-16の独立Asset C-slice選定時に適用した停止境界である。当時の`Project` / `Asset`型、JSON Schema、`.casproj`にはFamily / Variantが存在せず、ADR-0003は導入前の別設計PRと人間判断を要求していた。

2026-07-16に人間判断で`C`をacceptedとした。現行0.1.0の独立Asset管理とCREATE不足を先に実装し、Family / Variantのproduct code、schema、version、migration、可搬形式は別の契約変更まで保留する。

| 選択肢 | 方針 | 主な利点 / 制約 |
|---|---|---|
| `A` | Project側にadditiveなFamily / Variant構造を置き、既存Asset IDをmemberとして参照する。 | 関係の正本を一箇所にできる。Project schema、`.casproj`、保存transaction、migration判断が必要。 |
| `B` | Asset側にoptionalなfamily / variant metadataを置く。 | Asset単位で読めるが、重複・不整合membershipを防ぐ横断検査が必要。Asset schema、`.casproj`、migration判断が必要。 |
| `C`（accepted） | まず現行0.1.0の独立Asset管理とCREATE不足を実装し、Family / Variant設計を別の契約変更として保留する。 | schema / versionを変えず最小リスクで進められる。ただし`2D-2-PROJECT`全体はFamily / Variant実装までpartialのまま。 |

将来`A`または`B`へ進む場合は、ADR-0003の再検討条件を満たす設計PRを先に作る。`C`の実装では、独立copyをlinked variantと表示せず、Family / Variant完成を主張しない。

## 5. 完了した最初のC-slice

契約監査PR #93はmerge commit `359cb9c9d0918df95d1fc52db6d472639f0f3703`でmainへmerge済みである。accepted `C`の最初のproduct code実装はPR #94で次を扱った。

1. Project要約とAsset metadataを原子的に同期する高水準保存API。
2. Asset種別変更の原子的保存。
3. Project、Asset、TextureRef、Blobの整合を維持する独立Asset複製。
4. 型表示と複製操作を持つAsset list、複数Assetのreload / `.casproj`退避。
5. unit test、E2E、完了報告。

PR #94はmerge commit `5b0d16478d0b0140e6e56db63b5b89c52fd0f608`でmainへmerge済みである。最終head `c44246cbcf9f038c8089cbba4f79528165d3b553`のCI Run #277は全job successで、unit test 401件、E2E 84件が成功した。2026-07-16にOpus reviewと人間reviewの完了が報告された。この完了は現行0.1.0の独立Asset管理sliceを対象とし、Family / Variantまたは`2D-2-CREATE`全体の完成を意味しない。

このsliceではschema、data version、DB version、IndexedDB layout、migration、`.casproj`内部構成、export ZIP内部構成、dependenciesを変更していない。

## 6. 後続sliceの状態

`docs/future/2D_2_CREATE_REMAINING_PLAN.md`の`A+B+X`はacceptedとなり、PR #99〜#101で実装、監査補強、CI、mainへのmergeまで完了した。Family / Variantだけを`2D-2-PROJECT`の未完了範囲として残す。

Group 9のaccepted実装範囲はPR #115まででmainへmergeされ、Family / Variantと安全な一括変更の別契約監査はPR #116、Slice Aのoptional Family / Variant永続契約はPR #117でmainへmergeされた。2026-07-17にacceptedとなった`F1+C1+V1+T1+B1+O1+H1+L1`の直列順に従い、現在はSlice Bの複数Asset原子revision / recovery基盤を実装中である。管理UIとlinked refreshはSlice C、利用者向けbatch体験はSlice Dまで進めない。

## 7. 維持する安全条件

- 復元、trash purge、autosave、History、snapshot、`saveProjectBundle`の2D-1B確定方針を後退させない。
- 保存失敗時はProject要約、Asset、Blob、画面stateの直前正本を維持する。
- 新しいcopyはID、TextureRef ID、Blob keyを一貫して更新し、既存正本と衝突した場合は全件拒否する。
- source Blobは無断上書き・削除せず、copy後の独立性を明示する。
- 2D Pro Gate完了まで3D / WebGPUへ進まない。

## 8. Draft PR運用

code、tests、docs、CI修正、Opus 4.8 review対応は同じbranch・同じDraft PRへ入れる。ユーザーの明示指示前にready化、merge、auto-mergeを行わない。

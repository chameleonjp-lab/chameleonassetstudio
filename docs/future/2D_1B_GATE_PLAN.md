# 2D-1B-GATE 実装・検証契約

作成日: 2026-07-16
状態: `implementation completed / Draft PR #91 / CI Run #268 success / review pending`
正式work package: `2D-1B-GATE`
基準main: `54f7602974f87710c16a3b79d5fefe175232e376`（PR #90 merge）
直前work package: `2D-1B-INPUT-SAFETY` completed（最終head CI Run #266 success）

## 1. 目的

REVISION、LAYERS、RECOVERY、CAPACITY、CASPROJ、INPUT-SAFETYを横断し、保存正本、復旧、可搬正本、入力拒否、容量不足のfixtureと回帰を最終確認する。新しい製品機能を追加するGateではなく、既存契約を証拠へ対応付け、横断レビューで残ったSHOULDだけを最小補修する。

Gateのmerge、Opus 4.8 review、人間確認が揃うまで、追加の2D-2 / 2D-3本実装は解禁しない。2D Pro Gate承認前に3D / WebGPUへ進まない。

## 2. 着手時GitHub基準

- default branch: `main`
- main: PR #90 merge commit `54f7602974f87710c16a3b79d5fefe175232e376`
- PR #90最終head: `eef04042b9e82583e9efd0666b4d1fc4fb091ad9`
- CI Run #266: lint、format、build、unit test、E2Eがすべてsuccess
- open PR: 0件

実装開始後にDraft PR #91を作成した。実装head `c9918b29e75557266c26841320fe34bc5ee6bc93`のCI Run #268は全job successである。

## 3. 変更範囲

扱うこと:

- 全保存fixture・unit test・E2Eの横断実行と証拠化
- ADR-0015とv0.1.0 fixture / roundtrip / future version拒否の再監査
- storage barrelから不要な低水準mutation APIを除外する
- snapshot復元を一回限りのtokenでprepare / commitし、明示cancelと画面側finally cleanupを置く
- 上記最小補修のunit testと完了報告

変更しないこと:

- schema、data version、DB version、IndexedDB store / index layout、migration
- `.casproj`内部構成、export ZIP内部構成、dependencies
- accepted済み容量警告閾値、INPUT-SAFETY profile B+X
- 2D-2 / 2D-3本実装、3D / WebGPU

## 4. Gate判定マトリクス

| 契約 | 必須証拠 |
|---|---|
| Project / Asset / TextureRef / Blobの整合保存と失敗時正本維持 | `projectStore.test.ts`、`projectStoreFinalInvariants.test.ts`、`recoveryTrash.test.ts` |
| 復元時Project ID / Asset ID衝突拒否 | `projectRecovery.test.ts` |
| trash完全削除の衝突拒否、live正本とtrash維持、`purgeAllTrash`全件原子、自動purge代替削除禁止 | `projectStore.test.ts` |
| autosave失敗後に破壊的操作を開始しない / Historyは保存成功後だけ確定 | `autosave.test.ts`、`history.test.ts`、`editorMutationGuard.test.ts` |
| snapshotはStored edit Blob一致後だけ作成し、復元失敗時もAsset / Blobを維持 | `snapshotStore.test.ts`、`snapshotRestoreFlow.test.ts`、`snapshotRestoreCoordinator.test.ts` |
| 容量estimate、usage / quota、persistent storage、QuotaExceededError案内と正本維持 | `storageUsage.test.ts`、`db.test.ts`、`storage-capacity.spec.ts` |
| `.casproj` staged import、ID衝突拒否、再export、壊れた入力の隔離 | `casproj.test.ts`、`casprojImport.test.ts`、`casproj.spec.ts` |
| INPUT-SAFETY B+Xの境界、理由付き拒否、batch全件原子 | `inputSafety.test.ts`、画像import tests、`casproj.spec.ts` |
| v0.1.0可搬fixture、恒等migrate、roundtrip、future version拒否 | `storage.fixtures.test.ts`、`migrationContract.fixtures.test.ts` |
| UI横断の保存、trash、snapshot restore / Undo / reload | `storage.spec.ts` |
| 低水準APIがproduct向けstorage barrelから公開されない | `storagePublicApi.test.ts` |

## 5. 横断レビューSHOULDの解決契約

### 5.1 低水準API

`saveBlob`、`deleteBlob`、`deleteAsset`、raw snapshot applyは内部実装・fixtureから直接importできる状態を維持するが、`src/core/storage/index.ts`からは公開しない。製品コードは`saveProjectBundle`、`saveAssetRevision`、`deleteAssetBundle`、token付きsnapshot復元を使う。barrelのruntime export検査で迂回口の再公開を防ぐ。

### 5.2 snapshot復元token

prepareはautosaveをflushし、その時点の正本とsnapshotをtokenに束縛する。commitはtokenを先に一度だけ消費し、準備後の正本変更を検出した場合も上書きしない。画面処理は`finally`で未使用tokenをcancelする。cancel後・commit後の再利用は拒否し、同じAssetの通常保存を妨げない。

timeoutは採用しない。製品側の唯一の呼び出しはmutation guard内でprepareからcommitまでを直列実行し、`finally` cleanupを必須にするためである。将来tokenを長時間保持するUIを追加する場合は、所有componentのunmount cleanupまたは期限をその実装契約で追加する。

## 6. ADR-0015再監査

現行0.1.0は実在する最初の形式で、全`*_MIGRATIONS`は空配列である。Gateのために架空の旧versionやmigrationを追加しない。現行fixtureはmigrate後も恒等でschema検証を通り、`.casproj` import → export → reimportで意味と画像bytesを維持し、0.1.1を含むfuture versionは正本へ書く前に拒否する。

最初にversionを上げる将来PRはADR-0015のgateを維持し、旧 / 新fixture、連続migration、roundtrip、export重要情報、失敗時正本維持、docs、Opus 4.8 review、人間確認を同時に満たす。これはGateで先取り実装しない。

## 7. 完了条件

1. lint、format、build、全unit test、E2Eが成功する。
2. Gate matrixの各契約に実行証拠がある。
3. 横断レビューの継続SHOULD 2件を解決し、BLOCKER / MUSTを再導入していない。
4. 完了報告にcommit、CI Run、test件数、残リスクを記録する。
5. Opus 4.8 reviewと人間確認を得る。
6. ユーザーの明示指示まではDraftを維持し、ready化、merge、auto-mergeを行わない。

Gate PRがmergeされるまで2D-2 / 2D-3本実装は解禁しない。merge後も3D開始条件は2D Pro Gateの人間承認であり、本Gateだけでは解禁しない。

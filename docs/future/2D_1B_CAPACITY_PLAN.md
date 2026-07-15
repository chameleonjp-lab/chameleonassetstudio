# 2D-1B-CAPACITY 実装契約

作成日: 2026-07-16  
状態: `completed`
正式work package: `2D-1B-CAPACITY`  
基準main: `9e0a42afc47bb390b13f45b03884a7ea8571bba0`（PR #86 docs-only merge）
直前Gate: `2D-1B-STORAGE-CROSS-REVIEW` completed（`BLOCKER 0 / MUST 0`）

## 1. 目的

ブラウザ保存の使用量と状態を、利用者が理解して対処できる形でホーム画面へ表示する。容量不足が起きる前には承認済みの割合に基づいて警告し、容量不足が起きた後は既存の整合した正本を壊さず、不要データの削除、`.casproj`退避、再試行へ進めるようにする。

このwork packageは保存形式を変えない。`navigator.storage`が返す値は参考値であり、空き容量や次の保存成功を保証する値として扱わない。

## 2. 着手時監査

### 2.1 GitHub

- default branch: `main`
- 基準main: PR #85 merge commit `e3c34fb292aab1d35a6da571ff17ca4ed9d13e0e`
- open PR: 0件
- PR #85: merged
- PR #85最終head: `d8ce80f36adaa94b2711d0e4ce3ffc1f1bf5e413`
- CI Run #244: lint、format、build、unit test、E2Eがすべてsuccess
- PR #86: 同branchのdocs-only旧headで外部merge。実装差分はDraft PR #87が引き継ぐ。
- PR #87: merge済み。merge commit `66ba2c4096dabc297f402a9176b8c60de9c584f9`
- PR #87最終head `d7b965af333821d4e73937873ed039972a6f5f04`のCI Run #255: lint、format、build、unit test、E2Eがすべてsuccess

### 2.2 既存実装

| 対象 | 現在の状態 | CAPACITYで補うこと |
|---|---|---|
| `storageUsage.ts` | `estimate()`のusage / quotaを返す。例外と非対応をどちらも`unsupported`相当として扱う。 | 値の正規化、使用率、取得不能理由、persistent storage状態と要求を契約化する。 |
| `db.ts` | `QuotaExceededError`を検出し、削除だけを案内する。 | 容量不足を機械判定できる`StorageError`へ保ち、退避・削除・再試行を案内する。 |
| `index.ts` | storage usageと容量不足helperを公開する。 | CAPACITYの公開入口を追加する。schemaやstoreは公開しない。 |
| `HomeScreen.tsx` | usage / quotaの文字表示、ごみ箱、quarantine削除、`.casproj`読み込みがある。 | 状態表示、ユーザー操作による永続保存要求、対処導線、処理中の二重実行防止を追加する。 |
| `.casproj`書き出し | EditorのExportPanelにだけ存在する。 | 容量警告・容量不足から、対象Projectを開いて既存の`.casproj`書き出しへ到達できる案内を置く。直接書き出しを追加する場合も既存bundle生成契約を共有し、内部構成は変えない。 |
| unit / E2E | DBの容量不足検出unitはある。storage usageとpersistent storageのunit、容量UIのE2Eはない。 | 下記の受け入れテストを追加する。 |

## 3. 変更範囲

### 3.1 扱うこと

- storage estimate
- usage / quota / 使用率の表示
- 承認済み割合に基づく予防警告
- persistent storageの状態確認
- 利用者がボタンを押した時だけ行うpersistent storage要求
- `QuotaExceededError`時の理由と対処
- ごみ箱、Project、quarantineの手動削除導線
- `.casproj`による安全な退避導線
- 保存失敗時の正本維持
- unit test、E2E、完了報告

### 3.2 変更しないこと

- schema、JSON Schema、version
- `DB_VERSION`
- IndexedDB store / index layout
- migration
- `.casproj`内部構成とversion
- export ZIP内部構成
- dependencies
- 自動的なtrash / snapshot / quarantine / Project削除
- 2D-2 / 2D-3本実装
- 3D / WebGPU

これらが必要になった場合は実装を止め、別の設計判断へ戻す。

## 4. Storage Capacity API契約

### 4.1 estimate結果

表示層へ返す結果は、最低限次を区別する。

```ts
type StorageEstimateStatus = 'available' | 'unsupported' | 'error';

interface StorageEstimateResult {
  status: StorageEstimateStatus;
  usageBytes: number | null;
  quotaBytes: number | null;
  usageRatio: number | null;
}
```

規則:

- `navigator.storage.estimate`が無い場合は`unsupported`。
- APIがrejectまたはthrowした場合は`error`。画面全体を停止しない。
- usage / quotaは、有限かつ0以上の数だけ採用する。不正値は`null`。
- 使用率はusageとquotaがともに有効で、quotaが0より大きい場合だけ`usage / quota`で計算する。
- quotaが0、null、不正値の場合は割合を計算しない。
- usageがquotaを超える値でも取得結果を捨てない。表示上の割合だけ100%に丸めて事実を隠さない。
- estimate結果は参考値であり、保存成功保証ではないと画面に明記する。
- 取得不能時に空き容量を推測しない。

### 4.2 persistent storage

長期間残りやすい保存領域としてブラウザへ保護を求める仕組みを、永続保存（Persistent Storage）として扱う。

```ts
type PersistentStorageState = 'granted' | 'not-granted' | 'unsupported' | 'error';
```

規則:

- `navigator.storage.persisted()`と`persist()`を個別にfeature detectionする。
- 状態確認は画面読み込み時に行ってよい。
- `persist()`は利用者が専用ボタンを押した時だけ呼ぶ。自動要求しない。
- 要求結果`true`は`granted`、`false`は`not-granted`。
- 拒否や未付与を保存不能として扱わない。
- API例外は`error`として表示し、通常保存や他のホーム操作を止めない。
- 要求中は同じボタンを無効にし、二重要求を防ぐ。
- 付与済みの場合は再要求ボタンを出さない。

## 5. 予防警告契約

### 5.1 状態

警告状態は次の5つを使う。

- `normal`: 警告なし
- `notice`: 早めの退避を穏やかに案内
- `warning`: 不要データの整理と`.casproj`退避を明確に案内
- `critical`: 新しい大きな操作の前に退避を強く案内
- `unavailable`: 割合を計算できず、空き容量を推測しない

色だけで区別せず、状態名、理由、行動を文章で表示する。`critical`でも自動削除や保存禁止は行わない。保存はestimateと別に失敗し得るため、`QuotaExceededError`の処理を必ず維持する。

### 5.2 割合判断

| 候補 | notice開始 | warning開始 | critical開始 | 特徴 |
|---|---:|---:|---:|---|
| A: 早め | 50% | 70% | 85% | 退避を早く促すが、警告が長く表示されやすい。 |
| B: 標準 | 60% | 80% | 90% | **accepted（2026-07-16、人間判断）**。予防と表示頻度の中間。 |
| C: 遅め | 70% | 85% | 95% | 警告は少ないが、対処できる時間が短くなる。 |

候補Bを正式採用する。境界値はnotice 60%、warning 80%、critical 90%とし、同値から次の段階へ移る。候補AとCは比較記録として残すが、製品コードへ入れない。

## 6. 容量不足と正本維持

`QuotaExceededError`発生時は次を守る。

- 既存のProject、Asset、TextureRef、Blobを維持する。
- 複数record保存は既存の単一transactionを維持し、途中状態を残さない。
- Historyを成功扱いにしない。
- Undo / Redo stackを保存成功前に移動しない。
- autosave失敗後にsnapshot復元、Asset削除など後続の破壊的操作を開始しない。
- 失敗した保存を自動的に再試行し続けない。
- エラー理由に、`.casproj`退避、不要データの手動削除、再試行を含める。
- 退避のために現在の整合済み正本を読むことは許可する。保存に失敗した未確定画面状態を、保存済みであるかのように`.casproj`へ含めない。

`StorageError`には機械判定可能なcodeまたは判定helperを持たせる。表示側が日本語メッセージの文字列一致で容量不足を判定しない。

## 7. 利用者の対処導線

ホームの「保存容量」領域から、次へ到達できるようにする。

1. 使用量、quota、割合、取得不能理由を確認する。
2. 永続保存の状態を確認し、未付与なら利用者の操作で要求する。
3. 保存済みProjectを開き、既存の`.casproj をダウンロード`から退避する。
4. 退避確認後、不要Projectをごみ箱へ移動する。
5. ごみ箱を空にする、またはquarantineを個別削除する。
6. 使用量を再取得し、失敗した操作を利用者が再試行する。

削除操作は既存の確認と衝突拒否を維持する。容量確保を理由に、自動purge、別recordの代替削除、ID再採番、正本上書きを行わない。

## 8. UI契約

- ホームに`保存容量`見出しを持つ独立領域を置く。
- usage / quotaが揃う場合はbytesと割合を併記する。
- 一方だけ取得できた場合は取得できた値だけ表示し、割合は出さない。
- `unsupported`と`error`を同じ「取得できません」に畳まず、補足文で区別する。
- 永続保存は`保護されています`、`保護されていません`、`非対応`、`確認失敗`を区別する。
- 警告は`role="status"`、操作失敗は`role="alert"`を基本とする。
- 警告理由と対処を色だけで表さない。
- 容量再確認、永続保存要求、退避・削除導線の処理中は二重実行を防ぐ。
- iPhone SE相当幅で横スクロールを発生させない。

## 9. 対象ファイル

実装時の予定:

- `src/core/storage/storageUsage.ts`
- `src/core/storage/storageUsage.test.ts`（新規）
- `src/core/storage/db.ts`
- `src/core/storage/db.test.ts`
- `src/core/storage/index.ts`
- `src/features/home/HomeScreen.tsx`
- `src/features/home/home.css`
- `e2e/storage-capacity.spec.ts`（新規。既存storage E2Eへ混ぜる場合は理由を記録）
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/future/2D_1B_STORAGE_CROSS_REVIEW_REPORT.md`
- `docs/future/2D_COMPLETION_ROADMAP.md`
- `docs/future/2D_DEVICE_RELIABILITY_SPEC.md`
- `docs/future/2D_1B_CAPACITY_REPORT.md`（実装完了時に新規）

既存の`.casproj` bundle組み立てをHomeと共有する必要がある場合は、`ExportPanel.tsx`から純粋helperを既存storage / export責務内へ移す。`.casproj`内部構成は変更しない。

## 10. テスト契約

### 10.1 Unit

- estimate非対応は`unsupported`。
- estimate例外は`error`で、呼び出し元をrejectしない。
- usage / quota成功時に値を返す。
- undefined、負数、`NaN`、`Infinity`を`null`へ正規化する。
- quotaが0 / null / 不正値なら割合を計算しない。
- 有効値では割合を計算し、承認済み境界の直前・同値・直後を分類する。
- persisted / persistを`granted`、`not-granted`、`unsupported`、`error`へ分類する。
- persistent要求は専用関数の明示呼び出し時だけ実行する。
- `QuotaExceededError`を機械判定できる容量不足エラーへ変換する。
- 容量不足時にtransactionがabortし、既存正本を維持する既存testを回帰させる。

### 10.2 E2E

- estimate対応時にusage / quota / 割合を表示する。
- estimate非対応時に空き容量を推測せずfallbackを表示する。
- 承認済みの高使用率fixtureで警告理由と対処を表示する。
- persistent storageは初期表示で自動要求されず、ボタン操作後に結果を表示する。
- 要求中の二重実行を防ぐ。
- 容量警告から`.casproj`退避と手動削除へ到達できる。
- 注入した`QuotaExceededError`後も既存Projectを開け、保存済み正本が維持される。
- 375px幅でdocumentの横スクロールが発生しない。

ブラウザが返す実quotaには依存せず、E2Eでは`navigator.storage`をdocument作成前にstubする。固定waitで状態を隠さず、role / accessible nameと保存済みIndexedDBを検証する。

### 10.3 CI

- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run test`
- `npm run e2e`

すべて成功すること。失敗は同じbranch・同じDraft PRで原因を直す。

## 11. 完了条件

- 人間が警告割合を承認し、この文書へaccepted判断を記録している。
- estimate、使用率、persistent storage、容量不足後の対処が実装されている。
- 取得不能時に推測値を表示しない。
- 削除とpersistent要求は利用者操作からだけ実行される。
- `.casproj`退避が既存の完全性検査を通る。
- 保存失敗時の正本、History、autosave、破壊的操作の安全方針を維持する。
- schema、DB version、store layout、migration、`.casproj`、export ZIP、dependenciesに差分がない。
- unit、E2E、標準CIが全成功する。
- `2D_1B_CAPACITY_REPORT.md`に実装、テスト、残リスク、次の`2D-1B-CASPROJ`を記録する。

## 12. 停止条件

- 警告割合を人間承認なしで決める必要がある。
- schema、DB version、store / index、migrationの変更が必要になる。
- `.casproj`またはexport ZIPの内部構成変更が必要になる。
- dependency追加が必要になる。
- 容量確保のため自動削除が必要になる。
- 確定済みの衝突拒否、原子性、autosave / History契約と両立しない。

単なるlint、format、build、unit、E2E失敗は停止条件ではない。同じDraft PRで修正する。

## 13. 後続順序

```text
2D-1B-CAPACITY
→ 2D-1B-CASPROJ
→ 2D-1B-INPUT-SAFETY
→ 2D-1B-GATE
```

`2D-1B-GATE`が完了するまで、追加の2D-2 / 2D-3本実装と3D実装へ進まない。

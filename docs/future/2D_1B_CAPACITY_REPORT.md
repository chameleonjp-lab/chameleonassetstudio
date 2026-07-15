# 2D-1B-CAPACITY 実装完了報告

最終更新日: 2026-07-16
状態: `completed`
対象: `2D-1B-CAPACITY`

## 1. 結論

`2D-1B-CAPACITY`の契約、実装、unit test、E2E、標準CIを完了した。警告閾値は人間判断によりB案をacceptedとし、notice 60%、warning 80%、critical 90%で固定した。

PR #86は同branchのdocs-only旧headで外部mergeされたため、製品コードとテストはPR #87が引き継いだ。実装検証head `69d8e53d7cdc212d68042e6796ab47d447c9503c`に対するCI Run #250と、最終head `d7b965af333821d4e73937873ed039972a6f5f04`に対するCI Run #255は、変更分類、lint、format、build、unit test、E2Eがすべて成功した。

PR #87はmainへmerge済みである。merge commitは`66ba2c4096dabc297f402a9176b8c60de9c584f9`。

## 2. 実装した契約

### storage estimateと警告

- `available`、`unsupported`、`error`を区別する。
- usage / quotaは有限かつ0以上の値だけを採用し、不正値を推測で補わない。
- quotaが0または取得不能なら割合を計算しない。
- 取得値が参考値であり、次の保存成功を保証しないことを表示する。
- 60%でnotice、80%でwarning、90%でcriticalを表示し、色だけに依存しない文言を併記する。
- 警告だけを理由に保存を禁止しない。

### persistent storage

- `granted`、`not-granted`、`unsupported`、`error`を区別する。
- `persist()`は利用者がボタンを押した時だけ呼び出す。画面表示や更新時に自動要求しない。
- 要求中は二重実行を防ぎ、拒否・失敗・非対応でも通常保存を停止しない。

### 容量不足後の安全な対処

- `QuotaExceededError`を機械判定可能な`StorageError`へ変換する。
- IndexedDB requestの非同期errorと、`put()`等が同期的に投げる容量不足の両方を同じ案内へ変換する。
- 保存済み正本が変更されていないこと、`.casproj`退避、手動削除、再試行を案内する。
- Project一覧、ごみ箱、quarantineへ到達できる手動整理導線を置く。
- `.casproj`は既存ProjectをEditorで開き、既存export経路から退避する。内部構成は変更しない。
- 自動削除、自動purge、別recordの代替削除を追加しない。

## 3. 変更ファイル

- `src/core/storage/storageUsage.ts`
- `src/core/storage/storageUsage.test.ts`
- `src/core/storage/db.ts`
- `src/core/storage/db.test.ts`
- `src/core/storage/index.ts`
- `src/features/home/HomeScreen.tsx`
- `src/features/home/home.css`
- `e2e/storage-capacity.spec.ts`
- `docs/future/2D_DEVICE_RELIABILITY_SPEC.md`
- `docs/future/2D_1B_CAPACITY_PLAN.md`
- `docs/future/2D_1B_CAPACITY_REPORT.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/future/2D_COMPLETION_ROADMAP.md`

## 4. テスト証拠

### unit test

- estimate API非対応、throw / reject、usage / quotaの欠落・不正値・quota 0を検証した。
- 60%未満、60%、80%、90%の境界を検証した。
- persistent storageの全状態、ユーザー操作まで`persist()`を呼ばないことを検証した。
- 非同期requestと同期transaction callbackの`QuotaExceededError`変換を検証した。

### E2E

- 80%警告と、ボタン操作前にpersistent storageを要求しないことを検証した。
- storage API非対応時に割合や空き容量を推測しないことを検証した。
- 注入した同期`QuotaExceededError`後に新規Projectが残らず、既存Projectを開けることを検証した。
- 375px幅のcritical警告表示で横スクロールが発生しないことを検証した。

### CI Run #250

- classify-changes: success
- lint: success
- format:check: success
- build: success
- unit test: success
- E2E: success（78 tests）

初回のCI Run #248では、同期的な`QuotaExceededError`が容量不足用メッセージへ変換されない1件を検出した。同じbranch・同じDraft PRでトランザクション境界の変換と回帰unit testを追加し、Run #250で解消した。

## 5. 維持した安全不変条件

- 復元時とtrash完全削除時のProject ID / Asset ID衝突を拒否する。
- 衝突時はlive正本とtrashを両方維持する。
- `purgeAllTrash`は全件原子的に拒否し、自動purgeは別recordを代替削除しない。
- autosave失敗時は後続の破壊的操作を開始しない。
- Historyは保存成功後だけ確定する。
- snapshotはStored edit Blobとの一致確認後だけ作成する。
- `saveProjectBundle`はProject、Asset、TextureRef、Blobの不整合を拒否する。
- 容量不足による保存失敗時も、既存の整合した正本を維持する。

## 6. 変更しなかった範囲

- schema、DB version、IndexedDB store / index layout
- migration
- `.casproj`内部構成
- export ZIP内部構成
- dependencies
- 2D-2 / 2D-3本実装
- 3D / WebGPU

## 7. 残リスク

- `navigator.storage.estimate()`はブラウザ推定値であり、次の保存成功を保証しない。
- persistent storageの許可判断と利用可否はブラウザ・実行環境に依存する。
- 容量不足後の`.casproj`退避は、既に保存済みのProjectを既存export経路で書き出す。未保存変更の退避保証は追加していない。
- storage estimateとpersistent storageの実機差は、後続の端末検証でも確認する。

## 8. 後続

次の正式work packageは`2D-1B-CASPROJ`である。その後は`2D-1B-INPUT-SAFETY`、`2D-1B-GATE`の順を維持する。

`2D-1B-GATE`が完了するまで、追加の2D-2 / 2D-3本実装と3D実装へ進まない。

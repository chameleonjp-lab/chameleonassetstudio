# 2D-1B-GATE Opus 4.8 review依頼

作成日: 2026-07-16
状態: `review requested / evidence pending`
対象work package: `2D-1B-GATE`
対象main: `71c568d6c38846d5795b5e70fdea476336596e57`（PR #91 merge）
比較範囲: `54f7602974f87710c16a3b79d5fefe175232e376..71c568d6c38846d5795b5e70fdea476336596e57`
最終head CI: Run #269 success

## 1. review目的

2D-1B保存基盤全体について、Gate実装が正本整合性、失敗時原子性、復旧所有境界、公開API境界、旧形式互換を破っていないかをOpus 4.8が監査する。GitHub上のPR #91にはreview、comment、review threadがなく、merge済みという事実だけでは必須review完了と扱わない。

## 2. 必読範囲

- `docs/future/2D_1B_GATE_PLAN.md`
- `docs/future/2D_1B_GATE_REPORT.md`
- `docs/future/2D_1B_STORAGE_CROSS_REVIEW_REPORT.md`
- `docs/adr/0015-migration-detailed-contract.md`
- `src/core/storage/index.ts`
- `src/core/storage/snapshotRestoreCoordinator.ts`
- `src/core/storage/snapshotRestoreCoordinator.test.ts`
- `src/core/storage/storagePublicApi.test.ts`
- `src/features/editor/EditorScreen.tsx`のsnapshot復元経路

必要に応じてGate matrixが参照する全storage / history / mutation guard / E2E testへ展開する。

## 3. 必須確認

1. `saveBlob`、`deleteBlob`、`deleteAsset`、raw snapshot applyをpublic barrelから除外しても、製品経路に必要な安全な入口を欠落させていない。
2. snapshot tokenは一回限りで、cancel、競合、書き込み失敗、component処理中断後にstale restoreを通常保存へ誤適用しない。
3. prepare時のautosave flush、commit時の正本一致検査、Asset / edit Blobの同一transaction更新が維持される。
4. 復元、trash purge、autosave、History、snapshot作成、`saveProjectBundle`の確定済み安全方針を後退させていない。
5. schema、version、DB layout、migration、`.casproj` / export ZIP内部構成、dependenciesを変更していない。
6. ADR-0015に反して架空の旧versionや不完全なmigration証拠をGate完了根拠にしていない。
7. 既存・追加testとCI Run #269がGate matrixを十分に裏付ける。

## 4. 出力形式

指摘は`BLOCKER`、`MUST`、`SHOULD`、`NOTE`に分類し、各件に対象file / symbol、破損シナリオ、必要な修正、必要な回帰testを記載する。

- `BLOCKER`: 正本破損、silent data loss、互換性破壊、確定安全方針違反
- `MUST`: Gate完了前に必要な安全性・証拠不足
- `SHOULD`: 後続実装前に追跡すべき改善
- `NOTE`: 既知制約または後続package範囲

最終行に`BLOCKER n / MUST n / SHOULD n / NOTE n`を明記する。正式Gate完了には`BLOCKER 0 / MUST 0`と、人間によるreview結果確認が必要である。

## 5. 停止条件

review完了と人間確認が文書へ反映されるまで、2D-2 / 2D-3本実装を開始しない。2D Pro Gate承認前に3D / WebGPUへ進まない。

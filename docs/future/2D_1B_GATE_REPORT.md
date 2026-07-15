# 2D-1B-GATE 実装・検証報告

作成日: 2026-07-16
状態: `completed / PR #91 / CI Run #269 success / Opus review problem-free / human confirmed`
正式work package: `2D-1B-GATE`
基準main: `54f7602974f87710c16a3b79d5fefe175232e376`（PR #90 merge）
実装Draft PR: #91
実装head: `c9918b29e75557266c26841320fe34bc5ee6bc93`
CI: Run #268 success
最終head: `51a5a2baf6171e80a52fa5823df25fb5d33f95d8`
最終head CI: Run #269 success
merge commit: `71c568d6c38846d5795b5e70fdea476336596e57`

## 1. 結果

全保存契約をfixture、unit test、E2Eへ対応付けて再監査し、横断レビューから継続していたSHOULD 2件を最小補修した。BLOCKER / MUST相当の新しい不整合は確認していない。

Gateは新しいschema、version、migration、DB layout、可搬形式、製品機能を追加していない。PR #91はmainへmerge済みで、2026-07-16にユーザーからOpus 4.8 review完了・問題なしが報告された。少なくとも`BLOCKER 0 / MUST 0`、その他の指摘報告なしとして人間確認され、正式Gateを完了する。2D-2 / 2D-3は正式キューに従って解禁するが、3D / WebGPUは2D Pro Gateの人間承認まで解禁しない。

## 2. 補修内容

### public storage API

- product向け`src/core/storage/index.ts`を明示exportへ変更した。
- 正本整合性を迂回し得る`saveBlob`、`deleteBlob`、`deleteAsset`、raw snapshot applyをbarrelから除外した。
- fixtureと内部実装が必要な低水準関数は各実装moduleからの直接importに限定した。
- runtime export回帰testを追加した。

### snapshot復元token

- autosave flush後の正本とsnapshotを一回限りのtokenへ束縛するprepare / commit APIに変更した。
- commitはtokenを先に消費し、成功・競合拒否・書き込み失敗のいずれでもstale tokenを残さない。
- cancel後・commit後の再利用を理由付きで拒否する。
- Editorはmutation guard内でcommitし、未使用tokenを`finally`で必ずcancelする。
- cancel後に同じAssetの通常改訂が妨げられない回帰を追加した。

## 3. ADR-0015 / fixture再監査

- 現行0.1.0が最初の実形式であり、3文書のmigration配列が空である事実を維持した。
- v0.1.0 assetは恒等migrate後にschema検証を通る。
- v0.1.0 `.casproj`はimport → export → reimportでProject、Asset、画像bytesを維持する。
- future versionはcanonical保存前に拒否し、入力を破壊しない。
- Gate用の架空version、migration、混在version fixtureは追加していない。最初のversion進行PRでADR-0015の全gateを適用する。

## 4. ローカル検証

| 検証 | 結果 |
|---|---|
| `npm run lint` | success |
| `npm run format:check` | success |
| `npm run build` | success。既存の500 kB chunk warningのみ。 |
| `npm run test` | 45 files / 396 tests success |
| `npm run e2e` | 実行環境にPlaywright Chromium実体がなく、83 testsすべてbrowser起動前に停止。code assertion失敗は0件。正式判定はGitHub Actionsで行う。 |
| GitHub Actions | CI Run #268、最終head CI Run #269 success。lint、format、build、unit test、E2Eの全job成功。 |

## 5. Gate安全不変条件

- 復元時のProject ID / Asset ID衝突を拒否する。
- trash完全削除時のID衝突を拒否し、live正本とtrashを両方維持する。
- `purgeAllTrash`は全件原子的に拒否し、自動purgeは別recordを代替削除しない。
- autosave失敗時は後続の破壊的操作を開始せず、Historyは保存成功後だけ確定する。
- snapshotはStored edit Blobとの一致確認後だけ作成する。
- `saveProjectBundle`はProject、Asset、TextureRef、Blobの不整合を拒否する。
- 保存、復元、importの失敗時は直前の整合した正本を維持する。

## 6. 変更しなかった範囲

- schema、data version、DB version、IndexedDB store / index layout、migration
- `.casproj`内部構成、export ZIP内部構成、dependencies
- accepted済み容量警告閾値、INPUT-SAFETY B+X
- 2D-2 / 2D-3本実装、3D / WebGPU

## 7. Review・人間確認

- 対象範囲: `54f7602974f87710c16a3b79d5fefe175232e376..71c568d6c38846d5795b5e70fdea476336596e57`
- Opus 4.8 review: 2026-07-16にユーザーから完了・問題なしと報告
- 判定: 少なくとも`BLOCKER 0 / MUST 0`。その他の指摘報告なし
- 人間確認: 同日に後続対応開始が明示され、正式Gate完了を確認
- review証拠待ち記録: PR #92 merge commit `f1fcdf1fbd05f33810206ee0ebfbfd49cba784f0`、CI Run #271 success

これにより2D-1Bを正式完了し、次の正式work packageを`2D-2-PROJECT + 2D-2-CREATE`とする。3D開始には別途2D Pro Gateの人間承認が必要である。

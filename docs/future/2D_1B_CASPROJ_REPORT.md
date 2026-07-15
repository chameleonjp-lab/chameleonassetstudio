# 2D-1B-CASPROJ 完了報告

作成日: 2026-07-16
状態: `implementation completed / Draft PR #88 merge pending`
正式work package: `2D-1B-CASPROJ`
基準main: `66ba2c4096dabc297f402a9176b8c60de9c584f9`（PR #87 merge）
Draft PR: #88
実装commit: `ea884efd9c813b0371a333450ff1e794f47d03a9`
CI: Run #258 success

## 1. 結果

`.casproj`の読込みを、正本書込みのないstageと、既存transactionを使うcommitへ分離した。ZIP展開後に文書ごとのmigrationとschema検証、Project / Asset / TextureRef / file整合、copy用ID mapping、Blob準備を完了してからだけ`saveProjectBundle`を呼ぶ。

入力不正、future version、参照文書・画像欠落、ID・summary不整合ではcanonical Project / Asset / Blobを保存しない。commit失敗時も既存transactionの原子性により部分状態を残さない。

## 2. 実装内容

| 領域 | 実装 |
|---|---|
| error分類 | `CasprojError`へarchive、missing project、invalid document、unsupported version、incomplete bundle、inconsistent bundleを追加した。`MigrationError`をunsupported versionとして変換する。 |
| 文書検査 | asset.jsonのdirectory ID、Asset ID重複、Project参照重複・欠落、name / displayName / assetType summary一致を検査する。 |
| file検査 | TextureRef IDとcanonical pathの重複、必要画像欠落をcommit前に拒否する。未参照Asset、その配下file、orphan / unknown fileは理由付きwarningとしてcanonical対象から除外する。 |
| copy準備 | Project / Asset ID mappingを1回だけ作り、Project参照、Asset本体、Blob keyへ同じmappingを適用する。 |
| commit | `commitStagedCasprojImport`だけが`saveProjectBundle`を呼ぶ。容量不足などcommit側の失敗は入力不正としてquarantineしない。 |
| UI | compatibility warning、applied migration、copy成功、正本非変更を別表示する。future versionなどの`CasprojError`は元bytesを既存quarantineへ残す。 |
| export guard | Project / Asset summary、参照、重複file path、予約済みpath上書きを書出し前に拒否する。ZIP内部構成は変更していない。 |

## 3. 検証証拠

ローカルとGitHub CIで次を確認した。

| 検証 | 結果 |
|---|---|
| `npm run lint` | success |
| `npm run format:check` | success |
| `npm run build` | success。既存の500 kB chunk warningのみ。 |
| `npm run test` | 42 files / 385 tests success |
| `npm run e2e` | 80 tests success |
| GitHub Actions | CI Run #258 success |

追加・補強した主な回帰:

- stage中に正本へ書かず、Project / Asset / Blob keyを同じID mappingで準備する。
- future project / asset / export presets versionを理由付きで拒否する。
- Project参照重複、asset欠落、directory ID不一致、summary不一致、画像欠落をcommit前に拒否する。
- export presets非保存、未参照Asset / file、orphan fileをwarningとして表示する。
- commit時のID衝突でも既存正本だけを維持する。
- 作成→export→削除→import→画像表示→再export→再importをE2Eで通す。
- future versionと画像欠落をquarantineへ残し、未参照dataをcanonicalへ混ぜない。
- 375px幅のerror表示で横overflowを発生させない。

## 4. 固定済み安全方針との整合

- schema、DB version、IndexedDB store layout、migration配列を変更していない。
- `.casproj`とexport ZIPの内部構成、dependenciesを変更していない。
- importは常に新しいcopyとし、既存正本を上書きしない。
- 正本の確定は既存`saveProjectBundle` transactionだけで行う。
- 2D-2 / 2D-3本実装、3D / WebGPUへ進んでいない。

## 5. 残リスクと後続

- 現行`0.1.0`が最初の実在形式でmigration配列は空のため、非空のapplied migration表示は将来の実migration追加時に実fixtureで固定する。架空の旧versionは追加していない。
- `settings/export-presets.json`は検証するが、現行canonical storeに対応する保存先がない。UIで非保存と元`.casproj`保持を警告する。schema / store追加は本work packageでは行わない。
- ZIP展開サイズ、file数、圧縮率、JSON深さ、画像寸法などの数量上限とresource budgetは未決定であり、`2D-1B-INPUT-SAFETY`で契約を固定する。
- Draft PR #88がmainへmergeされるまでは`2D-1B-CASPROJ`を正式完了にせず、後続へ進まない。

正式な後続順序は次のとおり維持する。

```text
2D-1B-CASPROJ merge
→ 2D-1B-INPUT-SAFETY
→ 2D-1B-GATE
```

`2D-1B-GATE`完了までは、追加の2D-2 / 2D-3本実装と3D実装を開始しない。

# LIFE-09 local browser evidence — 2026-10-13 JST

検査対象のrepository snapshotは `6e1612a`（PR #393 head）。この追補では実装を変えず、既存browser specを実行して受入証跡を追加する。

対象は、quota失敗時の保存分離・復旧と、3D同projectを複数タブから開いたときの明示takeoverである。測定はこのrepoのPlaywright browser上で実施し、実機の総process memoryやOS中断を測ったものではない。

## 実行結果

| 対象 | 実行方法 / browser | 結果 | 確認したこと |
| --- | --- | --- | --- |
| `e2e/storage-capacity.spec.ts` | `playwright.config.ts`、Chromium、開発server | 4/4 pass | 80%警告と明示操作まで`persist()`を呼ばないこと、Storage API非対応fallback、quota拒否で既存2D projectを保つこと、375pxで横overflowしないこと |
| `e2e/native-cross-domain-recovery.spec.ts` | `playwright.production.config.ts`、Chromium + WebKit | 2/2 pass（各1回） | 同一originの2D/3D pageを並行して開き、各domainのIDB書込をquota拒否に注入。3Dは失敗中もbackup救出・retry可能、2D失敗はrollbackされ、互いの保存済みbytesを変更しないこと |
| `e2e/studio-entries.spec.ts` — explicit takeover test | `playwright.production.config.ts`、Chromium + WebKit、`--repeat-each=3` | 6/6 pass（各3回） | 2つ目の3D tabは読み取り専用から始まり、明示takeover後だけwriterになる。旧writerの未保存変更は競合表示され、別copyとして救出でき、元のownerのrevision/bytesは変わらないこと |

Production configは2D単独の`storage-capacity.spec.ts`を`testMatch`から除外するため、同specのみ通常設定のChromiumで別途実行した。cross-domainとtakeover testはproduction previewで実行した。

## 残る境界

- quotaはPlaywright内の`navigator.storage`応答・IndexedDB API monkeypatchで注入した。ブラウザやOSが実際にquota超過/evictionを起こす状況の証明ではない。
- 2D+3Dの並行pageと3D二タブtakeoverは検査したが、複数rendererの同時peak/process memory、物理端末の2D+3D/複数3D workload、GPU driver資源は測定していない。
- OS suspend/resume・process kill/discard、Assistive Technology、実データの容量回復は未検証。タブを無断で閉じる機能はこのPRで追加していない。
- よってLIFE-09はsoftware-only browser acceptanceを一部前進させるが、総resource/physical acceptanceはpartialのまま。

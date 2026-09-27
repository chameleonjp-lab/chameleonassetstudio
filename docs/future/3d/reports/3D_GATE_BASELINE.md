# 2D Pro Gate 人間承認と 3D-0 調査基準

記録日: 2026-09-27 JST（2026-09-26 UTC）

状態: **human-approved / user-reported acceptance**

対象: Group 23 → 既存ロードマップの `3D-0` 調査開始

## 1. 今回の人間判断

ユーザーは次の5項目を列挙し、「問題なしです。後続対応開始」と回答した。

| 確認項目 | 今回の判断 | 証拠の区分 |
|---|---|---|
| artifact内容の人間レビュー | 問題なし | user-reported |
| 初回利用者レビュー | 問題なし | user-reported |
| PC／iPhone／iPad／Android実機確認 | 問題なし | user-reported |
| Unity／RPG Maker MZ runtime確認 | 問題なし | user-reported |
| 2D Pro Gateの人間承認 | 承認済み | user-reported |

これは人間による受け入れ判断であり、以前の「人間承認待ち」を置き換える。同じ承認を再要求せず、[2Dロードマップ §9](../../2D_COMPLETION_ROADMAP.md)に従って `3D-0` の調査を開始する。

ユーザーの確認対象SHA、artifact ID、実施日、端末型番、OS・browser・engine version、実行ログ、初回利用者の母数・成功率は今回提示されていない。以下のmainは**記録時の開発基準**であり、ユーザーが試験した版と同一であるとは断定しない。Godot runtimeは今回の列挙に含まれない。

機械検査用の判断要約（既存の証拠manifestとは別の記録）:

```json
{
  "recordId": "ADR-2026-09-27-037",
  "decisionSource": "user-report",
  "gateDecision": "approved",
  "authorization": "3D-0-investigation",
  "acceptedAreas": [
    "artifact-content-review",
    "first-time-user-review",
    "physical-PC-iPhone-iPad-Android",
    "runtime-Unity-RPG-Maker-MZ",
    "2D-Pro-Gate"
  ],
  "userTestedRevision": null,
  "evidenceDetailStatus": "not-supplied",
  "recordedAgainstMain": "4d1ed9dfed9fcfda82cebc9d2286722f53771bda",
  "historicalEvidencePolicy": "preserve",
  "compatibilityPromotion": false,
  "productionDependencyApproval": false,
  "fourStagePlanApproval": false
}
```

## 2. 自動検査の基準

記録時にGitHub上で確認した、PR #275マージ後のmainを固定する。CI証拠を今回の人間確認と混同しない。

| 項目 | 固定した証拠 |
|---|---|
| main SHA | `4d1ed9dfed9fcfda82cebc9d2286722f53771bda` |
| CI | [Run #906 / 34252860771](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/34252860771)、同じSHA、success |
| CI内訳 | classify-changes、build-and-test、e2eの全jobがsuccess。lint、format:check、build、unit、Chromium E2Eの各stepもsuccess |
| 補助検査 | 同runのH3、Pages open / closed経路の検査stepがsuccess |
| 公開 | [Pages Run #127 / 34252860812](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/34252860812)、同じSHA、success |

これは既存CIの確認であり、今回新しく全実機・全engineを実行したという記録ではない。このPR自身の検査・固定headレビュー結果はPR本文へ追記し、CI番号更新だけの後続PRは作らない。基準タグは作成しない。

## 3. 履歴と現在判断の区別

- [Group 22証拠manifest](../../2D_6_REFERENCE_PROJECT_EVIDENCE.json)の `candidate`、`not-run`、当時のPC利用不可、artifact ID・digest・CI headを変更しない。当時の未実施記録を後日実行したように書き換えない。
- 証拠登録に基づく従来の **18/27** は履歴上の集計として残す。今回の承認だけから各Groupを一律completed、27/27へ更新しない。現在の着手判断は「2D Pro Gate人間承認済み、3D-0調査中」である。
- 互換性表の `verified` 昇格は対象version・fixture・実行証拠をそろえる別手続きであり、今回行わない。Godotや未列挙browserの成功も補完しない。
- Generic Webの配布APIはあるが製品UIから未接続である。今回の承認は未実装UIの完成宣言でも、Group 23の個別代替案の自動採用でもない。
- [旧監査](../../2D_PRO_GATE_AUDIT.md)の未承認・3D停止は日付付き履歴として残す。現在判断は本記録と [ADR-2026-09-27-037](../../DECISION_LOG.md#adr-2026-09-27-037-2d-pro-gate人間承認と3d-0調査開始)を優先する。

## 4. 今回進める範囲と次の作業

承認記録と [3Dライブラリ評価](3D_LIB_EVALUATION.md)を一つのwork packageへまとめる。一次情報・版固定の利用条件確認、リポジトリ外の静的bundle計測、2D非干渉の構成案、未計測項目の明示まで進める。

今回含めないもの: 本体dependency追加、製品3D画面、既存Asset / Layer / Frame / Animationの意味変更、schema・migration・IndexedDB・`.casproj`・export ZIPの変更、互換性ラベル昇格、WebGPU必須化、生成AI内蔵。

[3D四段階計画](../3D_FOUR_STAGE_IMPLEMENTATION_PLAN.md)は引き続き **draft / human review required**。記録場所や比較方法は参考にするが、今回の2D承認を四段階計画全体・新規dependency・保存形式の一括承認とは解釈しない。`3D-GATE-02` の実機比較完了や `3D-0` 全体完了も宣言しない。

PR #277で、同一fixture・同一シナリオによる等価viewerのLinux headless Chromium部分実測を評価記録へ追加した。残る実作業は、PC Chrome実機・iPhone Safari・iPad Safariでの比較、初回表示時間の分離、import完了後のfps、React / TypeScript統合、mount / unmount、実機memory・GPU残留・context loss、外部harnessの保存先と保持期間の決定である。renderer採用、dependency追加、保存形式はその結果と別の人間判断を経てから本体実装へ進める。2D Pro Gateの再承認は不要である。

## 5. PR #276/#277マージ後のcloseout

- 現在のmain: `053ce771baafece520f3003d8edc6e320d53fdea`。PR #276のmerge commitは`ba1bf5dcd468dae7d906bb07561925e30a74616a`、PR #277のmerge commitは現在のmainである。
- main CI: [Run #914](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/36265244137)はsuccess。`classify-changes`はsuccess、`build-and-test`と`e2e`はdocs-only分類でskipped。
- Pages: [Run #129](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/36265244128)はbuild・route確認・deployがsuccess。
- PR #277は`docs/future/3d/reports/3D_LIB_EVALUATION.md`だけを変更し、Linux headless Chromiumの部分runtime実測を記録した。これは`3D-GATE-02`完了、renderer採用、dependency承認を意味しない。
- 旧main SHA`4d1ed9dfed9fcfda82cebc9d2286722f53771bda`、CI #906、Pages #127は、このbaseline作成時の履歴証拠として上書きしない。

## 6. PR #278マージ後の確認記録（PR #279作成前）

- PR #278（`docs: sync 3D post-merge state`）はmainへマージ済みで、merge commitは`bbbaa4374808abd82a8d2af178d34ab399347c5b`である。PR #278はこのbaselineの旧PR #276/#277記録を上書きせず、3D-0 / 3D-GATE-02の現在状態を同期した。
- PR #278マージ後のmain CIは[Run #917](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/36281841101)がsuccessである。docs-only分類のため、`classify-changes`はsuccess、`build-and-test`と`e2e`はskippedである。これは3D実機や製品画面の検証成功を意味しない。
- Pagesは[Run #130](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/36281841086)がsuccessで、build・route確認・deployがsuccessである。これもiPhone/iPad Safariの3D実機証拠ではない。
- PR #279作成前の確認時点ではopen PRがなかった。PR #278の変更は5つのMarkdownに限定され、製品コード、dependency、schema、migration、IndexedDB、`.casproj`、export ZIPは変更していない。
- `3D-GATE-02`は引き続き未完了である。PC Chrome実機（PCなしのためnot-run）、iPhone/iPad Safari、import時間と初回表示時間の分離、import完了後fps、React / TypeScript、mount / unmount、実機memory・GPU残留・context loss、外部harnessの永続保存が残っている。Three.jsは第一候補だが未採用であり、renderer採用・dependency追加・製品3D実装・保存形式の変更には進まない。

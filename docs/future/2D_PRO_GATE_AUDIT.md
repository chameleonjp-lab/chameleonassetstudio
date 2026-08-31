# Group 23: 2D Pro Gate 監査・判断記録

最終更新日: 2026-08-31
対象リポジトリ: chameleonjp-lab/chameleonassetstudio  
正式work package: Group 23 / 2D Pro Gate  
監査開始時の基準main SHA: eaba79d235d1bf55ca85c972a6426de69db9f2dd  
PR #266マージ後main SHA: 22d55f28fca00d70d82fe184ef10165773ef1140  
PR #267マージ後main SHA: 9519ce63b29f8fcb14c62c65459d463e743eede6  
PR #268マージ後main SHA: 2122a67c895c78c07ed7f7ad7978df10dec551ed  
PR #269マージ後main SHA: 9a743a8cdd4b174089fe4580db3d94f0fea2054e  
PR #270マージ後main SHA: 6a025cebbd31fe5ac1f83afd24fd4e8c72ee2236  
PR #272マージ後main SHA: 17d62c49792202ef411124df03e3809ded5f2d8c
文書種別: docs-only audit / decision record  
状態: gate-pending / runtime-verification-unverified

上位文書: docs/IMPLEMENTATION_PLAN.md、docs/future/2D_COMPLETION_ROADMAP.md  
関連文書: docs/future/2D_6_REFERENCE_DOCS_GATE_PLAN.md、docs/future/2D_6_REFERENCE_PROJECT_EVIDENCE.json、docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md

> この文書は、2D Pro Gateを通過したことを示さない。既存の証拠と未確認項目を同じ表へ集め、人間が判断すべき点を明確にするための記録である。

## 1. 今回の目的

Group 22のmerge後に、2D Pro Gateの判定に必要な証拠、未確認項目、文書状態を一つの場所へ整理する。製品機能を追加せず、未確認の結果をverifiedへ変更しない。

## 2. 変更しない範囲

- 製品コード、asset.json、.casproj、JSON Schema、migration、IndexedDB、export ZIP
- 既存のPNG、sheet、atlas、helper API、依存関係、CI workflow
- Unity、Godot、RPG Maker MZのruntime結果
- 物理端末、初回利用者レビュー、代表projectの未実施結果
- 3D実装、3D library評価、WebGPU必須化

## 3. 現在状態

| 項目 | 確認結果 |
|---|---|
| 最新main | 17d62c49792202ef411124df03e3809ded5f2d8c。PR #272のmerge commit。 |
| 現在のopen PR | 0件。PR #272はmainへmerge済み。 |
| Group 23監査開始時のopen PR | 0件。Group 23用branchはPR #266で作成した。 |
| 完了数 | 18/27。Group 19〜22はruntimeまたは実機未確認を含むため、完了数を増やさない。 |
| Group 22 | implemented-candidate / CI-passed / merged / runtime-verification-unverified |
| Group 23監査PR | PR #266で監査記録、PR #267、PR #268、PR #269、PR #270でマージ後状態をmainへ反映し、PR #272で代表projectの自動証拠を追加した。2D Pro Gate自体は未完了。 |
| 代表project台帳 | referenceId 2d-pro-reference-001、status candidate |
| Group 22 PR CI | PR #264 head 4d513fa7a105336f00a51fa2c0ede9ee5d339f17に対するRun #869がsuccess。artifact 9601053891を取得済み。 |
| PR #270マージ後main CI | Run #884がsuccess。docs-only変更のためclassifyのみ実行し、build-and-test / E2Eはskip。 |
| PR #270マージ後Pages | Run #122がsuccess。同じmain SHAでbuild / deployがsuccess。 |
| PR #272固定head CI | [Run #892](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/33248089842)（Actions ID `33248089842`、attempt 2）がsuccess。E2E 205件、H3 1件、Pages open / closed各1件。 |
| PR #272 artifacts | [Generic Web](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/33248089842/artifacts/9713610304)、[Playwright](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/33248089842/artifacts/9713609727)。 |
| 固定head read-only review | 3方向（contract / CI・E2E / scope・Gate）はPASS。artifact内容のGateレビューはnot-run。 |
| 独立review | PR #264のGitHub review投稿とreview threadは0件。Group 22をindependently-verifiedへ昇格しない。 |

## 4. 2D Pro Gate判定表

| ID | 判定項目 | 現在の状態 | 根拠 | Gateへの影響 |
|---|---|---|---|---|
| G23-01 | 必須work package、ADR、docsの対応 | 部分確認 | IMPLEMENTATION_PLAN、2D_COMPLETION_ROADMAP | すべてのruntime・実機条件が揃うまでは完了としない。 |
| G23-02 | 代表projectの作成または取り込みから再出力までの一体実行 | 自動確認（artifact内容レビュー待ち） | PR #272 / 2D_6_REFERENCE_PROJECT_EVIDENCE.json | 代表IDの自動フローは追加済み。artifact内容・人間確認は未完了。 |
| G23-03 | preflight問題の修正から再試行まで | 自動確認（アプリ内修正・artifact内容レビュー待ち） | PR #272 / 2D_6_REFERENCE_DOCS_GATE_PLAN.md | テスト側の正常入力への再試行は確認済みだが、アプリ内での修正操作は未確認。 |
| G23-04 | 同じreference IDでの.casproj再読込と同じ意味の再出力 | 自動確認（artifact内容レビュー待ち） | PR #272 / 2D_6_REFERENCE_PROJECT_EVIDENCE.json | 同じIDのroundtripは自動確認済み。artifact内容・人間確認は未完了。 |
| G23-05 | 初回利用者レビュー | not-run | 2D_6_REFERENCE_PROJECT_EVIDENCE.json | 人間レビュー記録が必要。 |
| G23-06 | PC、iPhone Safari、iPad Safari、Android Chromeの全工程 | not-run | 2D_6_DEVICE_FLOW_CONTRACT.md、RELEASE_CHECKLIST.md | Chromium CIを実機確認へ読み替えない。 |
| G23-07 | Unity 6000.3.21f1 / Godot 4.7.1-stable runtime | partial | 2D_5_UNITY_GODOT_PLAN.md | Godot fixture成功だけでGroup 19をverifiedにしない。 |
| G23-08 | RPG Maker MZ 1.10.0 runtime | not-run | 2D_5_RPGMZ_HELPER_PLAN.md | candidate / import-notesを維持する。 |
| G23-09 | Canvas 2D外部実行確認 | 自動fixture確認 / 外部実行未確認 | PR #272 / 2D_EXPORT_COMPATIBILITY_MATRIX.md | Generic Web fixtureのHTTP・Canvas確認は自動化したが、外部実行のverifiedにはしない。 |
| G23-10 | Group 22固定headの独立review | 部分確認（read-only） | PR #272の固定head 3方向read-only review、PR #264のreviews / review threads | 3方向監査はPASSだが、artifact内容レビューとGitHub review投稿は未完了。 |
| G23-11 | 3D停止条件 | 確認済み | 2D_COMPLETION_ROADMAPの2D Pro Gate章 | 人間承認まで3Dを開始しない。 |

## 5. 監査結果

### BLOCKER

これは製品コードの不具合ではなく、2D Pro Gateを完了扱いにできない証拠上の停止事項である。

- PR #272で、代表IDの意図的な画像欠落の検出 → 修正済み入力の再試行 → Game Check → `.casproj`再読込・再出力、Generic Web package closureを自動確認した。
- ただしこの「修正」はテストが用意した正常入力への再試行であり、アプリ内で利用者がpreflight結果を修正した証拠ではない。artifact内容レビュー、初回利用者レビュー、物理端末、Group 19 / 20 runtime、人間承認は未完了。
- 初回利用者レビューと必須物理端末確認が未実施。
- Unity、Godot、RPG Maker MZの対象version付きruntime判定が完了していない。
- PR #264にGitHub上の独立review投稿がない。
- Group 23の人間承認がない。

### MUST

- candidate、not-run、runtime-verification-unverifiedを維持する。
- CI成功を、物理端末、runtime、初回レビューの代替にしない。
- 新しい製品実装、schema・保存・export・dependency変更、3D実装を開始しない。
- 未確認の対象をverified、完成、互換対応済みとして表示しない。

### SHOULD

- この監査記録をGroup 23の入口として使用する。
- 実機または対象runtimeが利用可能になった時点で、同じreference IDと対象versionを使って結果を追記する。
- Group 19 / 20を実行待ち、Gate後送り、unsupportedのいずれにするか、理由・代替手順・元データ保持方針を人間判断として記録する。

### NOTE

- Run #869はPR #264のheadに対する完全CIであり、Run #873はPR #265マージ後・PR #266前、Run #876はPR #266マージ後・PR #267前、Run #878はPR #267マージ後・PR #268前、Run #880はPR #268マージ後・PR #269前、Run #881はPR #269のhead、Run #882はPR #269マージ後・PR #270前、Run #883はPR #270のhead、Run #884はPR #270マージ後のmain docs-only push CIである。PR headのCIとmerge後mainのCIは別の目的である。
- Run #892（Actions ID `33248089842`、attempt 2）はPR #272 head `6270e59abbb999d00d7c434ff66c76db5836b0fc`に対する全job成功である。mainのRun #893（Actions ID `33253797190`）とPages Run #124（Actions ID `33253797167`）も同じmerge commit `17d62c49792202ef411124df03e3809ded5f2d8c`でsuccess。
- Pages Run #118はPR #266マージ後・PR #267前、Pages Run #119はPR #267マージ後・PR #268前、Pages Run #120はPR #268マージ後・PR #269前、Pages Run #121はPR #269マージ後・PR #270前、Pages Run #122はPR #270マージ後mainの公開確認であり、いずれも2D Pro Gateの実機確認ではない。
- PixiJS / Phaserのverifiedは対象versionのfixture-local範囲に限る。
- Godotのfixture-local成功は、UnityやGroup 19全体のverifiedを意味しない。

## 6. 人間判断が必要な項目

| 判断ID | 判断内容 | A | B | 推奨 |
|---|---|---|---|---|
| G23-D1 | 未確認の実機・runtimeをどう扱うか | 実行環境が整うまでGateを保留する | Gate契約を改訂し、未確認を既知制限として受容する | A。現行正本との矛盾がない。 |
| G23-D2 | Canvas 2Dの扱い | candidateのまま外部実行確認を待つ | Generic Web fixtureをCanvas 2D相当として扱うため契約を改訂する | A。現在の互換性表を維持できる。 |
| G23-D3 | 2D Pro Gateの承認 | 必須証拠と独立review完了後に判断する | 現在の未確認を残したまま承認する | A。現行Gate条件に一致する。 |

この表のA / Bは候補であり、まだ採用していない。

## 7. PR #270マージ後のGroup 23判定

PR #270でこの監査記録のマージ後状態はmainへ反映済みだが、2D Pro Gateの承認記録ではない。


- 判定: 2D Pro Gate未通過
- Group 22: candidateのまま
- 進捗: 18/27
- 互換性、保存形式、export形式: 変更なし
- 新規product code: 変更なし
- 3D: 人間承認まで開始しない
- 次の許可行動: 物理端末・対象runtime・代表project証拠の収集、または人間判断の記録

## 8. 次回引き継ぎ

PCが使用できない間は、物理端末とUnity / RPG Maker MZ runtimeを成功扱いにしない。実行環境が得られた場合は、まずG23-02〜G23-08の証拠を同一reference ID・対象version・固定headへ結び付け、その後に独立reviewと人間承認を再判定する。


## 9. PR #272マージ後のGroup 23証拠同期（2026-08-31）

PR #272は、head `6270e59abbb999d00d7c434ff66c76db5836b0fc`からmerge commit `17d62c49792202ef411124df03e3809ded5f2d8c`としてmainへ反映された。Run #892（Actions ID `33248089842`、attempt 2）は全job成功し、E2E 205件、H3 1件、Pages open / closed各1件を記録した。Generic Web artifactとPlaywright artifactはそれぞれ[9713610304](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/33248089842/artifacts/9713610304)と[9713609727](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/33248089842/artifacts/9713609727)である。

この証拠により、G23-02、G23-03、G23-04、G23-09は自動確認の範囲を更新する。ただしpreflightの「修正」はテスト側で用意した正常入力への再試行であり、アプリ内修正の証拠ではない。artifact内容レビュー、初回利用者レビュー、物理端末、Group 19 / 20 runtime、Group 23の人間承認は未完了である。

判定は2D Pro Gate未通過、Group 22はcandidate、状態はgate-pending / runtime-verification-unverified、進捗は18/27のままとする。人間承認まで新規製品実装と3Dを開始しない。
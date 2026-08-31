# Group 22: 代表プロジェクト・文書整合・最終監査

最終更新日: 2026-08-31
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
正式work package: `2D-6-REFERENCE` + `2D-6-DOCS` + `2D-6-GATE-AUDIT`  
基準main SHA: `17d62c49792202ef411124df03e3809ded5f2d8c`
文書種別: Group 22 implementation handoff / evidence gate  
状態: `implemented-candidate / CI-passed / merged / runtime-verification-unverified`

上位文書: [`2D_COMPLETION_ROADMAP.md`](2D_COMPLETION_ROADMAP.md)、[`2D_FIVE_PERSPECTIVE_REVIEW_ACTION_PLAN_2026-08-13.md`](2D_FIVE_PERSPECTIVE_REVIEW_ACTION_PLAN_2026-08-13.md)  
関連文書: [`2D_6_DEVICE_FLOW_CONTRACT.md`](2D_6_DEVICE_FLOW_CONTRACT.md)、[`2D_6_RECOVERY_OFFLINE_CONTRACT.md`](2D_6_RECOVERY_OFFLINE_CONTRACT.md)、[`2D_6_QUALITY_CONTRACT.md`](2D_6_QUALITY_CONTRACT.md)、[`2D_5_EVIDENCE_LABELS_PLAN.md`](2D_5_EVIDENCE_LABELS_PLAN.md)

> Group 22は、既存機能を新しく見せるための実装ではなく、2D Pro Gateへ進める前に「何を、どの証拠で、どこまで確認したか」を固定する監査工程である。PCを利用できないため、物理端末・対象engineのruntime成功を作らず、未実施を`candidate / not-run`として記録する。

## 1. 目的と境界

### 1.1 目的

- 取り込みから再編集までの代表プロジェクトを一意のIDで追跡する。
- Frame、Animation、origin、anchor、rect / circle collider、scale、複数pageを、既存の機械的な証拠へ対応付ける。
- Game Check、preflight、Generic Web HTTP fixture、`.casproj`別session再読込・同じ意味の再出力を、成功・部分確認・未実施に分ける。
- README、ユーザーガイド、release checklist、future docs、テスト計画の入口を相互に検査する。
- `verified`を作らず、次の人間確認で昇格できる停止条件を残す。

### 1.2 今回変更しないもの

- 製品コード、既存の保存正本、`asset.json`、`.casproj`、schema、migration、export ZIP、既存Atlas、依存関係。
- Generic Web、PixiJS、Phaser、Unity、Godot、RPG Maker MZのruntime結果や互換性ラベル。
- 物理iPhone / iPad / Android / PCブラウザの結果を推測すること。
- 実行していない初回レビュー、preflightの修正→再試行、対象engineのruntimeを成功扱いにすること。

## 2. 代表プロジェクトの定義

機械可読な正本は [`2D_6_REFERENCE_PROJECT_EVIDENCE.json`](2D_6_REFERENCE_PROJECT_EVIDENCE.json) とする。

| 項目 | 固定値 / 必須条件 |
|---|---|
| reference ID | `2d-pro-reference-001` |
| 最低限のゲーム情報 | Frame、Animation、origin、anchor、rectまたはcircle collider |
| 変換・出力情報 | Layer / Frameのscale、trim offset、複数pageのGeneric Web fixture |
| 再編集 | `.casproj`を別sessionで開き、同じ意味の出力を再生成する |
| 正本の状態 | `candidate`。runtime・実機・初回レビューの成功を含まない |

代表projectの初回成功ループは、次の順番で説明する。

1. 画像を作成または取り込む。
2. ゲーム用情報と動きを付ける。
3. Game Checkで見え方と動きを確認する。
4. preflightの問題を理由・対象path・修正場所・再実行方法とともに理解する。
5. Generic Web packageをHTTPで読み、scale・trim・複数page・ゲーム用情報を確認する。
6. `.casproj`を再読込し、同じ意味の出力を再生成する。

## 3. 証拠の対応付け

| ループ | 現行証拠 | Group 22での扱い |
|---|---|---|
| 作成 / 取り込み | `e2e/casproj.spec.ts`、`e2e/import.spec.ts`、`e2e/reference-project-gate.spec.ts` | PR #272で代表IDの自動一体フローを確認。 |
| Frame / Animation | `e2e/animation.spec.ts` | 既存E2Eの支援証拠。FrameとAnimationを同一台帳へ記録する。 |
| origin / anchor / collider | `e2e/gamedata.spec.ts` | rect / circle と保存・reloadを含む支援証拠。 |
| Game Check | `e2e/game-check-mode.spec.ts` | read-only表示、再生、問題表示の支援証拠。保存変更がないことを別Gateで維持する。 |
| preflight | `e2e/game-check-mode.spec.ts`、`e2e/export.spec.ts`、`e2e/reference-project-gate.spec.ts` | 意図的な欠落検出と正常入力への再試行を自動確認。アプリ内修正とartifact内容レビューは未確認。 |
| Generic Web HTTP | `e2e/generic-web.spec.ts`、`tools/group23/genericWebPackageClosure.test.ts`、`public/generic-web-fixture/` | PR #272でHTTP・package closure・Canvas 2D相当のfixtureを自動確認。外部実行のverifiedにはしない。 |
| `.casproj` roundtrip | `e2e/casproj.spec.ts`、`e2e/reference-project-gate.spec.ts` | PR #272で同じreference IDの再読込・再出力の意味一致を自動確認。artifact内容レビューは未確認。 |
| 利用者向け入口 | `e2e/beginner-guide.spec.ts`、`README.md`、`public/guide/` | リンク、title、mobile overflow、現在地と次の操作の入口を監査する。 |

### PR #272で追加された自動証拠

PR #272（head `6270e59abbb999d00d7c434ff66c76db5836b0fc`、merge `17d62c49792202ef411124df03e3809ded5f2d8c`）で、reference ID `2d-pro-reference-001`の意図的な画像欠落検出、修正済み入力の再試行、Game Check、初回出力、削除後の`.casproj`再読込、2回目出力の意味一致を自動確認した。Run #892（Actions ID `33248089842`、attempt 2）は全job成功、E2E 205件、H3 1件、Pages open / closed各1件である。

これはテストが用意した不備入力から正常入力へ再試行する自動証拠であり、アプリ内で利用者がpreflight結果を修正する操作、artifact内容の人間レビュー、初回利用者レビュー、物理端末、対象engine runtimeを成功扱いにしない。

Draft PR #273は、この証拠とGate handoffを正本文書へ同期するdocs＋Gate test変更である。固定head `2e3c5eed97cb7298c1032f091e783a46f71c0b98`のRun #895（Actions ID `33347654457`）はclassify / build-and-test success、unit 87 files / 916 tests success、E2Eは変更分類によりskipだった。Group 22 artifact [9742541791](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/33347654457/artifacts/9742541791)を取得した。これはPR #273の文書・Gate test検証であり、PR #272の代表flow E2Eとは別である。

### 3.1 証拠レベル

- `existing-test-coverage`: 既存testが該当機能を確認している。代表projectを最後まで一体実行したことを意味しない。
- `static-audit`: manifest、文書、参照path、ラベル境界を自動検査する。
- `candidate`: 手順・範囲は固定したが、runtimeまたはartifactがない。
- `not-run`: PC・物理端末・初回利用者レビューなど、現在の環境で実施していない。
- `verified`は、同じsource / fixture / manifest hash、対象version、受入項目、CI artifact、必要な実機記録が揃うまで使用しない。

## 4. 初回レビューと実機Gate

初回レビューは、対象者数・合格基準・記録形式を先に確定してから実行する。今回のmanifestでは次を未実施とする。

- 初回利用者の人数、所要時間、つまずき、成功率の記録。
- PC Chrome / Edge / Firefox、iPhone Safari、iPad Safari、Android Chromeでの全工程。
- 物理端末でのFiles、safe-area、software keyboard、download、メモリの確認。
- Unity / Godot / RPG Maker MZのruntime。既存のcandidate / import-notesを`verified`へ昇格しない。

PCが利用できない間にこの工程を実行することは停止条件である。ChromiumのCI結果を物理端末結果へ読み替えない。

## 5. 自動監査

`tools/group22/referenceGate.test.ts` は次を検査する。

- manifestの必須項目、状態値、必須データ、flowの重複・欠落。
- 証拠として列挙したtest、fixture、guide、release docsの存在。
- README、future index、implementation plan、roadmap、user guide、release checklist間の入口リンク。
- `verified`と記録しながら未実施理由を隠す状態がないこと。
- 2D Pro Gate前に3D開始を示す記載がないこと。

CIでは [`write-group22-record.mjs`](../../tools/evidence/write-group22-record.mjs) がstable manifestと動的run情報を分離した証拠を生成する。動的recordの成功はGroup 22全体やruntime compatibilityの成功を意味しない。

## 6. 完了条件と次の停止条件

Group 22をcompletedへ昇格するには、少なくとも次を同一の代表IDに結び付ける。

1. 作成 / 取り込み、ゲーム用情報、Game Check、preflight修正→再試行、Generic Web HTTP確認、`.casproj`再読込→同じ意味の再出力。
2. 最終状態、download数、reload後の結果、失敗時の正本維持を自動証拠で確認する。
3. 初回レビューの母数と合格基準、利用者向け説明、既知制限を記録する。
4. 必須端末、対象engine、CI artifact、固定head reviewを、成功と未実施に分けて記録する。
5. README、ユーザーガイド、出力形式、互換性表、release checklistの内容が一致する。

PR #264は1〜5のうち静的な台帳と入口監査をmainへ反映し、PR #272は代表IDの自動一体フローとGeneric Web package closureを追加した。runtime未検証・初回レビュー未実施・artifact内容レビュー未実施のため、完了数は増やさない。未完了条件は、PCまたは実機環境が利用可能になった時点で、代表IDの一体実行と人間レビューを行って記録することである。


## 7. Post-merge closeout（2026-08-27）

PR #264（head `4d513fa7a105336f00a51fa2c0ede9ee5d339f17`）はmerge commit `15e252d8339361cd153ac784cba5752189ceeabd`としてmainへ反映された。対応するCI Run #869（Actions ID `32953397489`）は、classify、build-and-test、E2E、H3計測、Pages公開・閉鎖後確認を含む全jobが成功した。Group 22の動的証拠artifactは `9601053891`（`sha256:d8d203289543a13157160bdc6461ea0744e1d591024fe0b32786dc3113465339`）である。

この記録が示すのは、Group 22の静的台帳・文書入口監査がCIを通過してmainへ入ったことだけである。stable manifestは `candidate` のままとし、代表projectの一体実行、preflightの修正→再試行、初回利用者レビュー、物理端末、Group 19 / 20 runtimeを成功扱いにしない。PR #264にはGitHub上の独立review投稿が記録されていないため、`independently-verified`へは昇格させない。

次はGroup 23（2D Pro Gate）である。人間がGateを承認するまで、新しい製品実装と3D実装を開始しない。進捗は18/27のままとする。


## 8. PR #272証拠同期（2026-08-31）

PR #272の自動証拠とmain反映を記録する。固定headは `6270e59abbb999d00d7c434ff66c76db5836b0fc`、merge commitは `17d62c49792202ef411124df03e3809ded5f2d8c`、Run #892（Actions ID `33248089842`、attempt 2）はsuccessである。artifactは [Generic Web](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/33248089842/artifacts/9713610304) と [Playwright](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/33248089842/artifacts/9713609727) に分かれる。

代表IDの自動一体フロー、package closure、Game Check、`.casproj` roundtripを確認済みとして台帳を更新する。ただしstable manifestは `candidate`、artifact内容レビュー・初回利用者レビュー・物理端末・Group 19 / 20 runtimeは `not-run` のままとする。preflightの修正はアプリ内利用者操作の証拠ではない。

次はartifact内容の人間レビュー、アプリ内preflight修正→再試行の確認、初回利用者レビュー、物理端末・対象runtimeの記録である。2D Pro Gate承認まで新しい製品実装と3D実装を開始しない。進捗は18/27のままとする。


## 9. Draft PR #273 handoff（2026-08-31）

PR #273では、PR #272の自動証拠、Run #892、artifactの役割、未確認範囲をGroup 23の正本文書へ同期し、Group 22 Gate testにhandoff CIを追加した。差分はdocs、`2D_6_REFERENCE_PROJECT_EVIDENCE.json`、`tools/group22/referenceGate.test.ts`の9ファイルで、製品実装・schema・保存・export・依存関係・3Dは変更しない。

PR #273の固定head `2e3c5eed97cb7298c1032f091e783a46f71c0b98`に対するRun #895（Actions ID `33347654457`）はclassify / build-and-test success、unit 87 files / 916 tests success、E2Eは変更分類によりskipだった。これは文書・Gate testの検証であり、代表projectのE2Eを新たに実行したものではない。代表flow E2EはPR #272 Run #892として別に記録する。

次の停止条件は、PR #273の最終head 3方向read-only review、PR #272 artifact内容の人間レビュー、アプリ内preflight修正→再試行、初回利用者レビュー、物理端末、対象engine runtime、2D Pro Gate人間承認である。`candidate / not-run`、`gate-pending / runtime-verification-unverified`、進捗18/27、3D停止を維持する。


## 10. Draft PR #274 handoff補正（2026-08-31）

Draft PR #274は、PR #273のマージ後にhandoff証拠を最新headへ更新し、Group 22 artifactの役割・実体名・CI境界を正本文書へ同期するdocs＋Gate test変更である。head `49769a14490e2300e66a238251d9aa7da5ad52cc`のRun #897（Actions ID `33348582105`）はclassify / build-and-test success、unit 87 files / 916 tests success、E2Eは変更分類によりskipだった。Group 22 artifact [9742835911](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/33348582105/artifacts/9742835911)（`group22-reference-project-evidence-33348582105-1`）を取得した。

PR #274の3方向read-only review、PR #272 artifact内容の人間Gateレビュー、アプリ内preflight修正→再試行、初回利用者レビュー、物理端末、対象engine runtime、2D Pro Gate人間承認は未完了である。`candidate / not-run`、`gate-pending / runtime-verification-unverified`、進捗18/27、3D停止を維持する。

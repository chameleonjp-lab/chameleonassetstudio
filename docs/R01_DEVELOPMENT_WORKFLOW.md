# 工程単位の開発・検査

PR #281への実装開始指示を受け、R01からR06へ順に進める。
工程内の製品コード・テスト・ガイド・関連文書は同じPRにまとめる。
調査、必要な試作、実装、検査、Draft PR、CI修正、独立レビューまで続ける。
mergeは人間が判断し、merge後は最新mainから次工程へ進む。
R02以降の保存・出力形式判断は完成計画§8へまとめる。

## 実装中

変更した境界のVitestを指定して実行する。例:
`npx vitest run src/core/storage/autosave.test.ts`。
画面境界は `npm run e2e -- e2e/storage.spec.ts`、
WebKitは `npm run e2e:webkit -- e2e/storage.spec.ts` で対象を絞る。
分類変更は `npm run test:ci-scope` で検査する。
成功済みの無関係な全検査を毎回反復しない。

## 統合PR

最終headで lint、format:check、build、test、test:ci-scope、e2e、e2e:webkitを実行する。
Chromiumは既存の全件を維持する。WebKitは保存・PNG取込・出力・バックアップ・
端末導線の既存テストを実行する。自動WebKitはiPhone Safari実機確認の代替ではない。
独立レビューの重大な指摘は同じPRで直す。未実行は成功として扱わない。

CIは `tools/ci/classify-changes.mjs` を共通で使用する。
Markdownだけなら分類のみ。コード・設定はlint・整形・アプリbuild・unit、
ブラウザに影響する変更はChromium全件とWebKit重要経路を実行する。
分類自体のテストもコード検査に含む。
H3は本体のcore（atlas・rig・model等の依存）、H3・Pages処理、依存・ビルド設定、
workflow変更時に計測と公開／閉鎖検査を行う。UIだけの変更ではH3を繰り返さない。
既存成果物名を保持し、別途アップロードされる3つのエンジン証拠だけを
Playwright総合成果物から除く。他の証拠・過去の記録は保持する。
通常CIのbuildをアプリだけにし、H3は必要な検査経路でビルドする。

## mainと公開

統合結果のtree照合による検査再利用は未実装なので、mainの全検査は維持する。
公開workflowも同じ分類を使い、アプリ、public、Pages/H3処理、依存・ビルド設定の
変更で公開する。Markdown-onlyとE2E-only変更は自動公開しない。
比較元が不明なら全検査・公開対象として扱う。
手動のclose-now / publish-24hは変更分類に関係なく維持する。
公開jobは実際に公開するSHAをビルドし、アプリ・ガイド・H3の経路と
publication recordのsourceCommitを検査してから成果物をdeployへ渡す。
正式出荷時はH3関連確認も実行し、6課題・実機・性能・実出力を同じ版で確認する。
Actionsの14日成果物だけを永続的な出荷記録とせず、版・結果・再現手順・
出力ハッシュをリポジトリに残す。

## 2D・3D共通の検査batch規約

本節を2D/3Dの共通入口とし、[3D実装計画の§9–10](THREE_D_IMPLEMENTATION_PLAN_2026-10-03.md#9-検査をbatchでまとめる運用)ですでに採用したbatch運用を補完する。R01〜R06/Bxx固有の受入・実機・出荷条件を置き換えない。[共有の参考規約](https://github.com/chameleonjp-lab/chameleonjp-browser-game-harness/blob/50229ded69378ed6392453e73856482eb78b7354/references/test-batching.md)のbatch部分だけの適用であり、Studio全体のハーネス採用版は更新しない。

### 開始と編集中

一つの機能・原因修正・レビュー対応をbatchとし、ID、目的・終了条件、対象path、直接/推移依存、壊れ得る契約、risk、関連/全体検査の集合を先に記録する。commit回数や30分のタイマーを作業単位にしない。sourceのほかtest・fixture・設定・lockfile・toolchain・生成物・環境を含む累積影響を確認し、不明なら広い側へ倒す。

上記「実装中」の軽量・関連検査は維持する。保存/schema、入力所有、untrusted asset decode、security/権限等の高リスクな異常系・統合検査は時間を理由に延期しない。コード/設定の全体検査は上記「統合PR」の集合を適用し、browser影響ではChromium全件・WebKit重要経路とCIの`npm run e2e:quality`を含める。H3/Pages影響の検査は既存条件どおりで、公開そのものの許可を追加する規約ではない。

### 途中の全体再実行の延期

次をすべて満たす場合だけ、編集中の全体再実行を延期できる。

1. 同じbatchで実測した全体passがあり、その終了時刻から現在まで0〜30分。直近の関連検査が現在候補で全件passしている。
2. 元passのSHA/tree/dirty内容識別から現在候補までの累積diffを確認済み。直接/推移影響は関連検査で覆い、未検査領域への非影響を説明できる。
3. toolchain・環境・lockfile・設定（runtime/build/testを含む）・test logicが同一で、高リスク変更や未解消のfail/blockedがない。
4. batch終了、最終候補、提出準備、merge/release判断の境界ではない。

30分の起点は全体passの終了時刻に固定し、関連pass・新commitで延長せず次batchへ持ち越さない。延期は`not_run`として理由・未検査領域・次の実行契機を残す。30分を過ぎて作業を続ける際の検査判断、範囲拡大、環境変更、失敗発生、作業境界のいずれか早い時点で全体へ戻す。条件不成立なら必要な全体検査を実行し、無用な定時起動は作らない。

失敗証拠を保ち、原因修正→失敗例と関連検査→必要な全体検査の順で進める。既知failをdocs-only、flaky、時間不足や古いgreenで相殺しない。未実行・blocked・対象外をpassに数えない。

### 区切りとCI分類の境界

区切り・最終提出では現在の提出SHAに必要な全体検査を行う。commit前の実行はtree/全内容・dirty差分の一致を別記録し、現在SHAの必須CIとPR head/merge SHAを区別する。未実行を明記したDraft PR提出は可能だが、検査完了・merge/release受入とは別である。

Markdown-onlyのCI分類は現行`tools/ci/classify-changes.mjs`のまま維持する。これはローカルのrisk判定とは別で、`.md`というだけで仕様・検査手順・生成元への影響を無条件除外しない。資料だけの全体検査は参照/ID/表/差分と変更した契約の整合性を確認する。runtime検査を行わない場合は実行関連内容の同一性、差分一覧、除外根拠・未実行範囲を記録する。過去の証拠を使うなら元検査SHA/時刻も残し、現在候補のruntime passへ読み替えない。

既存server/build成果物の再利用前にsource/tree、assets、依存lock、toolchain、build/test設定・環境のfingerprintを照合する。不一致・不明なら再buildし、依存cache hitをpassにしない。一batchをまとめたpushで自動CIの重複発火を減らすが、backup・協業・必要な途中共有を犠牲にしない。CIに30分キャッシュを実装したとはしない。mainのtree照合による検査再利用は引き続き未実装で、必須check・保護・公開gateも維持する。

### 既存の検査記録への最小追記

台帳は該当工程の既存検査記録を使い、3Dは[証拠レコード§10.1](THREE_D_IMPLEMENTATION_PLAN_2026-10-03.md#101-各工程の証拠レコード)へ統合する。最終SHA確定後の実行は対象PRの検査欄へ追記して同batchに結び付ける。別の恒久台帳を増やさず、過去の結果は不変のまま、不明項目は不明と記録する。単なる資料読取には台帳を要求しない。

- batch ID、目的・終了条件、対象path、影響/依存/risk、関連/全体の検査集合
- 検査したcommit SHA/tree、dirty有無と全内容/差分識別、現在候補、累積diffの比較元/範囲
- 開始/終了（timezone付き）、command、run URL/log、exit/result、expected/actual、fixture/証拠/出力hash
- OS/runtime/toolchain・依存lock・build/test設定・assets/成果物の環境fingerprint（秘密値を除く）
- 同batchの全体baselineのSHA/tree・終了時刻・run参照。無い/不明なら延期不可
- 実行契機、延期した全体の`not_run`・理由・未検査領域・次の契機、既知失敗、修正/再試験との関係、再検査理由
- pass / fail / not_run / blocked / not_applicable、limitationsと対象外の根拠。実機・実出力等を自動検査と混同しない

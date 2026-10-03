# 3D 実装計画のレビュー記録

対象: [実装計画](THREE_D_IMPLEMENTATION_PLAN_2026-10-03.md) / [要件対応表](THREE_D_PLAN_TRACEABILITY_2026-10-03.md)  
上位: merge済みPR #294、main `45bba8889edb37b4ce63c5f7060c9f3cd4512c7a`  
状態: 文書・一次sourceの読み取りレビュー。実行検証ではない。

## 方法と範囲

技術選定の独立調査担当が、公式repositoryの固定tag/commit/package/licenseとloader/exporter/skin APIを読み取り確認した。別の独立計画レビュー担当が、上位要件と計画、対応表を読み、依存関係、保存/復旧、mobile、interop、サービス、検査可能性を確認した。作成担当の自己点検は独立レビューと区別する。

コード、prototype、dependency install、以前停止した3D作業は実行しない。文書の精度と候補のAPI存在を確認しても、renderer採用、実機性能、取消可能なexport、データmigrationの技術成立を実証したとはしない。

## 指摘と処置

| ID | 観点 | 程度 | 指摘 | 処置 |
| --- | --- | --- | --- | --- |
| PLR-01 | 依存pin | HIGH | 旧調査のthree0.186.0と現r186 tagのpackage版が一致しない | DEC-01を0.186.1/commit9b4a2acへ固定候補として訂正。tarball/integrity/lockは採用前gate |
| PLR-02 | untrusted入力 | HIGH | GLTFLoaderは未知requiredをwarningだけにし、weightも正規化し得る | loader前raw検証を必須化。非有限/負/全zero/影響数/URIを正本変換前に検査 |
| PLR-03 | exporter損失 | HIGH | animations既定空・onlyVisible既定true・未解決track skip | 明示export graph/options、前後channel/target/mapping照合、helper除外 |
| PLR-04 | 取消/性能 | HIGH | parseAsyncはAbortSignal/progress保証ではない | S04でworker再構築/画像encoding/terminationを限定検証。未成立なら方式再審査 |
| PLR-05 | mapping/時間 | MEDIUM | nameや事前indexだけでは最終GLB対応を保証できずdurationもkey外で失われる | 最終GLB extras→index map+hash、clip duration/loopをsidecar契約へ |
| PLR-06 | 性能統計 | MEDIUM | 5回のcold測定をp95と扱うと精度が不明 | cold/warmはmedian/worst、応答は100操作以上、frameは60秒以上で分布測定 |
| PLR-07 | 保存GC | HIGH | Undo/Redoとbackup pinが生存集合から抜け、mark後再参照raceがある | DEC-02でhistory/snapshot pin、delete同一transaction内refs/epoch再確認、fencing。F08でrace検査 |
| PLR-08 | 依存gate | HIGH | 採用前に全S01〜06を要求すると完成flowのS06と循環 | G03a評価用取得・G03b工程内限定検証・G03c製品採用、S06はB09/G05へ分離 |
| PLR-09 | 数値受入 | HIGH | 上位が計画に求める誤差/比較時刻/色条件が未定義 | §8.3に位置/角度/weight/時間/pixel/maskを提案固定。失敗後緩和不可 |
| PLR-10 | URL移行 | MEDIUM | 旧URL監査がB00へ先送りでNAV-08を閉じていない | DEC-08に現main entryとPages試験の確認範囲、root/guide/features/h3/新entry fixtureを固定 |
| PLR-11 | 正本の順序 | MEDIUM | 座標/単位/時間/来歴をB07まで曖昧にするとskin/keyへ後付けになる | DEC-02/B01でcanonical契約とsource/derived親hash/rightsを先に固定 |
| PLR-12 | 機能網羅 | MEDIUM | preview PNG/canvas失敗の担当がない | B03へthumbnail/PNG/overlay/読出し失敗を追加、VIEW-06対応 |
| PLR-13 | 権利/skin | MEDIUM | VRM利用条件の矛盾保持、複数mesh/skin fixtureが曖昧 | B08に条件と申告の併存、B05/F04に複数skinと取り違え否定例 |
| PLR-14 | 対応表gate | HIGH | 全MUSTにG02を前提とすると図の作成自身が循環し、G00が文書も止める | 表契約をruntimeと文書へ分離。DOCはG01後に作成し受理がG02 |
| PLR-15 | 予算fixture | MEDIUM | medium測定fixtureが仮compact上限を超え事前拒否される | mediumを512nodes/1024²4枚へ揃え、上限内の通常測定と境界外拒否を区別 |

## 要件の網羅と境界

独立再確認で169IDと優先度の差分0を確認。PERF-01〜08は要件§15.1の全MUSTを継承する。対応表は要件ID、primary工程、DEC、fixture、test、AC、初期状態を結び、依存/完了/戻し方は担当Bxx本文を正とする。本文の横断条件も別行で追跡する。

SHOULDはB11の個別採否待ち、FUTUREは対象外で、基本MUSTの代わりにしない。図成果物は第三PRで作り、このPRには計画の参照要求だけを含める。計画受理と技術採用、実機合格、公開は区別する。

## まだ実証していないこと

- 3D runtime/prototype/実機/独立consumerの実行、cancel可能export、GPU残留、memory上限、schema migrationは未実施。
- npm配布物integrity、必要なtypes/validatorの正確な版と同梱ライセンスは採用前に確認する。
- G00の以前の停止対象確認は未解決。本書は停止回避の手順を提案しない。
- Studio採用ハーネスpinは未確認。共通batch方針の参照をハーネス全体の採用に読み替えない。
- 数値budget/比較閾値は測定開始用の設計提案。実測保証・全端末対応の宣言ではない。

## 最終検査の記録先

文書hash、要件coverage、表列/リンク整合、remote差分、固定headのdocs-only CIはPR本文へ記録する。CIのcode job skipをコード成功とは扱わない。指摘の修正後の独立再確認結果も対象hashと共に残す。

独立最終再確認ではPLR-01〜15の対象修正を確認し、文書整合上の未解消重大指摘・新規矛盾なし。対象はplan SHA-256 `5173fd964d174fac63a6cce6943575b6e5939d6577052b4ff7267ece2ce2a332`、trace SHA-256 `84f2e0ced767bd50b4f377370ad19538c6a2f9ca8be8476b211f2cb97f839645`。runtime成立、実機性能、依存採用、G00解消、公開承認の証拠ではない。

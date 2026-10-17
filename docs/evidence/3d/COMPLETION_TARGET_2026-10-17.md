# 3D 完了ターゲット追補（2026-10-17）

> **レビュー用の正本入口案**: 承認後の3Dの対象版、完成条件、証拠の扱いを本書へ集約する提案。本PRは文書のみで、実装・実機合格・公開・追加開発の承認は含まない。過去資料は履歴として保持し、旧版の完了記述を現在の合格根拠にしない。

以下のC0はローカル実装候補で、コード・派生台帳・実行ログは本PRに含めない。C0はリモート未提出であり、第三者がSHAから取得できる状態ではない。本PRのmain基点とC0の検証対象を混同しない。

## 1. 現在地（統合候補。公開完了ではない）

- 対象ブランチは `feat/completion-integration-20261017`。`origin/main` は `8f985eba42a056c8f74e4296d6100681e610a319`（PR317）であり、今回の変更は **main 未統合**。したがって公開完了・出荷完了とは扱わない。
- PR415 の sec06 merge先 head は `59a411b`、PR414 の sec07 merge先 head は `37dada0`。両者は現在branchへmerge済み。QA-01実decode、SAVE09明示整理、トップ機能表を含む現在の候補source SHAは `29ef7c6907abddaf983ad371ef20006d50d37b3e`。
- 作業開始時点のPR413のchecksは初回観測のみで、追跡・pollは行っていない。計画PR作成時のOPEN PR一覧は0件だった。remote CIの現在の成功は宣言しない。上記C0のclean導入・unit 3,568件・build等は成功。製品E2Eは323成功/3失敗、後続2D関連回帰は35成功で、**候補全体は未合格**。失敗は機能表2件とWebKitの破損画像fixture1件。SAVE09のcrash残参照の自動整理は未実装のまま保持する。[同版検証記録](COMPLETION_VALIDATION_2026-10-17.md)を参照する。
- **実装状態・検証状態・公開状態を分離する。** 実装が存在しても未検証なら `implemented / not verified`、main未統合なら `candidate / not published` と記録する。

## 2. 対象版と完成条件

- `package app 0.1.0` と `native schema 0.3.0` は別物であり、混同しない。今回、版bumpはない。
- 3D完成は viewer、文書、CI、単一ブラウザの表示だけでは成立しない。空からの制作、編集、保存・独立環境復元、成果物、実consumer受渡し、端末・アクセシビリティ・復旧の同一版証拠を要求する。
- 完了判定は、同じ tested source SHAについて **実装済み / 検証済み / 公開済み** を別々に記録し、未実施・未割当・対象外を空欄や `pass` で埋めない。公開はmain統合と公開確認を別ゲートとする。
- docs/future/app nativeization/extensions は未承認の別構想であり、本ターゲットや現行3D完成に混ぜない。

## 3. クリーン環境の再現手順（候補検査）

1. 作業treeを対象SHAに固定し、Node.js/npmの実バージョン、OS、日時、fixture hashを記録する。特定プラットフォーム固有の依存導入はしない。
2. `npm ci` でlockfileから導入する（lockfileが対象版の再現を保証しない場合はその時点でblock）。
3. `npm run lint`、`npm run format:check`、`npm run test`、`npm run test:ci-scope` を実行する。
4. `npm run build` を実行し、`dist/` の生成、manifest/chunk、3D不要時の分離を検査する。
5. cleanなpreviewから成果物を生成し、manifest/schema、hash、ZIP内path、サイズ上限、旧形式拒否を記録する。成果物は実行ログと同じSHAへ紐付ける。
6. browser検査（必要な場合は `npm run e2e` / `npm run e2e:webkit`）と、実機ゲートを別レコードで実行する。headless結果を実機結果の代替にしない。

## 4. 成果物・イベントの受入条件（2D回帰と3D回帰を分離）

同一fixtureで正常系だけでなく、既存specの境界条件まで検査する。ここでの記載は正しい既存specへの割当であり、統合候補ブランチの実装済み保証ではない。

### 4.1 2D event/payload・配布ZIP回帰

- `null` と未設定（`undefined`）は正規値であり、区別して保持・Undo/Redoする。payload自体はデータとして保存するが、payloadをコードとして実行しない。
- 不正なJSON型・参照不能値・サイズ上限超過のみ既存contractどおり拒否する。空/最大/最大超過、未知フィールド、取消・非実行の結果を理由付きで記録し、silent truncationをしない。
- duration/start、反復event（同じframeIdのoccurrenceを含む）、payload、padding、scale、trim、多ページ、1/2/3倍、原点・anchor・判定は **2D側の既存配布spec** として検証する。参照: [R05 output proposal](../../R05_OUTPUT_PROPOSAL.md)、`e2e/event-payload.spec.ts`、`e2e/distribution*.spec.ts`（対象specの実行結果を最終候補SHAへ紐付ける）。
- 旧配布ZIPは一律に新版として扱わない。旧配布ZIPのunsupported/拒否は既存配布契約の検査、新版出力は新版契約の検査として分ける。

### 4.2 3D native回帰

- 3D schemaには2D event/payload/padding/scale/trim/multi-pageの契約を追加しない。3Dでは既存specの秒・clip・origin/anchor/collider・GLB/sidecar・独立consumer受渡しを検証する。参照: [B06 native animation](B06_NATIVE_ANIMATION.md)、[B07 native asset I/O](B07_ASSET_IO.md)。C0上の追加証拠 `docs/evidence/3d/DATA04_PRODUCT_COORDINATE_HANDOFF_2026-10-13.md` は本PR未収録。同名既存資料があってもC0同版証拠とみなさない。
- native backup `0.1.0` / `0.2.0` はcopy upgradeを許可し、原本・旧archiveを保持する既存契約に従う。future/未知schema、壊れたhash、欠損・不正入力は拒否する。参照: [B04 native storage v2](B04_NATIVE_STORAGE_V2.md)。
- native schema `0.3.0`、旧native backup、旧配布ZIP、新版配布ZIPは別specへ割り当てる。未検証の形式を「実装済み」「互換verified」と宣言しない。

## 5. 実機・アクセシビリティ・性能ゲート

対象版、担当、合格条件を記録し、担当未割当は **未割当** のままにする。Chromium/WebKitのlocal previewは実機合格ではない。C0上の補助資料 `docs/evidence/3d/PHYSICAL_DEVICE_ACCESSIBILITY_GATES_2026-10-11.md` は本PR未収録であり、今回の計画には下表と改善計画のA05〜A07を用いる。

| ゲート | 担当 | 対象版 | 合格条件 | 現在状態 |
|---|---|---|---|---|
| PC採用ブラウザ | 未割当 | 最終候補SHA + 採用OS/browser版 | 制作→保存→再開→backup復元→GLBを完走、入力/復旧/性能ログ | 未検証 |
| iPhone Safari / iPad Safari | 未割当 | 最終候補SHA + 採用iOS/iPadOS | portrait/landscape、OS中断・再開、保存復元、操作到達性 | 未検証 |
| Android Chrome | 未割当 | 最終候補SHA + 採用Android/Chrome版 | memory pressure、tab切替、orientation、復旧、成果物 | 未検証 |
| VoiceOver / TalkBack | 未割当 | 上記対象版 | names/roles/states、canvas代替、selection/save/error/offline/recovery告知 | 未検証 |
| Keyboard / Japanese IME | 未割当 | 上記対象版 | composition、空/不正値、Enter/Escape、二重commitなし | 未検証 |
| OS中断・端末性能 | 未割当 | 採用端末/OS | kill・復帰・外部backup復元、採用した性能上限を実測 | 未検証 |

## 6. offline / cold の別ゲート

- **offline shell gate**: 一度shellを読み込んだ後に通信を遮断し、明示されたoffline状態、保存・復旧、不要な通信なしを検査する。
- **cold uncached startup gate**: cacheを消した完全cold状態で、通信もない条件での起動は現時点で未対応/unknownとして扱う。必要資源がないこと、3D非対応経路や救出表示が正しく出ることを確認し、起動成功や合格を推測しない。
- この二つを一つの「offline確認」へまとめない。shell読込後遮断の結果があっても、cold・無通信起動は未passのまま記録する。

## 7. 証拠記録フォーマット

各証拠には `tested source SHA`、対象版、実行日時、clean/cached状態、環境、fixture/hash、コマンド、期待値、実測結果、artifact path/hash、担当、状態（`implemented` / `verified` / `published` / `not run` / `blocked` / `unassigned`）を記録する。現在の検証対象source SHAは `29ef7c6907abddaf983ad371ef20006d50d37b3e`。全件検証・実機受入・公開の完了状態は別に記録する。

過去資料を削除・上書きしない。空placeholderで完了を装わず、未検証は「統合候補ブランチ上の変更、証拠は最終実行後追記」と明記する。

## 8. AIによる操作と将来MCP候補（実装対象外）

現製品の操作面はブラウザーUI、ラベル付きfile input、状態表示、ダウンロードである。意味のあるrole/nameを利用した既存E2Eは操作手順の根拠になるが、UI内部関数を外部向けの安定APIとは扱わない。画像のdrag & dropは2D編集画面の`EditorScreen.tsx`に実装されている。取り込み元・対象ID・座標単位・変更後値・revisionを確認し、生成完了、ブラウザー内保存、ダウンロード開始、OS上のファイル保存を区別する。

現製品にMCP接続実装はない。接続方式・権限・公開APIも未決定であり、今回のコードへ追加しない。将来の別計画で検討する順序は次のとおり。

1. 読み取り: 機能・対応profile、project/revision、対象IDと単位、警告の構造化取得。
2. 差分提示: 変更候補と影響範囲を返し、適用前の正本不変を確認。
3. 変更: expected revisionによる競合拒否、一操作一Undo、実行後revisionと変更値の取得。破壊的操作は明示確認。
4. 成果物取得: MIME・サイズ・hash・対応profile・来歴・未検証範囲を返し、生成と端末保存を別状態で扱う。

これは将来の候補であり、MCP採用・SDK追加・サーバー起動・接続許可を意味しない。特定AI製品やサービスに依存しないcore契約を先に検討する。

## 9. 参照

- [改善要件と実装計画表（議論用）](../../IMPROVEMENT_IMPLEMENTATION_PLAN_2026-10-17.md): 本書の受入条件を変えず、作業順・責任者案・依存・合格条件・証跡・三つの完了状態を整理する。MCPは別レーンとする。
- [R05 出力提案](../../R05_OUTPUT_PROPOSAL.md): payload、反復event、余白、倍率、原点・anchor、旧ZIPの既存specを参照する。ただし同書の過去時点の状態を現在の検証済み根拠へ昇格しない。
- 本書§5と改善計画A05〜A07: 実機・アクセシビリティの受入条件。C0の補助資料を未収録のまま合格根拠へ昇格しない。

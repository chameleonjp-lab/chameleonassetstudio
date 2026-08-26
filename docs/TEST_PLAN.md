# Chameleon Asset Studio テスト計画書

最終更新日: 2026-08-26
対象バージョン: アプリ 0.1.0 / Asset 0.2.0 / Project・export-presets・atlas 0.1.0
詳細な対象一覧の正本: `docs/implementation/TEST_AND_RELEASE.md`

---

## 1. テストの層と実行コマンド

| 層 | コマンド | 内容 |
| --- | --- | --- |
| 型 + ビルド | `npm run build` | tsc --noEmit + vite build |
| Unit（Vitest） | `npm run test` | 純関数・schema・storage・rig・export 生成の検証 |
| E2E（Playwright） | `npm run e2e` | 実ブラウザ（Chromium）でのユーザーフロー検証 |
| Lint / Format | `npm run lint` / `npm run format:check` | ESLint / Prettier |

CI（GitHub Actions）は、最初に変更ファイルを分類する。

- Markdown 文書だけ: 変更分類だけを実行し、build / unit / E2E は省略する。
- コードまたは設定: build-and-test（build / lint / format:check / unit）を実行する。
- `src/`、`e2e/`、ブラウザ表示、依存関係、Playwright、Vite、CI workflow: build-and-test に加えて E2E を実行する。

Markdown の説明文は、コード用の自動整形と一致しないことだけを理由に失敗させない。ローカル E2E は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` の指定が必要な環境がある。

## 2. Unit テストの主な対象

- データ形式: JSON Schema 検証（型別設定、image レイヤーの textureId 必須を含む）、migrate、サンプルデータの妥当性
- storage: IndexedDB CRUD、自動保存キュー、`.casproj` 往復（画像ファイル欠落の書き出し拒否 / 読み込み許容を含む）
- 画像: 取り込み検証（4096 x 4096 境界の受理 / 超過拒否）、画像操作、`decodeImageSource` フォールバック
- リグ: 行列合成・補間・rotationLimit・焼き込み・循環耐性、モーションテンプレート
- 書き出し: atlas 配置と tile 同梱条件、examples / helpers / エンジンガイドの生成内容
- Asset canvas resize: 9点anchorの偶数 / 奇数・拡大 / 縮小、canvas座標fieldの一括追従、非対象値不変、1〜4096整数validation、no-op、種類別canvas外warning
- Atomic Asset batch: 0 / 17件と重複Asset拒否、target直列準備と取消、linked Family fingerprint更新、preview除外、推定byte / 容量warning、Project / Asset / edit Blob / snapshotの原子保存、History再生時のsnapshot非evict
- Import provenance / source contract: source Blob原本bytesのSHA-256、strict source recordと既存open recordのschema互換、旧0.1.0→0.2.0でversion以外とprovenance不在を保持、IndexedDB live / trash / snapshotの原子的migration、sourceだけのSVG / GIF MIME、APNGのPNG canonical化、bundle / revision / snapshotでのTextureRef / Blob MIME一致、SVG / GIF verbatim `.casproj` roundtripとChromium実decode、複製 / flip copyのtexture参照規則、dangling参照のread-only検査、canonical `asset.json`保持とengine向け派生出力への非流出
- Optional image product import: GIF block / PNG chunkのbounded走査、logical screen / IHDRとframe範囲、`acTL`位置・一意性・frame宣言と`fcTL`件数、image/png APNG判別、1〜16frame上限、preflight repeat分類、SVG local fragment受理とDOCTYPE / active要素 / CSS animation / font / event / external href / base URL / CSS external参照・画像関数拒否、malformed SVGのquarantine、generic MIMEの拡張子・signature照合、uniform fps式・informational duration・8fps fallback・1〜240 clamp、有限repeatのloop無効、new Asset gateと既存raster gateの分離、unsupported形式の代替説明
- Import frame set: ASCII数字の自然順と完全同値時の選択順、uniform margin / spacingの行優先格子、0 / 17 cell拒否、各frameで対応layerだけを可視にする完全な`layerStates`、複数新規Asset削除の原子rollback、quarantine対象3分類
- Tileset / Atlas import: tileSize整数・cellSize以下・collision enum、Atlas bounded JSON、exact format / version / file pair、1〜16件、一意frame名、canonical geometry、animation参照、anchor / collider / tile / effect union、5-frame末尾空cell非生成、texture寸法不一致拒否

## 3. E2E テストの主な対象

プロジェクト管理、取り込み、キャンバス編集、画像編集、レイヤー / パーツ、原点・アンカー・判定、フレーム / アニメーション、書き出し（PNG / WebP / JSON / ZIP の中身検証、Blob 欠落時の失敗表示）、`.casproj` ラウンドトリップ、サンプル表示、型別設定、リグ焼き込み、モバイル（縦 / 横 / iPad / タップ対象 / 入力ズーム防止）。Import provenanceは、単枚 / layer追加の1 file = 1 record、元ファイルSHA-256、256px以下の実thumbnail寸法、`.casproj` export → import → save → exportでの保持、touch + 375 x 667 viewportでのreloadと横スクロールなしを確認する。Import frame setは、通常画像batchのpreview取消と1 Undo / Redo、previewのmodal focus・背景button無効化・Ctrl+Z拒否・確定後の履歴整合、連番の自然順・17件超・混在寸法拒否・frame可視性・reload、sheetのloss確認・行優先pixel・source / provenance件数・atlas順、signature / dimension / decode失敗のquarantine、touch + 375 x 667 viewportでの確定・Undo・reload・横overflowなしを確認する。Tileset / Atlasは、Tileset設定・0 animation・collider非生成、実exportの5-frame bundleとtile / effect metadataそれぞれのimport → save → reload → re-export意味比較、空sheet cell非生成、PNG source保持、JSON hash provenanceとraw JSON Blob非保存、外部形式・参照不整合JSONの理由付き拒否とquarantine非追加の直接確認、Desktop / touch tablet / 375 x 667での到達性と44px操作対象を確認する。Asset canvas resizeは、中央anchor拡大の保存 / reload / Undo / Redo、source / edit Blobとtexture sizeの不変、PNG / atlas cell寸法、縮小警告の取消 / 確認と非clamp / 非crop、touch + iPhone SE級viewportの9点anchor / preview / 横スクロールなしを確認する。Atomic Asset batchは、canvas target除外・1 History Undo / Redo・reload、2 Asset paletteのsource不変・snapshot、2 target保存途中失敗の全件rollback、touch + iPhone SE級viewportのtarget選択・progress・取消・横スクロールなしを確認する。

Optional image product importは、safe SVGのraster pixel・source bytes / SHA-256 / provenance・cancel / Undo / Redo / reload、active / external CSS / font SVGの非実行・通信なし・正本不変・quarantine非追加、malformed / invalid UTF-8 SVGのquarantine、空・generic MIMEの安全な正規化、実GIF / APNGの全frame pixel・duration→fps・preflight由来loop・APNG canonical source、codec前の4096px拒否、`ImageDecoder`不在時の先頭frame + 8fps + loss確認、unsupported形式と17frame拒否の正本不変、375 x 667 viewportでの確認・Undo / Redo・reload・横overflowなしを確認する。全frame decodeはskipせずGitHub ActionsのChromiumで実行し、ローカルにbrowser binaryがない場合もCI結果を合格証拠とする。

### 3.1 Optional image importのfollow-up test debt

PR #144 final head `1980ae6`の固定head reviewで、現行不具合ではないが回帰検出を強めるSHOULDとして次を残した。group 11の完了条件には戻さず、取り込みE2Eを次に補強する際の対象とする。

- generic MIMEと拡張子・実signatureが一致しないfileについて、利用者向けalert、Asset不変、quarantine記録までを一続きで確認する。
- `ImageDecoder.isTypeSupported() === false`とconstructor `NotSupportedError`の両方で、先頭frame + 8fps + loss表示へのfallbackを確認する。

### 3.2 Group 12 Timeline / Rig計測・実装Gate（Group 12 completed、B2は2D-6-PERFORMANCEへ延期）

正本は`docs/future/2D_3_TIMELINE_RIG_PLAN.md`。PR #146 merge `cb21ea4`後にH1=E1、H2=L1、H3=M1を人間承認した。T1 Slice AはPR #153で可変時間、event、共通scheduler、検査、保存roundtrip、E1拒否を実装済みである。P1 Slice CはPR #154で静的Part構成Layer差し替え、H2=L1拒否、read-only inspection、1 History、保存roundtripを実装済みである。ADR-2026-07-24-027でA1を採用し、R1をB1 / B2へ分割した。PR #157 final head `834cc38397c300895f50c1efdb86d94f3870a0a8`、merge `bf13cac3db854c30b33e9b2ef97d389a2372e961`でB1をmainへ反映した。CI Run #501は全job成功し、非GitHub・非Opusの固定head独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。B2の資源上限とH3数値は後続人間承認まで未決定とする。ADR-2026-07-27-028でA1+B1を採用したD1はPR #201 final head `25cd3327b93850f1af1733c2b43585e3fa0a667b`、merge `c1d08e3b4cadd7c3a3064ab8e824b17f67feb243`でmainへ反映済みである。CI Run #596はunit 758件、Chromium E2E 166件を含め全job成功し、固定head独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。ADR-2026-07-28-029でA1+B1+C1を採用したD2は、PR #204 final head `8ebeb279e9d7b9ef9a15700d80d4a6cd7ab1d57f`、merge `eeaea39522d0f31bfe786ca0da27176bfd5ee859`でmainへ反映済みである。CI Run #603の最終attemptはunit 763件、Chromium E2E 168件、H3 1件、Pages open / closed各1件を含め全job成功し、failed / flaky / skipped / retryは0件、固定head独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。D2を`implemented / CI-passed / independently-verified / merged`とする。

ADR-2026-07-29-030でP1+A1+B1+C1を採用したD3は、PR #206 final head `ac84b8c2d6141f6353c3e07dbb2dbfae9a2f5c98`、merge `3081495a979d10176a05eb2907e7cede55cc8c9a`でmainへ反映済みである。CI Run #610はunit 769件、Chromium E2E 170件、H3 1件、Pages open / closed各1件を含む31 stepを全成功し、failure / skip / retryは0件、固定headの3方向独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。D3を`implemented / CI-passed / independently-verified / merged`とする。

ADR-2026-07-29-031でA1+B1+C1を採用し、D4 frame alignmentの契約を確定した。契約PR #208 merge `ea67920`で実装前Gateを満了し、PR #209 final head `16f5ae2a62928c92f039710e935f3c66c113b0c1`、merge `5e25d0d4e1a4c6680afdd5f5d05ef51d0f8bdea8`でmodel、専用半透明参照描画、UI-only draft、編集防護、1 History、保存roundtrip、Chromium E2Eをmainへ反映した。CI Run #623はunit 799件、Chromium E2E 176件、H3 1件、Pages open / closed各1件を全成功し、failed / flaky / skippedは0件、固定headの3方向独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。D4を`implemented / CI-passed / independently-verified / merged`とする。D1〜D4の指定3端末確認に加え、2026-08-02の人間判断でT1 / P1 / B1のGroup 12物理Safari Gateも完了扱いとした。B2は未測定・未実装のまま`2D-6-PERFORMANCE`へ延期し、Group 12をcloseoutした。

計測準備は`tools/h3/`に分離する。固定fixtureがL1に適合すること、60 / 120 / 240 Frameのdevice matrix、480 / 960 Frameの明示Node escalation、現行`bakeRigAnimation` / `computeSheetLayout`の直接利用、結果schemaをunit testで固定する。通常のlint、format、typecheck、unit testに含め、専用browser buildも検証する。計測値そのものに合否assertionを置かない。

24時間限定配信では、開始前 / 開始時刻 / 終了直前 / 終了時刻の境界、開始・終了の片方欠落、不正日時、24時間以外の期間をunit testで固定する。公開buildは開始・終了時刻とsource commitを埋め込み、期限後の画面は新規計測を拒否する。恒久的な定期workflowや24時間待機jobを追加せず、Draft PRやPR CIからPagesをdeployしない。

PR CIと公開workflowでは、専用Playwright設定でbuild済みH3ページをChromiumから開き、baselineを3 warm-up / 10 sampleで完了し、download対象と同じJSONが`result.schema.json`を通ることを確認する。Pages構成のsmoke testでは、同じ成果物のrootでサービス本体、`/h3/`でH3を描画し、openとclosedを期待状態の完全一致として別々に確認する。openでは正確な24時間の開始・終了時刻とsource commitもbuild入力へ一致させ、404とpage errorがないことを確認する。結果値の閾値assertion、raw JSONのartifact保存、PlaywrightによるSafari実機Gate代替は行わない。

| Slice | Unit / contract | Chromium E2E・保存 | 実機 |
| --- | --- | --- | --- |
| T1 | `1000/fps` fallback、Frame duration override、反復Frame、loop / event、安全payload、Frame単体複製のevent不変、Asset複製 / flipのevent ID再採番とframeId張替え、delete | mock clock順序、event ID一意性・発火回数、Undo / Redo、reload、IndexedDB、`.casproj`、E1対象の理由付き拒否とPNG / WebP / asset.json / `.casproj`許可 | 2026-08-02の人間判断によりGroup 12の物理Safari Gateを完了扱い。個別操作結果、OS / Safari version、確認時commitは未記録 |
| R1 / B1 | 完全ID graph、再採番対象とTextureRef保持、鏡映式、source不変、double flip、親子 / pivot / bind / limit / scale、有限値・参照・循環・H2=L1、frameCountの有限・安全整数、`1e-6` transform / RGBA oracle | 画面から独立copy作成、新規entryなし・既存Undo / Redo stack完全一致、保存失敗rollback、保存・reload、`.casproj` decode直後exact＋製品importのcontainer ID map適用後exact＋再parity、375 × 667 / 667 × 375 | 2026-08-02の人間判断によりGroup 12の物理Safari Gateを完了扱い。個別操作結果、OS / Safari version、確認時commitは未記録 |
| Slice D1 | 永続変更開始とsnapshot反映のpreview guard、保存しないoccurrence index | PR #201 / CI #596で、375 × 667のpan・zoom・Layer選択、保存編集拒否、IndexedDB完全不変、手動preview停止、停止後の編集再開、反復Frame / loop / rewindの出現位置を確認済み | D1〜D4は2026-08-01〜02にiPhone 17 Pro、iPhone 11 Pro、iPad Pro 2018で確認済み。正確なOS / Safari versionは未記録 |
| Slice D2 | 再生順の前後1出現、loop端、反復Frameの出現位置選択、赤系の「前」・青系の「次」、固定25%、UI-only state | PR #204 / CI #603で、`A → B → A`の1番目・3番目の選択、375 × 667で初期off、前・次の個別切替、再生中非表示、停止後復元、Asset / History不変、reloadでoff、44px、横overflowなしを確認済み | D1〜D4は2026-08-01〜02にiPhone 17 Pro、iPhone 11 Pro、iPad Pro 2018で確認済み。正確なOS / Safari versionは未記録 |
| Slice D3 | 選択中Animationの実在Frame IDを初出順で重複除去、0 Frame・空名拒否、同名許可、一意ID、末尾追加、名前 / Frame変更と削除のexact write-set、`id` / payload / 未知項目 / event順保持、反復Frameの全出現発火。新規追加・明示参照変更ではAnimation外・参照切れFrameを拒否し、既存の無効参照は読込・表示・名前変更で保持する | PR #206 / CI #610で、名前とFrameの明示、Enter / blur各1 History、Enter後blurの二重確定なし、Esc取消、削除確認の取消 / 確定、preview中拒否、Undo / Redo、IndexedDB、reload、375 × 667、44px、16px input、touch emulation、横overflowなしを確認済み | D1〜D4は2026-08-01〜02にiPhone 17 Pro、iPhone 11 Pro、iPad Pro 2018で確認済み。正確なOS / Safari versionは未記録 |
| Slice D4 | 候補の初出順・重複除去、同一Frame拒否、選択Animation / 基準Frame / 対象Frameの一意解決、Layer 0件と選択対象のAnimation / Frame ID・Asset Layer ID重複の拒否、完全LayerState、有限delta / 結果座標、全対象positionへの同一delta、Asset内のexact write-set、通常保存の`Project.updatedAt`同期とその他Project field不変、入力Asset不変、shared Frameのdistinct Animation数・総出現数 | 複数Animation・反復出現fixtureで正確な影響件数表示、基準 / 対象の文字、基準のread-only・半透明表示、対象の通常表示、D2設定不変、1px方向操作とX / Y入力、一時表示中のAsset・History・IndexedDB不変、取消button / Escの個別確認、0差分、確定1 History、Undo / Redo、autosave / reload / `.casproj`、Layer 0件・重複ID・不足data拒否と拒否時永続状態不変、preview guard、375 × 667、44px、16px input、keyboard、touch emulation、入力zoom防止、横overflowなし | D1〜D4は2026-08-01〜02にiPhone 17 Pro、iPhone 11 Pro、iPad Pro 2018で確認済み。正確なOS / Safari versionは未記録 |
| 資源 / B2 | `2D-6-PERFORMANCE`へ延期。生成Frame / LayerState / JSON byte / sheet pixelの境界、理由code、warning / hard capは未実装 | 採用値の直前・一致・超過、超過時Asset / Blob / History / autosave不変は未検証 | 採用上限でのPC / iPhone / iPad product-pathは未測定。Group 12合格証拠へ流用しない |
| P1 | `Part.layerIds`だけのexact write-set、missing / duplicate / empty拒否 / order / 単一ownership / 未所属許可、他field不変 | 既存bake不変、次回bakeだけ反映、1 History、Undo / Redo、reload、`.casproj` | 2026-08-02の人間判断によりGroup 12の物理Safari Gateを完了扱い。個別操作結果、OS / Safari version、確認時commitは未記録 |

T1 Slice Aのunit / contractは`src/core/model/animationTiming.test.ts`、`src/core/export/animationLoss.test.ts`と既存model / schema / storage / export testへ固定する。Chromium E2Eは`e2e/animation.spec.ts`でduration入力、合計時間、Undo / Redo、reload、event開始通知、E1拒否、375 × 667と667 × 375の入力zoom・44px・横overflowを確認する。ローカルにbrowser binaryがない場合もskipへ変えず、GitHub Actionsの全Chromium結果を合格証拠とする。Slice D1は同じ`e2e/animation.spec.ts`でpreview中の保存状態完全不変、許可操作、停止後の再開、反復Frameの出現位置を固定済みである。Slice D2はPR #204で再生順から前後の出現位置を解決するunit / contractと、初期off、前・次の個別表示、再生中の非表示、停止後の復元、保存・History不変、reloadでoffを固定済みである。Slice D3はPR #206で既存mock-clock試験を維持し、event追加・名前変更・Frame変更・削除のexact write-set、同名・空名・0 Frame、全出現発火、履歴、取消、保存・reload、未知項目保持をunit / E2Eへ固定済みである。Slice D4は`src/core/model/frameAlignment.test.ts`、`src/renderers/canvas2d/render.test.ts`、`src/features/editor/editorMutationGuard.test.ts`、`src/core/storage/projectStore.test.ts`、`src/core/storage/casproj.test.ts`へ一意ID preflight、完全LayerState、全positionの同一delta、専用半透明描画、他編集拒否、通常保存metadata、exact roundtripを固定した。`e2e/animation.spec.ts`には共有・反復Frameの影響件数、確定前不変、取消button / 入力中Esc、no-op、1 History、Undo / Redo、D2設定不変、preview guard、reload、`.casproj`、理由付き拒否、375 × 667を6シナリオとして追加した。

P1 Slice Cのunit / contractは`src/core/model/assetOps.test.ts`、`assetInspection.test.ts`、`src/core/rig/rig.test.ts`、`src/core/storage/casproj.test.ts`へ固定する。Chromium E2Eは`e2e/part-layer-replacement.spec.ts`と`e2e/rig.spec.ts`で拒否・取消、他Part所有、H2違反bake refusal、1 History、保存失敗rollback、Undo / Redo、reload、既存bake不変、次回bake反映、375 × 667 / 667 × 375のtouch・長い一覧・44px・横overflowを確認する。Playwrightは実iPhone Safari、safe area、software keyboardの代替にしない。

PR #154 final head `fdf75f0`のCI #492はunit 732件、Chromium 159件、H3 1件、Pages公開・閉鎖各1件を成功し、固定head独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。PR #206 final head `ac84b8c`のCI #610はunit 769件、Chromium 170件、H3 1件、Pages公開・閉鎖各1件を成功し、固定headの3方向独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。PR #209 final head `16f5ae2`のCI #623はunit 799件、Chromium 176件、H3 1件、Pages公開・閉鎖各1件を成功し、failed / flaky / skippedは0件、固定headの3方向独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。D1〜D4の物理iPhone / iPad Safariは確認済みである。T1 / P1 / B1のGroup 12物理Safari Gateは2026-08-02の人間判断で完了扱いとする。B2と性能実測は`2D-6-PERFORMANCE`へ延期し、Group 12の合格証拠へ流用しない。

R1 Slice B1の独立左右反転コピーは、PR #157のE2Eで、現在と同じ新Asset作成操作として画面から実行できること、元Assetが不変であること、新しいHistory entryがなく既存のUndo / Redo stackが前後で完全一致すること、保存失敗時にProject参照・Asset・Blob・画面stateへの新Asset追加を全て取り消すこと、成功後のreloadでも参照と見た目が一致することを確認済みである。

R1 parity fixtureは左右Part、親子3段以上、非zero pivot、bind pose、rotation limit、複数keyframe、負scale、非等方scaleを含める。算出後frameCountが`NaN` / `Infinity` / 安全整数外になる入力は、loop、配列確保、ID採番前に理由付きで拒否する。対応ID mapを使い、transformの絶対差`1e-6`以下、RGBAのalphaと非透明pixelのRGB各channel差1以下を確認する。正規化対象と`.casproj` roundtrip oracleはADR-0022を正本とする。

bake性能はNode core、実browser core、製品pathを分けて測る。coreはwarm-up 3 / 記録10のraw sample、median、nearest-rank p95、fixture hash、生成分と最終AssetのFrame / LayerState、compact / pretty JSON byte、sheet pixelを残す。製品pathは実装後にwarm-up 1 / 記録3でReact、保存、Undo / Redo、reload、`asset.json` / `.casproj` / ZIPを測る。NodeやPlaywright viewportだけでiPhone Gateを通過させない。

### 3.3 Group 13 G1 Slice A（完了）

正本は`docs/future/2D_3_GAME_DATA_PLAN.md`。unitは`src/features/editor/gameDataSafety.test.ts`と`src/core/model/assetOps.test.ts`で、文字列・有限数値だけの編集許可、構造値の型付き表示、現在種別と一致しないtile / gimmick / effect / 全Layer background設定の列挙、設定・属性の意味上のno-opが元Asset参照を返すことを固定する。

Chromium E2Eは`e2e/game-data-safety.spec.ts`で、配列・object・boolean・nullの読み取り専用表示と別属性編集後のexact保持、重複key上書き拒否、Enter / blurの1 History、Enter後blurの二重commitなし、Esc取消、正規化後no-op、Undo / Redo、autosave、reload、`asset.json`、旧設定の種別変更後保持と全種類の個別削除、375 x 667で44px・16px・横overflowなしを確認する。既存`assettypes.spec.ts`と`gamedata.spec.ts`は削除・緩和しない。ローカルでbrowser binaryを取得できない場合もskipへ変えず、GitHub Actions Chromiumの成功を合格証拠とする。物理SafariはGroup 13の追加停止Gateにせず、リリース全体の端末確認へ残す。

PR #217 final head `e28e4de43f6825fdd5f0d206983e0760359f0503`のCI Run #650はunit 803件、Chromium E2E 180件、H3測定、Pages公開・閉鎖経路を全成功した。固定headの3方向独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`で、merge `bc48487ef47de113f96e80cf625b56b0e245efce`としてmainへ反映済みである。

### 3.4 Group 13 O1 Slice B / C

Slice Bはdocs-only契約としてPR #218 / merge `bbe9df960170942ddac67cad737b77fcb93d7e8d`で完了した。Slice Cの製品実装と次の自動検証はPR #219 / #220でmainへ反映済みである。PR #221はassertionの意味を変えずE2Eの非同期待機だけを安定化し、final head `45a41a19153334017801fd0354ffd0f678d9a30b`、merge `65df697e36f53ee20464d7bb74940f8713317d65`としてmainへ反映した。CI Run #669はUnit 78 files / 842 passed、Chromium E2E 184 passed、H3 1 passed、Pages open / closed各1 passedで、failed / flaky / skipped / retryは0件だった。固定headの3方向独立reviewも`BLOCKER 0 / MUST 0 / SHOULD 0`である。Group 13をcloseoutし、完了数を15/27とする。

375 x 667はO1専用E2Eを含むChromiumで確認済みである。物理SafariはGroup 13専用の追加停止Gateにせず、リリース全体の端末確認へ残す。

- schemaと意味検証: rect / circleの完全geometry、`visible`だけの上書き、field単位fallback、field不在、空配列、partial rect / circle、rect / circle同居、recognized override fieldなし、空`colliderId`、予約名fieldのexact保持・非解釈、未知field保持、重複Asset collider ID、Frame内重複参照、dangling参照、shape不一致、非有限値、0以下の寸法を扱う。無効dataを黙って修復・fallbackしない。
- 編集: Frame選択・停止中だけのscope、自動再生完了後のFrame編集selection解除、残る視覚previewが編集権限を与えないこと、rect / circle編集とpreview、`visible`のinherit / show / hide、geometry resetと全reset、未知geometry pathを含む削除警告、未知fieldだけを残すfield単位resetの理由付き拒否と明示的なentry全解除、Enter / blurの最大1 History、Escape取消、deep semantic no-op抑止、非正寸法の理由付き拒否、`visible: false`の再編集を扱う。
- 変換: Frame複製のdeep copy、Asset複製時のID map、左右反転、Family linked mirror / refresh、canvas resizeの同一delta、D4 alignmentでのbyte-equivalent保持、参照中colliderの削除・shape変更拒否を扱う。
- 保存・復旧: History / autosave / IndexedDB、snapshot、reload、旧dataのfield不在維持、新dataの`asset.json` / `.casproj` exact roundtrip、意味不正な手製`.casproj`のimport拒否、容量・保存失敗時rollback、pending autosave破棄、`SaveState.status === 'error'`と元の`errorMessage`の表示保持を扱う。
- 書き出し: PNG / WebP / 単体`asset.json` / `.casproj`は許可し、canonicalな上書きが1件以上あればAtlas API、`atlas.json`、product ZIPをBlob読込・decode・canvas・ZIP生成・downloadより前に理由付きで拒否する。空配列だけでは拒否しない。
- 端末: 375 x 667でtouch、44px target、16px input、横overflowなし、Tab / Enter / Escape、再生中と自動完了後に変更・History・保存が発生しないことを確認する。既存testを削除・skip・緩和せず、CIのfailed / flaky / skippedを0件にする。

`src/core/model/motionContract.fixtures.test.ts`の先行`colliderOverrides` fixtureは、参照先Asset colliderを持つ意味上validなdataへ直す。意味検証をfixtureに合わせて弱めない。物理SafariはSlice B / Cだけの追加停止Gateにはせず、リリース全体の端末確認へ残す。

Slice Cの専用testは、model / resolver / semantic validationを`src/core/model/frameColliderOverrides.test.ts`、Atlas / ZIPのloss判定を`src/core/export/colliderOverrideLoss.test.ts`、製品操作・保存失敗・書き出し・375 x 667を`e2e/collider-overrides.spec.ts`へ固定する。既存のschema、asset操作、複製・反転・linked refresh・canvas resize、storage、`.casproj`、export / Atlas testも同じ契約へ更新し、既存回帰を削除・緩和しない。

### 3.5 Group 14 Preview / Impact（完了）

正本は`docs/future/2D_3_PREVIEW_IMPACT_PLAN.md`。PR #225で初期実装、PR #226 / merge `280ab99d39a4857bb6bd7acd0d8f5479d3650766`でverification hardening、PR #227 final head `95c1e9de81a7c445cbae3e8846a7582c55dd7ded` / merge `217c695f22ee494f0ee2166f44d496de09fa3e8e`で最終補修をmainへ反映した。CI Run #689（Actions ID `31319970728`）はUnit 79 files / 870 passed、Chromium E2E 194 passed、Group 14専用10 tests、H3 1 passed、Pages open / closed各1 passedを成功し、failed / flaky / skipped / retryは0件だった。

acceptance fixtureは当初13 ID + runtime-invalid補強1 IDの計14 IDで、6素材種別の正常状態と5異常状態を検証した。375×667の全画面証拠2枚と353×287のcanvas crop 1枚、fixture hash、before / after / reload snapshotをPlaywright HTML reportへ添付した。artifact IDは`9039925430`、digestは`sha256:2456b487e140a6ef3ada2aa8cec6f94ca15747581d69b651f6b527bebb5d0bde`である。JSON証拠はHTML report内の添付であり、独立した`test-results/`ファイルではない。

no-save oracleは空でないHistoryを使い、before / afterともUndo 2件・Redo 1件を保持したまま、IndexedDB全store、Editor state、`asset.json`、`.casproj`の完全一致を確認した。reload後は保存済みdataと出力を維持し、UI-only state、History、autosaveのsession stateだけが初期化された。Game Check中のdownloadは0件、Atlas ZIP生成bytesは0、Blob URLはactive 0でcreated / revokedが一致した。固定headの仕様・判断、実装・データ契約、テスト・CI・証拠の3方向read-only reviewを完了し、Group 14をcompleted、進捗16/27とする。

このGateは実際のengine読込、distribution UI、物理Safariを検証した証拠ではない。History / autosaveの保存挙動は不変だが、検査用の読み取り専用snapshot観測APIは追加されている。schema、version、migration、IndexedDB配置、`.casproj`、export ZIP、dependency、polygon `unsupported`、現行Atlas拒否境界は変更していない。Group 15はG15-H1〜H3のhandoffと`2D-4-CORE`、`2D-4-SHEET`、`2D-4-SCALE`の製品実装・CI・独立確認・mergeを完了し、進捗は17/27である。次は`2D-4-PACKAGE + 2D-4-PREFLIGHT + 2D-4-GENERIC-WEB`で、distribution UI、engine読込、物理iPhone Safariの確認は後続範囲である。

### 3.6 Group 15 Common Export / Sheet / Scale（契約採用・CORE/SHEET/SCALE完了）

正本は`docs/future/2D_4_CORE_SHEET_SCALE_PLAN.md`。2026-08-11に`G15-C1 A + G15-C2 A + G15-C3 A`を採用し、PR #233（CORE）、PR #236（SHEET）、PR #238（SCALE）をmainへmergeした。PR #238のSCALE実装・CI・親の固定head read-only確認まで完了し、Group 15は17/27工程まで進んだ。次は`2D-4-PACKAGE + 2D-4-PREFLIGHT + 2D-4-GENERIC-WEB`である。

実装handoffは`G15-H1〜H3 A`として完了した。実装PRは次の固定値を使う。

- H1: 新distribution profileのパッケージ直下に`manifest.json`（`chameleon-distribution` / `0.1.0`）。legacy/default ZIPとAtlas `0.1.0`には追加しない。
- H2: packedは明示profile、rotationなし、height降順 → width降順 → canonical frame順の安定shelf配置。pageは`2048×2048`、最大4ページ、`atlas/pages/page-000.png`から3桁連番。paddingはセル間のみ、extrudeは0。
- H3: `1` / `2` / `3`から1つだけ出力し、ZIP名は`{assetName}-distribution-{scale}x.zip`。scale後の符号付き座標は最近傍・同率は絶対値が大きい側へ丸め、`asset.json` / `.casproj`は等倍のまま。

変更対象は`src/core/export/atlas.ts`、`src/core/export/exportAsset.ts`、`src/core/export/helpers.ts`、対応するexport/fixture unit、`e2e/export.spec.ts`、CI artifact検査、`docs/EXPORT_FORMATS.md`とする。`src/core/model/exportPreset.ts`、JSON Schema、version、migration、保存形式、既存Atlas / ZIPは対象外である。

実装PRでは次の受入IDを必須にする。

| ID | 必須確認 |
|---|---|
| G15-CORE-LEGACY | 既定設定で既存Atlas `0.1.0`と既存ZIPの意味・entry pathを維持する。 |
| G15-CORE-NOLOSS | 可変時間、event、Frame別collider上書き、polygonなど現行形式で表現できない入力を、Blob読込・canvas・ZIP生成・downloadより前に理由付きで拒否する。 |
| G15-CORE-REPEAT | 同一入力・同一条件でcanonical JSON、entry順、manifest hash、意味同一性を比較する。PNGの全環境byte一致は要求しない。 |
| G15-SHEET-GRID | 1 / 2 / 5 / 16 frameのfixed grid・行優先・rotationなしと、1 frameの不変性を確認する。 |
| G15-SHEET-PACK | packed明示profileのtie-break、rotationなし、page分割、page上限をfixtureとmanifest検査で固定する。既定profileと混同しない。 |
| G15-SHEET-TRIM | content rect、source size、offset、完全透明Frameを保持する。 |
| G15-SHEET-BLEED | セル間padding・外周なし、extrude初回未採用、Frame rectとhelperの整合をpixel fixtureで確認する。 |
| G15-SCALE-123 | 1x / 2x / 3xの寸法、Atlas座標、origin / anchor / collider / source sizeの丸めと整合を確認する。 |
| G15-COMPAT | 新しいdistribution出力が既存`atlas.json` `0.1.0`と既存ZIPを黙って壊さないことを確認する。 |
| G15-MOBILE | 375×667のtouch、長いwarning、拒否表示、出力開始、download完了を一連で確認する。 |

CI証拠は対象head SHAとworkflow runを明示的に紐付け、failed / flaky / skipped / retryを0件にする。既存testのskip、only、期待値弱体化、timeout緩和で失敗を隠さない。fixture hash、manifest hash、before / after / reload、download件数をartifactへ残し、artifact欠落はwarningではなく失敗とする。

Group 15の必須端末確認はChromium 375×667とする。物理iPhone SafariはGroup 15だけの追加停止Gateにはせず、`docs/RELEASE_CHECKLIST.md`に残るリリース全体の端末Gateとして確認する。

### 3.7 Group 15 2D-4-CORE（実装・CI・独立確認完了）

`2D-4-CORE`のunitは、legacy ZIPにmanifestを追加しないこと、新distributionのmanifest形式・profile・scale、canonical JSON、entry順、SHA-256 hash、fixed-gridのsource size / content offset、既存の理由付き拒否を確認する。unit成功時は`test-results/group15-core-evidence.json`を生成し、CIで欠落を失敗としてartifact化する。

既存`e2e/export.spec.ts`はlegacy ZIPのentry pathを完全一致（WebPは対応環境のみ許可）で確認し、manifestがlegacy ZIPへ混入しないことを確認する。CI Run #707（workflow ID `31478935075`）は`classify-changes`、`build-and-test`、`e2e`の全jobが成功し、CORE証拠artifact ID `9096417804`（digest `sha256:d6868ce878edbc03ad5c9a5986c08c1812691a6c0738df79275ada3529a5b1c7`）とPlaywright artifact ID `9096547560`（digest `sha256:dd88d6496a683190d4264d17a0649f4b7dd7f1bc383c7ef83b406e5b56248077`）を取得した。固定head `d6f28dab5bcbeb38a44ce50caddfe32732c69acc`の親担当read-only独立確認は`BLOCKER 0 / MUST 0`で、ローカルCORE対象unit 38/38、lint、format:check、buildも成功した。packed、trim、padding、multi-page、scale、375×667のdistribution UI、before / after / reloadの全証拠は後続のSHEET / SCALE / UI sliceで追加する。

### 3.8 Group 15 2D-4-SHEET

`2D-4-SHEET`では、fixed-grid / packedの純unit、trim rect、完全透明Frame、セル間padding、rotationなし、extrude=0、2048×2048・最大4ページ、manifest semantic、packed distribution ZIP、legacy ZIP不変を確認した。CI Run #716（Actions ID `31510296044`）は`classify-changes`、`build-and-test`、`e2e`の全jobが成功し、SHEET artifact ID `9108792430`（digest `sha256:4115f8382b18f4d02f1fb8320ab50f5d271040ce1d1439f514b66615fac51513`）、CORE artifact ID `9108792006`（digest `sha256:ddc802084338a77e3377df350bfcd1e7e3c7fae6d10d07a3526efbff7b05e078`）、Playwright artifact ID `9108931876`（digest `sha256:1e81e587f82d0c26d519de558bd0114c263c046b250163e734d977f3432342fe`）を取得した。最終head `d3a178b5614a00f72f1bd0e706b95e28d4c5189b`の固定head 3方向read-only確認は`BLOCKER 0 / MUST 0`で、ローカル対象unit 48/48、lint、format:check、buildも成功した。distribution UIと375×667 product-path E2E、物理iPhone Safariは後続Gateへ残す。


### 3.9 Group 15 2D-4-SCALE（実装・CI・独立確認・merge完了）

`2D-4-SCALE`では、採用済みG15-H3 Aに従い、distribution出力で`1` / `2` / `3`のいずれか1つを選ぶscale、最近傍整数への丸め、scale後のpage preflight、nearest-neighbor描画、manifest metadata、distribution ZIP名、既存legacy ZIP不変を確認した。scaleは`asset.json` / `.casproj`へ保存せず、Atlas `0.1.0`と保存形式も変更していない。

PR #238のfinal headは`c2dc87ee1506f0a68b283eb3accf09d78921011a`、merge commitは`a6f15d0b8bff90323d363827be62804959a0e7b0`である。CI Run #724（workflow ID `31518786336`）は`classify-changes`、`build-and-test`、`e2e`の全jobが成功し、lint、format、build、unit、Chromium E2E、H3 Pages確認まで通過した。SCALE evidence artifact `9112190870`（digest `sha256:00b3fb7b2b266c8ff4eb306d64d1a88b9f0ebfc1733054ea8cff0e0d3573a2e4`）を取得し、親の固定head read-only確認は`BLOCKER 0 / MUST 0`だった。

distribution UI、375×667 product-pathの追加証拠、engine読込、物理iPhone Safariは後続Gateで扱う。

### 3.10 Group 16 Package / Preflight / Generic Web（監査文書反映済み・契約判断待ち）

正本は`docs/future/2D_4_PACKAGE_PREFLIGHT_GENERIC_WEB_PLAN.md`。初回監査基準mainは`d691031`で、docs-only監査はPR #240 / merge `b5401529a552c38147d308d7209ad8483ffd85c4`によりmainへ反映済みである。これは契約採用ではない。Group 16のproduct implementationはまだ開始していない。package入口、sidecar、import notes、verification record、preflightの`block` / `warning` / 秘密情報検出、Generic Web受入証拠の3判断を人間が採用するまで、製品コード・unit・E2E・CI workflowは変更しない。

採用後の必須確認候補は、次のとおりである。

- package入口からmanifest、canonical `asset.json`、sidecar、README、import notes、verification record、画像、複数pageを一貫して参照でき、legacy ZIPとAtlas `0.1.0`を変更しない。
- preflightはassetを変更せず、問題を`code`、`severity`、`path`、`message`で返す。`block`がある場合はBlob読込、decode、canvas、ZIP生成、downloadを開始しない。既存の可変時間・event、Frame別collider上書き、polygonの理由付き拒否を維持する。
- Generic Web / Canvas 2D fixtureはHTTP経由でpackageを読み、frame、trim offset、scale、origin、anchor、rect / circle、animation、複数pageを確認する。通常viewportと`375×667`を対象にする。package内の安定した検証記録と、browser情報、実行日時、console error、download件数を持つCI artifactを同じheadで対応付ける。
- Unitはunsafe path、ASCII大小文字・Unicode NFC名衝突、秘密値、安定順、非破壊性、古いpreflight結果、壊れた参照、package再読込、高速二重開始を確認する。
- package生成後かつdownload前に、全JSON、全参照、entry hash、画像寸法、複数pageを再確認する。失敗時のdownloadは0件とする。
- E2Eは通常成功、`block`、decode失敗、ZIP失敗、download失敗、再試行、`375×667`の長い問題一覧、Generic Webの404・console error、生成・download各1回、Blob URL解放を確認する。
- CI artifactは対象head SHA、fixture hash、package hash、entry一覧とhash、問題一覧、before / after snapshot、download件数、Blob URL件数、browser情報、console errorを残す。artifact欠落、unexpected skip、flaky、retryは合格にしない。
- `.casproj`の別session再読込と意味の同じpackage再生成はGroup 21B・22、distribution製品UIと物理iPhone SafariはGroup 21A・release Gateで確認し、Group 16完了の証拠と混同しない。

このdocs-only監査PRではコード用テストを実行せず、Markdown差分検査とdocs-only分類だけを確認する。採用後の実装PRでは、変更範囲に応じてlint、format、build、unit、E2E、artifact、固定head独立確認を必須とする。

## 4. テスト変更と失敗時の扱い

テストは現在の仕様を確認する手段であり、変更禁止の仕様書ではない。

- 仕様や UI を意図して変更した場合は、理由と新しい期待値を記録してテストを更新してよい。
- テストの準備、待機、IndexedDB 読み取り、Canvas 座標依存に欠陥がある場合は、テストを修正または置き換える。
- 失敗は、実装不具合、テスト不具合、環境不具合に分ける。
- 失敗を隠すだけの削除や skip は行わない。一時的な skip には原因、復帰条件、未検証範囲を書く。

## 5. 実機ブラウザ確認（未実施・リリース前に必要）

自動テストは Chromium のみ。v1.0.0 判定前に次の実機確認を行う（`docs/RELEASE_CHECKLIST.md`）。

- [ ] iPhone Safari / [ ] iPad Safari / [ ] Chrome / [ ] Edge / [ ] Firefox / [ ] Android Chrome
- 確認観点: 主要画面の表示、取り込み → 編集 → 書き出し一連、WebP 書き出しの可否表示、ダウンロード動作（Blob URL）、タッチ操作、iOS Filesからのatlas.json + spritesheet.pngおよびSVG / GIF / APNG選択時のfile MIME、SafariでのSVG rasterize・animated全frameまたは明示fallback、native dialog focus、safe-area、画面キーボード、大きなAtlas / animated画像のmemory

## 6. 性能・メモリ（baselineあり・実機は未実施）

現状性能の測定環境、build / test 参考値、Chromium 未取得で測定できなかった範囲、主スレッド / Worker / cancel / メモリ解放のコード経路は `docs/future/PERFORMANCE_BUDGET.md` を参照する。Codex 環境の値は headless Chromium すら未取得の container 参考値であり、実機・Safari・iPad・iPhone・Android の合格証拠ではない。

- [ ] 4096 x 4096 画像の取り込み〜編集〜書き出しのメモリ使用量計測（実機）
- [ ] 25MB 実画像の decode、編集、書き出し、スマホ可用性確認（実機）
- [ ] 連続編集（画像操作を繰り返す）でメモリが増え続けないことの確認
- [ ] レイヤー数が多い（20+）場合の描画フレームレート確認
- [ ] `2D-6-PERFORMANCE`で採用候補を決めた後、rig bake、React反映、autosave、Undo / Redo、reload、`asset.json` / `.casproj` / ZIPをPC Chromium・iPad Safari・iPhone Safariで各3回測定

## 3.13 Group 22 代表プロジェクト・文書整合監査

正本は [`docs/future/2D_6_REFERENCE_DOCS_GATE_PLAN.md`](future/2D_6_REFERENCE_DOCS_GATE_PLAN.md) と [`docs/future/2D_6_REFERENCE_PROJECT_EVIDENCE.json`](future/2D_6_REFERENCE_PROJECT_EVIDENCE.json) とする。`tools/group22/referenceGate.test.ts` は、代表ID、必須データ、既存E2E・Generic Web fixture・ガイド・release入口の存在、`candidate / not-run` 境界、3D停止条件を検査する。

- 既存の `e2e/casproj.spec.ts`、`animation.spec.ts`、`gamedata.spec.ts`、`game-check-mode.spec.ts`、`generic-web.spec.ts` は支援証拠として参照する。
- 既存testの個別成功を、同一代表projectの作成 → Game Check → preflight修正 → HTTP fixture → `.casproj`再読込の一体成功へ読み替えない。
- 初回利用者レビュー、PC / iPhone / iPad / Androidの実機、Group 19 / 20 runtimeは未実施のまま `verified` へ昇格させない。
- `npm run evidence:group22` はstable manifestとCI run情報を分離した動的証拠を生成する。artifact欠落はCIで失敗させる。

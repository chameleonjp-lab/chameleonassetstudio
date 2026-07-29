# Chameleon Asset Studio テスト計画書

最終更新日: 2026-07-29
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

### 3.2 Group 12 Timeline / Rig計測・実装Gate（T1 / P1 / B1 / D1〜D3実装・独立検証・merge済み、D4契約済み・製品未着手、B2保留）

正本は`docs/future/2D_3_TIMELINE_RIG_PLAN.md`。PR #146 merge `cb21ea4`後にH1=E1、H2=L1、H3=M1を人間承認した。T1 Slice AはPR #153で可変時間、event、共通scheduler、検査、保存roundtrip、E1拒否を実装済みである。P1 Slice CはPR #154で静的Part構成Layer差し替え、H2=L1拒否、read-only inspection、1 History、保存roundtripを実装済みである。ADR-2026-07-24-027でA1を採用し、R1をB1 / B2へ分割した。PR #157 final head `834cc38397c300895f50c1efdb86d94f3870a0a8`、merge `bf13cac3db854c30b33e9b2ef97d389a2372e961`でB1をmainへ反映した。CI Run #501は全job成功し、非GitHub・非Opusの固定head独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。B2の資源上限とH3数値は後続人間承認まで未決定とする。ADR-2026-07-27-028でA1+B1を採用したD1はPR #201 final head `25cd3327b93850f1af1733c2b43585e3fa0a667b`、merge `c1d08e3b4cadd7c3a3064ab8e824b17f67feb243`でmainへ反映済みである。CI Run #596はunit 758件、Chromium E2E 166件を含め全job成功し、固定head独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。ADR-2026-07-28-029でA1+B1+C1を採用したD2は、PR #204 final head `8ebeb279e9d7b9ef9a15700d80d4a6cd7ab1d57f`、merge `eeaea39522d0f31bfe786ca0da27176bfd5ee859`でmainへ反映済みである。CI Run #603の最終attemptはunit 763件、Chromium E2E 168件、H3 1件、Pages open / closed各1件を含め全job成功し、failed / flaky / skipped / retryは0件、固定head独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。D2を`implemented / CI-passed / independently-verified / merged`とする。

ADR-2026-07-29-030でP1+A1+B1+C1を採用したD3は、PR #206 final head `ac84b8c2d6141f6353c3e07dbb2dbfae9a2f5c98`、merge `3081495a979d10176a05eb2907e7cede55cc8c9a`でmainへ反映済みである。CI Run #610はunit 769件、Chromium E2E 170件、H3 1件、Pages open / closed各1件を含む31 stepを全成功し、failure / skip / retryは0件、固定headの3方向独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。D3を`implemented / CI-passed / independently-verified / merged`とする。

ADR-2026-07-29-031でA1+B1+C1を採用し、D4 frame alignmentの契約を確定した。D4製品実装は本docs-only決定PRのmerge後に別Draft PRで開始する。B2、物理iPhone Safari、Group 12完了判定は保留する。

計測準備は`tools/h3/`に分離する。固定fixtureがL1に適合すること、60 / 120 / 240 Frameのdevice matrix、480 / 960 Frameの明示Node escalation、現行`bakeRigAnimation` / `computeSheetLayout`の直接利用、結果schemaをunit testで固定する。通常のlint、format、typecheck、unit testに含め、専用browser buildも検証する。計測値そのものに合否assertionを置かない。

24時間限定配信では、開始前 / 開始時刻 / 終了直前 / 終了時刻の境界、開始・終了の片方欠落、不正日時、24時間以外の期間をunit testで固定する。公開buildは開始・終了時刻とsource commitを埋め込み、期限後の画面は新規計測を拒否する。恒久的な定期workflowや24時間待機jobを追加せず、Draft PRやPR CIからPagesをdeployしない。

PR CIと公開workflowでは、専用Playwright設定でbuild済みH3ページをChromiumから開き、baselineを3 warm-up / 10 sampleで完了し、download対象と同じJSONが`result.schema.json`を通ることを確認する。Pages構成のsmoke testでは、同じ成果物のrootでサービス本体、`/h3/`でH3を描画し、openとclosedを期待状態の完全一致として別々に確認する。openでは正確な24時間の開始・終了時刻とsource commitもbuild入力へ一致させ、404とpage errorがないことを確認する。結果値の閾値assertion、raw JSONのartifact保存、PlaywrightによるSafari実機Gate代替は行わない。

| Slice | Unit / contract | Chromium E2E・保存 | 実機 |
| --- | --- | --- | --- |
| T1 | `1000/fps` fallback、Frame duration override、反復Frame、loop / event、安全payload、Frame単体複製のevent不変、Asset複製 / flipのevent ID再採番とframeId張替え、delete | mock clock順序、event ID一意性・発火回数、Undo / Redo、reload、IndexedDB、`.casproj`、E1対象の理由付き拒否とPNG / WebP / asset.json / `.casproj`許可 | 長いtimeline、keyboard、入力zoom、44px、縦横 |
| R1 / B1 | 完全ID graph、再採番対象とTextureRef保持、鏡映式、source不変、double flip、親子 / pivot / bind / limit / scale、有限値・参照・循環・H2=L1、frameCountの有限・安全整数、`1e-6` transform / RGBA oracle | 画面から独立copy作成、新規entryなし・既存Undo / Redo stack完全一致、保存失敗rollback、保存・reload、`.casproj` decode直後exact＋製品importのcontainer ID map適用後exact＋再parity、375 × 667 / 667 × 375 | B1 merge Gateには採用上限の実機合格を要求しない。物理Safari確認はGroup 12 closeoutへ残す |
| Slice D1 | 永続変更開始とsnapshot反映のpreview guard、保存しないoccurrence index | PR #201 / CI #596で、375 × 667のpan・zoom・Layer選択、保存編集拒否、IndexedDB完全不変、手動preview停止、停止後の編集再開、反復Frame / loop / rewindの出現位置を確認済み | 物理iPhone SafariはGroup 12 closeoutへ残す |
| Slice D2 | 再生順の前後1出現、loop端、反復Frameの出現位置選択、赤系の「前」・青系の「次」、固定25%、UI-only state | PR #204 / CI #603で、`A → B → A`の1番目・3番目の選択、375 × 667で初期off、前・次の個別切替、再生中非表示、停止後復元、Asset / History不変、reloadでoff、44px、横overflowなしを確認済み | 物理iPhone SafariはGroup 12 closeoutへ残す |
| Slice D3 | 選択中Animationの実在Frame IDを初出順で重複除去、0 Frame・空名拒否、同名許可、一意ID、末尾追加、名前 / Frame変更と削除のexact write-set、`id` / payload / 未知項目 / event順保持、反復Frameの全出現発火。新規追加・明示参照変更ではAnimation外・参照切れFrameを拒否し、既存の無効参照は読込・表示・名前変更で保持する | PR #206 / CI #610で、名前とFrameの明示、Enter / blur各1 History、Enter後blurの二重確定なし、Esc取消、削除確認の取消 / 確定、preview中拒否、Undo / Redo、IndexedDB、reload、375 × 667、44px、16px input、touch emulation、横overflowなしを確認済み | 物理iPhone Safariのsoftware keyboard、safe area、実touch、orientationはGroup 12 closeoutへ残す |
| Slice D4 | 候補の初出順・重複除去、同一Frame拒否、選択Animation / 基準Frame / 対象Frameの一意解決、Layer 0件と選択対象のAnimation / Frame ID・Asset Layer ID重複の拒否、完全LayerState、有限delta / 結果座標、全対象positionへの同一delta、Asset内のexact write-set、通常保存の`Project.updatedAt`同期とその他Project field不変、入力Asset不変、shared Frameのdistinct Animation数・総出現数 | 複数Animation・反復出現fixtureで正確な影響件数表示、基準 / 対象の文字、基準のread-only・半透明表示、対象の通常表示、D2設定不変、1px方向操作とX / Y入力、一時表示中のAsset・History・IndexedDB不変、取消button / Escの個別確認、0差分、確定1 History、Undo / Redo、autosave / reload / `.casproj`、Layer 0件・重複ID・不足data拒否と拒否時永続状態不変、preview guard、375 × 667、44px、16px input、keyboard、touch emulation、入力zoom防止、横overflowなし | 物理iPhone Safariのsoftware keyboard、safe area、実touch、orientationはGroup 12 closeoutへ残す |
| 資源 / B2 | 生成Frame / LayerState / JSON byte / sheet pixelの境界、理由code、warning / hard cap | 採用値の直前・一致・超過、超過時Asset / Blob / History / autosave不変 | 採用上限でbake、操作応答、PC / iPhone / iPad Safari reload / crashなし |
| P1 | `Part.layerIds`だけのexact write-set、missing / duplicate / empty拒否 / order / 単一ownership / 未所属許可、他field不変 | 既存bake不変、次回bakeだけ反映、1 History、Undo / Redo、reload、`.casproj` | touch選択、長いLayer一覧、keyboard後の確定 / 取消 |

T1 Slice Aのunit / contractは`src/core/model/animationTiming.test.ts`、`src/core/export/animationLoss.test.ts`と既存model / schema / storage / export testへ固定する。Chromium E2Eは`e2e/animation.spec.ts`でduration入力、合計時間、Undo / Redo、reload、event開始通知、E1拒否、375 × 667と667 × 375の入力zoom・44px・横overflowを確認する。ローカルにbrowser binaryがない場合もskipへ変えず、GitHub Actionsの全Chromium結果を合格証拠とする。Slice D1は同じ`e2e/animation.spec.ts`でpreview中の保存状態完全不変、許可操作、停止後の再開、反復Frameの出現位置を固定済みである。Slice D2はPR #204で再生順から前後の出現位置を解決するunit / contractと、初期off、前・次の個別表示、再生中の非表示、停止後の復元、保存・History不変、reloadでoffを固定済みである。Slice D3はPR #206で既存mock-clock試験を維持し、event追加・名前変更・Frame変更・削除のexact write-set、同名・空名・0 Frame、全出現発火、履歴、取消、保存・reload、未知項目保持をunit / E2Eへ固定済みである。Slice D4は既存のFrame / LayerTransform / History / preview guardを再利用し、一意ID preflight、完全LayerState、全positionの同一delta、影響件数表示、確定前不変、取消button / Esc、no-op、確定1 History、D2設定不変、通常保存metadata、保存roundtripを同じmodel / storage / E2E領域へ追加する。

P1 Slice Cのunit / contractは`src/core/model/assetOps.test.ts`、`assetInspection.test.ts`、`src/core/rig/rig.test.ts`、`src/core/storage/casproj.test.ts`へ固定する。Chromium E2Eは`e2e/part-layer-replacement.spec.ts`と`e2e/rig.spec.ts`で拒否・取消、他Part所有、H2違反bake refusal、1 History、保存失敗rollback、Undo / Redo、reload、既存bake不変、次回bake反映、375 × 667 / 667 × 375のtouch・長い一覧・44px・横overflowを確認する。Playwrightは実iPhone Safari、safe area、software keyboardの代替にしない。

PR #154 final head `fdf75f0`のCI #492はunit 732件、Chromium 159件、H3 1件、Pages公開・閉鎖各1件を成功し、固定head独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。PR #206 final head `ac84b8c`のCI #610はunit 769件、Chromium 170件、H3 1件、Pages公開・閉鎖各1件を成功し、固定headの3方向独立reviewは`BLOCKER 0 / MUST 0 / SHOULD 0`だった。物理iPhone Safariの項目はGroup 12 closeoutまで未完了として維持する。

R1 Slice B1の独立左右反転コピーは、PR #157のE2Eで、現在と同じ新Asset作成操作として画面から実行できること、元Assetが不変であること、新しいHistory entryがなく既存のUndo / Redo stackが前後で完全一致すること、保存失敗時にProject参照・Asset・Blob・画面stateへの新Asset追加を全て取り消すこと、成功後のreloadでも参照と見た目が一致することを確認済みである。

R1 parity fixtureは左右Part、親子3段以上、非zero pivot、bind pose、rotation limit、複数keyframe、負scale、非等方scaleを含める。算出後frameCountが`NaN` / `Infinity` / 安全整数外になる入力は、loop、配列確保、ID採番前に理由付きで拒否する。対応ID mapを使い、transformの絶対差`1e-6`以下、RGBAのalphaと非透明pixelのRGB各channel差1以下を確認する。正規化対象と`.casproj` roundtrip oracleはADR-0022を正本とする。

bake性能はNode core、実browser core、製品pathを分けて測る。coreはwarm-up 3 / 記録10のraw sample、median、nearest-rank p95、fixture hash、生成分と最終AssetのFrame / LayerState、compact / pretty JSON byte、sheet pixelを残す。製品pathは実装後にwarm-up 1 / 記録3でReact、保存、Undo / Redo、reload、`asset.json` / `.casproj` / ZIPを測る。NodeやPlaywright viewportだけでiPhone Gateを通過させない。

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
- [ ] Group 12 B2で採用した上限のrig bake、React反映、autosave、Undo / Redo、reload、`asset.json` / `.casproj` / ZIPをPC Chromium・iPad Safari・iPhone Safariで各3回測定

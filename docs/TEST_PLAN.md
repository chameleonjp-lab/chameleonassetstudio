# Chameleon Asset Studio テスト計画書

最終更新日: 2026-07-23
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

### 3.2 Group 12 Timeline / Rig計測・実装Gate（T1 Slice A実装）

正本は`docs/future/2D_3_TIMELINE_RIG_PLAN.md`。PR #146 merge `cb21ea4`後にH1=E1、H2=L1、H3=M1を人間承認した。T1 Slice Aでは可変時間、event、共通scheduler、検査、保存roundtrip、E1拒否を実装する。R1 / P1とH3数値budgetは先取りせず、H3数値は`docs/future/2D_3_H3_MEASUREMENT_PROTOCOL.md`の実測と後続人間承認まで未決定とする。

計測準備は`tools/h3/`に分離する。固定fixtureがL1に適合すること、60 / 120 / 240 Frameのdevice matrix、480 / 960 Frameの明示Node escalation、現行`bakeRigAnimation` / `computeSheetLayout`の直接利用、結果schemaをunit testで固定する。通常のlint、format、typecheck、unit testに含め、専用browser buildも検証する。計測値そのものに合否assertionを置かない。

24時間限定配信では、開始前 / 開始時刻 / 終了直前 / 終了時刻の境界、開始・終了の片方欠落、不正日時、24時間以外の期間をunit testで固定する。公開buildは開始・終了時刻とsource commitを埋め込み、期限後の画面は新規計測を拒否する。恒久的な定期workflowや24時間待機jobを追加せず、Draft PRやPR CIからPagesをdeployしない。

PR CIと公開workflowでは、専用Playwright設定でbuild済みH3ページをChromiumから開き、baselineを3 warm-up / 10 sampleで完了し、download対象と同じJSONが`result.schema.json`を通ることを確認する。Pages構成のsmoke testでは、同じ成果物のrootでサービス本体、`/h3/`でH3を描画し、openとclosedを期待状態の完全一致として別々に確認する。openでは正確な24時間の開始・終了時刻とsource commitもbuild入力へ一致させ、404とpage errorがないことを確認する。結果値の閾値assertion、raw JSONのartifact保存、PlaywrightによるSafari実機Gate代替は行わない。

| Slice | Unit / contract | Chromium E2E・保存 | 実機 |
| --- | --- | --- | --- |
| T1 | `1000/fps` fallback、Frame duration override、反復Frame、loop / event、安全payload、Frame単体複製のevent不変、Asset複製 / flipのevent ID再採番とframeId張替え、delete | mock clock順序、event ID一意性・発火回数、Undo / Redo、reload、IndexedDB、`.casproj`、E1対象の理由付き拒否とPNG / WebP / asset.json / `.casproj`許可 | 長いtimeline、keyboard、入力zoom、44px、縦横 |
| R1 | 完全ID graph、鏡映式、source不変、double flip、親子 / pivot / bind / limit / scale、`1e-6` transform / RGBA oracle | 全Frameのbake parity、Undo / Redo、reload、`.casproj` decode直後exact＋製品importのcontainer ID map適用後exact＋再parity、上限超過の原子的拒否 | 採用上限でbake、操作応答、Safari reload / crashなし |
| P1 | `Part.layerIds`だけのexact write-set、missing / duplicate / empty拒否 / order / 単一ownership / 未所属許可、他field不変 | 既存bake不変、次回bakeだけ反映、1 History、Undo / Redo、reload、`.casproj` | touch選択、長いLayer一覧、keyboard後の確定 / 取消 |

T1 Slice Aのunit / contractは`src/core/model/animationTiming.test.ts`、`src/core/export/animationLoss.test.ts`と既存model / schema / storage / export testへ固定する。Chromium E2Eは`e2e/animation.spec.ts`でduration入力、合計時間、Undo / Redo、reload、event開始通知、E1拒否、375 × 667と667 × 375の入力zoom・44px・横overflowを確認する。ローカルにbrowser binaryがない場合もskipへ変えず、GitHub Actionsの全Chromium結果を合格証拠とする。

R1 parity fixtureは左右Part、親子3段以上、非zero pivot、bind pose、rotation limit、複数keyframe、負scale、非等方scaleを含める。対応ID mapを使い、transformの絶対差`1e-6`以下、RGBAのalphaと非透明pixelのRGB各channel差1以下を確認する。正規化対象と`.casproj` roundtrip oracleはADR-0022を正本とする。

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
- [ ] Group 12の採用候補上限でrig bake、React反映、autosave、Undo / Redo、reload、`asset.json` / `.casproj` / ZIPをPC Chromium・iPad Safari・iPhone Safariで各3回測定

# Chameleon Asset Studio Group 17 契約監査・実装 handoff

最終更新日: 2026-08-14  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
正式work package: `2D-4-PIXIJS + 2D-4-PHASER + 2D-4-DOCS`  
基準main SHA: `9d33306fd7ad340065dac22548c218a8c4500383`  
文書種別: docs-only 契約監査・人間判断 handoff  
状態: `human-decision-pending / implementation not-started`

上位文書: `docs/IMPLEMENTATION_PLAN.md`, `docs/future/2D_COMPLETION_ROADMAP.md`  
関連文書: `docs/future/2D_4_PACKAGE_PREFLIGHT_GENERIC_WEB_PLAN.md`, `docs/EXPORT_FORMATS.md`, `docs/ENGINE_INTEGRATION.md`, `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`

> Group 16のGeneric Web packageはPR #242でmainへmerge済みである。Group 17では、そのpackageと既存AtlasをPixiJS / Phaserの実ブラウザfixtureから読み込み、対象versionを限定して確認する。PixiJSやPhaserのプロジェクト全体生成、標準形式への完全互換、schema・保存形式・既存package入口の変更は今回の範囲に含めない。

## 1. 現在確認できる事実

| 項目 | 確認結果 | Group 17への意味 |
|---|---|---|
| Group 16 | PR #242 final head `6616ad30fdae7a05f98e0a0146ce69555bab1bfa`、merge `711bcec268d6e732a24c0c787c6054b41e415c27`、CI Run #765全job成功。 | Generic Web package、複数page、trim / offset、scale、sidecarの入力を再利用できる。 |
| Group 17 Gate A | docs-only handoff PR #243、merge `9d33306fd7ad340065dac22548c218a8c4500383`。 | 契約文書はmainへ反映済み。G17-C1〜C3の採用（Gate B）とproduct implementation開始（Gate C）は未完了。 |
| 既存PixiJS | `src/core/export/examples.ts`と`helpers.ts`にPixiJS用HTML / helperがある。現在のHTMLは`pixi.js@8`というメジャー指定である。 | 対象versionをfixtureでは固定し、既存HTMLの扱いをdocsで明確にする。 |
| 既存Phaser | Phaser 4.2.0のHTML / helperがあり、unitは生成文字列を確認している。 | 実ブラウザでの読込・表示・animation確認を追加する。 |
| 現行E2E | Generic Web / Canvas 2DのHTTP fixtureはあるが、PixiJS / Phaserの実行fixtureはない。 | 各engineを別fixture・別artifactで検証する。 |
| dependency | 本体の`package.json` / `package-lock.json`にPixiJS / Phaserは追加されていない。 | 本体bundleへ追加せず、既存のCDN方式を使う候補とする。 |
| 既存package | `package-manifest.json`は`generic-web-v1`専用で、`targets/generic-web.json`を参照する。 | PixiJS / Phaser用targetを既存packageへ混ぜない。 |

## 2. 今回の目的

Group 17の完了時に、次の範囲だけを対象version付きで説明できるようにする。

1. PixiJSがHTTP経由で画像とmanifestを読み込み、frame、trim、origin、animationを表示する。
2. PhaserがHTTP経由で画像とmanifestを読み込み、frame、trim、origin、animationを表示する。
3. PixiJS / Phaserで確認した範囲だけを`verified`と記録し、他version・他形式・全機能へ広げない。
4. export手順、import notes、既知の制限、検証証拠をdocsへ反映する。

## 3. 対象と対象外

### 3.1 対象

- PixiJS用HTTP fixtureとPhaser用HTTP fixtureを分離して作る。
- fixtureからGroup 16のdistribution manifest、複数page、sidecar、画像を読み込む。
- frame rect、trim後のcontentRect / contentOffset、scale、origin、anchor、rect / circle collider、固定fps animationの順番を確認する。
- 通常viewportとChromium `375×667`で表示を確認する。
- fixtureごとに、対象version、fixture hash、manifest hash、browser version、viewport、console error、download件数、読込page数をartifactへ保存する。
- `docs/EXPORT_FORMATS.md`、`docs/ENGINE_INTEGRATION.md`、`docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`へ、対象versionと制限を反映する。

### 3.2 対象外

- PixiJS / Phaserの本体をアプリのnpm dependencyへ追加すること。
- PixiJSのApplication全体、PhaserのScene全体、project template、plugin、addonを自動生成すること。
- ChameleonのmanifestをPixiJS標準atlas JSONまたはPhaser標準atlas / Aseprite JSONと同一視すること。
- variable duration、event、polygon、frame別collider overrideなど、現行exportが表現できない情報を無理に変換すること。
- `asset.json`、`.casproj`、schema、migration、IndexedDB、History、既存Atlas `0.1.0`、legacy ZIP、Group 16 package入口を変更すること。
- 物理iPhone Safariの合格判定。これは後続の端末Gateで扱う。

## 4. 人間判断が必要な選択

### G17-C1: 対象versionとfixtureの読み込み方法

| 案 | 内容 | 影響 |
|---|---|---|
| **A（推奨）** | PixiJS `8.12.0`、Phaser `4.2.0`を固定する。fixtureはHTTPでCDNの固定URLを読み、PixiJSは`PIXI.Assets`、PhaserはSceneのLoaderを使う。 | versionが変わった時に証拠を無効にでき、CIで同じ対象を再現しやすい。外部CDNへの接続が必要になる。 |
| B | PixiJS 8系、Phaser 4系の範囲だけを指定し、CDN URLはmajor / minorの可変指定にする。 | 更新には追従しやすいが、同じfixtureの実行対象が変わり、証拠の再現性が落ちる。 |
| C | 実ブラウザfixtureは作らず、生成HTMLとhelperのunit確認だけを行う。 | 実際のloader、画像読込、描画、animationの失敗を確認できない。 |

### G17-C2: PixiJS / Phaserの受入証拠

| 案 | 内容 | 影響 |
|---|---|---|
| **A（推奨）** | PixiJSとPhaserを別fixture・別E2E・別artifactで実行する。両方でHTTP読込、2ページ、trim / offset、scale、origin、anchor、rect / circle、animation順、Canvas描画、console error 0、download 0、`375×667`を確認する。 | `verified`の範囲をengine・version単位で説明できる。CIのCDN障害は失敗として記録する。 |
| B | fixtureは作るが、画像表示とmanifest JSONの読込だけを確認する。 | animation、座標、複数pageの意味を確認できない。 |
| C | 物理iPhone Safariだけで確認する。 | 実機の確認はできるが、CIで再現できず、回帰検査が弱くなる。 |

### G17-C3: docsと互換性ラベルの境界

| 案 | 内容 | 影響 |
|---|---|---|
| **A（推奨）** | fixtureで実行した対象versionだけを`verified`とし、未確認version・標準atlas完全互換・project自動生成は`candidate`または対象外と明記する。export手順、import notes、既知制限、artifact項目を4文書へ反映する。 | 利用者が確認済み範囲を誤解しにくい。文書更新が必要になる。 |
| B | 既存docsのcandidate表記だけを維持し、fixture結果を内部artifactにだけ残す。 | 誤った期待を生みにくいが、利用者が検証済み範囲を知りにくい。 |
| C | PixiJS / Phaserの標準atlasやproject templateを出力し、対応済みとして扱う。 | 便利だが、変換意味・版差・手動調整の保証範囲が広がり、今回の境界を越える。 |

## 5. 推奨採用範囲

```text
G17-C1 A + G17-C2 A + G17-C3 A
```

推奨理由は、既存のCDN方式を保ちつつ、対象versionと実ブラウザ証拠を固定できるためである。PixiJS v8.12.0の公式配布案内はPixiJS公式更新記事にあり、Phaser v4.2.0の公式配布案内はPhaser公式リリースページにある。採用後はこの2 version以外の成功を推測しない。

## 6. 採用後の実装handoff候補

### 6.1 変更候補

- 新規: `public/engine-fixtures/pixijs-v8/index.html`、`public/engine-fixtures/phaser-v4/index.html`。
- 新規: `e2e/pixijs.spec.ts`、`e2e/phaser.spec.ts`。
- 更新候補: `.github/workflows/ci.yml`（engine別evidence artifact）。
- 更新候補: `src/core/export/examples.ts`（PixiJS CDNのversion固定。既存API・出力構造は維持）。
- 更新候補: `docs/EXPORT_FORMATS.md`、`docs/ENGINE_INTEGRATION.md`、`docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`。
- 必要な場合のみ新規: `docs/future/2D_4_ENGINE_FIXTURE_EVIDENCE.md`。

### 6.2 受入ID

| ID | 受入内容 |
|---|---|
| G17-VERSION-PIN | PixiJS / Phaserの対象versionとCDN URLがfixture・docs・artifactで一致する。 |
| G17-PIXEL-LOAD | PixiJS fixtureがHTTPでmanifest、複数page、画像を読み込み、Canvasへ描画する。 |
| G17-PHASER-LOAD | Phaser fixtureがHTTPでmanifest、複数page、画像を読み込み、Canvasへ描画する。 |
| G17-METADATA | 両fixtureでtrim / offset、scale、origin、anchor、rect / circle、animation順を確認する。 |
| G17-ENGINE-SCOPE | PixiJS / Phaserの対象version以外、標準atlas完全互換、project自動生成を`verified`と表示しない。 |
| G17-EVIDENCE | engine別fixture hash、manifest hash、browser、viewport、console error、download数、page数をartifactへ残し、欠落をCI成功にしない。 |
| G17-DOCS | export手順、import notes、既知の制限、candidate / verifiedの境界をdocsへ反映する。 |
| G17-NO-REGRESSION | schema、version、migration、IndexedDB、`.casproj`、legacy ZIP、Atlas `0.1.0`、Group 16 packageを変更しない。 |

## 7. 停止条件

- 人間がG17-C1〜C3を採用するまでproduct code、fixture、CIを変更しない。
- CDNのversionが固定できない、またはfixtureが対象versionを記録できない場合は実装を止める。
- Group 16 packageへPixiJS / Phaserのtargetを混ぜる必要が出た場合は、別の契約判断へ戻す。
- 現行Atlasが表現できない情報を変換して成功扱いにする必要が出た場合は、理由付き未対応として記録する。
- CIでengine本体の読込、画像表示、artifact保存のどれかが失敗した場合は、同じDraft PRで修正する。

## 8. 人間判断

次の形式で採用する案を回答する。

```text
G17-C1 [A/B/C] + G17-C2 [A/B/C] + G17-C3 [A/B/C]
```

回答があるまでは、この文書の契約状態を`human-decision-pending`、Group 17のproduct implementationを`not-started`として扱う。


# 0019-optional-source-mime-and-asset-0.2.0

ステータス: accepted（2026-07-21 人間承認、選択肢 A）
上位文書: `docs/future/2D_2_IMPORT_PLAN.md`（Slice E）、`docs/future/2D_ASSET_DATA_CONTRACT.md`（§2、§11、§13）
関連 ADR: ADR-0007、ADR-0015、ADR-0016
関連 fixture: `src/core/model/migrationContract.fixtures.test.ts`、`src/core/images/importOptionalContract.fixtures.test.ts`、`src/core/storage/storage.fixtures.test.ts`、`src/core/storage/casprojImport.test.ts`

---

## 文脈

Slice E は SVG / GIF / APNG を `rasterized-import` として扱いながら、取り込んだ元ファイルを source Blob として verbatim に保持する。しかし Asset 0.1.0 の `TextureRef.mimeType` と JSON Schema は PNG / JPEG / WebP しか表現できず、`.casproj` と IndexedDB は全 TextureRef と Blob を 1 対 1 で保持する。このまま UI だけを追加すると、SVG / GIF の原本を捨てるか、現行 schema を満たさない Asset を保存することになる。

2026-07-21 に人間が選択肢 A を承認したため、Slice E の UI / frame decode より先に、source 保存契約だけを独立した migration PR で補正する。

## 決定

1. **Asset だけを 0.2.0 へ進める。** `CURRENT_ASSET_VERSION` を `0.2.0` とし、Project、export-presets、Chameleon Atlas、アプリの version は `0.1.0` のまま維持する。各 version は ADR-0015 どおり独立である。
2. **0.1.0 → 0.2.0 migration は既存フィールドを変更しない。** 0.1.0 Asset は全フィールドと未知フィールドを保持し、migration framework が `version` だけを `0.2.0` にする。旧 fixture を `.casproj` から読み、0.2.0 として再書き出し・再読み込みできることを固定する。IndexedDBのlive Asset、trash、snapshotに残る0.1.0 copyも、正本へ戻す前に同じmigration→現行schema検証を通す。旧データへ provenance を遡及生成しない。
3. **source と rasterized data の MIME 境界を分ける。** `kind: source` は `image/png` / `image/jpeg` / `image/webp` / `image/svg+xml` / `image/gif` を許可する。`kind: edit` と `kind: thumbnail` は、ブラウザー内で生成する raster 形式の PNG / JPEG / WebP だけを許可する。
4. **APNG の canonical MIME は `image/png` とする。** APNG は PNG コンテナなので、source TextureRef / Blob / `.casproj` path は `image/png` / `.png` として保持する。元 file の宣言 MIME が `image/apng` だった事実は `Asset.provenance[].mimeType` に保持できる。実体署名検査では PNG 実体と `image/apng` 宣言を同一コンテナとして扱う。
5. **source bytes を変換せず保存する。** SVG / GIF source の Blob bytes は取り込みから IndexedDB、`.casproj` export / import まで verbatim に維持する。新規bundle、通常改訂、snapshotを含むcanonical保存ではTextureRefのMIMEとBlobのMIMEが一致しなければ拒否する。
6. **実体署名検査を保存層まで先行実装する。** GIF87a / GIF89a と UTF-8 SVG root を識別し、`.casproj` の staged import でも宣言 MIME、実体、decode 寸法を検証する。SVG root 確認のため先頭 4096 bytes を検査する。ユーザー向け通常 import の許可 MIME はこの PR では PNG / JPEG / WebP のままとする。
7. **Slice E の製品機能は別 PR とする。** SVG の安全な rasterize、GIF / APNG の全 frame decode と fallback、loss preview、unsupported 形式の理由表示、UI、E2E はこの契約補正に含めない。dependency、IndexedDB version / store / index、`.casproj` の配置、product export ZIP は変更しない。

## 根拠

- ADR-0007 は source を取り込んだ元データとして不変・verbatim に保持する。
- ADR-0015 は version を上げる変更に migration と旧 fixture roundtrip を必須とし、各文書の version を独立に進める。
- ADR-0016 は SVG / GIF / APNG を `rasterized-import` と分類し、原本保持と rasterized edit data の分離を前提にする。
- SVG を画像として読み込む browser context では script 実行や外部 resource 読み込みが制限される。ただし実際の安全な decode と回帰 E2E は Slice E で固定する。参考: <https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image>
- `ImageDecoder` は利用可能環境が限定されるため、Slice E では機能検出と先頭 frame fallback を維持する。参考: <https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder>

## 影響と fixture

- 型 / schema: source MIME に SVG / GIF を追加し、edit / thumbnail を raster 3 形式へ制限する。
- migration: Asset 0.1.0 → 0.2.0 の意味保持 migration を 1 段追加する。
- storage: live Asset / trash / snapshotをmigrate→検証し、現行schemaはAsset 0.2.0だけを受理する。TextureRefとBlobのMIME一致、SVG / GIFの署名・decode・寸法、verbatim bytesを検証する。
- samples / docs: Asset sample だけを 0.2.0 に更新し、Project / export-presets / atlas / `package.json` は 0.1.0 を維持する。
- tests: 旧0.1.0 `.casproj`のmigration → export → re-import、旧IndexedDB / trash / snapshot copyの原子的migration、future version拒否、source-only MIME schema、SVG / GIF bytesの正本保存、APNG MIME正規化を固定する。実ブラウザーdecodeはGitHub ActionsのChromium E2Eで確認する。

## 現状の制限

- 通常の file picker / drag and drop はまだ SVG / GIF / APNG を許可しない。
- SVG 構造の安全性検査、animated frame の列挙、frame duration の扱い、fallback warning はまだ実装しない。
- UTF-16 等の SVG は署名検査対象外であり、UTF-8 の SVG root だけを受ける。
- APNG と静止 PNG の識別や animation chunk 検証は Slice E の decode 段で行う。

## 再検討条件

- source へ別 MIME を追加する場合は、宣言 MIME、実体判定、decode、verbatim roundtrip、UI 分類を同じ契約で追加する。
- SVG をベクターとして編集する場合、または外部 resource を許可する場合は別 ADR と security review を必須にする。
- APNG を `image/apng` として TextureRef に保存する必要が生じた場合は、PNG container の canonical 化を変更する migration と互換 fixtureを別 PR で用意する。
